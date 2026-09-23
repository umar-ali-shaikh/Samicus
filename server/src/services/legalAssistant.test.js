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

test("answerLegalQuestion() recovers a JSON object wrapped in commentary text", async (t) => {
  const wrapped = `Sure, here's the answer:\n${SECTIONS_JSON}\nLet me know if you need more.`;
  t.mock.method(globalThis, "fetch", routedFetch({ generation: wrapped, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "answered");
  assert.match(result.sections.statute, /\[1\]/);
});

test("answerLegalQuestion() treats syntactically-valid but wrong-shaped JSON as unparsed", async (t) => {
  const wrongShape = JSON.stringify({ hasSufficientEvidence: "true", statute: 42 }); // wrong types, not the six-field contract
  t.mock.method(globalThis, "fetch", routedFetch({ generation: wrongShape, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "unparsed");
  assert.equal(result.rawAnswer, wrongShape);
});

test("answerLegalQuestion() salvages individually well-formed fields from an object broken by one stray character", async (t) => {
  // Reproduces a real production case: a stray ':' right after the opening brace
  // ({":hasSufficientEvidence":false, ...) breaks JSON.parse on the whole object even
  // though every individual "field":"value" pair is well-formed.
  const glitched =
    '{":hasSufficientEvidence":false, "statute":null, ' +
    '"judgments":"Evidence [1] discusses a related order.", ' +
    '"interpretation":null, "generalInformation":null, ' +
    '"practicalNextSteps":"Turant ek qualified Indian lawyer se consult karein.", ' +
    '"insufficiencyNote":"Evidence FIR ke baad ke steps par direct jawab nahi deta."}';
  t.mock.method(globalThis, "fetch", routedFetch({ generation: glitched, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");

  assert.equal(result.outcome, "answered"); // recovered cleanly, not dumped as unparsed
  assert.equal(result.sections.hasSufficientEvidence, false);
  assert.match(result.sections.judgments, /related order/);
  assert.match(result.sections.practicalNextSteps, /qualified Indian lawyer/);
  assert.match(result.sections.insufficiencyNote, /direct jawab nahi deta/);
  // Never leak the raw curly-brace/JSON text into a user-facing field.
  for (const value of Object.values(result.sections)) {
    if (typeof value === "string") assert.ok(!value.includes("{"), `field leaked raw JSON: ${value}`);
  }
});

test("answerLegalQuestion() suppresses raw JSON-looking text instead of showing it when nothing can be salvaged", async (t) => {
  const unsalvageable = '{":totally broken, no recognizable fields at all';
  t.mock.method(globalThis, "fetch", routedFetch({ generation: unsalvageable, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "unparsed");
  assert.equal(result.sections.generalInformation, null); // not the raw '{...' text
  assert.equal(result.rawAnswer, unsalvageable); // still preserved for debugging/API consumers
});

test("answerLegalQuestion() prioritizes doctypes:laws hits (bare acts) ahead of general case-law hits", async (t) => {
  const FIR_UNDERSTANDING = JSON.stringify({
    searchQuery: "FIR police procedure rights",
    topic: "criminal procedure",
    language: "hinglish",
    isEmergency: false,
    emergencyReason: null,
  });
  const CASE_DOC = { tid: 111, title: "Karan vs State", headline: "FIR mentioned", docsource: "Punjab-Haryana High Court", docsize: 3 };
  const LAW_DOC = { tid: 222, title: "The Code Of Criminal Procedure, 1973 Section 154", headline: "FIR procedure", docsource: "Central Government Act", docsize: 1 };
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? FIR_UNDERSTANDING : SECTIONS_JSON);
    }
    if (u.includes("/search/")) {
      const isLawsSearch = decodeURIComponent(u).includes("doctypes:laws");
      return jsonResponse(200, { found: 1, docs: isLawsSearch ? [LAW_DOC] : [CASE_DOC], categories: [] });
    }
    if (u.includes("/doc/")) return jsonResponse(200, { doc: "<p>Statute or judgment text.</p>", title: "x", citeList: [], citedbyList: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");

  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].tid, 222); // the statute hit leads
  assert.equal(result.sources[1].tid, 111);
});

test("answerLegalQuestion() drops candidates with zero relevance to the query instead of padding evidence", async (t) => {
  // Mirrors a real production case: an FIR question where doctypes:laws only had
  // completely unrelated Acts on offer (no shared vocabulary at all) — the old
  // behavior force-included them anyway just to fill LAWS_TOP_N/topN slots.
  const FIR_UNDERSTANDING = JSON.stringify({
    searchQuery: "FIR registration police procedure next steps",
    topic: "criminal procedure",
    language: "hinglish",
    isEmergency: false,
    emergencyReason: null,
  });
  const UNRELATED_LAW = { tid: 401, title: "Kerala Municipality Act, 1994", headline: "municipal governance taxation provisions", docsource: "State of Kerala - Act", docsize: 6 };
  const RELEVANT_CASE = { tid: 402, title: "Tej Kishan Sadhu vs State", headline: "FIR registration procedure quashing", docsource: "Delhi High Court", docsize: 2 };
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? FIR_UNDERSTANDING : SECTIONS_JSON);
    }
    if (u.includes("/search/")) {
      const isLawsSearch = decodeURIComponent(u).includes("doctypes:laws");
      return jsonResponse(200, { found: 1, docs: isLawsSearch ? [UNRELATED_LAW] : [RELEVANT_CASE], categories: [] });
    }
    if (u.includes("/doc/")) return jsonResponse(200, { doc: "<p>text</p>", title: "x", citeList: [], citedbyList: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");

  assert.equal(result.sources.length, 1); // the unrelated Municipality Act was dropped, not force-included
  assert.equal(result.sources[0].tid, 402);
});

test("answerLegalQuestion() re-ranks general candidates by relevance, not just Indian Kanoon's raw order", async (t) => {
  // A/B share one weak, generic term ("remedy") with the query so they survive the
  // relevance filter (this test is about ordering, not filtering — see the dedicated
  // "drops candidates with zero relevance" test above for the filtering behavior).
  const IRRELEVANT_A = { tid: 301, title: "Random Tax Dispute vs Commissioner", headline: "income tax assessment appeal remedy sought", docsource: "ITAT", docsize: 4 };
  const RELEVANT = { tid: 302, title: "Sharma vs Landlord Tenant Deposit Case", headline: "landlord security deposit not returned tenant remedy compensation", docsource: "Delhi High Court", docsize: 2 };
  const IRRELEVANT_B = { tid: 303, title: "Random Motor Accident Claim", headline: "vehicle accident compensation tribunal remedy claim", docsource: "MACT", docsize: 3 };
  let orCalls = 0;

  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? UNDERSTANDING_JSON : SECTIONS_JSON);
    }
    if (u.includes("/search/")) {
      const isLawsSearch = decodeURIComponent(u).includes("doctypes:laws");
      return jsonResponse(200, {
        found: isLawsSearch ? 0 : 3,
        docs: isLawsSearch ? [] : [IRRELEVANT_A, RELEVANT, IRRELEVANT_B],
        categories: [],
      });
    }
    if (u.includes("/doc/")) return jsonResponse(200, { doc: "<p>text</p>", title: "x", citeList: [], citedbyList: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  // IK's raw order is [IRRELEVANT_A, RELEVANT, IRRELEVANT_B] — a naive first-N slice
  // would pick IRRELEVANT_A over RELEVANT. TF-IDF re-ranking (docText vs the distilled
  // searchQuery, "landlord security deposit not returned tenant remedy") should promote
  // the actually-relevant hit instead.
  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?", {}, 2);

  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].tid, 302);
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
