import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { increment, getCounts, __resetCountsForTests } from "./callCounter.js";

beforeEach(() => {
  __resetCountsForTests();
});

test("increment() tallies calls per provider independently", () => {
  increment("indianKanoon");
  increment("indianKanoon");
  increment("openrouter");

  assert.deepEqual(getCounts(), { indianKanoon: 2, openrouter: 1 });
});

test("getCounts() is empty before any increment", () => {
  assert.deepEqual(getCounts(), {});
});
