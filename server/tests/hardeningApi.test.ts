import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('production hardening boundaries', () => {
  it('returns request IDs and security headers', async () => { const response = await request(app).get('/api/health/live').set('X-Request-ID', 'hardening-test'); expect(response.status).toBe(200); expect(response.headers['x-request-id']).toBe('hardening-test'); expect(response.headers['x-content-type-options']).toBe('nosniff'); });
  it('reports readiness without making optional AI a dependency', async () => { const response = await request(app).get('/api/health/ready'); expect([200, 503]).toContain(response.status); expect(response.body.data?.ai ?? response.body.ai).toBe('optional'); });
  it('uses a sanitized structured not-found error', async () => { const response = await request(app).get('/api/does-not-exist'); expect(response.status).toBe(404); expect(response.body.error.code).toBe('NOT_FOUND'); expect(response.body.error.requestId).toBeTruthy(); });
});