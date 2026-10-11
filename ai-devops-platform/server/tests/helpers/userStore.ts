import { ROLE_DEFAULT_ID } from './auth.js';
import type { UserRole } from '../../src/models/User.js';

/**
 * Fake backing store for the User model, used by tests/helpers/setup.ts's global
 * mock of src/models/User.js.
 *
 * Why this exists: authenticate() now does a live database lookup on every request
 * (tokenVersion + active check -- review 1.6), so a bearer token alone is no longer
 * enough to pass authentication in a test. Most API test files mock the business-logic
 * service layer and never start a real database, so without this, every test using
 * tests/helpers/api.ts or tests/helpers/auth.ts would fail at the auth layer before
 * reaching the thing it actually means to test.
 *
 * The three standard roles are pre-seeded and reset before every test (see
 * tests/helpers/setup.ts). A test that needs to simulate revocation -- a logout,
 * a deactivation, a live role change -- calls seedMockUser() with a matching id
 * before making its request.
 */
export interface MockUserRecord {
  role: UserRole;
  active: boolean;
  tokenVersion: number;
}

export const mockUsers = new Map<string, MockUserRecord>();

export function resetMockUsers(): void {
  mockUsers.clear();
  mockUsers.set(ROLE_DEFAULT_ID.viewer, { role: 'viewer', active: true, tokenVersion: 0 });
  mockUsers.set(ROLE_DEFAULT_ID.operator, { role: 'operator', active: true, tokenVersion: 0 });
  mockUsers.set(ROLE_DEFAULT_ID.admin, { role: 'admin', active: true, tokenVersion: 0 });
}

export function seedMockUser(id: string, record: MockUserRecord): void {
  mockUsers.set(id, record);
}

resetMockUsers();
