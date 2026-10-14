// Ported from utils/cache.test.js (same assertions, now async get/set per this file's header
// comment) plus new coverage for createRedisCache against a minimal fake Redis client -- no
// live Redis server needed, same "fake double" precedent as test/fakeSupabase.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCache, createRedisCache } from "./cache.js";

test("memory cache: getOrSet calls the loader once and caches the result", async () => {
  const cache = createMemoryCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return "value";
  };

  const a = await cache.getOrSet("k", 10_000, load);
  const b = await cache.getOrSet("k", 10_000, load);

  assert.equal(a, "value");
  assert.equal(b, "value");
  assert.equal(calls, 1);
});

test("memory cache: dedupes concurrent calls for the same key into one loader invocation", async () => {
  const cache = createMemoryCache();
  let calls = 0;
  const load = () =>
    new Promise<string>((resolve) => {
      calls += 1;
      setTimeout(() => resolve("value"), 10);
    });

  const [a, b] = await Promise.all([cache.getOrSet("k", 10_000, load), cache.getOrSet("k", 10_000, load)]);

  assert.equal(a, "value");
  assert.equal(b, "value");
  assert.equal(calls, 1);
});

test("memory cache: expires entries after the TTL", async () => {
  const cache = createMemoryCache();
  await cache.set("k", "old", 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(await cache.get("k"), undefined);
});

test("memory cache: different keys are cached independently", async () => {
  const cache = createMemoryCache();
  await cache.getOrSet("a", 10_000, async () => "A");
  await cache.getOrSet("b", 10_000, async () => "B");
  assert.equal(await cache.get("a"), "A");
  assert.equal(await cache.get("b"), "B");
});

test("memory cache: clear() empties the cache", async () => {
  const cache = createMemoryCache();
  await cache.getOrSet("k", 10_000, async () => "value");
  await cache.clear();
  assert.equal(await cache.get("k"), undefined);
});

// A minimal fake standing in for the ioredis methods createRedisCache actually calls
// (get/set/keys/del) -- real TTL expiry, not simulated, so the TTL test below is meaningful.
class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, mode: string, ttlMs: number): Promise<"OK"> {
    assert.equal(mode, "PX", "createRedisCache must set a millisecond TTL");
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return "OK";
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, "");
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }
}

test("redis cache: getOrSet calls the loader once, serialising through the fake client", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake only implements
  // the subset of ioredis's Redis type createRedisCache actually calls.
  const cache = createRedisCache(new FakeRedis() as any);
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { answer: 42 };
  };

  const a = await cache.getOrSet("k", 10_000, load);
  const b = await cache.getOrSet("k", 10_000, load);

  assert.deepEqual(a, { answer: 42 });
  assert.deepEqual(b, { answer: 42 });
  assert.equal(calls, 1);
});

test("redis cache: expires entries after the TTL (real Redis PX semantics via the fake)", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache = createRedisCache(new FakeRedis() as any);
  await cache.set("k", "old", 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(await cache.get("k"), undefined);
});

test("redis cache: clear() only removes this cache's own prefixed keys", async () => {
  const fake = new FakeRedis();
  // Something else wrote directly to Redis under an unrelated key -- clear() must not touch it.
  await fake.set("other:thing", "x", "PX", 60_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache = createRedisCache(fake as any, "mycache:");
  await cache.set("k", "value", 60_000);
  await cache.clear();
  assert.equal(await cache.get("k"), undefined);
  assert.equal(await fake.get("other:thing"), "x");
});
