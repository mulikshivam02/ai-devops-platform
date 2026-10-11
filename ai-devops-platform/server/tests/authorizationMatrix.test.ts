import { describe, expect, it, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { bearer, forgedToken, tokenFor } from './helpers/auth.js';
import { seedMockUser } from './helpers/userStore.js';

/**
 * Exercises the REAL authenticate + authorizeRequest middleware over HTTP.
 *
 * Before Phase 0, config/env.ts set `authDisabled: authDisabled || nodeEnvironment === 'test'`,
 * so no test could reach this code at all. That single clause is why the operator-GET
 * bug survived 85 passing tests.
 *
 * Service layers are mocked so this stays a pure authorization test with no database.
 * A 500 from a mocked service still proves the request passed authorization, so the
 * assertions below check "was it 401/403" rather than "was it 200".
 */

vi.mock('../src/services/resourceService.js', () => ({
  getResources: vi.fn().mockResolvedValue([]),
  getResourceById: vi.fn().mockResolvedValue({ id: 'r1' }),
  createResource: vi.fn().mockResolvedValue({ id: 'r1' }),
  updateResource: vi.fn().mockResolvedValue({ id: 'r1' }),
  deleteResource: vi.fn().mockResolvedValue(undefined)
}));

const { app } = await import('../src/server.js');

const DENIED = [401, 403];
function assertAllowed(status: number, label: string) {
  expect(DENIED, `${label} should NOT be rejected by the auth layer (got ${status})`).not.toContain(status);
}
function assertDenied(status: number, expected: number, label: string) {
  expect(status, `${label} should be rejected with ${expected}`).toBe(expected);
}

describe('authorization boundary', () => {
  beforeAll(() => {
    // Guard: if this fires, the NODE_ENV=test bypass is back and every assertion below is vacuous.
    expect(process.env.AUTH_DISABLED).not.toBe('true');
  });

  describe('authentication', () => {
    it('rejects a request with no Authorization header', async () => {
      const response = await request(app).get('/api/resources');
      assertDenied(response.status, 401, 'anonymous GET /api/resources');
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('rejects a token signed with the wrong secret', async () => {
      const response = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${forgedToken('admin')}`);
      assertDenied(response.status, 401, 'forged admin token');
      expect(response.body.error.code).toBe('AUTH_INVALID');
    });

    it('rejects an expired token', async () => {
      const expired = tokenFor('admin', { expiresInSeconds: -60 });
      const response = await request(app).get('/api/resources').set('Authorization', `Bearer ${expired}`);
      assertDenied(response.status, 401, 'expired token');
      expect(response.body.error.code).toBe('AUTH_EXPIRED');
    });

    it('rejects a malformed Authorization header', async () => {
      const response = await request(app).get('/api/resources').set('Authorization', 'Basic abc123');
      assertDenied(response.status, 401, 'non-bearer scheme');
    });
  });

  describe('role matrix', () => {
    it('viewer can read', async () => {
      const response = await request(app).get('/api/resources').set('Authorization', bearer('viewer'));
      assertAllowed(response.status, 'viewer GET /api/resources');
    });

    // THIS IS THE BUG (review 1.1). middleware/auth.middleware.ts resolves a GET to
    // authorize('viewer', 'admin'), and 'operator' is not in that set -- so an operator
    // can write data but cannot read any of it.
    it('operator can read', async () => {
      const response = await request(app).get('/api/resources').set('Authorization', bearer('operator'));
      assertAllowed(response.status, 'operator GET /api/resources');
    });

    it('admin can read', async () => {
      const response = await request(app).get('/api/resources').set('Authorization', bearer('admin'));
      assertAllowed(response.status, 'admin GET /api/resources');
    });

    it('viewer cannot write', async () => {
      const response = await request(app)
        .post('/api/resources')
        .set('Authorization', bearer('viewer'))
        .send({ name: 'r', type: 'github_repository' });
      assertDenied(response.status, 403, 'viewer POST /api/resources');
    });

    it('operator can write', async () => {
      const response = await request(app)
        .post('/api/resources')
        .set('Authorization', bearer('operator'))
        .send({ name: 'r', type: 'github_repository' });
      assertAllowed(response.status, 'operator POST /api/resources');
    });

    it('admin can write', async () => {
      const response = await request(app)
        .post('/api/resources')
        .set('Authorization', bearer('admin'))
        .send({ name: 'r', type: 'github_repository' });
      assertAllowed(response.status, 'admin POST /api/resources');
    });
  });

  describe('safe methods', () => {
    // HEAD and OPTIONS are reads, but `request.method === 'GET'` treats them as writes,
    // so a viewer is denied. Review 1.1.
    it('viewer can issue HEAD', async () => {
      const response = await request(app).head('/api/resources').set('Authorization', bearer('viewer'));
      assertAllowed(response.status, 'viewer HEAD /api/resources');
    });
  });

  describe('admin-only routes', () => {
    it('operator cannot approve a remediation', async () => {
      const response = await request(app)
        .post('/api/remediations/507f1f77bcf86cd799439011/approve')
        .set('Authorization', bearer('operator'))
        .send({ reason: 'looks fine' });
      assertDenied(response.status, 403, 'operator POST approve');
    });
  });

  describe('public routes stay public', () => {
    it('health is reachable without a token', async () => {
      const response = await request(app).get('/api/health/live');
      expect(response.status).toBe(200);
    });

    it('login is reachable without a token', async () => {
      const response = await request(app).post('/api/auth/login').send({});
      expect(DENIED).not.toContain(response.status);
    });

    // Review 1.2: previously the FIRST caller to hit an empty database became admin,
    // no login required. Registration must now be explicitly enabled.
    it('registration is disabled unless explicitly enabled', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'newperson@test.local', password: 'a-long-enough-password', role: 'admin' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('AUTH_REGISTRATION_DISABLED');
    });
  });

  // Review 1.6: authenticate() now checks the database on every request, so revocation
  // (logout, deactivation) and role changes take effect immediately instead of waiting
  // out the token's 8-hour life. These exercise the REAL auth.service functions against
  // the in-memory User mock in tests/helpers/userStore.ts.
  describe('session revocation', () => {
    it('a logged-out token is rejected on the very next request', async () => {
      const token = tokenFor('operator');

      const before = await request(app).get('/api/resources').set('Authorization', `Bearer ${token}`);
      assertAllowed(before.status, 'operator GET before logout');

      const logoutResponse = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(logoutResponse.status).toBe(200);

      const after = await request(app).get('/api/resources').set('Authorization', `Bearer ${token}`);
      assertDenied(after.status, 401, 'same token, same request, after logout');
      expect(after.body.error.code).toBe('AUTH_REVOKED');
    });

    it('a deactivated account is rejected even with a validly signed, unexpired token', async () => {
      seedMockUser('test-user-deactivated', { role: 'operator', active: false, tokenVersion: 0 });
      const token = tokenFor('operator', { id: 'test-user-deactivated' });

      const response = await request(app).get('/api/resources').set('Authorization', `Bearer ${token}`);
      assertDenied(response.status, 401, 'deactivated user GET');
      expect(response.body.error.code).toBe('AUTH_REVOKED');
    });

    it('a role change is enforced on the next request without requiring re-login', async () => {
      seedMockUser('test-user-promote', { role: 'viewer', active: true, tokenVersion: 0 });
      const token = tokenFor('viewer', { id: 'test-user-promote' });

      const before = await request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'r', type: 'github_repository' });
      assertDenied(before.status, 403, 'viewer POST before promotion');

      seedMockUser('test-user-promote', { role: 'operator', active: true, tokenVersion: 0 });

      const after = await request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'r', type: 'github_repository' });
      assertAllowed(after.status, 'same token, same request, after promotion to operator');
    });
  });
});
