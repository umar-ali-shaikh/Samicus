import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "./cache.js";

test("getOrSet calls the loader once and caches the result", async () => {
  const cache = createCache();
  let calls = 0;
  const load = async () => { calls += 1; return "value"; };

  const a = await cache.getOrSet("k", 10_000, load);
  const b = await cache.getOrSet("k", 10_000, load);

  assert.equal(a, "value");
  assert.equal(b, "value");
  assert.equal(calls, 1);
});

test("dedupes concurrent calls for the same key into one loader invocation", async () => {
  const cache = createCache();
  let calls = 0;
  const load = () => new Promise((resolve) => {
    calls += 1;
    setTimeout(() => resolve("value"), 10);
  });

  const [a, b] = await Promise.all([
    cache.getOrSet("k", 10_000, load),
    cache.getOrSet("k", 10_000, load),
  ]);

  assert.equal(a, "value");
  assert.equal(b, "value");
  assert.equal(calls, 1);
});

test("expires entries after the TTL", async () => {
  const cache = createCache();
  cache.set("k", "old", 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(cache.get("k"), undefined);
});

test("different keys are cached independently", async () => {
  const cache = createCache();
  await cache.getOrSet("a", 10_000, async () => "A");
  await cache.getOrSet("b", 10_000, async () => "B");
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("b"), "B");
});

test("clear() empties the cache", async () => {
  const cache = createCache();
  await cache.getOrSet("k", 10_000, async () => "value");
  cache.clear();
  assert.equal(cache.get("k"), undefined);
});
