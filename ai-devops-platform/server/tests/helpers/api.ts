import supertest from 'supertest';
import type { Application } from 'express';
import { bearer } from './auth.js';
import type { UserRole } from '../../src/models/User.js';

/**
 * A supertest agent that sends a valid token on every request.
 *
 * Existing API tests used bare `request(app)` and passed only because
 * config/env.ts disabled auth whenever NODE_ENV === 'test'. That bypass is gone,
 * so those tests must now authenticate like a real client does.
 *
 * Default role is 'admin' so a test that is not about authorization does not
 * accidentally become one. Pass a role explicitly when the test IS about permissions.
 */
export function api(app: Application, role: UserRole = 'admin') {
  return supertest.agent(app).set('Authorization', bearer(role));
}
