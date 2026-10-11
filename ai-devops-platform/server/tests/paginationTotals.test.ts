import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Review 2.21/3.10. Three places reported a fetched page's size as the true
 * total. This is the most significant of the three: getSecuritySummary fetched
 * up to 1000 findings and derived EVERY field (total, per-severity counts,
 * categories, open count, affectedResources) from that capped array, so a
 * deployment with more than 1000 findings got a silently wrong summary with no
 * indication anything was truncated.
 */
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: { exists: vi.fn() } }));
vi.mock('../src/models/Change.js', () => ({ ChangeModel: { exists: vi.fn(), countDocuments: vi.fn() } }));
vi.mock('../src/models/Evidence.js', () => ({ EvidenceModel: { countDocuments: vi.fn() } }));

describe('getSecuritySummary uses real database counts, not a capped page size (review 2.21/3.10)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('total reflects a real aggregation count, not the length of a fetched (and possibly truncated) array', async () => {
    // Simulates a deployment with 1,500 matching findings -- more than the old
    // 1000-record fetch cap. The aggregation reports the true count directly,
    // it never fetches all 1,500 documents just to measure them.
    const aggregateResults = [
      { _id: 'critical', count: 900 },
      { _id: 'high', count: 600 }
    ];
    const aggregate = vi.fn().mockResolvedValueOnce(aggregateResults).mockResolvedValueOnce([]);
    const countDocuments = vi.fn().mockResolvedValue(300);
    const distinct = vi.fn().mockResolvedValue(['r1', 'r2']);
    const find = vi.fn().mockReturnValue({ select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) });

    vi.doMock('../src/models/SecurityFinding.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/models/SecurityFinding.js')>();
      return {
        ...actual,
        SecurityFindingModel: { ...actual.SecurityFindingModel, aggregate, countDocuments, distinct, find }
      };
    });

    const { getSecuritySummary } = await import('../src/services/securityAnalysisService.js');
    const summary = await getSecuritySummary({});

    // 900 + 600 from the two severity groups -- the real total, not capped at 1000.
    expect(summary.total).toBe(1500);
    expect(summary.critical).toBe(900);
    expect(summary.high).toBe(600);
    expect(summary.affectedResources).toBe(2);
  });
});

describe('getResourceHistory reports a real total, not the fetched page size (review 2.21/3.10)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('pagination.total comes from a count query, independent of how many records were fetched for the current page', async () => {
    vi.doMock('../src/intelligence/historical-intelligence.service.js', () => ({
      getHistoricalOutcomes: vi.fn().mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({ changeId: `c${i}` }))),
      // Simulates a resource with 340 total historical changes -- far more than
      // any single fetched page would contain.
      countHistoricalOutcomes: vi.fn().mockResolvedValue(340)
    }));

    const { getResourceHistory } = await import('../src/intelligence/intelligence.controller.js');
    const request = { query: { page: '1', limit: '25' }, params: { resourceId: '507f1f77bcf86cd799439011' } };
    const json = vi.fn();
    const response = { status: () => ({ json }) };

    await getResourceHistory(request as never, response as never, vi.fn());

    const payload = json.mock.calls[0][0];
    expect(payload.pagination.total).toBe(340);
    expect(payload.pagination.pages).toBe(Math.ceil(340 / 25));
  });
});
