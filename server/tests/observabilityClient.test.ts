import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  env: {
    prometheusApiUrl: 'https://prom.example/base',
    prometheusToken: 'prom-secret',
    prometheusTimeoutMs: 10,
    lokiApiUrl: 'https://loki.example/base',
    lokiToken: 'loki-secret',
    lokiTimeoutMs: 10
  }
}));
vi.mock('../src/config/env.js', () => config);
const prometheus = await import('../src/integrations/prometheus/prometheus.client.js');
const loki = await import('../src/integrations/loki/loki.client.js');

function response(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(payload)
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('Prometheus and Loki HTTP clients', () => {
  it('use configured URLs and bearer headers without returning tokens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(200, { status: 'success', data: { resultType: 'vector', result: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    await prometheus.queryPrometheus('up');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://prom.example/base/api/v1/query?query=up');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer prom-secret' })
    });
    const lokiFetch = vi.fn().mockResolvedValue(response(200, { status: 'success', data: { result: [] } }));
    vi.stubGlobal('fetch', lokiFetch);
    await loki.queryLoki(
      '{app="api"}',
      { start: new Date('2026-09-14T00:00:00.000Z'), end: new Date('2026-09-14T00:05:00.000Z') },
      10
    );
    expect(lokiFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer loki-secret' })
    });
  });

  it('maps API failures and timeouts safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, { error: 'prom-secret' })));
    await expect(prometheus.getPrometheusBuildInfo()).rejects.toMatchObject({
      statusCode: 502,
      code: 'PROMETHEUS_UNAVAILABLE'
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, { error: 'loki-secret' })));
    await expect(loki.getLokiBuildInfo()).rejects.toMatchObject({ statusCode: 502, code: 'LOKI_UNAVAILABLE' });
    const timeoutFetch = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          })
        )
    );
    vi.stubGlobal('fetch', timeoutFetch);
    await expect(prometheus.queryPrometheus('up')).rejects.toMatchObject({
      statusCode: 504,
      code: 'PROMETHEUS_TIMEOUT'
    });
    await expect(
      loki.queryLoki(
        '{app="api"}',
        { start: new Date('2026-09-14T00:00:00.000Z'), end: new Date('2026-09-14T00:05:00.000Z') },
        10
      )
    ).rejects.toMatchObject({ statusCode: 504, code: 'LOKI_TIMEOUT' });
  });
});
