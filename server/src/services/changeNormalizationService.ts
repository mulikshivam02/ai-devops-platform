import type { ChangeDTO } from '../types/change.js';
import type { ChangedItem } from '../types/changeAnalysis.js';

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function normalizePair(before: unknown, after: unknown): ChangedItem[] {
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeList = Array.isArray(before) ? before : [];
    const afterList = Array.isArray(after) ? after : [];
    const length = Math.max(beforeList.length, afterList.length);
    return Array.from({ length }, (_, index) => {
      const oldValue = beforeList[index];
      const newValue = afterList[index];
      const operation: ChangedItem['operation'] = oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'changed';
      return { path: `[${index}]`, itemType: valueType(newValue ?? oldValue), operation, ...(oldValue !== undefined ? { before: oldValue } : {}), ...(newValue !== undefined ? { after: newValue } : {}) };
    }).filter((item) => item.before !== undefined || item.after !== undefined).filter((item) => JSON.stringify(item.before) !== JSON.stringify(item.after));
  }
  if (before && typeof before === 'object' && after && typeof after === 'object') {
    const oldObject = before as Record<string, unknown>;
    const newObject = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(oldObject), ...Object.keys(newObject)])].sort();
    return keys.filter((key) => JSON.stringify(oldObject[key]) !== JSON.stringify(newObject[key])).map((key) => ({ path: key, itemType: valueType(newObject[key] ?? oldObject[key]), operation: oldObject[key] === undefined ? 'added' : newObject[key] === undefined ? 'removed' : 'changed', ...(oldObject[key] !== undefined ? { before: oldObject[key] } : {}), ...(newObject[key] !== undefined ? { after: newObject[key] } : {}) }));
  }
  if (before !== undefined || after !== undefined) return [{ path: '$value', itemType: valueType(after ?? before), operation: 'changed', ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) }];
  return [];
}

export function normalizeChange(change: ChangeDTO): ChangedItem[] {
  const metadata = change.metadata as Record<string, unknown>;
  const structuredDiff = metadata.diff;
  if (Array.isArray(structuredDiff)) {
    return structuredDiff.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null).map((item) => ({ path: typeof item.path === 'string' ? item.path : '$diff', itemType: typeof item.itemType === 'string' ? item.itemType : 'change', operation: item.operation === 'added' || item.operation === 'removed' ? item.operation : 'changed', ...(item.before !== undefined ? { before: item.before } : {}), ...(item.after !== undefined ? { after: item.after } : {}) }));
  }
  const changedPaths = metadata.changedPaths;
  if (Array.isArray(changedPaths)) {
    const paths = changedPaths.filter((path): path is string => typeof path === 'string').sort();
    if (paths.length > 0) {
      const pairedItems = normalizePair(change.before, change.after);
      return paths.map((path) => {
        const paired = pairedItems.find((item) => item.path === path);
        return { path, itemType: paired?.itemType ?? 'field', operation: 'changed', ...(paired?.before !== undefined ? { before: paired.before } : {}), ...(paired?.after !== undefined ? { after: paired.after } : {}) };
      });
    }
  }
  const items = normalizePair(change.before, change.after);
  if (items.length > 0) return items;
  return [{ path: '$summary', itemType: change.changeType, operation: 'changed', after: change.summary }];
}