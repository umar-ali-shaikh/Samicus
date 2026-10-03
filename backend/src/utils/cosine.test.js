import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity } from "./cosine.js";

test("cosineSimilarity() is 1 for identical vectors", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test("cosineSimilarity() is 0 for orthogonal vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity() is -1 for opposite vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("cosineSimilarity() is 0 when either vector is all zeros (no division by zero)", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
  assert.equal(cosineSimilarity([1, 2], [0, 0]), 0);
});
