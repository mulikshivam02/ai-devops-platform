import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/**
 * Real in-memory MongoDB for tests that need persistence rather than mocks.
 *
 * NOT required by the Phase 0 authorization matrix -- that test mocks the service
 * layer and needs no database. You need this from Phase 1.4 onward, when
 * `authenticate` starts doing a real user lookup to support token revocation,
 * and from Phase 2 for the persistence regression tests (audit trail, upserts).
 *
 * First run downloads a mongod binary from fastdl.mongodb.org. If you are behind
 * a proxy, set MONGOMS_DOWNLOAD_URL or point MONGOMS_SYSTEM_BINARY at a local mongod.
 *
 * Usage:
 *   beforeAll(startTestDb);
 *   afterAll(stopTestDb);
 *   afterEach(clearTestDb);
 */

let mongo: MongoMemoryServer | undefined;

export async function startTestDb(): Promise<void> {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await mongo?.stop();
  mongo = undefined;
}

/** Wipes every collection between tests without paying to restart mongod. */
export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
