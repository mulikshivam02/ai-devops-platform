/**
 * Small shared helpers for "this lookup is allowed to fail, but not silently".
 *
 * `.catch(() => [])` made a broken query indistinguishable from genuinely empty history, so the AI
 * (and the operator reading its output) would conclude "no similar changes" when the truth was "the
 * lookup failed". See review 5.7.
 */

type Level = 'warn' | 'error';

export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error)
    return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  return { name: typeof error, message: String(error) };
}

// Same one-line JSON shape as middleware/error.middleware.ts so both sort together in a log stream.
export function logEvent(level: Level, code: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level, code, ...fields }));
}

/**
 * Runs `work`; on failure logs the real error, records `label` in `failed`, and returns `fallback`.
 * The caller decides how to surface `failed` -- the point is that it is never empty by accident.
 */
export async function tryLookup<T>(label: string, work: () => Promise<T>, fallback: T, failed: string[]): Promise<T> {
  try {
    return await work();
  } catch (error) {
    failed.push(label);
    logEvent('error', 'LOOKUP_FAILED', { label, ...describeError(error) });
    return fallback;
  }
}

/**
 * What a failed lookup looks like in a result that otherwise carries data. Distinct from
 * `insufficient_evidence`, which is a real finding ("we looked; there is not enough history").
 */
export interface LookupFailure {
  status: 'error';
  message: string;
}

export function lookupFailure(label: string): LookupFailure {
  return { status: 'error', message: `${label} lookup failed; this section is unknown, not empty.` };
}

/** Maps with at most `limit` calls in flight, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);

  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;

      next += 1;

      results[index] = await work(items[index] as T);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));

  return results;
}
