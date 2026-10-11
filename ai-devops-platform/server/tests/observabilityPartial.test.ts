import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/utils/app-error.js';

/** Review 4.9: a failing source must not hide the other source's already-committed import. */
const prom = vi.hoisted(() => ({ importPrometheusMetrics: vi.fn() }));
const lokiSvc = vi.hoisted(() => ({ importLokiLogs: vi.fn() }));
vi.mock('../src/integrations/prometheus/prometheus.service.js', () => prom);
vi.mock('../src/integrations/loki/loki.service.js', () => lokiSvc);

const { importObservability } = await import('../src/integrations/observability/observability.service.js');

const promOk = { observed: 2, truncated: false, skipped: 0, imported: 2, alreadyPresent: 0, evidenceIds: ['a', 'b'] };
const lokiOk = { requested: 50, observed: 3, imported: 3, alreadyPresent: 0, evidenceIds: ['c', 'd', 'e'] };
const input = { resourceId: '507f1f77bcf86cd799439011', prometheus: { query: 'up' }, loki: { query: '{a="b"}' } };

beforeEach(() => vi.clearAllMocks());

describe('importObservability', () => {
  it('returns both results and no errors key when everything succeeds', async () => {
    prom.importPrometheusMetrics.mockResolvedValue(promOk);
    lokiSvc.importLokiLogs.mockResolvedValue(lokiOk);
    const result = await importObservability(input);
    expect(result).toEqual({ prometheus: promOk, loki: lokiOk });
    expect(result).not.toHaveProperty('errors');
  });

  it('keeps the Loki import and reports the Prometheus failure per source', async () => {
    prom.importPrometheusMetrics.mockRejectedValue(
      new AppError(504, 'Prometheus API request timed out.', 'PROMETHEUS_TIMEOUT')
    );
    lokiSvc.importLokiLogs.mockResolvedValue(lokiOk);
    const result = await importObservability(input);
    expect(result.loki).toEqual(lokiOk);
    expect(result.prometheus).toBeUndefined();
    expect(result.errors).toEqual({
      prometheus: { code: 'PROMETHEUS_TIMEOUT', message: 'Prometheus API request timed out.' }
    });
  });

  it('does not leak the message of an unexpected (non-AppError) failure', async () => {
    prom.importPrometheusMetrics.mockResolvedValue(promOk);
    lokiSvc.importLokiLogs.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3100 token=abc'));
    const result = await importObservability(input);
    expect(result.errors?.loki).toEqual({ code: 'IMPORT_FAILED', message: 'loki import failed.' });
  });

  it('throws the first failure when EVERY requested source failed, so the HTTP status is honest', async () => {
    prom.importPrometheusMetrics.mockRejectedValue(new AppError(502, 'prom down', 'PROMETHEUS_UNAVAILABLE'));
    lokiSvc.importLokiLogs.mockRejectedValue(new AppError(502, 'loki down', 'LOKI_UNAVAILABLE'));
    await expect(importObservability(input)).rejects.toMatchObject({ code: 'PROMETHEUS_UNAVAILABLE', statusCode: 502 });
  });

  it('rethrows a lone failing source (only one was requested)', async () => {
    lokiSvc.importLokiLogs.mockRejectedValue(new AppError(502, 'loki down', 'LOKI_UNAVAILABLE'));
    await expect(importObservability({ resourceId: input.resourceId, loki: input.loki })).rejects.toMatchObject({
      code: 'LOKI_UNAVAILABLE'
    });
    expect(prom.importPrometheusMetrics).not.toHaveBeenCalled();
  });

  it('still requires at least one source', async () => {
    await expect(importObservability({ resourceId: input.resourceId })).rejects.toMatchObject({ statusCode: 400 });
  });
});
