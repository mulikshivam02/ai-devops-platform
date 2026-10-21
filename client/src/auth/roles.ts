import type { AuthUser } from '../services/api';

export type Role = AuthUser['role'];

/**
 * viewer < operator < admin -- the same order the server enforces (middleware/auth.middleware.ts).
 * The UI uses this only to hide controls that would be refused; the server remains the authority.
 */
const rank: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };

export function hasRole(user: Pick<AuthUser, 'role'> | null | undefined, minimum: Role): boolean {
  if (!user) return false;

  return rank[user.role] >= rank[minimum];
}
