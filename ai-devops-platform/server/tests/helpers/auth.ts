import { createHmac } from 'node:crypto';
import { env } from '../../src/config/env.js';
import type { UserRole } from '../../src/models/User.js';

/**
 * Mints a token in the same format as services/auth.service.ts#tokenFor, using the
 * same secret the running app verifies against.
 *
 * This deliberately does NOT import tokenFor: tests that assert on the auth boundary
 * should not share a code path with the thing under test. If the token format changes,
 * this helper must be updated and that is the point -- it is a contract test.
 *
 * The default id is role-derived ('test-user-viewer', etc.) rather than a single
 * fixed id shared across all roles, so tests/helpers/userStore.ts's fake database
 * can answer a lookup for any of the three standard roles without per-test setup.
 * Override `id` (and seed a matching record in userStore) for revocation tests.
 */
export const ROLE_DEFAULT_ID: Record<UserRole, string> = {
  viewer: 'test-user-viewer',
  operator: 'test-user-operator',
  admin: 'test-user-admin'
};

export function tokenFor(
  role: UserRole,
  overrides: { id?: string; email?: string; tokenVersion?: number; expiresInSeconds?: number } = {}
): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: overrides.id ?? ROLE_DEFAULT_ID[role],
      email: overrides.email ?? `${role}@test.local`,
      role,
      tv: overrides.tokenVersion ?? 0,
      exp: Math.floor(Date.now() / 1000) + (overrides.expiresInSeconds ?? 3600)
    })
  ).toString('base64url');
  const signature = createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function bearer(role: UserRole): string {
  return `Bearer ${tokenFor(role)}`;
}

/** A structurally valid token signed with the wrong key. */
export function forgedToken(role: UserRole): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'x', email: 'attacker@test.local', role, tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  const signature = createHmac('sha256', 'not-the-real-secret').update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
