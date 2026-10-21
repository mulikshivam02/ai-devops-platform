import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Review 4.4 / 4.5: Kubernetes pagination, flap suppression, revert detection, tie-breaking.
 * The API client, Resource/Evidence models and the Evidence/Change creators are replaced by an
 * in-memory fake that behaves like the real collections (sorting, unique changeId); the
 * comparison and import logic in kubernetes.service.ts is real.
 */
const k8sClient = vi.hoisted(() => ({
  getKubernetesWorkloads: vi.fn(),
  getKubernetesNamespaces: vi.fn(),
  getKubernetesVersion: vi.fn(),
  isKubernetesConfigured: vi.fn()
}));
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const store = vi.hoisted(() => ({
  evidence: [] as any[],
  changes: new Map<string, any>(),
  counter: 0,
  lastSort: undefined as Record<string, number> | undefined
}));
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn() }));
const createEvidence = vi.hoisted(() => vi.fn());
const createChange = vi.hoisted(() => vi.fn());

vi.mock('../src/integrations/kubernetes/kubernetes.client.js', () => k8sClient);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({ EvidenceModel: evidenceModel }));
vi.mock('../src/services/evidenceService.js', () => ({ createEvidence }));
vi.mock('../src/services/changeService.js', () => ({ createChange }));

const k8s = await import('../src/integrations/kubernetes/kubernetes.service.js');

const RESOURCE = '507f1f77bcf86cd799439011';

interface Shape {
  image?: string;
  replicas?: number;
  ready?: number;
  generation?: number;
  label?: string;
  message?: string;
  current?: number;
  available?: number;
  updated?: number;
}

function workload(name: string, shape: Shape = {}) {
  const { image = 'api:1', replicas = 3, ready = 3, generation = 1, label = 'v1', message = 'ok' } = shape;
  return {
    metadata: {
      name,
      namespace: 'prod',
      generation,
      resourceVersion: String(store.counter),
      labels: { app: name, release: label },
      annotations: {}
    },
    spec: { replicas, template: { spec: { containers: [{ name: 'c', image }] } } },
    status: {
      replicas: shape.current ?? replicas,
      readyReplicas: ready,
      availableReplicas: shape.available ?? ready,
      updatedReplicas: shape.updated ?? replicas,
      conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message }]
    }
  };
}

function serveOnly(kindItems: Partial<Record<'Deployment' | 'StatefulSet' | 'DaemonSet', any[]>>) {
  k8sClient.getKubernetesWorkloads.mockImplementation(async (_ns: unknown, kind: 'Deployment') => ({
    items: kindItems[kind] ?? []
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-14T10:00:00.000Z')); // every poll gets the SAME observedAt
  store.evidence.length = 0;
  store.changes.clear();
  store.counter = 0;
  store.lastSort = undefined;
  k8sClient.isKubernetesConfigured.mockReturnValue(true);
  resourceModel.exists.mockResolvedValue(true);

  evidenceModel.findOne.mockImplementation((filter: Record<string, string>) => ({
    sort: (sort: Record<string, number>) => {
      store.lastSort = sort;
      const matches = store.evidence.filter((e) => e.metadata.observationKey === filter['metadata.observationKey']);
      matches.sort((left, right) => {
        for (const [field, direction] of Object.entries(sort)) {
          const a = field === '_id' ? left._id : (left[field] as Date).getTime();
          const b = field === '_id' ? right._id : (right[field] as Date).getTime();
          if (a !== b) return (a < b ? -1 : 1) * direction;
        }
        return 0; // a genuine tie: whatever the DB happens to return first (insertion order)
      });
      return { lean: async () => matches[0] ?? null };
    }
  }));
  createEvidence.mockImplementation(async (input: any) => {
    store.counter += 1;
    const record = {
      ...input,
      _id: store.counter,
      collectedAt: new Date(store.counter),
      timestamp: new Date(input.timestamp)
    };
    store.evidence.push(record);
    return { id: String(record._id) };
  });
  createChange.mockImplementation(async (input: any) => {
    if (store.changes.has(input.changeId)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    const change = { id: `chg-${store.changes.size + 1}`, ...input };
    store.changes.set(input.changeId, change);
    return change;
  });
});

afterEach(() => vi.useRealTimers());

async function poll(shape: Shape) {
  serveOnly({ Deployment: [workload('api', shape)] });
  return k8s.importKubernetesWorkloads({ resourceId: RESOURCE, kind: 'Deployment' });
}

describe('change detection', () => {
  it('records the first sighting as a baseline, not a change', async () => {
    const result = await poll({});
    expect(result).toMatchObject({ observed: 1, evidenceCreated: 1, changesCreated: 0, unchanged: 0 });
  });

  it('does not manufacture changes from condition text or pod-by-pod replica churn (review 4.5 flapping)', async () => {
    await poll({});
    const churn = await poll({ message: 'heartbeat 12:00:05', current: 4, available: 2, updated: 1 });
    expect(churn).toMatchObject({ changesCreated: 0, unchanged: 1 });
  });

  it('records a revert: A -> B -> A -> B yields three changes with three distinct ids', async () => {
    await poll({ image: 'api:1' });
    const toB = await poll({ image: 'api:2' });
    const backToA = await poll({ image: 'api:1' });
    const toBAgain = await poll({ image: 'api:2' });

    expect([toB, backToA, toBAgain].map((r) => r.changesCreated)).toEqual([1, 1, 1]);
    expect(store.changes.size).toBe(3);
    expect(backToA.changes[0]?.summary).toMatch(/image changed/);
    // Keying on the new state alone would have given the 4th poll the same id as the 2nd.
    expect(new Set(store.changes.keys()).size).toBe(3);
  });

  it('picks the LATEST observation even when every observation shares one timestamp', async () => {
    await poll({ image: 'api:1' });
    await poll({ image: 'api:2' });
    // Latest is api:2. A third poll showing api:2 must be "unchanged" -- if "latest" resolved to the
    // first record (a tie on timestamp) it would compare against api:1 and report a bogus change.
    const same = await poll({ image: 'api:2' });
    expect(same).toMatchObject({ changesCreated: 0, unchanged: 1 });
    expect(store.lastSort).toEqual({ timestamp: -1, collectedAt: -1, _id: -1 });
  });

  it('treats a concurrent duplicate transition as unchanged rather than failing the import', async () => {
    await poll({ image: 'api:1' });
    createChange.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    const result = await poll({ image: 'api:2' });
    expect(result).toMatchObject({ changesCreated: 0, unchanged: 1 });
  });

  it('still surfaces genuine failures from change creation', async () => {
    await poll({ image: 'api:1' });
    createChange.mockRejectedValueOnce(new Error('mongo is down'));
    await expect(poll({ image: 'api:2' })).rejects.toThrow('mongo is down');
  });
});

describe('change classification', () => {
  const cases: Array<[string, Shape, string, RegExp]> = [
    ['image change', { image: 'api:2' }, 'deployment', /image changed/],
    ['scaling', { replicas: 5, ready: 5 }, 'infrastructure', /scaled from 3 to 5 replicas/],
    ['other spec edit (generation only)', { generation: 2 }, 'deployment', /rollout generation changed/],
    ['ready replicas dropping', { ready: 1 }, 'infrastructure', /ready replicas changed from 3 to 1/],
    ['label edit', { label: 'v2' }, 'configuration', /labels or annotations changed/]
  ];
  it.each(cases)('%s', async (_name, shape, changeType, summary) => {
    await poll({});
    const result = await poll(shape);
    expect(result.changesCreated).toBe(1);
    expect(result.changes[0]).toMatchObject({ changeType });
    expect(result.changes[0]?.summary).toMatch(summary);
  });
});

describe('listing and pagination (review 4.4)', () => {
  const many = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => workload(`${prefix}-${i}`));

  it('follows continue tokens and flags truncation when a kind exceeds the import cap', async () => {
    const pages = [
      { items: many('d1', 100), metadata: { continue: 't1' } },
      { items: many('d2', 100), metadata: { continue: 't2' } },
      { items: many('d3', 100) }
    ];
    k8sClient.getKubernetesWorkloads.mockImplementation(
      async (_ns: unknown, kind: string, _limit: number, token?: string) => {
        if (kind !== 'Deployment') return { items: kind === 'StatefulSet' ? many('sts', 2) : [] };
        return pages[token === 't1' ? 1 : token === 't2' ? 2 : 0];
      }
    );
    const result = await k8s.importKubernetesWorkloads({ resourceId: RESOURCE });
    const deploymentCalls = k8sClient.getKubernetesWorkloads.mock.calls.filter((c) => c[1] === 'Deployment');
    expect(deploymentCalls.map((c) => c[3])).toEqual([undefined, 't1']); // stopped once the cap was reached
    expect(result.observed).toBe(200 + 2);
    expect(result.truncatedKinds).toEqual(['Deployment']);
    expect(result.requested).toBe(600);
  });

  it('does not starve small kinds when one kind is huge', async () => {
    serveOnly({ Deployment: many('d', 150), StatefulSet: many('s', 4), DaemonSet: many('x', 3) });
    const result = await k8s.importKubernetesWorkloads({ resourceId: RESOURCE });
    expect(result.observed).toBe(150 + 4 + 3);
    expect(result.truncatedKinds).toEqual([]);
  });

  it('reports no truncation when a kind fits exactly at the cap with no further page', async () => {
    serveOnly({ Deployment: many('d', 200) });
    const result = await k8s.importKubernetesWorkloads({ resourceId: RESOURCE, kind: 'Deployment' });
    expect(result).toMatchObject({ observed: 200, truncatedKinds: [] });
  });

  it('read-only listing splits its limit across kinds so StatefulSets/DaemonSets are not dropped', async () => {
    serveOnly({ Deployment: many('d', 60), StatefulSet: many('s', 5), DaemonSet: many('x', 5) });
    const listed = await k8s.listKubernetesWorkloads(undefined, undefined, 50);
    const kinds = new Set(listed.map((w) => w.kind));
    expect(kinds).toEqual(new Set(['Deployment', 'StatefulSet', 'DaemonSet']));
    expect(listed.length).toBeLessThanOrEqual(50);
  });
});
