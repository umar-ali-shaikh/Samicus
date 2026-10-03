import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rankRelevantDocs } from "./relevanceRanking.js";

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

test("rankRelevantDocs() returns [] for an empty candidate list without calling fetch", async (t) => {
  delete process.env.GEMINI_API_KEY;
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    throw new Error("should not be called");
  });

  const result = await rankRelevantDocs("query", [], (x) => x);
  assert.deepEqual(result, []);
  assert.equal(called, false);
});

test("rankRelevantDocs() falls back to TF-IDF when GEMINI_API_KEY is unset", async (t) => {
  delete process.env.GEMINI_API_KEY;
  let fetchCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalled = true;
    throw new Error("should not be called — no Gemini key configured");
  });

  const items = [
    { title: "Unrelated tenancy dispute" },
    { title: "Code Of Criminal Procedure Section 154 FIR registration procedure" },
  ];
  const ranked = await rankRelevantDocs("FIR registration procedure", items, (i) => i.title);

  assert.equal(fetchCalled, false);
  assert.equal(ranked.length, 1); // the unrelated one is dropped by TF-IDF's zero-overlap filter
  assert.equal(ranked[0].item.title, items[1].title);
});

test("rankRelevantDocs() uses Gemini embeddings when configured, filtering below the similarity threshold", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    const isQuery = body.requests[0].taskType === "RETRIEVAL_QUERY";
    if (isQuery) return jsonResponse(200, { embeddings: [{ values: [1, 0] }] });
    // doc A closely aligned with the query vector, doc B orthogonal (unrelated)
    return jsonResponse(200, { embeddings: [{ values: [0.9, 0.1] }, { values: [0, 1] }] });
  });

  const items = [{ title: "relevant" }, { title: "unrelated" }];
  const ranked = await rankRelevantDocs("query", items, (i) => i.title);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.title, "relevant");
});

test("rankRelevantDocs() falls back to TF-IDF when the Gemini call fails", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => jsonResponse(500, { error: "boom" }));

  const items = [
    { title: "Unrelated tenancy dispute" },
    { title: "Code Of Criminal Procedure Section 154 FIR registration procedure" },
  ];
  const ranked = await rankRelevantDocs("FIR registration procedure", items, (i) => i.title);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.title, items[1].title);
});
