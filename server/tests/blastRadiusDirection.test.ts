import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

/**
 * Review 2.3/2.4/3.1. A dependency edge means "source depends on target"
 * (createDependency always sets direction: 'source_to_target'). So a change to
 * TARGET can affect SOURCE (the thing depending on it) -- not the other way
 * around. getBlastRadius must only ever walk from target back to source
 * (finding dependents), never from source to target (finding dependencies).
 *
 * Graph under test:  C --depends on--> A --depends on--> B
 * (edge1: source=A target=B, edge2: source=C target=A)
 *
 * A change to A can affect C (C depends on A) but cannot affect B (B is what A
 * depends on, not the other way round). This is the exact scenario review 2.4
 * describes: unioning both directions would incorrectly pull B into A's blast
 * radius.
 */
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: { exists: vi.fn().mockResolvedValue(true) } }));

const resourceA = new Types.ObjectId().toString();
const resourceB = new Types.ObjectId().toString();
const resourceC = new Types.ObjectId().toString();

const edges = [
  { sourceResourceId: resourceA, targetResourceId: resourceB }, // A depends on B
  { sourceResourceId: resourceC, targetResourceId: resourceA } // C depends on A
];

vi.mock('../src/models/Dependency.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/models/Dependency.js')>();
  return {
    ...actual,
    DependencyModel: {
      ...actual.DependencyModel,
      find: (query: { targetResourceId: { $in: string[] } }) => ({
        select: () => ({
          lean: () =>
            Promise.resolve(
              edges
                .filter((edge) => query.targetResourceId.$in.includes(edge.targetResourceId))
                .map((edge) => ({ sourceResourceId: { toString: () => edge.sourceResourceId } }))
            )
        })
      })
    }
  };
});

describe('getBlastRadius walks dependents only, never dependencies', () => {
  it('a change to A affects C (a dependent) but not B (a dependency)', async () => {
    const { getBlastRadius } = await import('../src/services/dependencyService.js');
    const result = await getBlastRadius(resourceA, 10);
    expect(result.direct).toEqual([resourceC]);
    expect(result.direct).not.toContain(resourceB);
    expect(result.transitive).not.toContain(resourceB);
  });

  it('a change to B is direct on A and transitive on C (walking two hops of dependents)', async () => {
    const { getBlastRadius } = await import('../src/services/dependencyService.js');
    const result = await getBlastRadius(resourceB, 10);
    expect(result.direct).toEqual([resourceA]);
    expect(result.transitive).toEqual([resourceC]);
    expect(result.maxDepth).toBe(2);
  });

  it('a change to C has no dependents at all (nothing depends on C)', async () => {
    const { getBlastRadius } = await import('../src/services/dependencyService.js');
    const result = await getBlastRadius(resourceC, 10);
    expect(result.direct).toEqual([]);
    expect(result.transitive).toEqual([]);
    expect(result.maxDepth).toBe(0);
  });
});
