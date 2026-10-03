import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { embedTexts, isGeminiConfigured, GeminiAuthError, GeminiApiError } from "./gemini.js";

let originalKey;

before(() => {
  originalKey = process.env.GEMINI_API_KEY;
});

after(() => {
  process.env.GEMINI_API_KEY = originalKey;
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test("isGeminiConfigured() reflects whether GEMINI_API_KEY is set", () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal(isGeminiConfigured(), false);
  process.env.GEMINI_API_KEY = "test-key";
  assert.equal(isGeminiConfigured(), true);
});

test("embedTexts() throws GeminiAuthError without calling fetch when the key is missing", async (t) => {
  delete process.env.GEMINI_API_KEY;
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    throw new Error("should not be called");
  });

  await assert.rejects(() => embedTexts(["hello"], "RETRIEVAL_QUERY"), GeminiAuthError);
  assert.equal(called, false);
});

test("embedTexts() returns [] for an empty input without calling fetch", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    return jsonResponse(200, { embeddings: [] });
  });

  const result = await embedTexts([], "RETRIEVAL_DOCUMENT");
  assert.deepEqual(result, []);
  assert.equal(called, false);
});

test("embedTexts() sends one batched request and returns vectors in order", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  let seenBody;
  let seenHeaders;
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    seenBody = JSON.parse(opts.body);
    seenHeaders = opts.headers;
    return jsonResponse(200, {
      embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
    });
  });

  const vectors = await embedTexts(["first", "second"], "RETRIEVAL_DOCUMENT");

  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
  assert.equal(seenBody.requests.length, 2);
  assert.equal(seenBody.requests[0].taskType, "RETRIEVAL_DOCUMENT");
  assert.equal(seenBody.requests[0].content.parts[0].text, "first");
  assert.equal(seenHeaders["x-goog-api-key"], "test-key");
});

test("embedTexts() throws GeminiAuthError on 401/403", async (t) => {
  process.env.GEMINI_API_KEY = "bad-key";
  t.mock.method(globalThis, "fetch", async () => jsonResponse(401, { error: "bad key" }));

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), GeminiAuthError);
});

test("embedTexts() throws GeminiApiError on other non-ok statuses", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => jsonResponse(500, { error: "boom" }));

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), GeminiApiError);
});

test("embedTexts() wraps a network failure in GeminiApiError", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("network down");
  });

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), GeminiApiError);
});
