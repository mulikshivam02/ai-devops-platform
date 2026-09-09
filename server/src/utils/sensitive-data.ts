const sensitiveKey = /secret|token|password|api[-_]?key|private[-_]?key|credential|authorization/i;

export function sanitizeObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, entry]) => [key, sanitizeValue(entry)])
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === 'object' && entry !== null ? sanitizeObject(entry) : entry));
  if (typeof value === 'object' && value !== null) return sanitizeObject(value);
  return value;
}

export function sanitizeStructured(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeStructured(entry));
  if (typeof value === 'object' && value !== null) return sanitizeObject(value);
  return value;
}