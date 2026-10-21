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
  if (Array.isArray(value))
    return (value as unknown[]).map((entry) =>
      typeof entry === 'object' && entry !== null ? sanitizeObject(entry) : entry
    );
  if (typeof value === 'object' && value !== null) return sanitizeObject(value);
  return value;
}

export function sanitizeStructured(value: unknown): unknown {
  if (Array.isArray(value)) return (value as unknown[]).map((entry) => sanitizeStructured(entry));
  if (typeof value === 'object' && value !== null) return sanitizeObject(value);
  return value;
}

/**
 * Free-text secret patterns, applied to log lines, label values and anything else that
 * originates in an external system and later reaches the database or an AI prompt.
 *
 * Order matters: block-shaped secrets (PEM) first, then self-describing tokens (JWT,
 * AWS, GitHub), then the generic "key = value" / "Bearer x" shapes.
 */
const secretPatterns: Array<[RegExp, string]> = [
  // An unterminated PEM block (truncated upstream) is redacted to the end of the text.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]'],
  // user:password@ inside a connection string (mongodb://, https://, ...). Startup errors from the
  // MongoDB driver can echo the URI they were given.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
  [/\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*){0,2}/g, '[REDACTED JWT]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED AWS KEY]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g, '[REDACTED GITHUB TOKEN]'],
  // Bearer tokens of ANY length (short test/dev tokens are still credentials). "basic" is also an
  // ordinary English word, so it only counts when followed by something base64-shaped.
  [/\b(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]'],
  [/\b(basic\s+)[A-Za-z0-9+/]{8,}={0,2}/gi, '$1[REDACTED]'],
  [
    /((?:password|passwd|api[_-]?key|secret|token|credential|authorization)["']?\s*[:=]\s*)(?!(?:bearer|basic)\s)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1[REDACTED]'
  ]
];

/**
 * Redacts secrets and THEN truncates. The order is the point: truncating first cut a
 * secret that straddled the length limit in half, so the surviving fragment no longer
 * matched any pattern and was stored (and later sent to the model) verbatim. See review 4.8.
 */
export function redactSecrets(value: string, maxLength: number): string {
  let redacted = value;
  for (const [pattern, replacement] of secretPatterns) redacted = redacted.replace(pattern, replacement);
  return redacted.length > maxLength ? redacted.slice(0, maxLength) : redacted;
}
