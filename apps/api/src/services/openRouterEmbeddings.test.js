import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { embedTexts, isOpenRouterEmbeddingsConfigured, OpenRouterEmbeddingAuthError, OpenRouterEmbeddingApiError } from "./openRouterEmbeddings.js";

let originalKey;

before(() => {
  originalKey = process.env.OPENROUTER_API_KEY;
});

after(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test("isOpenRouterEmbeddingsConfigured() reflects whether OPENROUTER_API_KEY is set", () => {
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(isOpenRouterEmbeddingsConfigured(), false);
  process.env.OPENROUTER_API_KEY = "test-key";
  assert.equal(isOpenRouterEmbeddingsConfigured(), true);
});

test("embedTexts() throws OpenRouterEmbeddingAuthError without calling fetch when the key is missing", async (t) => {
  delete process.env.OPENROUTER_API_KEY;
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    throw new Error("should not be called");
  });

  await assert.rejects(() => embedTexts(["hello"], "RETRIEVAL_QUERY"), OpenRouterEmbeddingAuthError);
  assert.equal(called, false);
});

test("embedTexts() returns [] for an empty input without calling fetch", async (t) => {
  process.env.OPENROUTER_API_KEY = "test-key";
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    return jsonResponse(200, { data: [] });
  });

  const result = await embedTexts([], "RETRIEVAL_DOCUMENT");
  assert.deepEqual(result, []);
  assert.equal(called, false);
});

test("embedTexts() sends one batched request and returns vectors in order", async (t) => {
  process.env.OPENROUTER_API_KEY = "test-key";
  let seenBody;
  let seenHeaders;
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    seenBody = JSON.parse(opts.body);
    seenHeaders = opts.headers;
    return jsonResponse(200, {
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
    });
  });

  const vectors = await embedTexts(["first", "second"], "RETRIEVAL_DOCUMENT");

  assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
  assert.equal(seenBody.input.length, 2);
  assert.equal(seenBody.input[0], "first");
  assert.equal(seenHeaders.Authorization, "Bearer test-key");
});

test("embedTexts() throws OpenRouterEmbeddingAuthError on 401/403", async (t) => {
  process.env.OPENROUTER_API_KEY = "bad-key";
  t.mock.method(globalThis, "fetch", async () => jsonResponse(401, { error: "bad key" }));

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), OpenRouterEmbeddingAuthError);
});

test("embedTexts() throws OpenRouterEmbeddingApiError on other non-ok statuses", async (t) => {
  process.env.OPENROUTER_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => jsonResponse(500, { error: "boom" }));

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), OpenRouterEmbeddingApiError);
});

test("embedTexts() wraps a network failure in OpenRouterEmbeddingApiError", async (t) => {
  process.env.OPENROUTER_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("network down");
  });

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), OpenRouterEmbeddingApiError);
});

test("embedTexts() wraps a timeout that fires while parsing the body (res.json() rejecting) in OpenRouterEmbeddingApiError", async (t) => {
  process.env.OPENROUTER_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    },
    text: async () => "",
  }));

  await assert.rejects(() => embedTexts(["x"], "RETRIEVAL_QUERY"), OpenRouterEmbeddingApiError);
});
