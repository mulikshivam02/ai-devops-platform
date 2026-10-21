import { describe, expect, it } from 'vitest';
import { hasRole, type Role } from './roles';

const roles: Role[] = ['viewer', 'operator', 'admin'];

describe('hasRole', () => {
  // viewer < operator < admin, the same order the server enforces.
  it.each([
    ['viewer', 'viewer', true],
    ['viewer', 'operator', false],
    ['viewer', 'admin', false],
    ['operator', 'viewer', true],
    ['operator', 'operator', true],
    ['operator', 'admin', false],
    ['admin', 'viewer', true],
    ['admin', 'operator', true],
    ['admin', 'admin', true]
  ] as const)('%s needs %s -> %s', (role, minimum, expected) => {
    expect(hasRole({ role }, minimum)).toBe(expected);
  });

  it('is false for a missing user at every level', () => {
    for (const minimum of roles) {
      expect(hasRole(null, minimum)).toBe(false);
      expect(hasRole(undefined, minimum)).toBe(false);
    }
  });
});
