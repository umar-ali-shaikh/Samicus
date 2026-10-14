// Per-provider call counter for the per-call-billed providers (Indian Kanoon, OpenRouter,
// Tavily) -- deliberately lightweight observability, not a billing reconciliation system.
// Redis-backed (via platform/redis.js's shared client, mirroring platform/cache.ts's
// memory/Redis selection) when REDIS_URL is configured, so counts stay accurate across
// horizontally-scaled instances instead of each instance only seeing its own share; falls
// back to an in-process Map otherwise -- same "optional integration, app keeps working
// without it" rule as cache/rateLimit.
import { getRedisClient } from "../platform/redis.js";

const REDIS_KEY = "counter:callCounts";

function createMemoryCounter() {
  const counts = new Map();

  async function increment(provider) {
    counts.set(provider, (counts.get(provider) || 0) + 1);
  }

  async function getCounts() {
    return Object.fromEntries(counts);
  }

  function clear() {
    counts.clear();
  }

  return { increment, getCounts, clear };
}

function createRedisCounter(client) {
  async function increment(provider) {
    await client.hincrby(REDIS_KEY, provider, 1);
  }

  async function getCounts() {
    const raw = await client.hgetall(REDIS_KEY);
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  }

  async function clear() {
    await client.del(REDIS_KEY);
  }

  return { increment, getCounts, clear };
}

let shared;

function getCounter() {
  if (!shared) {
    const client = getRedisClient();
    shared = client ? createRedisCounter(client) : createMemoryCounter();
  }
  return shared;
}

/**
 * @param {string} provider - e.g. "indianKanoon", "openrouter"
 * Never throws -- this is advisory observability, not part of any request's correctness path.
 * The old in-process Map version could never fail; a Redis hiccup here must not newly break
 * the real (billed) API call each increment() is reporting on.
 */
export async function increment(provider) {
  try {
    await getCounter().increment(provider);
  } catch (err) {
    console.error(`callCounter.increment(${provider}) failed:`, err.message);
  }
}

/** @returns {Promise<Record<string, number>>} */
export async function getCounts() {
  return getCounter().getCounts();
}

// Test-only: keeps counts from leaking between test files, and forces re-selection of the
// memory/Redis implementation (mirrors platform/cache.ts's __resetCacheForTests).
export async function __resetCountsForTests() {
  if (shared) await shared.clear();
  shared = undefined;
}
