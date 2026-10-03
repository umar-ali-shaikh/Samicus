import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { understandQuery, OpenRouterAuthError, __resetCacheForTests } from "./legalQueryUnderstanding.js";

// All HTTP is mocked below — this suite never makes a real network call.
let originalKey;

before(() => {
  originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
});

after(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
});

beforeEach(() => {
  __resetCacheForTests();
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function llmResponse(content) {
  return jsonResponse(200, { choices: [{ message: { content } }] });
}

test("understandQuery() parses a well-formed JSON response", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    llmResponse(
      JSON.stringify({
        searchQuery: "landlord security deposit not returned tenant remedy",
        topic: "tenancy",
        language: "hinglish",
        isEmergency: false,
        emergencyReason: null,
      })
    )
  );

  const result = await understandQuery("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");

  assert.equal(result.searchQuery, "landlord security deposit not returned tenant remedy");
  assert.equal(result.topic, "tenancy");
  assert.equal(result.isEmergency, false);
});

test("understandQuery() strips markdown code fences before parsing", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    llmResponse("```json\n" + JSON.stringify({ searchQuery: "bail anticipatory", topic: "criminal procedure", language: "english", isEmergency: false, emergencyReason: null }) + "\n```")
  );

  const result = await understandQuery("What does the Supreme Court say about anticipatory bail?");
  assert.equal(result.searchQuery, "bail anticipatory");
});

test("understandQuery() OR's the LLM's isEmergency with the keyword safety net", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    llmResponse(JSON.stringify({ searchQuery: "arrest rights", topic: "criminal procedure", language: "english", isEmergency: false, emergencyReason: null }))
  );

  // The LLM said false, but the question itself mentions arrest — the keyword net must still flag it.
  const result = await understandQuery("What are my rights if I am arrested?");
  assert.equal(result.isEmergency, true);
});

test("understandQuery() falls back gracefully on invalid JSON, keyword-checking emergency", async (t) => {
  t.mock.method(globalThis, "fetch", async () => llmResponse("not json at all"));

  const result = await understandQuery("Mere against FIR ho gayi hai, ab mujhe kya karna chahiye?");
  assert.equal(result.parseFallback, true);
  assert.equal(result.isEmergency, true); // "FIR" keyword
});

test("understandQuery() falls back gracefully when OpenRouter auth fails", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(401, { error: "bad key" }));

  const result = await understandQuery("Section 138 NI Act ka kya meaning hai?");
  assert.equal(result.parseFallback, true);
  assert.equal(result.searchQuery, "Section 138 NI Act ka kya meaning hai?");
});

test("understandQuery() caches identical questions — fetch is only called once", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return llmResponse(JSON.stringify({ searchQuery: "x", topic: "y", language: "english", isEmergency: false, emergencyReason: null }));
  });

  await understandQuery("same question");
  await understandQuery("same question");
  assert.equal(calls, 1);
});

test("missing OPENROUTER_API_KEY still returns a usable fallback (no OpenRouterAuthError thrown)", async (t) => {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return llmResponse("{}"); });

  const result = await understandQuery("Can an employer terminate me without notice?");
  assert.equal(calls, 0);
  assert.equal(result.parseFallback, true);

  process.env.OPENROUTER_API_KEY = saved;
});
