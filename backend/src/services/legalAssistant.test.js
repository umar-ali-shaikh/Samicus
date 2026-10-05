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

const GENERAL_GUIDANCE_JSON = JSON.stringify({
  summary: "This looks like a wage dispute with your employer.",
  authority: "The local Labour Commissioner's office",
  documentsToCollect: ["Salary slips", "Bank statements", "Attendance records"],
  nextStep: "File a complaint with the Labour Commissioner or via the Samadhan portal.",
  legalAidContact: "NALSA helpline 15100",
  applicableLaws: [{ act: "Code on Wages 2019", plainMeaning: "Sets rules for timely payment of wages." }],
  followUpQuestions: ["Do you have a written appointment letter?"],
});

// Cites BOTH evidence indexes — used by tests that check ordering/ranking across 2 sources,
// since a source never cited anywhere in the body is now trimmed out of `result.sources`.
const SECTIONS_JSON_TWO_SOURCES = JSON.stringify({
  summary: "Per [1] and [2], this is well covered.",
  immediateActions: [],
  stepByStep: [{ order: 1, action: "Send a written demand.", where: null, documentsNeeded: [], timeLimit: null, sourceIds: ["1", "2"] }],
  yourRights: [],
  applicableLaws: [],
  caseLaw: [],
  whereToGetHelp: [],
  gaps: [],
  followUpQuestions: [],
  confidence: "medium",
});

const SECTIONS_JSON = JSON.stringify({
  summary: "Per [1], tenants may recover a wrongfully withheld deposit.",
  immediateActions: [],
  stepByStep: [{ order: 1, action: "Send a written demand to the landlord.", where: null, documentsNeeded: [], timeLimit: null, sourceIds: ["1"] }],
  yourRights: [],
  applicableLaws: [],
  caseLaw: [],
  whereToGetHelp: [],
  gaps: [],
  followUpQuestions: [],
  confidence: "medium",
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
  assert.match(result.sections.summary, /\[1\]/);
  assert.equal(result.sections.stepByStep[0].sourceIds[0], "1");
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

test("answerLegalQuestion() falls back to general guidance (never a bare 'insufficient sources' card) when search finds nothing", async (t) => {
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? UNDERSTANDING_JSON : GENERAL_GUIDANCE_JSON);
    }
    if (String(url).includes("/search/")) return jsonResponse(200, { found: 0, docs: [], categories: [] });
    throw new Error(`Unexpected fetch to ${url}`);
  });

  const result = await answerLegalQuestion("some obscure query with no hits");

  assert.equal(result.outcome, "general_guidance");
  assert.equal(result.sections.groundedInEvidence, false);
  assert.match(result.sections.summary, /wage dispute/);
  assert.equal(result.sections.applicableLaws[0].act, "Code on Wages 2019");
  assert.equal(result.sections.whereToGetHelp[0].contact, "NALSA helpline 15100");
  assert.equal(result.sections.followUpQuestions.length, 1); // the "1-2 clarifying questions" ask
  assert.equal(result.sources.length, 0); // nothing to cite — this is explicitly ungrounded
  assert.equal(orCalls, 2); // query understanding, then the general-guidance generation call
});

test("answerLegalQuestion() flags emergencies via the keyword net even if the model doesn't, and prepends a fixed immediate action", async (t) => {
  const understandingNoFlag = JSON.stringify({ searchQuery: "arrest rights criminal procedure", topic: "criminal procedure", language: "english", isEmergency: false, emergencyReason: null });
  t.mock.method(globalThis, "fetch", routedFetch({ understanding: understandingNoFlag, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("What are my rights if I am arrested?");

  assert.equal(result.emergency.flag, true);
  assert.ok(result.emergency.message);
  // Server-constructed, non-LLM-generated — always first, regardless of what the model produced.
  assert.equal(result.sections.immediateActions[0].step, result.emergency.message);
});

test("answerLegalQuestion() falls back to raw text when the model doesn't return valid JSON", async (t) => {
  t.mock.method(globalThis, "fetch", routedFetch({ generation: "This is not JSON, just prose with a [1] citation.", docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "unparsed");
  assert.match(result.sections.summary, /\[1\] citation/);
  assert.equal(result.rawAnswer, "This is not JSON, just prose with a [1] citation.");
});

test("answerLegalQuestion() recovers a JSON object wrapped in commentary text", async (t) => {
  const wrapped = `Sure, here's the answer:\n${SECTIONS_JSON}\nLet me know if you need more.`;
  t.mock.method(globalThis, "fetch", routedFetch({ generation: wrapped, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "answered");
  assert.match(result.sections.summary, /\[1\]/);
});

test("answerLegalQuestion() treats syntactically-valid but wrong-shaped JSON as unparsed", async (t) => {
  const wrongShape = JSON.stringify({ summary: 42, immediateActions: "not an array" }); // wrong types, not the documented contract
  t.mock.method(globalThis, "fetch", routedFetch({ generation: wrongShape, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "unparsed");
  assert.equal(result.rawAnswer, wrongShape);
});

test("answerLegalQuestion() salvages well-formed scalar fields from a truncated/malformed response", async (t) => {
  // A cut-off model response (e.g. hit a token limit mid-object) — JSON.parse fails
  // outright (no closing brace), but the individual "field":"value" pairs written so
  // far are well-formed. Since every field in the new schema is optional, a merely
  // oddly-shaped-but-valid object would validate trivially with mostly-empty defaults
  // (unlike the old schema's required hasSufficientEvidence, which forced a validation
  // failure on key corruption) — only a genuine syntax error actually reaches salvage
  // now. Only scalar fields (summary, confidence) are salvaged — the rest of the
  // richer schema is array-shaped and degrades to empty arrays.
  const glitched = '{"summary":"Turant ek qualified Indian lawyer se consult karein.", "confidence":"low"';
  t.mock.method(globalThis, "fetch", routedFetch({ generation: glitched, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");

  assert.equal(result.outcome, "answered"); // recovered cleanly, not dumped as unparsed
  assert.match(result.sections.summary, /qualified Indian lawyer/);
  assert.equal(result.sections.confidence, "low");
  assert.deepEqual(result.sections.stepByStep, []);
  // Never leak the raw curly-brace/JSON text into a user-facing field.
  assert.ok(!result.sections.summary.includes("{"));
});

test("answerLegalQuestion() suppresses raw JSON-looking text instead of showing it when nothing can be salvaged", async (t) => {
  const unsalvageable = '{":totally broken, no recognizable fields at all';
  t.mock.method(globalThis, "fetch", routedFetch({ generation: unsalvageable, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Section 138 NI Act ka kya meaning hai?");

  assert.equal(result.outcome, "unparsed");
  assert.equal(result.sections.summary, null); // not the raw '{...' text
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
      return llmMessage(orCalls === 1 ? FIR_UNDERSTANDING : SECTIONS_JSON_TWO_SOURCES);
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
      return llmMessage(orCalls === 1 ? UNDERSTANDING_JSON : SECTIONS_JSON_TWO_SOURCES);
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

// ---- Stage 3/4/6 tests: Indian Kanoon + Tavily fallbacks ------------------------------
// QDRANT_URL is never set in this file, so ragEnabled() is false and
// stage 2 always returns zero passages — the same observable shape as a genuine "RAG
// miss" for every test in this file, without needing a Qdrant/Supabase double here.
// (The "RAG hit skips everything" and "learn step dedupes" cases genuinely need a live
// knowledge base, so they live in rag/rag.test.js, which already has that harness.)

// Pass key: null to explicitly simulate TAVILY_API_KEY being unset (not configured).
function withTavilyKey(t, key = "test-tavily-key") {
  const prev = process.env.TAVILY_API_KEY;
  if (key === null) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = key;
  t.after(() => { if (prev === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = prev; });
}

function tavilyResponse(results) {
  return jsonResponse(200, { results });
}

test("answerLegalQuestion() skips Tavily when Indian Kanoon alone already gives enough evidence", async (t) => {
  withTavilyKey(t);
  const DOC_A = { tid: 701, title: "Rent Control Act, 1999", headline: "landlord security deposit refund", docsource: "Central Government Act", docsize: 2 };
  const DOC_B = { tid: 702, title: "Tenant v Landlord", headline: "security deposit refund dispute", docsource: "Delhi High Court", docsize: 3 };
  let orCalls = 0;
  let tavilyCalled = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? UNDERSTANDING_JSON : SECTIONS_JSON);
    }
    if (u.startsWith("https://api.tavily.com")) {
      tavilyCalled = true;
      return tavilyResponse([]);
    }
    if (u.includes("/search/")) {
      const isLawsSearch = decodeURIComponent(u).includes("doctypes:laws");
      return jsonResponse(200, { found: 1, docs: isLawsSearch ? [DOC_A] : [DOC_B], categories: [] });
    }
    if (u.includes("/doc/")) return jsonResponse(200, { doc: "<p>landlord security deposit text</p>", title: "x", citeList: [], citedbyList: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");

  assert.equal(result.outcome, "answered");
  assert.deepEqual(result.evidenceOrigin, { rag: 0, indianKanoon: 2, web: 0 });
  assert.equal(tavilyCalled, false, "two Indian Kanoon hits already clear MIN_EVIDENCE_TO_SKIP_WEB — Tavily must not run");
});

test("answerLegalQuestion() falls through to Tavily when Indian Kanoon comes up empty", async (t) => {
  withTavilyKey(t);
  let orCalls = 0;
  let generationPrompt = "";
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      if (orCalls === 1) return llmMessage(UNDERSTANDING_JSON);
      generationPrompt = JSON.parse(init.body).messages.at(-1).content;
      return llmMessage(SECTIONS_JSON);
    }
    if (u.startsWith("https://api.tavily.com")) {
      return tavilyResponse([
        { title: "Rent disputes — step by step", url: "https://nalsa.gov.in/rent-deposit-guide", content: "A tenant can approach the rent authority to recover a wrongfully withheld deposit.", score: 0.9 },
      ]);
    }
    if (u.includes("/search/")) return jsonResponse(200, { found: 0, docs: [], categories: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");

  assert.equal(result.outcome, "answered");
  assert.deepEqual(result.evidenceOrigin, { rag: 0, indianKanoon: 0, web: 1 });
  assert.equal(result.sources[0].url, "https://nalsa.gov.in/rent-deposit-guide");
  assert.equal(result.sources[0].sourceType, "web");
  assert.match(generationPrompt, /nalsa\.gov\.in/);
});

test("answerLegalQuestion() falls back to general guidance when Tavily is not configured and Indian Kanoon is empty", async (t) => {
  withTavilyKey(t, null); // not configured
  let orCalls = 0;
  let tavilyCalled = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? UNDERSTANDING_JSON : GENERAL_GUIDANCE_JSON);
    }
    if (u.startsWith("https://api.tavily.com")) {
      tavilyCalled = true;
      return tavilyResponse([]);
    }
    if (u.includes("/search/")) return jsonResponse(200, { found: 0, docs: [], categories: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("some obscure query with no hits anywhere");

  assert.equal(result.outcome, "general_guidance");
  assert.equal(tavilyCalled, false, "TAVILY_API_KEY is unset — the stage must not attempt a call");
  assert.equal(orCalls, 2, "query understanding, then the general-guidance generation call");
});

test("answerLegalQuestion() falls back to general guidance (not an unhandled throw) when Tavily itself fails", async (t) => {
  withTavilyKey(t);
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? UNDERSTANDING_JSON : GENERAL_GUIDANCE_JSON);
    }
    if (u.startsWith("https://api.tavily.com")) return jsonResponse(500, { error: "Tavily is down" });
    if (u.includes("/search/")) return jsonResponse(200, { found: 0, docs: [], categories: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("some obscure query with no hits anywhere");

  assert.equal(result.outcome, "general_guidance");
  assert.equal(orCalls, 2, "a failed Tavily call still falls through to general guidance, not a throw");
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

// ---- Issue 3: a relative/friend asking about someone else's custody gets different,
// specific guidance (24-hour rule + helplines), not generic "if you are arrested" advice ---
test("answerLegalQuestion() gives the relative-of-someone-in-custody rights checklist and helplines, even with no cited evidence", async (t) => {
  const CUSTODY_UNDERSTANDING = JSON.stringify({
    searchQueries: ["BNSS arrest procedure rights", "habeas corpus illegal detention"],
    topic: "criminal procedure - arrest",
    language: "hinglish",
    speakerRole: "relative_or_witness",
    isEmergency: true,
    emergencyReason: "A family member was taken into police custody.",
  });
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? CUSTODY_UNDERSTANDING : GENERAL_GUIDANCE_JSON);
    }
    if (u.includes("/search/")) return jsonResponse(200, { found: 0, docs: [], categories: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("police kal raat mere bete ko utha ke le gaye, koi kagaj nahi diya, thane me milne nahi de rahe");

  assert.equal(result.emergency.custodyOfRelative, true);
  assert.ok(result.sections.yourRights.some((r) => /24 hours/.test(r.right)), "the 24-hour production-before-magistrate rule must be present");
  assert.ok(result.sections.whereToGetHelp.some((h) => h.contact === "15100"), "NALSA's helpline must be offered");
  assert.ok(result.sections.whereToGetHelp.some((h) => /District Legal Services Authority/.test(h.name)), "the DLSA must be offered");
});

// ---- Issue 4: BNS/BNSS/BSA current-law mapping -----------------------------------------
test("answerLegalQuestion() flags an answer that cites only a repealed code (CrPC/IPC) without its BNS/BNSS/BSA successor", async (t) => {
  const OLD_CODE_ONLY = JSON.stringify({ ...JSON.parse(SECTIONS_JSON), summary: "Per [1], file this under CrPC Section 154." });
  t.mock.method(globalThis, "fetch", routedFetch({ generation: OLD_CODE_ONLY, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");
  assert.equal(result.lawCurrencyWarning, true);
});

test("answerLegalQuestion() does not flag an answer that already names the current BNSS section alongside the old one", async (t) => {
  const BOTH_CODES = JSON.stringify({ ...JSON.parse(SECTIONS_JSON), summary: "Per [1], file under BNSS Section 173 (old CrPC Section 154)." });
  t.mock.method(globalThis, "fetch", routedFetch({ generation: BOTH_CODES, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");
  assert.equal(result.lawCurrencyWarning, false);
});

// ---- Issue 8: grounding/confidence discipline ------------------------------------------
test("answerLegalQuestion() caps 'high' confidence down to 'medium' when fewer than 3 sources are actually cited", async (t) => {
  const OVERCONFIDENT = JSON.stringify({ ...JSON.parse(SECTIONS_JSON), confidence: "high" }); // only cites source "1"
  t.mock.method(globalThis, "fetch", routedFetch({ generation: OVERCONFIDENT, docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");
  assert.equal(result.sections.confidence, "medium");
});

test("answerLegalQuestion() removes a retrieved source from the list if nothing in the body actually cites it", async (t) => {
  // Must share real vocabulary with the two docs below (FIR-themed) — otherwise the
  // TF-IDF relevance fallback drops both as unrelated, and the pipeline falls all the way
  // through to the always-sourceless general-guidance path instead of the "answered" path
  // this test is actually about.
  const FIR_UNDERSTANDING = JSON.stringify({ searchQuery: "FIR police procedure rights", topic: "criminal procedure", language: "hinglish", isEmergency: false, emergencyReason: null });
  const CASE_DOC = { tid: 111, title: "Karan vs State", headline: "FIR mentioned", docsource: "Punjab-Haryana High Court", docsize: 3 };
  const LAW_DOC = { tid: 222, title: "The Code Of Criminal Procedure, 1973 Section 154", headline: "FIR procedure", docsource: "Central Government Act", docsize: 1 };
  let orCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = String(url);
    if (u.startsWith("https://openrouter.ai")) {
      orCalls += 1;
      return llmMessage(orCalls === 1 ? FIR_UNDERSTANDING : SECTIONS_JSON); // cites only "1"
    }
    if (u.includes("/search/")) {
      const isLawsSearch = decodeURIComponent(u).includes("doctypes:laws");
      return jsonResponse(200, { found: 1, docs: isLawsSearch ? [LAW_DOC] : [CASE_DOC], categories: [] });
    }
    if (u.includes("/doc/")) return jsonResponse(200, { doc: "<p>text</p>", title: "x", citeList: [], citedbyList: [] });
    throw new Error(`Unexpected fetch to ${u}`);
  });

  const result = await answerLegalQuestion("Mujhe FIR ho gayi hai, ab kya karu?");

  assert.equal(result.sources.length, 1, "the uncited second source (CASE_DOC) must be dropped from the list");
  assert.equal(result.sources[0].tid, 222);
});

// ---- Issue 5: a ready legal-notice template for a tenancy deposit dispute --------------
test("answerLegalQuestion() attaches a legal-notice template for a landlord deposit dispute", async (t) => {
  t.mock.method(globalThis, "fetch", routedFetch({ docs: [SAMPLE_DOC] }));

  const result = await answerLegalQuestion("Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?");
  assert.match(result.sections.legalNoticeTemplate, /LEGAL NOTICE/);
  assert.match(result.sections.legalNoticeTemplate, /security deposit/);
});
