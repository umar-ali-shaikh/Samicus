import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { increment, getCounts, __resetCountsForTests } from "./callCounter.js";

beforeEach(async () => {
  await __resetCountsForTests();
});

test("increment() tallies calls per provider independently", async () => {
  await increment("indianKanoon");
  await increment("indianKanoon");
  await increment("openrouter");

  assert.deepEqual(await getCounts(), { indianKanoon: 2, openrouter: 1 });
});

test("getCounts() is empty before any increment", async () => {
  assert.deepEqual(await getCounts(), {});
});
