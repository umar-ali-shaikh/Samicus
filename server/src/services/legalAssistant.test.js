import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { answerLegalQuestion, DISCLAIMER, __resetCacheForTests } from "./legalAssistant.js";
import { __resetCacheForTests as resetIkCache } from "./indianKanoon.js";
import { __resetCacheForTests as resetQuCache } from "./legalQueryUnderstanding.js";

// All HTTP is mocked below — this suite never makes a real network call, and never hits
// Indian Kanoon or OpenRouter for real (both cost money).
let originalIkToken;
let originalOrKey;

before(() => {
  originalIkToken = process.env.IK_API_TOKEN;
  originalOrKey = process.env.OPENROUTER_API_KEY;
  process.env.IK_API_TOKEN = "test-ik-token";
  process.env.OPENROUTER_API_KEY = "test-or-key";
});

after(() => {
  process.env.IK_API_TOKEN = originalIkToken;
  process.env.OPENROUTER_API_KEY = originalOrKey;
});

beforeEach(() => {
  __resetCacheForTests();
  resetIkCache();
  resetQuCache();
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function llmMessage(content) {
  return jsonResponse(200, { choices: [{ message: { content } }] });
}

const UNDERSTANDING_JSON = JSON.stringify({
  searchQuery: "landlord security deposit not returned tenant remedy",
  topic: "tenancy",
  language: "hinglish",
  isEmergency: false,
  emergencyReason: null,
});

const SECTIONS_JSON = JSON.stringify({
  hasSufficientEvidence: true,
  statute: "Per [1], tenants may recover a wrongfully withheld deposit.",
  judgments: null,
  interpretation: "Based on [1], a landlord who withholds a deposit without cause may be liable to return it.",
  generalInformation: null,
  practicalNextSteps: "Send a written demand; consult a lawyer if the landlord doesn't respond.",
  insufficiencyNote: null,
});

// Dispatches mocked fetch calls by host: OpenRouter is called twice (understanding, then
// generation), Indian Kanoon's /search/ and /doc/ once each per doc. /docfragment/ is
// only hit when a test omits docText to simulate the full-document fetch failing.
function routedFetch({
  understanding = UNDERSTANDING_JSON,
  generation = SECTIONS_JSON,
  docs,
  docText = "<p>The <b>deposit</b> clause requires the landlord to return it within 30 days.</p>",
  fragmentText = "<b>deposit</b> clause",
} = {}) {
  let orCalls = 0;
  const seen = [];
  return async (url) => {
    seen.push(String(url));
    if (String(url).startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? understanding : generation);
    }
    if (String(url).includes("/search/")) {
      return jsonResponse(200, { found: docs.length, docs, categories: [] });
    }
    if (String(url).includes("/doc/")) {
      if (docText === null) return jsonResponse(404, { error: "doc not found" }); // 4xx: no retry, fails fast
      return jsonResponse(200, { doc: docText, title: "X vs Y", citeList: [], citedbyList: [] });
    }
    if (String(url).includes("/docfragment/")) {
      return jsonResponse(200, { headline: fragmentText });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };
}

const SAMPLE_DOC = { tid: 555, title: "X vs Y (Tenancy)", headline: "deposit dispute", docsource: "Delhi High Court", docsize: 5 };

test("answerLegalQuestion() runs understand -> search -> full document -> generate and returns structured sections", async (t) => {
  t.mock.method(globalThis, "fetch", routedFetch({ docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");

  assert.equal(result.outcome, "answered");
  assert.equal(result.understanding.searchQuery, "landlord security deposit not returned tenant remedy");
  assert.equal(result.emergency.flag, false);
  assert.equal(result.sections.hasSufficientEvidence, true);
  assert.match(result.sections.statute, /\[1\]/);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://indiankanoon.org/doc/555/");
  assert.equal(result.disclaimer, DISCLAIMER);
});

test("answerLegalQuestion() falls back to the docfragment snippet when the full-document fetch fails", async (t) => {
  t.mock.method(globalThis, "fetch", routedFetch({ docs: [SAMPLE_DOC], docText: null }));

  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");

  assert.equal(result.outcome, "answered");
  assert.equal(result.sources.length, 1); // evidence still built via the fragment fallback, not dropped
});

test("answerLegalQuestion() short-circuits to no_evidence when search finds nothing, without a generation call", async (t) => {
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(UNDERSTANDING_JSON);
    }
    if (String(url).includes("/search/")) return jsonResponse(200, { found: 0, docs: [], categories: [] });
    throw new Error(`Unexpected fetch to ${url}`);
  });

  const result = await answerLegalQuestion("some obscure query with no hits");

  assert.equal(result.outcome, "no_evidence");
  assert.equal(result.sections.hasSufficientEvidence, false);
  assert.ok(result.sections.insufficiencyNote);
  assert.equal(result.sources.length, 0);
  assert.equal(orCalls, 1); // only query understanding ran, not generation
});

test("answerLegalQuestion() flags emergencies via the keyword net even if the model doesn't", async (t) => {
  const understandingNoFlag = JSON.stringify({ searchQuery: "arrest rights criminal procedure", topic: "criminal procedure", language: "english", isEmergency: false, emergencyReason: null });
  t.mock.method(globalThis, "fetch", routedFetch({ understanding: understandingNoFlag, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("What are my rights if I am arrested?");

  assert.equal(result.emergency.flag, true);
  assert.ok(result.emergency.message);
});

test("answerLegalQuestion() falls back to raw text when the model doesn't return valid JSON", async (t) => {
  t.mock.method(globalThis, "fetch", routedFetch({ generation: "This is not JSON, just prose with a [1] citation.", docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "unparsed");
  assert.match(result.sections.generalInformation, /\[1\] citation/);
  assert.equal(result.rawAnswer, "This is not JSON, just prose with a [1] citation.");
});

test("answerLegalQuestion() caches identical question+filters — no repeat fetch calls", async (t) => {
  let calls = 0;
  const dispatcher = routedFetch({ docs: [SAMPLE_DOC] });
  t.mock.method(globalThis, "fetch", async (url) => {
    calls += 1;
    return dispatcher(url);
  });

  await answerLegalQuestion("same question", {}, 5);
  const callsAfterFirst = calls;
  await answerLegalQuestion("same question", {}, 5);

  assert.equal(calls, callsAfterFirst);
});
