import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

/**
 * Review 4.1 / 4.3 -- GitHub client error mapping, rate limiting, paging, and incremental import.
 * fetch is stubbed; the client and service code is real.
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

const client = await import('../src/integrations/github/github.client.js');
const service = await import('../src/integrations/github/github.service.js');

function res(body: unknown, init: { status?: number; headers?: Record<string, string>; raw?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    text: async () => init.raw ?? JSON.stringify(body)
  };
}

const commit = (sha: string, date = '2026-09-09T11:00:00Z') => ({
  sha,
  commit: { message: `msg ${sha}`, author: { name: 'Ada', date } },
  html_url: `https://github.com/octo/demo/commit/${sha}`
});

function urlOf(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe('error mapping (never a user-facing 401)', () => {
  it('maps a rejected GITHUB_TOKEN (401) to 502 so the browser does not sign the user out', async () => {
    fetchMock.mockResolvedValue(res({ message: 'Bad credentials' }, { status: 401 }));
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 502,
      code: 'GITHUB_AUTH_FAILED'
    });
  });

  it('maps 403 without rate-limit signals to 502 GITHUB_FORBIDDEN', async () => {
    fetchMock.mockResolvedValue(
      res({ message: 'Resource not accessible' }, { status: 403, headers: { 'x-ratelimit-remaining': '4000' } })
    );
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 502,
      code: 'GITHUB_FORBIDDEN'
    });
  });

  it('keeps 404 as 404 (the caller supplied the repository)', async () => {
    fetchMock.mockResolvedValue(res({ message: 'Not Found' }, { status: 404 }));
    await expect(client.getGitHubRepositorySummary('octo', 'nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'GITHUB_REPOSITORY_NOT_FOUND'
    });
  });

  it('reports a malformed 200 body as an invalid upstream response, not a network error', async () => {
    fetchMock.mockResolvedValue(res(null, { raw: '<html>oops</html>' }));
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 502,
      code: 'GITHUB_INVALID_RESPONSE'
    });
  });

  it('rejects a commits payload that is not an array', async () => {
    fetchMock.mockResolvedValue(res({ message: 'surprise' }));
    await expect(client.getGitHubCommitPage('octo', 'demo', 5)).rejects.toMatchObject({
      code: 'GITHUB_INVALID_RESPONSE'
    });
  });

  it('still reports a genuine network failure as 503', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 503,
      code: 'GITHUB_NETWORK_ERROR'
    });
  });
});

describe('rate limits', () => {
  it('detects an exhausted primary limit from headers and reports when it resets', async () => {
    const reset = Math.floor(Date.parse('2026-09-14T12:00:00Z') / 1000);
    fetchMock.mockResolvedValue(
      res(
        { message: 'API rate limit exceeded' },
        { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } }
      )
    );
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 429,
      code: 'GITHUB_RATE_LIMIT',
      message: expect.stringContaining('2026-09-14T12:00:00.000Z')
    });
  });

  it('detects a secondary rate limit (Retry-After with quota remaining)', async () => {
    fetchMock.mockResolvedValue(
      res(
        { message: 'You have exceeded a secondary rate limit' },
        { status: 403, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '4999' } }
      )
    );
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 429,
      code: 'GITHUB_RATE_LIMIT'
    });
  });

  it('treats a bare 429 as a rate limit', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 429 }));
    await expect(client.getGitHubRepositorySummary('octo', 'demo')).rejects.toMatchObject({
      statusCode: 429,
      code: 'GITHUB_RATE_LIMIT'
    });
  });

  it('stops spending quota on per-commit stats once a rate limit is hit, but still returns the commits', async () => {
    const shas = Array.from({ length: 12 }, (_, i) => `sha${i}`);
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/commits?')
        ? res(shas.map((sha) => commit(sha)))
        : res({ message: 'limit' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
    );
    const { commits } = await client.getGitHubCommitPage('octo', 'demo', 12);
    const detailCalls = fetchMock.mock.calls.filter(([url]) => !String(url).includes('/commits?')).length;
    expect(commits).toHaveLength(12);
    expect(commits.every((c) => c.additions === undefined)).toBe(true);
    // 5 workers start together; after the first rejection the other 7 commits are skipped.
    expect(detailCalls).toBeLessThanOrEqual(5);
  });

  it('records real commit stats when the detail endpoint succeeds', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/commits?')
        ? res([commit('abc')])
        : res({
            stats: { additions: 10, deletions: 2 },
            files: [{ filename: 'a' }, { filename: 'b' }, { filename: 'c' }]
          })
    );
    const { commits } = await client.getGitHubCommitPage('octo', 'demo', 5);
    expect(commits[0]).toMatchObject({ additions: 10, deletions: 2, changedFiles: 3 });
  });
});

describe('paging and branches', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/commits?') ? res([commit('abc')]) : res({})
    );
  });

  it('sends sha (branch) and page, URL-encoded, and omits page=1', async () => {
    await client.getGitHubCommitPage('octo', 'demo', 10, { ref: 'release/1.2', page: 3 });
    const url = urlOf(0);
    expect(url.searchParams.get('sha')).toBe('release/1.2');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('per_page')).toBe('10');

    fetchMock.mockClear();
    await client.getGitHubCommitPage('octo', 'demo', 10, { page: 1 });
    expect(urlOf(0).searchParams.has('page')).toBe(false);
    expect(urlOf(0).searchParams.has('sha')).toBe(false);
  });

  it('reads hasNextPage from the Link header', async () => {
    const link =
      '<https://api.github.com/repositories/1/commits?page=2>; rel="next", <https://api.github.com/repositories/1/commits?page=9>; rel="last"';
    fetchMock.mockImplementation(async () => res([commit('abc')], { headers: { link } }));
    expect((await client.getGitHubCommitPage('octo', 'demo', 1)).hasNextPage).toBe(true);

    fetchMock.mockImplementation(async () =>
      res([commit('abc')], { headers: { link: '<https://x/?page=1>; rel="prev"' } })
    );
    expect((await client.getGitHubCommitPage('octo', 'demo', 1)).hasNextPage).toBe(false);

    fetchMock.mockImplementation(async () => res([commit('abc')]));
    expect((await client.getGitHubCommitPage('octo', 'demo', 1)).hasNextPage).toBe(false);
  });
});

describe('ref / page validation', () => {
  it.each(['main', 'release/1.2', 'v1.0.0', 'abc123def456', 'feature/a_b-c'])('accepts ref %s', (ref) => {
    expect(service.validateCommitRef(ref)).toBe(ref);
  });
  it.each(['--upload-pack=x', '-x', 'a..b', 'has space', 'semi;colon', 'x'.repeat(256), 'new\nline', 123])(
    'rejects ref %j',
    (ref) => {
      expect(() => service.validateCommitRef(ref)).toThrow();
    }
  );
  it('treats absent/empty ref and page as "not supplied"', () => {
    expect(service.validateCommitRef(undefined)).toBeUndefined();
    expect(service.validateCommitRef('')).toBeUndefined();
    expect(service.validateCommitPage(undefined)).toBeUndefined();
    expect(service.validateCommitPage('')).toBeUndefined();
  });
  it('accepts page 1..100 as number or numeric string and rejects the rest', () => {
    expect(service.validateCommitPage(2)).toBe(2);
    expect(service.validateCommitPage('7')).toBe(7);
    for (const bad of [0, 101, 1.5, 'abc', -1, {}]) expect(() => service.validateCommitPage(bad)).toThrow();
  });
});

describe('incremental import', () => {
  const RESOURCE = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    resourceModel.exists.mockResolvedValue(true);
    evidenceModel.findOne.mockReturnValue({ lean: async () => null });
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
    // The "latest imported change for this repository" lookup is the only findOne with metadata.repository.
    changeModel.findOne.mockImplementation((filter: Record<string, unknown>) =>
      'metadata.repository' in filter
        ? { sort: () => ({ lean: async () => ({ timestamp: new Date('2026-09-01T00:00:00.000Z') }) }) }
        : { lean: async () => null }
    );
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/commits?') ? res([commit('c1')]) : res({})
    );
  });

  it("scopes the 'newest already imported' lookup to this resource AND this repository", async () => {
    await service.importGitHubCommits('octo', 'demo', RESOURCE, 10);
    const lookup = changeModel.findOne.mock.calls.map(([f]) => f).find((f) => 'metadata.repository' in f);
    expect(lookup).toMatchObject({ resourceId: RESOURCE, source: 'github', 'metadata.repository': 'octo/demo' });
    expect(urlOf(0).searchParams.get('since')).toBe('2026-09-01T00:00:00.000Z');
  });

  it('drops the since filter when the caller walks history with page or ref', async () => {
    const result = await service.importGitHubCommits('octo', 'demo', RESOURCE, 10, { page: 2 });
    expect(urlOf(0).searchParams.has('since')).toBe(false);
    expect(urlOf(0).searchParams.get('page')).toBe('2');
    expect(result.page).toBe(2);
    expect(changeModel.findOne.mock.calls.some(([f]) => 'metadata.repository' in f)).toBe(false);

    fetchMock.mockClear();
    await service.importGitHubCommits('octo', 'demo', RESOURCE, 10, { ref: 'release/1.2' });
    expect(urlOf(0).searchParams.has('since')).toBe(false);
    expect(urlOf(0).searchParams.get('sha')).toBe('release/1.2');
  });

  it('tells the caller when there is another page to fetch', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/commits?')
        ? res([commit('c1')], { headers: { link: '<https://api.github.com/x?page=2>; rel="next"' } })
        : res({})
    );
    const result = await service.importGitHubCommits('octo', 'demo', RESOURCE, 10);
    expect(result).toMatchObject({ hasMore: true, page: 1, imported: 1 });
  });
});
