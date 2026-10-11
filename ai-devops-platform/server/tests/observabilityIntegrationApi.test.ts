import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { api } from './helpers/api.js';

const prometheusClient = vi.hoisted(() => ({
  getPrometheusBuildInfo: vi.fn(),
  isPrometheusConfigured: vi.fn(),
  queryPrometheus: vi.fn()
}));
const lokiClient = vi.hoisted(() => ({ getLokiBuildInfo: vi.fn(), isLokiConfigured: vi.fn(), queryLoki: vi.fn() }));
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceRecords = vi.hoisted(() => [] as any[]);
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn() }));

vi.mock('../src/integrations/prometheus/prometheus.client.js', () => prometheusClient);
vi.mock('../src/integrations/loki/loki.client.js', () => lokiClient);
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

const { app } = await import('../src/server.js');

function queryResult(value: unknown) {
  return { lean: async () => value };
}

beforeEach(() => {
  vi.clearAllMocks();
  evidenceRecords.length = 0;
  resourceModel.exists.mockResolvedValue(true);
  prometheusClient.isPrometheusConfigured.mockReturnValue(true);
  prometheusClient.getPrometheusBuildInfo.mockResolvedValue({ version: '2.0.0' });
  prometheusClient.queryPrometheus.mockResolvedValue({
    resultType: 'vector',
    result: [{ metric: { __name__: 'http_requests_total', pod: 'api', secret: 'hidden' }, value: [1726272000, '42'] }]
  });
  lokiClient.isLokiConfigured.mockReturnValue(true);
  lokiClient.getLokiBuildInfo.mockResolvedValue({ version: '3.0.0' });
  lokiClient.queryLoki.mockResolvedValue({
    resultType: 'streams',
    result: [
      {
        stream: { app: 'api', token: 'hidden' },
        values: [['1726272000000000000', 'Authorization: Bearer abc123 password=secret']]
      }
    ]
  });
  evidenceModel.findOne.mockImplementation((query: Record<string, string>) =>
    queryResult(evidenceRecords.find((item) => item.correlationId === query.correlationId) ?? null)
  );
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
});

describe('Prometheus, Loki, and observability integrations', () => {
  it('allows authenticated GET previews and returns bounded normalized metric/log data', async () => {
    const prometheus = await api(app).get('/api/integrations/prometheus/query?query=rate(http_requests_total%5B5m%5D)');
    const loki = await api(app).get('/api/integrations/loki/query?query=%7Bapp%3D%22api%22%7D&limit=10');
    expect(prometheus.status).toBe(200);
    expect(prometheus.body.data[0]).toMatchObject({
      provider: 'prometheus',
      value: '42',
      metric: { __name__: 'http_requests_total', pod: 'api' }
    });
    expect(JSON.stringify(prometheus.body)).not.toContain('hidden');
    expect(loki.status).toBe(200);
    expect(loki.body.data[0]).toMatchObject({
      provider: 'loki',
      labels: { app: 'api' },
      message: 'Authorization: Bearer [REDACTED] password=[REDACTED]'
    });
    expect(JSON.stringify(loki.body)).not.toContain('abc123');
  });

  it('reports missing integrations safely and rejects invalid/bounded queries', async () => {
    prometheusClient.isPrometheusConfigured.mockReturnValue(false);
    lokiClient.isLokiConfigured.mockReturnValue(false);
    const prometheusHealth = await api(app).get('/api/integrations/prometheus/health');
    const lokiHealth = await api(app).get('/api/integrations/loki/health');
    const invalidPrometheus = await api(app).get('/api/integrations/prometheus/query?query=');
    const invalidLoki = await api(app).get(`/api/integrations/loki/query?query=${'x'.repeat(1001)}`);
    const longRange = await api(app).get(
      '/api/integrations/loki/query?query=%7Bapp%3D%22api%22%7D&start=2026-09-01T00%3A00%3A00.000Z&end=2026-09-14T00%3A00%3A00.000Z'
    );
    expect(prometheusHealth.body.data.configured).toBe(false);
    expect(lokiHealth.body.data.configured).toBe(false);
    expect(invalidPrometheus.status).toBe(400);
    expect(invalidLoki.status).toBe(400);
    expect(longRange.status).toBe(400);
  });

  it('imports Prometheus, Loki, or both through the existing Evidence service and is idempotent', async () => {
    const resourceId = '507f1f77bcf86cd799439011';
    const first = await api(app)
      .post('/api/integrations/observability/import')
      .send({ resourceId, prometheus: { query: 'up' }, loki: { query: '{app="api"}' } });
    expect(first.status).toBe(200);
    expect(first.body.data.prometheus).toMatchObject({ imported: 1, alreadyPresent: 0 });
    expect(first.body.data.loki).toMatchObject({ imported: 1, alreadyPresent: 0 });
    expect(evidenceRecords).toHaveLength(2);
    expect(evidenceRecords.map((item) => item.source).sort()).toEqual(['loki', 'prometheus']);
    expect(JSON.stringify(evidenceRecords)).not.toContain('abc123');

    const repeated = await api(app)
      .post('/api/integrations/observability/import')
      .send({ resourceId, prometheus: { query: 'up' }, loki: { query: '{app="api"}' } });
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.prometheus).toMatchObject({ imported: 0, alreadyPresent: 1 });
    expect(repeated.body.data.loki).toMatchObject({ imported: 0, alreadyPresent: 1 });
  });

  it('requires a valid existing resource and at least one source, with no mutation routes', async () => {
    const noSource = await api(app)
      .post('/api/integrations/observability/import')
      .send({ resourceId: '507f1f77bcf86cd799439011' });
    const invalidResource = await api(app)
      .post('/api/integrations/observability/import')
      .send({ resourceId: 'bad', prometheus: { query: 'up' } });
    resourceModel.exists.mockResolvedValue(false);
    const missingResource = await api(app)
      .post('/api/integrations/observability/import')
      .send({ resourceId: '507f1f77bcf86cd799439011', prometheus: { query: 'up' } });
    const mutation = await api(app).post('/api/integrations/prometheus/rules').send({});
    expect(noSource.status).toBe(400);
    expect(invalidResource.status).toBe(400);
    expect(missingResource.status).toBe(404);
    expect(mutation.status).toBe(404);
  });

  it('keeps the import role guard in place for viewers', async () => {
    const { authorize } = await import('../src/middleware/auth.middleware.js');
    const next = vi.fn();
    authorize('operator')({ user: { role: 'viewer' } } as any, {} as any, next);
    expect(next.mock.calls[0]?.[0]?.statusCode).toBe(403);
  });
});
