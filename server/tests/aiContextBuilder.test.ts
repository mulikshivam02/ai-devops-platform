import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-ins for the mongoose models. The evidence fake really filters, sorts and limits, so
// the tests exercise the selection logic rather than just asserting that some query was issued.
type Doc = Record<string, any>;

const store = vi.hoisted(() => ({
  evidence: [] as Doc[],
  findings: [] as Doc[],
  change: undefined as Doc | undefined,
  evidenceFindCalls: [] as Doc[]
}));

function chain<T>(result: () => T) {
  const q: any = {
    sort: () => q,
    limit: () => q,
    select: () => q,
    lean: () => q,
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve().then(result).then(resolve, reject)
  };

  return q;
}

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

const evidenceModel = vi.hoisted(() => ({
  find: (filter: Doc) => {
    store.evidenceFindCalls.push(filter);
    let rows = [...store.evidence];
    let max = Infinity;
    const q: any = {
      sort: () => {
        rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return q;
      },
      limit: (n: number) => {
        max = n;
        return q;
      },
      then: (resolve: (v: Doc[]) => unknown, reject: (r: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            if (filter._id?.$in) rows = rows.filter((r) => filter._id.$in.some((id: unknown) => sameId(id, r._id)));
            if (filter._id?.$nin) rows = rows.filter((r) => !filter._id.$nin.some((id: unknown) => sameId(id, r._id)));
            if (filter.resourceId) rows = rows.filter((r) => sameId(r.resourceId, filter.resourceId));
            return rows.slice(0, max);
          })
          .then(resolve, reject)
    };

    return q;
  }
}));

const changeModel = vi.hoisted(() => ({
  findById: async () => store.change,
  find: () => ({ sort: () => ({ limit: async () => [] }) })
}));
const securityModel = vi.hoisted(() => ({
  find: () => ({ sort: () => ({ limit: () => ({ lean: async () => store.findings }) }) })
}));
const dependents = vi.hoisted(() => ({ getResourceDependents: vi.fn() }));
const history = vi.hoisted(() => ({
  findSimilarChanges: vi.fn(),
  getHistoricalRisk: vi.fn(),
  getPredictionAccuracyHistory: vi.fn(),
  getPatterns: vi.fn()
}));
const none = () => ({ findOne: () => chain(() => null) });

vi.mock('../src/models/Change.js', () => ({
  ChangeModel: changeModel,
  toChangeDTO: (doc: Doc) => ({
    id: String(doc._id),
    summary: 'summary',
    changeType: 'deployment',
    source: 'github',
    resourceId: String(doc.resourceId),
    evidenceIds: doc.evidenceIds.map(String),
    timestamp: '2026-09-01T00:00:00.000Z',
    status: 'detected'
  })
}));
vi.mock('../src/models/ChangeAnalysis.js', () => ({ ChangeAnalysisModel: none(), toChangeAnalysisDTO: (d: Doc) => d }));
vi.mock('../src/models/Evidence.js', () => ({
  EvidenceModel: evidenceModel,
  toEvidenceDTO: (doc: Doc) => ({
    id: String(doc._id),
    evidenceType: 'commit',
    source: 'github',
    timestamp: doc.timestamp.toISOString(),
    resourceId: String(doc.resourceId),
    payload: doc.payload ?? {},
    metadata: {}
  })
}));
vi.mock('../src/models/PredictionSnapshot.js', () => ({
  PredictionSnapshotModel: none(),
  toPredictionSnapshotDTO: (d: Doc) => d
}));
vi.mock('../src/models/ObservedImpact.js', () => ({ ObservedImpactModel: none(), toObservedImpactDTO: (d: Doc) => d }));
vi.mock('../src/models/PredictionComparison.js', () => ({
  PredictionComparisonModel: none(),
  toPredictionComparisonDTO: (d: Doc) => d
}));
vi.mock('../src/models/Resource.js', () => ({
  ResourceModel: { findById: () => chain(() => ({ _id: RESOURCE, name: 'svc', type: 'kubernetes_deployment' })) }
}));
vi.mock('../src/models/SecurityFinding.js', () => ({ SecurityFindingModel: securityModel }));
vi.mock('../src/services/dependencyService.js', () => dependents);
vi.mock('../src/intelligence/historical-intelligence.service.js', () => history);

const hex = (n: number) => n.toString(16).padStart(24, '0');
const RESOURCE = hex(0xa);
const CHANGE = hex(0xc);

const { buildInvestigationContext } = await import('../src/ai/contextBuilder.js');

function evidenceDoc(n: number, minutesAgo: number, resourceId = RESOURCE): Doc {
  return { _id: hex(0x1000 + n), resourceId, timestamp: new Date(Date.UTC(2026, 8, 1) - minutesAgo * 60_000) };
}

function finding(n: number, resourceId?: string): Doc {
  return {
    _id: hex(0x2000 + n),
    category: 'misconfiguration',
    severity: 'low',
    title: `finding ${n}`,
    description: 'd',
    ...(resourceId ? { resourceId } : {}),
    evidenceIds: [],
    confidence: 50
  };
}

beforeEach(() => {
  store.evidence = [];
  store.findings = [];
  store.evidenceFindCalls = [];
  store.change = { _id: CHANGE, resourceId: RESOURCE, evidenceIds: [] };
  dependents.getResourceDependents.mockReset().mockResolvedValue([]);
  history.findSimilarChanges.mockReset().mockResolvedValue([]);
  history.getHistoricalRisk.mockReset().mockResolvedValue({ status: 'insufficient_evidence' });
  history.getPredictionAccuracyHistory.mockReset().mockResolvedValue({ status: 'insufficient_evidence' });
  history.getPatterns.mockReset().mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('evidence selection (plan 5.4)', () => {
  it("keeps the change's own linked evidence even when newer resource evidence would fill every slot", async () => {
    // 60 newer, unrelated evidence records on the same resource, plus one OLD linked record.
    const linked = evidenceDoc(0, 60 * 24 * 30);
    store.evidence = [linked, ...Array.from({ length: 60 }, (_, i) => evidenceDoc(i + 1, i + 1))];
    store.change = { _id: CHANGE, resourceId: RESOURCE, evidenceIds: [linked._id] };

    const context = await buildInvestigationContext(CHANGE);

    expect(context.evidence).toHaveLength(40);
    expect(context.evidence.map((e) => e.id)).toContain(String(linked._id));
    // The rest are the NEWEST contextual records.
    expect(context.evidence.map((e) => e.id)).toContain(String(hex(0x1000 + 1)));
    expect(context.evidence.map((e) => e.id)).not.toContain(String(hex(0x1000 + 60)));
  });

  it('does not return the same evidence twice when it is both linked and on the resource', async () => {
    store.evidence = [evidenceDoc(1, 5), evidenceDoc(2, 10), evidenceDoc(3, 15)];
    store.change = { _id: CHANGE, resourceId: RESOURCE, evidenceIds: [store.evidence[1]?._id] };

    const context = await buildInvestigationContext(CHANGE);
    const ids = context.evidence.map((e) => e.id);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('skips the contextual query entirely when linked evidence already fills the budget', async () => {
    store.evidence = Array.from({ length: 45 }, (_, i) => evidenceDoc(i, i + 1));
    store.change = { _id: CHANGE, resourceId: RESOURCE, evidenceIds: store.evidence.map((e) => e._id) };

    const context = await buildInvestigationContext(CHANGE);

    expect(context.evidence).toHaveLength(40);
    expect(store.evidenceFindCalls).toHaveLength(1);
  });

  it('works when the change has no linked evidence', async () => {
    store.evidence = [evidenceDoc(1, 5), evidenceDoc(2, 10)];

    const context = await buildInvestigationContext(CHANGE);

    expect(context.evidence.map((e) => e.id)).toEqual([hex(0x1001), hex(0x1002)]);
  });

  it("does not pull in another resource's evidence", async () => {
    store.evidence = [evidenceDoc(1, 5), evidenceDoc(2, 5, hex(0xbad))];

    const context = await buildInvestigationContext(CHANGE);

    expect(context.evidence.map((e) => e.id)).toEqual([hex(0x1001)]);
  });
});

describe('blast radius lookups (plan 5.3)', () => {
  it('traverses dependencies once per distinct root, not once per finding', async () => {
    store.findings = Array.from({ length: 100 }, (_, i) => finding(i)); // all fall back to the change's resource

    await buildInvestigationContext(CHANGE);

    expect(dependents.getResourceDependents).toHaveBeenCalledTimes(1);
    expect(dependents.getResourceDependents).toHaveBeenCalledWith(RESOURCE, 10);
  });

  it('makes one call per distinct root across mixed findings', async () => {
    store.findings = [
      finding(1),
      finding(2, hex(0xb1)),
      finding(3, hex(0xb1)),
      finding(4, hex(0xb2)),
      finding(5, RESOURCE)
    ];

    await buildInvestigationContext(CHANGE);

    const roots = dependents.getResourceDependents.mock.calls.map(([root]) => root).sort();

    expect(roots).toEqual([RESOURCE, hex(0xb1), hex(0xb2)].sort());
  });

  it('bounds how many traversals run at once', async () => {
    store.findings = Array.from({ length: 12 }, (_, i) => finding(i, hex(0xb00 + i)));
    let inFlight = 0;
    let peak = 0;
    dependents.getResourceDependents.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;

      return [];
    });

    await buildInvestigationContext(CHANGE);

    expect(dependents.getResourceDependents).toHaveBeenCalledTimes(12);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('gives each finding the blast radius of its own root', async () => {
    store.findings = [finding(1, hex(0xb1)), finding(2, hex(0xb2))];
    dependents.getResourceDependents.mockImplementation(async (root: string) =>
      root === hex(0xb1) ? [{ sourceResourceId: hex(0xd1), targetResourceId: hex(0xb1) }] : []
    );

    const context = await buildInvestigationContext(CHANGE);
    const byTitle = Object.fromEntries(context.securityFindings.map((f) => [f.title, f.dependencyBlastRadius]));

    expect(byTitle['finding 1']?.directDependents).toEqual([hex(0xd1)]);
    expect(byTitle['finding 2']?.directDependents).toEqual([]);
  });

  it('records a failed traversal in lookupErrors without failing the investigation', async () => {
    store.findings = [finding(1, hex(0xb1)), finding(2, hex(0xb2))];
    dependents.getResourceDependents.mockImplementation(async (root: string) => {
      if (root === hex(0xb1)) throw new Error('graph query failed');

      return [];
    });

    const context = await buildInvestigationContext(CHANGE);

    expect(context.securityFindings).toHaveLength(2);
    expect(context.historicalIntelligence.lookupErrors).toEqual([`blastRadius:${hex(0xb1)}`]);
  });
});

describe('lookup failures are distinguishable from empty history (plan 5.7)', () => {
  it('reports no lookup errors when every lookup succeeds', async () => {
    const context = await buildInvestigationContext(CHANGE);

    expect(context.historicalIntelligence.lookupErrors).toEqual([]);
    expect(context.historicalIntelligence.riskTrend).toEqual({ status: 'insufficient_evidence' });
  });

  it('marks each failed section as an error, names it, and logs the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    history.findSimilarChanges.mockRejectedValue(new Error('similarity blew up'));
    history.getHistoricalRisk.mockRejectedValue(new Error('risk blew up'));

    const context = await buildInvestigationContext(CHANGE);
    const { historicalIntelligence: h } = context;

    expect(h.lookupErrors).toEqual(['similarChanges', 'riskTrend']);
    expect(h.riskTrend).toMatchObject({ status: 'error' });
    expect(h.riskTrend).not.toMatchObject({ status: 'insufficient_evidence' });
    expect(h.predictionAccuracy).toEqual({ status: 'insufficient_evidence' });
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).toContain('similarity blew up');
  });
});

describe('input handling', () => {
  it('rejects a malformed change id', async () => {
    await expect(buildInvestigationContext('not-an-id')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 404 for an unknown change', async () => {
    store.change = undefined;

    await expect(buildInvestigationContext(CHANGE)).rejects.toMatchObject({ statusCode: 404 });
  });
});
