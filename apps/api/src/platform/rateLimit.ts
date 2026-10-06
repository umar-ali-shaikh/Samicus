/**
 * Rate-limit store interface, shaped to match express-rate-limit's Store contract
 * (increment/decrement/resetKey) so a Redis-backed store (rate-limit-redis + ioredis) can be
 * swapped in for prod later without touching call sites. NOT YET WIRED IN -- every route still
 * uses express-rate-limit's default in-memory store directly (see docs/architecture/00-inventory.md
 * risk list for which routes are missing dedicated limiters entirely).
 *
 * Enabling real Redis requires explicit sign-off (docs/MASTER-PROMPT.md STOP conditions) --
 * this file only defines the seam, it does not add the ioredis/rate-limit-redis dependency.
 */

export interface RateLimitHit {
  totalHits: number;
  resetTime?: Date;
}

export interface RateLimitStore {
  increment(key: string): Promise<RateLimitHit>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
}

/** Process-local store for dev/tests. Each app instance has its own counters -- not safe for
 * a horizontally-scaled prod deployment, which is exactly the gap a future Redis store closes. */
export function createMemoryRateLimitStore(windowMs: number): RateLimitStore {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function currentWindow(key: string) {
    const now = Date.now();
    const existing = hits.get(key);
    if (existing && existing.resetAt > now) return existing;
    const fresh = { count: 0, resetAt: now + windowMs };
    hits.set(key, fresh);
    return fresh;
  }

  return {
    async increment(key) {
      const window = currentWindow(key);
      window.count += 1;
      return { totalHits: window.count, resetTime: new Date(window.resetAt) };
    },
    async decrement(key) {
      const window = hits.get(key);
      if (window && window.count > 0) window.count -= 1;
    },
    async resetKey(key) {
      hits.delete(key);
    },
  };
}
