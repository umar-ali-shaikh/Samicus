/**
 * Cache interface + in-memory implementation, matching apps/api/src/utils/cache.js's shape
 * exactly (get/set/getOrSet/clear with the same dedupe-concurrent-calls behaviour) so adopting
 * it is a drop-in swap, not a rewrite. NOT YET WIRED IN -- utils/cache.js stays authoritative
 * until each call site is ported in Phase 2+.
 *
 * A Redis-backed implementation of this same interface is the prod swap (per
 * docs/MASTER-PROMPT.md's scalability requirements) but is deliberately not built here:
 * enabling Redis/Upstash requires explicit sign-off (MASTER-PROMPT.md's STOP conditions).
 */

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createMemoryCache(): Cache {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  const inFlight = new Map<string, Promise<unknown>>();

  function get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  function set<T>(key: string, value: T, ttlMs: number): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = get<T>(key);
    if (cached !== undefined) return cached;

    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await fn();
        set(key, value, ttlMs);
        return value;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  }

  function clear(): void {
    store.clear();
    inFlight.clear();
  }

  return { get, set, getOrSet, clear };
}
