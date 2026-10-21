import { describe, expect, it } from 'vitest';
import supertest from 'supertest';
import express from 'express';

describe('trust proxy (plan 7.4: nginx in front of the API)', () => {
  it('the real app applies the configured hop count', async () => {
    const { app } = await import('../src/server.js');
    const { env } = await import('../src/config/env.js');

    expect(app.get('trust proxy')).toBe(env.trustProxyHops);
  });

  // Why the setting matters, independent of our routes: the client address (which keys the rate
  // limiter) comes from X-Forwarded-For only when a hop is trusted.
  async function clientIp(hops: number): Promise<string> {
    const probe = express();

    probe.set('trust proxy', hops);
    probe.get('/ip', (request, response) => {
      response.json({ ip: request.ip });
    });

    const response = await supertest(probe).get('/ip').set('X-Forwarded-For', '203.0.113.9');

    return (response.body as { ip: string }).ip;
  }

  it('with 0 hops a client cannot choose its own address with X-Forwarded-For', async () => {
    expect(await clientIp(0)).not.toBe('203.0.113.9');
  });

  it('with 1 hop the address the proxy reports is used, so clients get separate rate-limit buckets', async () => {
    expect(await clientIp(1)).toBe('203.0.113.9');
  });
});
