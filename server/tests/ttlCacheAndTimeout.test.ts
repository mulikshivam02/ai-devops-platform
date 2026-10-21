import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/utils/ttlCache.js';
import { withTimeout } from '../src/utils/timeout.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('returns the cached value within the TTL and reloads after it', async () => {
    let now = 1000;
    const cache = new TtlCache<number>(100, () => now);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.get('k', load)).toBe(1);
    now = 1099;
    expect(await cache.get('k', load)).toBe(1);
    now = 1101;
    expect(await cache.get('k', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keys entries independently', async () => {
    const cache = new TtlCache<string>(100, () => 0);

    expect(await cache.get('a', async () => 'A')).toBe('A');
    expect(await cache.get('b', async () => 'B')).toBe('B');
    expect(await cache.get('a', async () => 'changed')).toBe('A');
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const cache = new TtlCache<number>(100, () => 0);
    const load = vi.fn(async () => 7);

    const results = await Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);

    expect(results).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a rejection: the next call retries', async () => {
    const cache = new TtlCache<number>(100, () => 0);
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(5);

    await expect(cache.get('k', load)).rejects.toThrow('down');
    expect(await cache.get('k', load)).toBe(5);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('clear() drops everything', async () => {
    const cache = new TtlCache<number>(100, () => 0);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await cache.get('k', load);
    cache.clear();

    expect(await cache.get('k', load)).toBe(2);
  });

  it('uses the live clock by default, so fake timers can control it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    const cache = new TtlCache<number>(1000);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await cache.get('k', load);
    vi.setSystemTime(1001);

    expect(await cache.get('k', load)).toBe(2);
  });
});

describe('withTimeout', () => {
  it('returns the work result and clears its timer', async () => {
    vi.useFakeTimers();

    expect(await withTimeout(Promise.resolve('done'), 1000, 'fallback')).toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns the fallback when the work is too slow, and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<string>(() => undefined), 1000, 'fallback');

    await vi.advanceTimersByTimeAsync(1000);

    expect(await result).toBe('fallback');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates a rejection from the work and clears its timer', async () => {
    vi.useFakeTimers();

    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, 'fallback')).rejects.toThrow('nope');
    expect(vi.getTimerCount()).toBe(0);
  });
});
