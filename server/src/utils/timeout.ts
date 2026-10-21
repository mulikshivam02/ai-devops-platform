/**
 * Resolves with `work`'s result, or `fallback` if it takes longer than `ms`.
 *
 * The timer is always cleared. `Promise.race` against a bare `setTimeout` leaves the timer pending
 * after `work` wins, which kept the event loop alive for the full timeout after every request.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
