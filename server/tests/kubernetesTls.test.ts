import { readFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Review 4.2 TLS: a cluster behind a private CA must be reachable once KUBERNETES_CA_CERT is set,
 * and certificate verification must stay ON. This test runs a real HTTPS server with a self-signed
 * certificate (tests/fixtures) and talks to it through the real client.
 */
const cert = readFileSync(new URL('./fixtures/test-ca.crt', import.meta.url), 'utf8');
const key = readFileSync(new URL('./fixtures/test-ca.key', import.meta.url), 'utf8');

const config = vi.hoisted(() => ({
  env: {
    kubernetesApiUrl: '',
    kubernetesToken: 'sa-token',
    kubernetesTimeoutMs: 5000,
    kubernetesCaCert: undefined as string | undefined
  }
}));
vi.mock('../src/config/env.js', () => config);

const { getKubernetesVersion } = await import('../src/integrations/kubernetes/kubernetes.client.js');

let server: https.Server;
let lastAuthorization: string | undefined;

beforeAll(async () => {
  server = https.createServer({ key, cert }, (request, response) => {
    lastAuthorization = request.headers.authorization;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ gitVersion: 'v1.31.0', platform: 'linux/amd64' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  config.env.kubernetesApiUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Kubernetes TLS with a private CA', () => {
  it('refuses a self-signed server when no CA is configured (verification is on)', async () => {
    config.env.kubernetesCaCert = undefined;
    await expect(getKubernetesVersion()).rejects.toMatchObject({ code: 'KUBERNETES_NETWORK_ERROR' });
  });

  it('connects once the cluster CA is configured, sending the bearer token', async () => {
    config.env.kubernetesCaCert = cert;
    await expect(getKubernetesVersion()).resolves.toMatchObject({ gitVersion: 'v1.31.0' });
    expect(lastAuthorization).toBe('Bearer sa-token');
  });
});
