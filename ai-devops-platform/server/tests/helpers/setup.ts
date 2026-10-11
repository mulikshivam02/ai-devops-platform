import { beforeEach, vi } from 'vitest';
import { mockUsers, resetMockUsers, type MockUserRecord } from './userStore.js';
import type { UserRole } from '../../src/models/User.js';

/**
 * Runs before every test file (wired in vitest.config.ts's `setupFiles`).
 *
 * Replaces src/models/User.js with an in-memory fake so authenticate()'s live
 * database check (review 1.6) has something to answer against, without every one
 * of the ~10 API test files needing its own User mock. See tests/helpers/userStore.ts
 * for why this exists and how to seed a specific user for a revocation test.
 *
 * vi.mock is hoisted by Vitest's transform, so this runs before the test file's own
 * imports -- including its dynamic `await import('../src/server.js')` -- execute.
 */
vi.mock('../../src/models/User.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/models/User.js')>();

  function toFakeDocument(id: string, record: MockUserRecord) {
    return {
      _id: { toString: () => id },
      email: record.email ?? `${record.role}@test.local`,
      role: record.role,
      active: record.active,
      tokenVersion: record.tokenVersion,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    };
  }

  const UserModel = {
    findById: (id: string) => ({
      select: () => ({
        lean: () => Promise.resolve(mockUsers.has(id) ? { _id: id, ...mockUsers.get(id) } : null)
      }),
      // getUser() in auth.service.ts calls findById(id) directly (no .select()/.lean()).
      then: (resolve: (value: unknown) => void) =>
        resolve(mockUsers.has(id) ? toFakeDocument(id, mockUsers.get(id)!) : null)
    }),
    findByIdAndUpdate: (
      id: string,
      update: { role?: UserRole; $inc?: { tokenVersion?: number } }
    ): Promise<ReturnType<typeof toFakeDocument> | null> => {
      const existing = mockUsers.get(id);
      if (!existing) return Promise.resolve(null);
      const next: MockUserRecord = {
        ...existing,
        role: update.role ?? existing.role,
        tokenVersion: existing.tokenVersion + (update.$inc?.tokenVersion ?? 0)
      };
      mockUsers.set(id, next);
      return Promise.resolve(toFakeDocument(id, next));
    },
    findOne: () => Promise.resolve(null),
    countDocuments: () => Promise.resolve(mockUsers.size),
    create: (doc: { email: string; role: UserRole }) => {
      const id = `test-user-created-${mockUsers.size}`;
      mockUsers.set(id, { role: doc.role, active: true, tokenVersion: 0 });
      return Promise.resolve(toFakeDocument(id, mockUsers.get(id)!));
    }
  };

  return { ...actual, UserModel };
});

beforeEach(() => {
  resetMockUsers();
});
