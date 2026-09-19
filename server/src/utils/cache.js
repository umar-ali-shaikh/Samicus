// Minimal in-memory TTL cache. The project has no existing cache to reuse, and nothing
// here needs to survive a restart, so a Map is enough — no new dependency required.

export function createCache() {
  const store = new Map(); // key -> { value, expiresAt }
  const inFlight = new Map(); // key -> Promise, so concurrent requests for the same key
  // (e.g. two users opening the same docid at once) don't both pay for the call.

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value, ttlMs) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async function getOrSet(key, ttlMs, fn) {
    const cached = get(key);
    if (cached !== undefined) return cached;

    if (inFlight.has(key)) return inFlight.get(key);

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

  function clear() {
    store.clear();
    inFlight.clear();
  }

  return { get, set, getOrSet, clear };
}
