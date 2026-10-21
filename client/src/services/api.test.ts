import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authSessionChanged, buildHeaders, getDashboardSummary, listResources, request } from './api';
import { getAuthToken, setAuthToken } from './session';

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

const sentHeaders = (call = 0) => new Headers((fetchMock.mock.calls[call]?.[1] as RequestInit).headers);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildHeaders (plan 7.2 header-merge bug)', () => {
  it('always carries the Authorization header, even when the caller supplies its own headers', () => {
    setAuthToken('tok');

    const headers = buildHeaders({ 'X-Custom': '1' });

    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('X-Custom')).toBe('1');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('lets a caller override a default, case-insensitively, without sending both', () => {
    setAuthToken('tok');

    const headers = buildHeaders({ 'content-type': 'text/plain' });

    expect(headers.get('Content-Type')).toBe('text/plain');
  });

  it('accepts a Headers instance and an array of pairs', () => {
    setAuthToken('tok');

    expect(buildHeaders(new Headers({ 'X-A': 'a' })).get('X-A')).toBe('a');
    expect(buildHeaders([['X-B', 'b']]).get('X-B')).toBe('b');
  });

  it('sends no Authorization header when signed out', () => {
    expect(buildHeaders().has('Authorization')).toBe(false);
  });
});

describe('request', () => {
  it('keeps the token when a call passes custom headers (the old code dropped it)', async () => {
    setAuthToken('tok');
    fetchMock.mockReturnValue(json({ success: true, data: { ok: 1 } }));

    await request('/things', { method: 'POST', headers: { 'X-Idempotency-Key': 'k1' }, body: '{}' });

    expect(sentHeaders().get('Authorization')).toBe('Bearer tok');
    expect(sentHeaders().get('X-Idempotency-Key')).toBe('k1');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('calls the relative /api base by default', async () => {
    fetchMock.mockReturnValue(json({ success: true, data: {} }));

    await getDashboardSummary();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/dashboard/summary');
  });

  it('clears the session and announces it on a 401', async () => {
    setAuthToken('tok');
    const listener = vi.fn();

    window.addEventListener(authSessionChanged, listener);
    fetchMock.mockReturnValue(json({ success: false, error: { message: 'Session expired' } }, 401));

    await expect(getDashboardSummary()).rejects.toThrow('Session expired');
    window.removeEventListener(authSessionChanged, listener);

    expect(getAuthToken()).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it('does not clear the session on a 403', async () => {
    setAuthToken('tok');
    fetchMock.mockReturnValue(json({ success: false, error: { message: 'Forbidden' } }, 403));

    await expect(getDashboardSummary()).rejects.toThrow('Forbidden');

    expect(getAuthToken()).toBe('tok');
  });
});

describe('listResources (the API pages /resources)', () => {
  const page = (n: number, pages: number, count: number) =>
    json({
      success: true,
      data: Array.from({ length: count }, (_, i) => ({ id: `r${n}-${i}` })),
      pagination: { page: n, limit: 100, total: 250, pages }
    });

  it('walks every page and returns the whole inventory', async () => {
    setAuthToken('tok');
    fetchMock.mockImplementationOnce(() => page(1, 3, 100)).mockImplementationOnce(() => page(2, 3, 100)).mockImplementationOnce(() => page(3, 3, 50));

    const all = await listResources();

    expect(all).toHaveLength(250);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=100');
  });

  it('forwards filters and sends the token on every page', async () => {
    setAuthToken('tok');
    fetchMock.mockImplementation(() => page(1, 1, 2));

    await listResources({ type: 'kubernetes_cluster', enabled: false });

    const url = String(fetchMock.mock.calls[0]?.[0]);

    expect(url).toContain('type=kubernetes_cluster');
    expect(url).toContain('enabled=false');
    expect(sentHeaders().get('Authorization')).toBe('Bearer tok');
  });

  it('stops after a single page when there is only one', async () => {
    fetchMock.mockImplementation(() => page(1, 1, 5));

    expect(await listResources()).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
