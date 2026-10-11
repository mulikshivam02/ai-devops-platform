import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

/**
 * Review 4.2/4.3. Two GitHub integration fixes, tested independently of the
 * full import pipeline (which tests/githubIntegrationApi.test.ts already covers
 * end to end):
 *  - the dedup lookups must be scoped by resourceId, or importing the same repo
 *    into a second Resource silently sees every commit as "already present"
 *    (belonging to the first resource) and imports nothing at all;
 *  - a commit with no discoverable date must be skipped, not given a fabricated
 *    1970-01-01 timestamp that then fails every observation-window query.
 */

const fetchMock = vi.hoisted(() => vi.fn());
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() }));
const changeModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() }));

vi.stubGlobal('fetch', fetchMock);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({
  EvidenceModel: evidenceModel,
  toEvidenceDTO: (record: any) => ({ id: String(record._id), correlationId: record.correlationId })
}));
vi.mock('../src/models/Change.js', () => ({
  ChangeModel: changeModel,
  toChangeDTO: (record: any) => ({
    id: String(record._id),
    changeId: record.changeId,
    source: record.source,
    summary: record.summary,
    status: record.status
  })
}));

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body)
  };
}

describe('GitHub import dedup is scoped by resourceId (review 4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    resourceModel.exists.mockResolvedValue(true);
    evidenceModel.countDocuments.mockResolvedValue(1);
    evidenceModel.create.mockImplementation(async (input: any) => ({
      _id: new Types.ObjectId(),
      correlationId: input.correlationId
    }));
    changeModel.countDocuments.mockResolvedValue(1);
    changeModel.create.mockImplementation(async (input: any) => ({
      _id: new Types.ObjectId(),
      changeId: input.changeId,
      source: input.source,
      summary: input.summary,
      status: input.status
    }));
  });

  it('the "already imported" lookup includes resourceId in its filter', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          sha: 'abc123',
          commit: { message: 'fix bug', author: { name: 'a', date: '2026-01-01T00:00:00Z' } },
          html_url: 'https://github.com/octo/demo/commit/abc123'
        }
      ])
    );
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 404 })); // commit detail (stats) lookups

    changeModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    });
    evidenceModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const { importGitHubCommits } = await import('../src/integrations/github/github.service.js');
    await importGitHubCommits('octo', 'demo', '507f1f77bcf86cd799439011', 10);

    // Every ChangeModel.findOne call made while checking "is this commit
    // already imported" must be scoped by resourceId -- without it, a second
    // resource importing the same repo would find the first resource's change
    // and treat every commit as already present.
    const dedupCalls = changeModel.findOne.mock.calls.filter(([filter]) => 'changeId' in filter);
    expect(dedupCalls.length).toBeGreaterThan(0);
    for (const [filter] of dedupCalls) {
      expect(filter).toHaveProperty('resourceId', '507f1f77bcf86cd799439011');
    }

    const evidenceDedupCalls = evidenceModel.findOne.mock.calls;
    expect(evidenceDedupCalls.length).toBeGreaterThan(0);
    for (const [filter] of evidenceDedupCalls) {
      expect(filter).toHaveProperty('resourceId', '507f1f77bcf86cd799439011');
    }
  });
});

describe('GitHub commit import skips commits with no discoverable date (review 4.3)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('a commit with no author or committer date is dropped, not given a 1970 timestamp', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { sha: 'has-date', commit: { message: 'ok', author: { date: '2026-01-01T00:00:00Z' } } },
        { sha: 'no-date', commit: { message: 'no date anywhere' } }
      ])
    );
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 404 })); // commit detail (stats) lookups

    const { getGitHubRecentCommits } = await import('../src/integrations/github/github.client.js');
    const commits = await getGitHubRecentCommits('octo', 'demo', 10);
    expect(commits.map((c) => c.sha)).toEqual(['has-date']);
    expect(commits.some((c) => c.timestamp === new Date(0).toISOString())).toBe(false);
  });
});
