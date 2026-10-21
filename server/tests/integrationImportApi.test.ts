import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './helpers/api.js';
import { AppError } from '../src/utils/app-error.js';

/**
 * HTTP-level checks for the Phase 4 import surface: the new Loki POST /import (reachable only by
 * operators, review 1.5) and the partial-failure response of the aggregate observability import
 * (review 4.9). Upstream clients are mocked; routing, auth, validation and services are real.
 */
const prometheusClient = vi.hoisted(() => ({
  getPrometheusBuildInfo: vi.fn(),
  isPrometheusConfigured: vi.fn(),
  queryPrometheus: vi.fn()
}));
const lokiClient = vi.hoisted(() => ({ getLokiBuildInfo: vi.fn(), isLokiConfigured: vi.fn(), queryLoki: vi.fn() }));
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn() }));

vi.mock('../src/integrations/prometheus/prometheus.client.js', () => prometheusClient);
vi.mock('../src/integrations/loki/loki.client.js', () => lokiClient);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({
  EvidenceModel: evidenceModel,
  toEvidenceDTO: (record: any) => ({ id: String(record._id), correlationId: record.correlationId })
}));

const { app } = await import('../src/server.js');

const RESOURCE = '507f1f77bcf86cd799439011';
const lokiBody = {
  resourceId: RESOURCE,
  query: '{app="api"}',
  start: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  end: new Date(Date.now() - 1000).toISOString(),
  limit: 5
};

beforeEach(() => {
  vi.clearAllMocks();
  resourceModel.exists.mockResolvedValue(true);
  evidenceModel.findOne.mockReturnValue({ lean: async () => null });
  evidenceModel.create.mockImplementation(async (input: any) => ({
    _id: String(Math.random()).slice(2, 14).padEnd(24, '0'),
    ...input,
    resourceId: input.resourceId,
    timestamp: new Date(input.timestamp),
    collectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  lokiClient.isLokiConfigured.mockReturnValue(true);
  // Behaves like Loki: only returns the line when it falls inside the requested window.
  const lineAt = Date.now() - 5000;
  lokiClient.queryLoki.mockImplementation(async (_query: string, range: { start: Date; end: Date }) => ({
    result:
      lineAt >= range.start.getTime() && lineAt < range.end.getTime()
        ? [{ stream: { app: 'api' }, values: [[`${BigInt(lineAt) * 1_000_000n}`, 'hello']] }]
        : []
  }));
  prometheusClient.isPrometheusConfigured.mockReturnValue(true);
  prometheusClient.queryPrometheus.mockResolvedValue({ result: [{ metric: { pod: 'a' }, value: [1726272000, '1'] }] });
});

describe('POST /api/integrations/loki/import', () => {
  it('is forbidden to a viewer (a write must not hang off the GET minimum)', async () => {
    const response = await api(app, 'viewer').post('/api/integrations/loki/import').send(lokiBody);
    expect(response.status).toBe(403);
    expect(evidenceModel.create).not.toHaveBeenCalled();
  });

  it('imports for an operator, over a multi-day range, and reports requested vs observed', async () => {
    const response = await api(app, 'operator').post('/api/integrations/loki/import').send(lokiBody);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ requested: 5, observed: 1, imported: 1, alreadyPresent: 0 });
  });

  it('rejects a range beyond 7 days with 400', async () => {
    const response = await api(app, 'operator')
      .post('/api/integrations/loki/import')
      .send({ ...lokiBody, start: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString() });
    expect(response.status).toBe(400);
  });

  it.each([
    ['missing resourceId', { query: '{a="b"}' }],
    ['invalid resourceId', { resourceId: 'nope', query: '{a="b"}' }],
    ['missing query', { resourceId: RESOURCE }],
    ['bad limit', { ...lokiBody, limit: 500 }]
  ])('rejects %s with 400', async (_name, body) => {
    const response = await api(app, 'operator').post('/api/integrations/loki/import').send(body);
    expect(response.status).toBe(400);
  });

  it('rejects a non-object body with 400', async () => {
    const response = await api(app, 'operator').post('/api/integrations/loki/import').send([1, 2]);
    expect(response.status).toBe(400);
  });
});

describe('POST /api/integrations/observability/import partial failure', () => {
  const body = { resourceId: RESOURCE, prometheus: { query: 'up' }, loki: { query: '{app="api"}', limit: 5 } };

  it('returns 200 with the Loki data and a per-source error when only Prometheus fails', async () => {
    prometheusClient.queryPrometheus.mockRejectedValue(new AppError(504, 'timeout', 'PROMETHEUS_TIMEOUT'));
    const response = await api(app, 'operator').post('/api/integrations/observability/import').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.loki).toMatchObject({ imported: 1 });
    expect(response.body.data.prometheus).toBeUndefined();
    expect(response.body.data.errors.prometheus.code).toBe('PROMETHEUS_TIMEOUT');
  });

  it('returns the failing status when every source fails', async () => {
    prometheusClient.queryPrometheus.mockRejectedValue(new AppError(502, 'down', 'PROMETHEUS_UNAVAILABLE'));
    lokiClient.queryLoki.mockRejectedValue(new AppError(502, 'down', 'LOKI_UNAVAILABLE'));
    const response = await api(app, 'operator').post('/api/integrations/observability/import').send(body);
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PROMETHEUS_UNAVAILABLE');
  });

  it('has no errors key when everything works', async () => {
    const response = await api(app, 'operator').post('/api/integrations/observability/import').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('errors');
    expect(response.body.data.prometheus).toMatchObject({ observed: 1, imported: 1 });
  });
});
