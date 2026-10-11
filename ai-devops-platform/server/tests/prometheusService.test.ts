import { beforeEach, describe, expect, it, vi } from 'vitest';

const promClient = vi.hoisted(() => ({
  queryPrometheus: vi.fn(),
  getPrometheusBuildInfo: vi.fn(),
  isPrometheusConfigured: vi.fn()
}));
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn() }));
const createEvidence = vi.hoisted(() => vi.fn());

vi.mock('../src/integrations/prometheus/prometheus.client.js', () => promClient);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({ EvidenceModel: evidenceModel }));
vi.mock('../src/services/evidenceService.js', () => ({ createEvidence }));

const prometheus = await import('../src/integrations/prometheus/prometheus.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  resourceModel.exists.mockResolvedValue(true);
  evidenceModel.findOne.mockReturnValue({ lean: async () => null });
  createEvidence.mockResolvedValue({ id: 'e1' });
});

describe('Prometheus import accounting (review 4.9 "requested")', () => {
  it('reports observed/skipped/truncated instead of a "requested" that always equalled observed', async () => {
    const series = (i: number) => ({ metric: { pod: `p${i}` }, value: [1726272000, String(i)] });
    promClient.queryPrometheus.mockResolvedValue({
      resultType: 'vector',
      result: [
        ...Array.from({ length: 49 }, (_, i) => series(i)),
        { metric: { pod: 'matrix-like' }, values: [[1, '1']] }, // range-shaped, unsupported -> skipped
        series(99) // 51st series: beyond the 50-series cap -> truncated
      ]
    });
    const result = await prometheus.importPrometheusMetrics('507f1f77bcf86cd799439011', 'up');
    expect(result).toMatchObject({ observed: 49, skipped: 1, truncated: true, imported: 49 });
    expect(result).not.toHaveProperty('requested');
  });

  it('flags nothing when the response is clean', async () => {
    promClient.queryPrometheus.mockResolvedValue({ result: [{ metric: {}, value: [1726272000, '1'] }] });
    const result = await prometheus.importPrometheusMetrics('507f1f77bcf86cd799439011', 'up');
    expect(result).toMatchObject({ observed: 1, skipped: 0, truncated: false });
  });

  it('counts oversized values as skipped rather than silently dropping them', async () => {
    promClient.queryPrometheus.mockResolvedValue({ result: [{ metric: {}, value: [1726272000, 'x'.repeat(500)] }] });
    const result = await prometheus.importPrometheusMetrics('507f1f77bcf86cd799439011', 'up');
    expect(result).toMatchObject({ observed: 0, skipped: 1 });
  });
});

describe('Prometheus redaction', () => {
  it('redacts secret-shaped label VALUES (keys were already filtered) and the stored query', async () => {
    promClient.queryPrometheus.mockResolvedValue({
      result: [
        {
          metric: { note: 'password=hunter2', jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig' },
          value: [1726272000, '1']
        }
      ]
    });
    const observations = await prometheus.queryPrometheusMetrics('up{token="abc"}');
    const text = JSON.stringify(observations);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('eyJhbGci');
  });

  it('scopes the already-imported lookup by resourceId', async () => {
    promClient.queryPrometheus.mockResolvedValue({ result: [{ metric: {}, value: [1726272000, '1'] }] });
    await prometheus.importPrometheusMetrics('507f1f77bcf86cd799439011', 'up');
    expect(evidenceModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: '507f1f77bcf86cd799439011' })
    );
  });
});
