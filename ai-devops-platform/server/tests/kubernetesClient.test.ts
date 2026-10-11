import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  env: { kubernetesApiUrl: 'https://cluster.example/api', kubernetesToken: 'secret-token', kubernetesTimeoutMs: 10 }
}));
vi.mock('../src/config/env.js', () => config);
const { getKubernetesVersion, getKubernetesNamespaces } =
  await import('../src/integrations/kubernetes/kubernetes.client.js');

function response(status: number, payload: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('Kubernetes HTTP client', () => {
  it('adds the optional token to read-only GET requests without exposing it in errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { gitVersion: 'v1.31.0' }));
    vi.stubGlobal('fetch', fetchMock);
    await getKubernetesVersion();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cluster.example/api/version',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' })
      })
    );
  });

  it('maps Kubernetes API errors safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, { message: 'secret-token should not leak' })));
    await expect(getKubernetesVersion()).rejects.toMatchObject({ statusCode: 502, code: 'KUBERNETES_UNAVAILABLE' });
  });

  it('maps request timeouts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      )
    );
    await expect(getKubernetesNamespaces(10)).rejects.toMatchObject({ statusCode: 504, code: 'KUBERNETES_TIMEOUT' });
  });

  it('reports a rejected token (401) as an upstream credential problem, never as a user 401', async () => {
    // The browser client signs the user out on any 401 from this API.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { message: 'Unauthorized' })));
    await expect(getKubernetesVersion()).rejects.toMatchObject({ statusCode: 502, code: 'KUBERNETES_AUTH_FAILED' });
  });

  it('distinguishes missing RBAC permission (403) from a bad token (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(403, { message: 'forbidden' })));
    await expect(getKubernetesVersion()).rejects.toMatchObject({ statusCode: 502, code: 'KUBERNETES_FORBIDDEN' });
  });

  it('reports a proxy HTML error page as "unavailable", not "invalid JSON"', async () => {
    const html = { ok: false, status: 502, text: async () => '<html>Bad Gateway</html>' } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html));
    await expect(getKubernetesVersion()).rejects.toMatchObject({ code: 'KUBERNETES_UNAVAILABLE' });
  });

  it('still reports malformed JSON on a 200 as an invalid response', async () => {
    const bad = { ok: true, status: 200, text: async () => '{not json' } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bad));
    await expect(getKubernetesVersion()).rejects.toMatchObject({ code: 'KUBERNETES_INVALID_RESPONSE' });
  });

  it('passes the continue token through to the workloads request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { getKubernetesWorkloads } = await import('../src/integrations/kubernetes/kubernetes.client.js');
    await getKubernetesWorkloads('prod', 'Deployment', 25, 'abc==');
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/apis/apps/v1/namespaces/prod/deployments');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('continue')).toBe('abc==');
  });
});
