/**
 * Cache interface + implementations, per docs/MASTER-PROMPT.md's scalability requirements
 * ("Replace utils/cache.js ... with platform/cache ... interfaces (memory impl for dev/tests,
 * Redis impl for prod)"). The interface is async throughout (even get/set) because a Redis
 * backend cannot support a synchronous read -- every real call site in this codebase already
 * only used the async getOrSet()/clear() (verified by reading every caller before this change:
 * services/aiCaseLawAnswer.js, indianKanoon.js, legalAssistant.js, legalQueryUnderstanding.js),
 * so this is not a breaking change for any of them.
 *
 * Redis is now approved (per the Phase 4 sign-off) -- see platform/redis.ts for the shared
 * ioredis client and getCache() below for the memory/Redis selection every call site should use
 * instead of constructing createMemoryCache()/createRedisCache() directly.
 */
import type { Redis } from "ioredis";
import { getRedisClient } from "./redis.js";

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
  clear(): Promise<void>;
}

export function createMemoryCache(): Cache {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  const inFlight = new Map<string, Promise<unknown>>();

  async function get<T>(key: string): Promise<T | undefined> {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async function set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = await get<T>(key);
    if (cached !== undefined) return cached;

    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await fn();
        await set(key, value, ttlMs);
        return value;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  }

  async function clear(): Promise<void> {
    store.clear();
    inFlight.clear();
  }

  return { get, set, getOrSet, clear };
}

/**
 * Redis-backed cache. The getOrSet() in-flight dedupe stays process-local (a Map, same as the
 * memory impl) -- it is only a thundering-herd optimisation within one process; correctness
 * across processes comes from Redis itself being the single shared store, not from the dedupe.
 */
export function createRedisCache(client: Redis, keyPrefix = "cache:"): Cache {
  const inFlight = new Map<string, Promise<unknown>>();
  const prefixed = (key: string) => `${keyPrefix}${key}`;

  async function get<T>(key: string): Promise<T | undefined> {
    const raw = await client.get(prefixed(key));
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  }

  async function set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await client.set(prefixed(key), JSON.stringify(value), "PX", Math.max(1, Math.floor(ttlMs)));
  }

  async function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = await get<T>(key);
    if (cached !== undefined) return cached;

    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await fn();
        await set(key, value, ttlMs);
        return value;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  }

  async function clear(): Promise<void> {
    inFlight.clear();
    const keys = await client.keys(`${keyPrefix}*`);
    if (keys.length) await client.del(...keys);
  }

  return { get, set, getOrSet, clear };
}

let shared: Cache | undefined;

/** The one cache instance every call site should use -- Redis when REDIS_URL is configured,
 * an in-process Map otherwise (dev/tests, or a deployment that hasn't set Redis up yet). */
export function getCache(): Cache {
  if (!shared) {
    const client = getRedisClient();
    shared = client ? createRedisCache(client) : createMemoryCache();
  }
  return shared;
}
