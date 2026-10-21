/**
 * Tiny in-memory cache for results that are expensive or rude to recompute on every request (live
 * health probes of Kubernetes, Prometheus, Loki and the AI provider).
 *
 * It stores the *promise*, so concurrent callers inside the TTL share one in-flight probe rather than
 * each starting their own. A rejected load is evicted immediately so the next call retries; callers
 * that want failures cached (to avoid hammering a system that is down) should turn them into a value
 * inside `load`, as the dashboard does.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<T> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);

    if (hit && hit.expiresAt > this.now()) return hit.value;

    const value = load();

    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });

    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });

    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
