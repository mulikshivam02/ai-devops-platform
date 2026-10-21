import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  changes: [] as Row[],
  analyses: [] as Row[],
  comparisons: [] as Row[],
  observations: [] as Row[],
  predictions: [] as Row[],
  investigations: [] as Row[],
  resources: [] as Row[]
}));
const health = vi.hoisted(() => ({
  getKubernetesHealth: vi.fn(),
  getPrometheusHealth: vi.fn(),
  getLokiHealth: vi.fn(),
  getAIHealth: vi.fn()
}));

const fake = async (rows: () => Row[]) => (await import('./helpers/fakeModel.js')).fakeModel(rows);

vi.mock('../src/models/Change.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/models/Change.js')>()),
  ChangeModel: await fake(() => db.changes)
}));
vi.mock('../src/models/ChangeAnalysis.js', async () => ({ ChangeAnalysisModel: await fake(() => db.analyses) }));
vi.mock('../src/models/PredictionComparison.js', async () => ({
  PredictionComparisonModel: await fake(() => db.comparisons)
}));
vi.mock('../src/models/ObservedImpact.js', async () => ({ ObservedImpactModel: await fake(() => db.observations) }));
vi.mock('../src/models/PredictionSnapshot.js', async () => ({
  PredictionSnapshotModel: await fake(() => db.predictions)
}));
vi.mock('../src/models/Investigation.js', async () => ({ InvestigationModel: await fake(() => db.investigations) }));
vi.mock('../src/models/Resource.js', async () => ({ ResourceModel: await fake(() => db.resources) }));
vi.mock('../src/integrations/kubernetes/kubernetes.service.js', () => ({
  getKubernetesHealth: health.getKubernetesHealth
}));
vi.mock('../src/integrations/prometheus/prometheus.service.js', () => ({
  getPrometheusHealth: health.getPrometheusHealth
}));
vi.mock('../src/integrations/loki/loki.service.js', () => ({ getLokiHealth: health.getLokiHealth }));
vi.mock('../src/services/investigationService.js', () => ({ getAIHealth: health.getAIHealth }));

const { env } = await import('../src/config/env.js');
const { getDashboardSummary, resetDashboardCachesForTests, HEALTH_CACHE_TTL_MS } =
  await import('../src/dashboard/dashboard.service.js');

const T0 = Date.UTC(2026, 8, 1);
const at = (minutes: number) => new Date(T0 + minutes * 60_000);
const cid = (n: number) => `change-${String(n).padStart(3, '0')}`;
const rid = (n: number) => `resource-${String(n).padStart(3, '0')}`;

function change(n: number, resource = n % 3): Row {
  return {
    _id: cid(n),
    resourceId: rid(resource),
    changeId: `src:${n}`,
    source: 'github',
    timestamp: at(n), // higher n = newer
    summary: `Change ${n}`,
    changeType: 'deployment',
    evidenceIds: [],
    status: 'detected',
    metadata: {},
    createdAt: at(n),
    updatedAt: at(n)
  };
}

const analysis = (n: number, level: string, analyzedAt: Date): Row => ({
  _id: `a-${n}-${analyzedAt.getTime()}`,
  changeId: cid(n),
  analyzedAt,
  risk: { score: { low: 10, medium: 40, high: 70, critical: 95 }[level] ?? 0, level }
});

const comparison = (n: number, outcome: string, comparedAt: Date): Row => ({
  _id: `cmp-${n}-${comparedAt.getTime()}`,
  changeId: cid(n),
  outcome,
  comparedAt
});

const healthy = (name: string) => ({ configured: true, reachable: true, message: `${name} ok` });

beforeEach(() => {
  for (const key of Object.keys(db) as Array<keyof typeof db>) db[key] = [];
  resetDashboardCachesForTests();
  vi.clearAllMocks();
  health.getKubernetesHealth.mockResolvedValue(healthy('k8s'));
  health.getPrometheusHealth.mockResolvedValue(healthy('prom'));
  health.getLokiHealth.mockResolvedValue(healthy('loki'));
  health.getAIHealth.mockResolvedValue({ available: true, provider: 'ollama', model: 'm', message: 'ok' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboard counts (plan 6.1)', () => {
  beforeEach(() => {
    // 40 changes, far more than the 12-item recent window.
    db.changes = Array.from({ length: 40 }, (_, i) => change(i));
    db.resources = Array.from({ length: 3 }, (_, i) => ({ _id: rid(i), name: `svc-${i}` }));
  });

  it('counts risk levels across ALL analyzed changes, not just the 12 newest analyses', async () => {
    // Changes 0..19: critical x5, high x7, medium x5, low x3.
    const levels = [
      ...Array(5).fill('critical'),
      ...Array(7).fill('high'),
      ...Array(5).fill('medium'),
      ...Array(3).fill('low')
    ];

    db.analyses = levels.map((level, i) => analysis(i, level, at(1000 + i)));

    const { changeCounts, riskDistribution } = (await getDashboardSummary()) as any;

    expect(riskDistribution).toEqual({ low: 3, medium: 5, high: 7, critical: 5 });
    expect(changeCounts.highCriticalRisk).toBe(12);
    expect(changeCounts.analyzed).toBe(20);
    expect(changeCounts.total).toBe(40);
  });

  it('counts each change once, by its latest analysis, because analyses are versioned', async () => {
    db.analyses = [
      analysis(1, 'critical', at(100)), // superseded
      analysis(1, 'low', at(200)), // latest
      analysis(2, 'low', at(100)), // superseded
      analysis(2, 'high', at(200)) // latest
    ];

    const { riskDistribution, changeCounts } = await getDashboardSummary();

    expect(riskDistribution).toEqual({ low: 1, medium: 0, high: 1, critical: 0 });
    expect(changeCounts.analyzed).toBe(2);
    expect(changeCounts.highCriticalRisk).toBe(1);
  });

  it('counts unexpected and insufficient-evidence outcomes across all comparisons, latest per change', async () => {
    db.comparisons = [
      ...Array.from({ length: 15 }, (_, i) =>
        comparison(i, i < 4 ? 'unexpected_impact' : 'insufficient_evidence', at(500 + i))
      ),
      comparison(20, 'unexpected_impact', at(100)), // superseded below
      comparison(20, 'predicted_and_observed', at(200))
    ];

    const { changeCounts } = await getDashboardSummary();

    expect(changeCounts.unexpectedImpact).toBe(4);
    expect(changeCounts.insufficientEvidence).toBe(11);
  });

  it('reports investigated = distinct changes with a COMPLETED investigation, not a capped list', async () => {
    db.investigations = [
      { _id: 'i1', changeId: cid(1), status: 'completed' },
      { _id: 'i2', changeId: cid(1), status: 'completed' },
      { _id: 'i3', changeId: cid(2), status: 'completed' },
      { _id: 'i4', changeId: cid(3), status: 'failed' },
      { _id: 'i5', changeId: cid(4), status: 'pending' }
    ];

    const { changeCounts } = (await getDashboardSummary()) as any;

    expect(changeCounts.investigated).toBe(2);
    expect(changeCounts).not.toHaveProperty('underInvestigation');
  });

  it('is not capped at 100 investigations', async () => {
    db.investigations = Array.from({ length: 150 }, (_, i) => ({
      _id: `i${i}`,
      changeId: cid(i),
      status: 'completed'
    }));
    db.changes = Array.from({ length: 150 }, (_, i) => change(i));

    expect((await getDashboardSummary()).changeCounts.investigated).toBe(150);
  });

  it('returns zeros, not undefined, for an empty database', async () => {
    db.changes = [];

    const summary = await getDashboardSummary();

    expect(summary.changeCounts).toEqual({
      total: 0,
      analyzed: 0,
      highCriticalRisk: 0,
      investigated: 0,
      unexpectedImpact: 0,
      insufficientEvidence: 0
    });
    expect(summary.riskDistribution).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
    expect(summary.recentChanges).toEqual([]);
    expect(summary.recentOutcomes).toEqual([]);
  });
});

describe('recent changes join (plan 6.2)', () => {
  beforeEach(() => {
    db.changes = Array.from({ length: 40 }, (_, i) => change(i));
    db.resources = Array.from({ length: 3 }, (_, i) => ({ _id: rid(i), name: `svc-${i}` }));
  });

  it('shows risk for the newest changes even when their analyses are older than 12 other analyses', async () => {
    // The 12 newest CHANGES (28..39) were analyzed long ago; 20 older changes were analyzed recently.
    // Building the lookup from "the 12 newest analyses" misses every one of the changes on screen.
    db.analyses = [
      ...Array.from({ length: 12 }, (_, i) => analysis(28 + i, 'high', at(10 + i))),
      ...Array.from({ length: 20 }, (_, i) => analysis(i, 'low', at(5000 + i)))
    ];

    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges).toHaveLength(12);
    expect(recentChanges.every((item) => item.risk?.level === 'high')).toBe(true);
    expect(recentChanges[0]).toMatchObject({ id: cid(39), risk: { score: 70, level: 'high' } });
  });

  it("uses a change's latest analysis when it has several", async () => {
    db.analyses = [analysis(39, 'low', at(100)), analysis(39, 'critical', at(200)), analysis(39, 'medium', at(150))];

    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges[0]?.risk?.level).toBe('critical');
  });

  it('leaves risk out for a change that genuinely has no analysis', async () => {
    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges[0]).not.toHaveProperty('risk');
  });

  it('shows the NEWEST observation status, not the oldest', async () => {
    db.observations = [
      { _id: 'o1', changeId: cid(39), status: 'pending', createdAt: at(100) },
      { _id: 'o2', changeId: cid(39), status: 'observed', createdAt: at(300) },
      { _id: 'o3', changeId: cid(39), status: 'insufficient_evidence', createdAt: at(200) }
    ];

    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges[0]?.realityStatus).toBe('observed');
    expect(recentChanges[1]?.realityStatus).toBe('unavailable');
  });

  it("shows each change's own latest comparison outcome even if it is not among the 12 newest comparisons", async () => {
    db.comparisons = [
      comparison(39, 'partially_predicted', at(10)),
      comparison(39, 'predicted_and_observed', at(20)),
      ...Array.from({ length: 20 }, (_, i) => comparison(i, 'no_significant_impact', at(9000 + i)))
    ];

    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges[0]?.outcome).toBe('predicted_and_observed');
  });

  it('marks prediction availability from the displayed changes', async () => {
    db.predictions = [{ _id: 'p1', changeId: cid(38) }];

    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges.find((item) => item.id === cid(38))?.predictionStatus).toBe('available');
    expect(recentChanges.find((item) => item.id === cid(39))?.predictionStatus).toBe('unavailable');
  });

  it('resolves resource names for the displayed changes even with a large inventory', async () => {
    db.resources = [
      ...Array.from({ length: 600 }, (_, i) => ({ _id: `other-${i}`, name: `other-${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ _id: rid(i), name: `svc-${i}` }))
    ];

    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges.every((item) => item.resourceName?.startsWith('svc-'))).toBe(true);
  });

  it('orders recent changes newest first', async () => {
    const { recentChanges } = await getDashboardSummary();

    expect(recentChanges.map((item) => item.id).slice(0, 3)).toEqual([cid(39), cid(38), cid(37)]);
  });

  it('lists recent outcomes one per change, newest first, with the right change summary', async () => {
    db.comparisons = [
      comparison(3, 'unexpected_impact', at(50)), // an old change (not in the recent 12)
      comparison(3, 'predicted_and_observed', at(900)),
      comparison(30, 'insufficient_evidence', at(800)),
      ...Array.from({ length: 10 }, (_, i) => comparison(10 + i, 'no_significant_impact', at(100 + i)))
    ];

    const { recentOutcomes } = await getDashboardSummary();

    expect(recentOutcomes).toHaveLength(8);
    expect(recentOutcomes[0]).toMatchObject({
      changeId: cid(3),
      outcome: 'predicted_and_observed',
      summary: 'Change 3'
    });
    expect(recentOutcomes[1]).toMatchObject({ changeId: cid(30), summary: 'Change 30' });
    expect(new Set(recentOutcomes.map((item) => item.changeId)).size).toBe(8);
    expect(recentOutcomes.map((item) => item.summary)).not.toContain('Change');
  });
});

describe('integration status (plan 6.3)', () => {
  const original = { token: env.githubToken, base: env.githubApiBaseUrl };

  afterEach(() => {
    env.githubToken = original.token;
    env.githubApiBaseUrl = original.base;
  });

  it('reports GitHub as not configured when there is no token, despite the default base URL', async () => {
    env.githubToken = '';

    expect(env.githubApiBaseUrl).toBeTruthy();
    expect((await getDashboardSummary()).integrationStatus.github).toBe('not_configured');
  });

  it('reports GitHub as configured when a token is set', async () => {
    env.githubToken = 'ghp_example';

    expect((await getDashboardSummary()).integrationStatus.github).toBe('configured');
  });
});

describe('health probe caching (plan 6.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(at(0));
  });

  it('probes each system once across repeated summaries inside the TTL', async () => {
    for (let i = 0; i < 5; i += 1) await getDashboardSummary();

    expect(health.getKubernetesHealth).toHaveBeenCalledTimes(1);
    expect(health.getPrometheusHealth).toHaveBeenCalledTimes(1);
    expect(health.getLokiHealth).toHaveBeenCalledTimes(1);
    expect(health.getAIHealth).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight probe between concurrent requests', async () => {
    await Promise.all(Array.from({ length: 10 }, () => getDashboardSummary()));

    expect(health.getKubernetesHealth).toHaveBeenCalledTimes(1);
    expect(health.getAIHealth).toHaveBeenCalledTimes(1);
  });

  it('probes again once the TTL has passed', async () => {
    await getDashboardSummary();
    vi.setSystemTime(at(0).getTime() + HEALTH_CACHE_TTL_MS - 1);
    await getDashboardSummary();

    expect(health.getKubernetesHealth).toHaveBeenCalledTimes(1);

    vi.setSystemTime(at(0).getTime() + HEALTH_CACHE_TTL_MS + 1);
    await getDashboardSummary();

    expect(health.getKubernetesHealth).toHaveBeenCalledTimes(2);
    expect(health.getAIHealth).toHaveBeenCalledTimes(2);
  });

  it('keeps the TTL inside the plan window of 15-30 seconds', () => {
    expect(HEALTH_CACHE_TTL_MS).toBeGreaterThanOrEqual(15_000);
    expect(HEALTH_CACHE_TTL_MS).toBeLessThanOrEqual(30_000);
  });

  it('caches a failed probe as "unavailable" instead of re-probing a down system on every poll', async () => {
    health.getKubernetesHealth.mockRejectedValue(new Error('connection refused'));

    const first = await getDashboardSummary();
    const second = await getDashboardSummary();

    expect(first.integrationStatus.kubernetes).toMatchObject({
      reachable: false,
      message: 'Kubernetes status unavailable.'
    });
    expect(second.integrationStatus.kubernetes).toEqual(first.integrationStatus.kubernetes);
    expect(health.getKubernetesHealth).toHaveBeenCalledTimes(1);
  });

  it('caches each integration under its own key', async () => {
    health.getLokiHealth.mockResolvedValue({ configured: true, reachable: false, message: 'loki down' });

    const { integrationStatus } = await getDashboardSummary();

    expect(integrationStatus.kubernetes.message).toBe('k8s ok');
    expect(integrationStatus.prometheus.message).toBe('prom ok');
    expect(integrationStatus.loki.message).toBe('loki down');
  });

  it('leaves no timer pending after a fast AI health check', async () => {
    await getDashboardSummary();

    // The old Promise.race left a 2s timer alive after every request, holding the event loop open.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still falls back after 2 seconds when the AI provider hangs, and then leaves no timer', async () => {
    health.getAIHealth.mockReturnValue(new Promise(() => undefined));

    const pending = getDashboardSummary();

    await vi.advanceTimersByTimeAsync(2000);

    expect((await pending).aiStatus).toMatchObject({ available: false, message: 'AI status unavailable.' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back when the AI health check throws', async () => {
    health.getAIHealth.mockRejectedValue(new Error('boom'));

    expect((await getDashboardSummary()).aiStatus).toMatchObject({ available: false, provider: 'unknown' });
  });
});
