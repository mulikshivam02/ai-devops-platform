import { isDeepStrictEqual } from 'node:util';
import type { ChangeDTO } from '../types/change.js';
import type { ChangedItem } from '../types/changeAnalysis.js';

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

// `newValue ?? oldValue` treats null as "absent" (`??` only falls through on
// null/undefined), so a field explicitly changed TO null was typed from its
// OLD value instead of reflecting that it is now null. `after` is only
// genuinely absent when it's `undefined`, not when it's `null`. See review 2.19/3.8.
function currentValue(before: unknown, after: unknown): unknown {
  return after !== undefined ? after : before;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diffEntry(path: string, oldValue: unknown, newValue: unknown): ChangedItem {
  return {
    path,
    itemType: valueType(currentValue(oldValue, newValue)),
    operation: oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'changed',
    ...(oldValue !== undefined ? { before: oldValue } : {}),
    ...(newValue !== undefined ? { after: newValue } : {})
  };
}

// Common conventional identity fields, checked in order of specificity.
const ARRAY_IDENTITY_KEYS = ['id', 'name', 'key'];

function arrayIdentityKey(items: unknown[]): string | null {
  if (items.length === 0) return null;
  for (const key of ARRAY_IDENTITY_KEYS) {
    if (items.every((item) => isRecord(item) && typeof item[key] === 'string')) return key;
  }
  return null;
}

function normalizeArray(beforeList: unknown[], afterList: unknown[]): ChangedItem[] {
  const identityKey = arrayIdentityKey([...beforeList, ...afterList]);
  if (identityKey) {
    // Keyed diff: match array elements by identity value rather than raw index,
    // so inserting one element at the front (or reordering) doesn't spuriously
    // mark every later element as "changed" just because it shifted position.
    // See review 2.19/3.8.
    const beforeByKey = new Map(
      beforeList.map((item) => [(item as Record<string, unknown>)[identityKey] as string, item])
    );
    const afterByKey = new Map(
      afterList.map((item) => [(item as Record<string, unknown>)[identityKey] as string, item])
    );
    const allKeys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])];
    return allKeys
      .map((key) => diffEntry(`[${identityKey}=${key}]`, beforeByKey.get(key), afterByKey.get(key)))
      .filter((item) => !isDeepStrictEqual(item.before, item.after));
  }
  // Fallback: positional diff. Known limitation, not fixed here -- without a
  // shared identity field there is no principled way to tell "this element
  // moved" from "this element changed" for arbitrary array contents (this
  // would need a general sequence-alignment algorithm, not attempted here).
  const length = Math.max(beforeList.length, afterList.length);
  return Array.from({ length }, (_, index) => diffEntry(`[${index}]`, beforeList[index], afterList[index])).filter(
    (item) => (item.before !== undefined || item.after !== undefined) && !isDeepStrictEqual(item.before, item.after)
  );
}

function normalizePair(before: unknown, after: unknown): ChangedItem[] {
  if (Array.isArray(before) || Array.isArray(after)) {
    return normalizeArray(Array.isArray(before) ? before : [], Array.isArray(after) ? after : []);
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => {
      const oldValue = before[key];
      const newValue = after[key];
      if (Array.isArray(oldValue) || Array.isArray(newValue)) {
        // Recurse into nested arrays so keyed diffing (see normalizeArray above)
        // applies to array FIELDS within an object, not only when the whole diff
        // target is itself an array. A config object with a `containers` or `env`
        // array nested inside it is the common real-world shape here, not an
        // edge case -- without this, only a top-level array diff would benefit
        // from the fix above. See review 2.19/3.8.
        return normalizeArray(Array.isArray(oldValue) ? oldValue : [], Array.isArray(newValue) ? newValue : []).map(
          (item) => ({ ...item, path: `${key}${item.path}` })
        );
      }
      // Structural deep-equality, not JSON.stringify comparison: key order in an
      // object previously produced a false "changed" diff for two objects that
      // were actually equal (e.g. {a:1,b:2} vs {b:2,a:1}), and JSON.stringify
      // also throws on circular references and silently drops undefined values.
      // See review 2.19/3.8.
      return isDeepStrictEqual(oldValue, newValue) ? [] : [diffEntry(key, oldValue, newValue)];
    });
  }
  if (before !== undefined || after !== undefined) return [diffEntry('$value', before, after)];
  return [];
}

export function normalizeChange(change: ChangeDTO): ChangedItem[] {
  const metadata = change.metadata;
  const structuredDiff = metadata.diff;
  if (Array.isArray(structuredDiff)) {
    return structuredDiff
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        path: typeof item.path === 'string' ? item.path : '$diff',
        itemType: typeof item.itemType === 'string' ? item.itemType : 'change',
        operation: item.operation === 'added' || item.operation === 'removed' ? item.operation : 'changed',
        ...(item.before !== undefined ? { before: item.before } : {}),
        ...(item.after !== undefined ? { after: item.after } : {})
      }));
  }
  const changedPaths = metadata.changedPaths;
  if (Array.isArray(changedPaths)) {
    const paths = changedPaths.filter((path): path is string => typeof path === 'string').sort();
    if (paths.length > 0) {
      const pairedItems = normalizePair(change.before, change.after);
      return paths.map((path) => {
        const paired = pairedItems.find((item) => item.path === path);
        return {
          path,
          itemType: paired?.itemType ?? 'field',
          operation: 'changed',
          ...(paired?.before !== undefined ? { before: paired.before } : {}),
          ...(paired?.after !== undefined ? { after: paired.after } : {})
        };
      });
    }
  }
  const items = normalizePair(change.before, change.after);
  if (items.length > 0) return items;
  return [{ path: '$summary', itemType: change.changeType, operation: 'changed', after: change.summary }];
}
