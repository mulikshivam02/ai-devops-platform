import { describe, expect, it } from 'vitest';
import { normalizeChange } from '../src/services/changeNormalizationService.js';
import type { ChangeDTO } from '../src/types/change.js';

function change(overrides: Partial<ChangeDTO>): ChangeDTO {
  return {
    id: 'change',
    resourceId: 'resource',
    changeId: 'c1',
    source: 'test',
    timestamp: '2026-01-01T00:00:00.000Z',
    summary: 's',
    changeType: 'configuration',
    evidenceIds: [],
    status: 'detected',
    metadata: {},
    createdAt: '',
    updatedAt: '',
    ...overrides
  };
}

/** Review 2.19/3.8: a field changed TO null must be typed as null, not as its old type. */
describe('normalizeChange: a field changed to null is typed correctly (review 2.19/3.8)', () => {
  it('a numeric field changed to null reports itemType "null", not "number"', () => {
    const items = normalizeChange(change({ before: { replicas: 5 }, after: { replicas: null } }));
    const replicas = items.find((item) => item.path === 'replicas');
    expect(replicas?.itemType).toBe('null');
    expect(replicas?.after).toBeNull();
  });
});

/** Review 2.19/3.8: equality must be structural, not key-order-dependent JSON.stringify. */
describe('normalizeChange: object equality is structural, not key-order dependent (review 2.19/3.8)', () => {
  it('two objects with the same keys in a different order are NOT reported as changed', () => {
    const items = normalizeChange(change({ before: { config: { a: 1, b: 2 } }, after: { config: { b: 2, a: 1 } } }));
    expect(items.find((item) => item.path === 'config')).toBeUndefined();
  });

  it('a genuinely different nested value IS still reported as changed', () => {
    const items = normalizeChange(change({ before: { config: { a: 1, b: 2 } }, after: { config: { a: 1, b: 3 } } }));
    expect(items.find((item) => item.path === 'config')).toBeDefined();
  });
});

/** Review 2.19/3.8: an array with an identity field diffs by identity, not raw position. */
describe('normalizeChange: keyed array diffing avoids false positives from insertion (review 2.19/3.8)', () => {
  it('inserting an element at the front of a named array does not mark every other element as changed', () => {
    const before = [
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
      { name: 'c', value: 3 }
    ];
    const after = [
      { name: 'z', value: 99 },
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
      { name: 'c', value: 3 }
    ];
    const items = normalizeChange(change({ before: { list: before }, after: { list: after } }));
    // Only the newly-inserted 'z' entry should show as a change -- a, b, c are
    // byte-for-byte identical and merely shifted position.
    const listItems = items.filter((item) => item.path.startsWith('list'));
    expect(listItems).toHaveLength(1);
    expect(listItems[0].path).toContain('z');
    expect(listItems[0].operation).toBe('added');
  });

  it('a genuine value change inside a named array element is still detected by its identity, not position', () => {
    const before = [
      { name: 'a', value: 1 },
      { name: 'b', value: 2 }
    ];
    const after = [
      { name: 'a', value: 1 },
      { name: 'b', value: 99 }
    ];
    const items = normalizeChange(change({ before: { list: before }, after: { list: after } }));
    const listItems = items.filter((item) => item.path.startsWith('list'));
    expect(listItems).toHaveLength(1);
    expect(listItems[0].path).toContain('b');
  });
});
