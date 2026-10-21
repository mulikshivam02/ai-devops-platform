import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { api } from './helpers/api.js';

const fetchMock = vi.hoisted(() => vi.fn());
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() }));
const changeModel = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  countDocuments: vi.fn()
}));

vi.stubGlobal('fetch', fetchMock);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({
  EvidenceModel: evidenceModel,
  toEvidenceDTO: (record: any) => ({
    id: String(record._id),
    resourceId: record.resourceId?.toString?.() ?? record.resourceId,
    evidenceType: record.evidenceType,
    source: record.source,
    timestamp: record.timestamp.toISOString(),
    collectedAt: record.collectedAt.toISOString(),
    payload: record.payload,
    metadata: record.metadata,
    correlationId: record.correlationId
  })
}));
vi.mock('../src/models/Change.js', () => ({
  ChangeModel: changeModel,
  toChangeDTO: (record: any) => ({
    id: String(record._id),
    resourceId: record.resourceId?.toString?.() ?? record.resourceId,
    changeId: record.changeId,
    source: record.source,
    author: record.author,
    timestamp: record.timestamp.toISOString(),
    summary: record.summary,
    changeType: record.changeType,
    evidenceIds: Array.isArray(record.evidenceIds) ? record.evidenceIds.map((item: any) => String(item)) : [],
    status: record.status,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  })
}));

const { app } = await import('../src/server.js');

describe('github integration API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resourceModel.exists.mockResolvedValue(true);
    evidenceModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    evidenceModel.countDocuments.mockResolvedValue(1);
    evidenceModel.create.mockImplementation(async (input: any) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      resourceId: new Types.ObjectId(input.resourceId),
      evidenceType: input.evidenceType,
      source: input.source,
      timestamp: new Date(input.timestamp),
      collectedAt: new Date(),
      payload: input.payload,
      metadata: input.metadata ?? {},
      correlationId: input.correlationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    // findOne needs to support two call shapes now: a plain .lean() (the
    // per-commit "does this change already exist" check) and .sort().lean()
    // (the new "most recent change for this resource" lookup used to compute
    // an incremental `since` for the next GitHub API call -- see review 4.3).
    changeModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    });
    changeModel.countDocuments.mockResolvedValue(1);
    changeModel.create.mockImplementation(async (input: any) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      resourceId: new Types.ObjectId(input.resourceId),
      changeId: input.changeId,
      source: input.source,
      author: input.author,
      timestamp: new Date(input.timestamp),
      summary: input.summary,
      changeType: input.changeType,
      evidenceIds: (input.evidenceIds ?? []).map((value: string) => new Types.ObjectId(value)),
      status: input.status ?? 'detected',
      metadata: input.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    changeModel.findByIdAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      resourceId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      changeId: 'github:octo/demo:abc123',
      source: 'github',
      author: 'Ada Lovelace',
      timestamp: new Date('2026-09-09T11:00:00.000Z'),
      summary: 'fix: handle import',
      changeType: 'code',
      evidenceIds: [new Types.ObjectId('507f1f77bcf86cd799439012')],
      status: 'detected',
      metadata: {
        repository: 'octo/demo',
        github: {
          owner: 'octo',
          repo: 'demo',
          sha: 'abc123',
          url: 'https://github.com/octo/demo/commit/abc123',
          additions: 10,
          deletions: 2,
          changedFiles: 3
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/repos/octo/demo/commits')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify([
              {
                sha: 'abc123',
                commit: {
                  message: 'fix: handle import',
                  author: { name: 'Ada Lovelace', email: 'ada@example.com', date: '2026-09-09T11:00:00.000Z' },
                  committer: { name: 'Ada Lovelace', email: 'ada@example.com', date: '2026-09-09T11:00:00.000Z' }
                },
                author: { login: 'ada' },
                committer: { login: 'ada' },
                html_url: 'https://github.com/octo/demo/commit/abc123',
                stats: { additions: 10, deletions: 2, total: 12 },
                files: [{ filename: 'src/index.ts' }, { filename: 'src/util.ts' }, { filename: 'src/more.ts' }]
              }
            ])
        } as Response;
      }
      if (url.includes('/repos/octo/demo')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              full_name: 'octo/demo',
              description: 'Example repository',
              default_branch: 'main',
              html_url: 'https://github.com/octo/demo',
              private: false,
              archived: false,
              pushed_at: '2026-09-09T12:00:00.000Z'
            })
        } as Response;
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ message: 'Not Found' }) } as Response;
    });
  });

  it('supports preview repository and commit endpoints', async () => {
    const repository = await api(app).get('/api/integrations/github/repository?owner=octo&repo=demo');
    expect(repository.status).toBe(200);
    expect(repository.body.data.fullName).toBe('octo/demo');

    const commits = await api(app).get('/api/integrations/github/commits?owner=octo&repo=demo&limit=10');
    expect(commits.status).toBe(200);
    expect(commits.body.data[0].sha).toBe('abc123');
  });

  it('validates repo input and rejects path traversal attempts', async () => {
    const invalid = await api(app).get('/api/integrations/github/repository?owner=../evil&repo=demo');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBeDefined();
  });

  it('imports commits through the existing change/evidence pipeline and returns a bounded summary', async () => {
    const response = await api(app).post('/api/integrations/github/import').send({
      owner: 'octo',
      repo: 'demo',
      resourceId: '507f1f77bcf86cd799439011',
      limit: 10
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.repository).toBe('octo/demo');
    expect(response.body.data.imported).toBe(1);
    expect(changeModel.create).toHaveBeenCalled();
    expect(evidenceModel.create).toHaveBeenCalled();
  });
});
