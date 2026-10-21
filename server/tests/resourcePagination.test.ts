import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './helpers/api.js';

type Row = Record<string, any>;

const db = vi.hoisted(() => ({ resources: [] as Row[], findFilters: [] as Row[] }));

vi.mock('../src/models/Resource.js', async (importOriginal) => {
  const { fakeModel } = await import('./helpers/fakeModel.js');
  const model = fakeModel(() => db.resources);

  return {
    ...(await importOriginal<typeof import('../src/models/Resource.js')>()),
    ResourceModel: {
      ...model,
      find: (filter: Row) => {
        db.findFilters.push(filter);

        return model.find(filter);
      }
    }
  };
});

const { app } = await import('../src/server.js');
const { buildResourceQuery } = await import('../src/services/resourceService.js');

const resource = (n: number, overrides: Row = {}): Row => ({
  _id: `res-${String(n).padStart(3, '0')}`,
  name: `svc-${n}`,
  type: 'kubernetes_cluster',
  status: 'active',
  metadata: {},
  enabled: true,
  deletedAt: null,
  createdAt: new Date(Date.UTC(2026, 8, 1) + n * 1000),
  updatedAt: new Date(Date.UTC(2026, 8, 1) + n * 1000),
  ...overrides
});

beforeEach(() => {
  db.resources = Array.from({ length: 60 }, (_, i) => resource(i));
  db.findFilters = [];
});

describe('GET /api/resources pagination (plan 6.5)', () => {
  it('returns a page and pagination metadata instead of the whole inventory', async () => {
    const response = await api(app).get('/api/resources');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(25);
    expect(response.body.pagination).toEqual({ page: 1, limit: 25, total: 60, pages: 3 });
  });

  it('pages without gaps or repeats, newest first', async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => api(app).get(`/api/resources?page=${page}&limit=25`)));
    const ids = pages.flatMap((response) => response.body.data.map((item: Row) => item.id));

    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    expect(ids[0]).toBe('res-059');
    expect(ids.at(-1)).toBe('res-000');
  });

  it('keeps paging stable when many resources share a createdAt', async () => {
    const same = new Date(Date.UTC(2026, 8, 1));

    db.resources = Array.from({ length: 30 }, (_, i) => resource(i, { createdAt: same, updatedAt: same }));

    const [first, second] = await Promise.all([
      api(app).get('/api/resources?page=1&limit=10'),
      api(app).get('/api/resources?page=2&limit=10')
    ]);
    const ids = [...first.body.data, ...second.body.data].map((item: Row) => item.id);

    expect(new Set(ids).size).toBe(20);
  });

  it('reports the true total with filters applied, excluding soft-deleted resources', async () => {
    db.resources = [
      ...Array.from({ length: 5 }, (_, i) => resource(i)),
      ...Array.from({ length: 4 }, (_, i) => resource(10 + i, { type: 'github_repository' })),
      resource(20, { deletedAt: new Date() })
    ];

    const response = await api(app).get('/api/resources?type=kubernetes_cluster&limit=2');

    expect(response.body.pagination).toEqual({ page: 1, limit: 2, total: 5, pages: 3 });
    expect(response.body.data).toHaveLength(2);
  });

  it('honours the enabled filter, including false', async () => {
    db.resources = [resource(1), resource(2, { enabled: false }), resource(3, { enabled: false })];

    const response = await api(app).get('/api/resources?enabled=false');

    expect(response.body.pagination.total).toBe(2);
  });

  it.each([
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=abc', 'limit'],
    ['page=0', 'page'],
    ['page=-1', 'page'],
    ['page=1.5', 'page'],
    ['page=1&page=2', 'page']
  ])('rejects ?%s with 400', async (query) => {
    const response = await api(app).get(`/api/resources?${query}`);

    expect(response.status).toBe(400);
  });

  it('returns an empty page, not an error, beyond the last page', async () => {
    const response = await api(app).get('/api/resources?page=99');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(60);
  });

  it('never forwards unvalidated query keys to the database', async () => {
    await api(app).get('/api/resources?type=kubernetes_cluster&$where=1&name[$ne]=x&extra=1');

    expect(db.findFilters).toHaveLength(1);
    expect(Object.keys(db.findFilters[0] ?? {}).sort()).toEqual(['deletedAt', 'type']);
  });
});

describe('buildResourceQuery', () => {
  it('builds the filter from known fields only', () => {
    const query = buildResourceQuery({
      type: 'github_repository',
      status: 'active',
      environment: 'prod',
      enabled: false,
      // Anything extra that slips past validation must not reach Mongo.
      ...({ $where: 'sleep(1000)', name: { $ne: 'x' } } as object)
    });

    expect(query).toEqual({
      deletedAt: null,
      type: 'github_repository',
      status: 'active',
      environment: 'prod',
      enabled: false
    });
  });

  it('always excludes soft-deleted resources', () => {
    expect(buildResourceQuery({})).toEqual({ deletedAt: null });
  });
});
