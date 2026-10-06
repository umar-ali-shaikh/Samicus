// Tiny in-memory per-provider call counter. Indian Kanoon and OpenRouter both bill per
// call and nothing in the app logs volume — this is deliberately lightweight
// observability, not a billing reconciliation system: it resets on restart and (like
// utils/cache.js) doesn't survive multiple instances. Fine for the app's current
// single-process deployment; see docs/legal-assistant-spec.md gap #5 for the same
// tradeoff already accepted for the answer cache.
const counts = new Map();

/** @param {string} provider - e.g. "indianKanoon", "openrouter" */
export function increment(provider) {
  counts.set(provider, (counts.get(provider) || 0) + 1);
}

/** @returns {Record<string, number>} */
export function getCounts() {
  return Object.fromEntries(counts);
}

// Test-only: keeps counts from leaking between test files.
export function __resetCountsForTests() {
  counts.clear();
}
