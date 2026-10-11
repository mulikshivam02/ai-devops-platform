import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { api } from './helpers/api.js';

const client = vi.hoisted(() => ({
  getKubernetesVersion: vi.fn(),
  getKubernetesNamespaces: vi.fn(),
  getKubernetesWorkloads: vi.fn(),
  isKubernetesConfigured: vi.fn()
}));
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceRecords = vi.hoisted(() => [] as any[]);
const changeRecords = vi.hoisted(() => [] as any[]);
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() }));
const changeModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() }));

vi.mock('../src/integrations/kubernetes/kubernetes.client.js', () => client);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({
  EvidenceModel: evidenceModel,
  toEvidenceDTO: (record: any) => ({
    id: String(record._id),
    resourceId: String(record.resourceId),
    evidenceType: record.evidenceType,
    source: record.source,
    timestamp: record.timestamp.toISOString(),
    collectedAt: record.collectedAt.toISOString(),
    payload: record.payload,
    metadata: record.metadata,
    correlationId: record.correlationId
  })
}));
vi.mock('../src/models/Change.js', () => ({
  ChangeModel: changeModel,
  toChangeDTO: (record: any) => ({
    id: String(record._id),
    resourceId: String(record.resourceId),
    changeId: record.changeId,
    source: record.source,
    author: record.author,
    timestamp: record.timestamp.toISOString(),
    summary: record.summary,
    changeType: record.changeType,
    before: record.before,
    after: record.after,
    evidenceIds: record.evidenceIds.map((value: any) => String(value)),
    status: record.status,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  })
}));

const { app } = await import('../src/server.js');

function queryResult(value: unknown) {
  return { sort: () => ({ lean: async () => value }), lean: async () => value };
}

function deployment(image = 'nginx:1.0', replicas = 2) {
  return {
    metadata: {
      name: 'web',
      namespace: 'default',
      generation: replicas,
      resourceVersion: String(replicas),
      creationTimestamp: '2026-09-14T00:00:00.000Z',
      labels: { app: 'web', token: 'must-not-persist' },
      annotations: { owner: 'platform' }
    },
    spec: {
      replicas,
      template: {
        spec: {
          containers: [
            { name: 'web', image },
            { name: 'sidecar', image: 'busybox:1.36' }
          ]
        }
      }
    },
    status: {
      replicas,
      readyReplicas: replicas,
      availableReplicas: replicas,
      updatedReplicas: replicas,
      conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message: 'ready' }],
      secret: 'must-not-persist'
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  evidenceRecords.length = 0;
  changeRecords.length = 0;
  resourceModel.exists.mockResolvedValue(true);
  client.isKubernetesConfigured.mockReturnValue(true);
  client.getKubernetesVersion.mockResolvedValue({ gitVersion: 'v1.31.0', platform: 'linux/amd64' });
  client.getKubernetesNamespaces.mockResolvedValue({
    items: [{ metadata: { name: 'default', labels: { team: 'platform' } }, status: { phase: 'Active' } }]
  });
  client.getKubernetesWorkloads.mockImplementation(async (_namespace: string | undefined, kind: string) => ({
    items:
      kind === 'Deployment'
        ? [deployment()]
        : [
            {
              metadata: { name: kind.toLowerCase(), namespace: 'default' },
              spec: { template: { spec: { containers: [{ image: `${kind.toLowerCase()}:1` }] } } },
              status: { desiredNumberScheduled: 1, currentNumberScheduled: 1, numberReady: 1 }
            }
          ]
  }));
  evidenceModel.findOne.mockImplementation((query: Record<string, any>) => {
    const record = query.correlationId
      ? evidenceRecords.find((item) => item.correlationId === query.correlationId)
      : [...evidenceRecords]
          .reverse()
          .find((item) => item.metadata.observationKey === query['metadata.observationKey']);
    return queryResult(record ?? null);
  });
  evidenceModel.countDocuments.mockResolvedValue(1);
  evidenceModel.create.mockImplementation(async (input: any) => {
    const record = {
      _id: new Types.ObjectId(),
      ...input,
      resourceId: new Types.ObjectId(input.resourceId),
      timestamp: new Date(input.timestamp),
      collectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    evidenceRecords.push(record);
    return record;
  });
  changeModel.findOne.mockReturnValue(queryResult(null));
  changeModel.countDocuments.mockResolvedValue(1);
  changeModel.create.mockImplementation(async (input: any) => {
    const record = {
      _id: new Types.ObjectId(),
      ...input,
      resourceId: new Types.ObjectId(input.resourceId),
      evidenceIds: input.evidenceIds.map((value: string) => new Types.ObjectId(value)),
      timestamp: new Date(input.timestamp),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    changeRecords.push(record);
    return record;
  });
});

describe('Kubernetes integration API', () => {
  it('rejects unauthenticated access through the shared auth middleware when auth is enabled', async () => {
    const { authorize } = await import('../src/middleware/auth.middleware.js');
    const next = vi.fn();
    authorize('operator')({} as any, {} as any, next);
    expect(next.mock.calls[0]?.[0]?.statusCode).toBe(403);
  });

  it('allows viewer GET operations and returns normalized namespace/workload data', async () => {
    const health = await api(app).get('/api/integrations/kubernetes/health');
    const namespaces = await api(app).get('/api/integrations/kubernetes/namespaces');
    const workloads = await api(app).get('/api/integrations/kubernetes/workloads?namespace=default&kind=Deployment');
    expect(health.status).toBe(200);
    expect(namespaces.body.data[0].name).toBe('default');
    expect(workloads.status).toBe(200);
    expect(workloads.body.data[0]).toMatchObject({
      kind: 'Deployment',
      namespace: 'default',
      name: 'web',
      images: ['nginx:1.0', 'busybox:1.36']
    });
    expect(JSON.stringify(workloads.body)).not.toContain('must-not-persist');
  });

  it('handles missing configuration safely', async () => {
    client.isKubernetesConfigured.mockReturnValue(false);
    const response = await api(app).get('/api/integrations/kubernetes/health');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ configured: false, reachable: false });
  });

  it('normalizes StatefulSets and DaemonSets and enforces bounded validation', async () => {
    const statefulSet = await api(app).get('/api/integrations/kubernetes/workloads?kind=StatefulSet');
    const daemonSet = await api(app).get('/api/integrations/kubernetes/workloads?kind=DaemonSet');
    const invalidKind = await api(app).get('/api/integrations/kubernetes/workloads?kind=Pod');
    const excessiveLimit = await api(app).get('/api/integrations/kubernetes/workloads?limit=51');
    expect(statefulSet.body.data[0].kind).toBe('StatefulSet');
    expect(daemonSet.body.data[0].kind).toBe('DaemonSet');
    expect(invalidKind.status).toBe(400);
    expect(excessiveLimit.status).toBe(400);
  });

  it('requires an existing resource and imports first, changed, then unchanged observations idempotently', async () => {
    const resourceId = '507f1f77bcf86cd799439011';
    const first = await api(app)
      .post('/api/integrations/kubernetes/import')
      .send({ resourceId, namespace: 'default', kind: 'Deployment' });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ evidenceCreated: 1, changesCreated: 0 });

    client.getKubernetesWorkloads.mockResolvedValue({ items: [deployment('nginx:2.0', 3)] });
    const changed = await api(app)
      .post('/api/integrations/kubernetes/import')
      .send({ resourceId, namespace: 'default', kind: 'Deployment' });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ evidenceCreated: 1, changesCreated: 1 });
    expect(changed.body.data.changes[0].before.images).toEqual(['nginx:1.0', 'busybox:1.36']);
    expect(changed.body.data.changes[0].after.images).toEqual(['nginx:2.0', 'busybox:1.36']);

    const repeated = await api(app)
      .post('/api/integrations/kubernetes/import')
      .send({ resourceId, namespace: 'default', kind: 'Deployment' });
    expect(repeated.status).toBe(200);
    // evidenceAlreadyPresent is no longer how "nothing changed" is reported --
    // "unchanged" is now determined by comparing to the LATEST observation
    // (see review 4.5), not by checking whether this exact state hash was
    // ever seen at any point in history. Evidence is still recorded every
    // poll (an audit trail of "we checked"), even when nothing changed --
    // only whether a CHANGE record is created depends on comparison to the
    // latest observation.
    expect(repeated.body.data).toMatchObject({ evidenceCreated: 1, unchanged: 1, changesCreated: 0 });
    expect(changeRecords).toHaveLength(1);

    // Review 4.5: reverting back to a PREVIOUSLY-seen state (nginx:1.0, which
    // the very first import above already recorded) must still register as a
    // real change, because it differs from the latest observation (nginx:2.0).
    // The old state-hash-keyed existence check would have found nginx:1.0's
    // evidence from the first import and silently skipped this entirely.
    client.getKubernetesWorkloads.mockResolvedValue({ items: [deployment('nginx:1.0', 3)] });
    const reverted = await api(app)
      .post('/api/integrations/kubernetes/import')
      .send({ resourceId, namespace: 'default', kind: 'Deployment' });
    expect(reverted.status).toBe(200);
    expect(reverted.body.data).toMatchObject({ evidenceCreated: 1, changesCreated: 1 });
    expect(reverted.body.data.changes[0].before.images).toEqual(['nginx:2.0', 'busybox:1.36']);
    expect(reverted.body.data.changes[0].after.images).toEqual(['nginx:1.0', 'busybox:1.36']);
    expect(changeRecords).toHaveLength(2);
  });

  it('does not register a change when only a condition reason/message flaps (review 4.5)', async () => {
    const resourceId = '507f1f77bcf86cd799439011';
    const withMessage = (message: string) => ({
      metadata: {
        name: 'web',
        namespace: 'default',
        generation: 2,
        resourceVersion: '2',
        creationTimestamp: '2026-09-14T00:00:00.000Z',
        labels: { app: 'web' },
        annotations: {}
      },
      spec: { replicas: 2, template: { spec: { containers: [{ name: 'web', image: 'nginx:1.0' }] } } },
      status: {
        replicas: 2,
        readyReplicas: 2,
        availableReplicas: 2,
        updatedReplicas: 2,
        // type/status are identical across both polls; only reason/message
        // change, exactly like a routine heartbeat update would.
        conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message }]
      }
    });

    client.getKubernetesWorkloads.mockResolvedValue({ items: [withMessage('ready at 10:00')] });
    const first = await api(app)
      .post('/api/integrations/kubernetes/import')
      .send({ resourceId, namespace: 'default', kind: 'Deployment' });
    expect(first.body.data).toMatchObject({ evidenceCreated: 1, changesCreated: 0 });

    // Only the condition's message changed (a routine status heartbeat) --
    // image, replicas, and generation are all identical to the first poll.
    // Under the old comparison (which included the full condition object),
    // this alone would have registered as a "status changed" change. Evidence
    // is still recorded every poll (an audit trail of "we checked"); only the
    // CHANGE record is correctly suppressed here.
    client.getKubernetesWorkloads.mockResolvedValue({ items: [withMessage('ready at 10:05, still healthy')] });
    const second = await api(app)
      .post('/api/integrations/kubernetes/import')
      .send({ resourceId, namespace: 'default', kind: 'Deployment' });
    expect(second.body.data).toMatchObject({ evidenceCreated: 1, changesCreated: 0, unchanged: 1 });
    expect(changeRecords).toHaveLength(0);
  });

  it('all three workload kinds get fair representation when no kind is specified (review 4.4)', async () => {
    // Simulate 50+ Deployments -- more than fit in a single MAX_WORKLOADS-sized
    // response on their own -- alongside StatefulSets and DaemonSets.
    client.getKubernetesWorkloads.mockImplementation((_namespace: unknown, kind: string) => {
      if (kind === 'Deployment')
        return Promise.resolve({
          items: Array.from({ length: 60 }, (_, i) => ({
            metadata: { name: `deploy-${i}`, namespace: 'default' },
            spec: { replicas: 1, template: { spec: { containers: [{ image: 'nginx:1.0' }] } } },
            status: {}
          }))
        });
      return Promise.resolve({
        items: [
          {
            metadata: { name: kind.toLowerCase(), namespace: 'default' },
            spec: { template: { spec: { containers: [{ image: `${kind.toLowerCase()}:1` }] } } },
            status: { desiredNumberScheduled: 1, currentNumberScheduled: 1, numberReady: 1 }
          }
        ]
      });
    });

    const response = await api(app).get('/api/integrations/kubernetes/workloads').query({ namespace: 'default' });
    expect(response.status).toBe(200);
    const kinds = new Set(response.body.data.map((item: { kind: string }) => item.kind));
    // Under the old bug, a global slice(0, 50) after combining all three
    // kinds' results (Deployments first) meant StatefulSet and DaemonSet were
    // silently absent from the response whenever Deployments alone met the cap.
    expect(kinds.has('StatefulSet')).toBe(true);
    expect(kinds.has('DaemonSet')).toBe(true);
  });

  it('rejects invalid resource IDs and has no Kubernetes mutation endpoint', async () => {
    const invalid = await api(app).post('/api/integrations/kubernetes/import').send({ resourceId: 'not-an-object-id' });
    const mutation = await api(app).post('/api/integrations/kubernetes/workloads').send({});
    expect(invalid.status).toBe(400);
    expect(mutation.status).toBe(404);
  });
});
