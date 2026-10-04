import { test, mock, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createFakeSupabase } from "../../test/fakeSupabase.js";

// ---- fakes: Supabase (in-memory), Gemini embeddings (bag-of-words), Qdrant (in-memory cosine) ----
const fake = createFakeSupabase({ unique: { corpus_documents: [{ cols: ["external_id"] }] } });
mock.module("../../config/db.js", { namedExports: { getSupabase: () => fake.client } });

const DIM = 768;
function embedText(text) {
  const v = new Array(DIM).fill(0);
  for (const w of String(text).toLowerCase().match(/[a-z]{3,}/g) || []) {
    const h = crypto.createHash("md5").update(w).digest();
    v[h.readUInt16BE(0) % DIM] += 1;
  }
  return v;
}
const cosine = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};

let qdrantCollections;
let calls;
const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

function stubFetch(extra = () => null) {
  return async (url, init = {}) => {
    const u = String(url);
    calls.push(`${init.method || "GET"} ${u}`);
    const handled = extra(u, init);
    if (handled) return handled;

    if (u.startsWith("https://generativelanguage.googleapis.com")) {
      const body = JSON.parse(init.body);
      return json(200, { embeddings: body.requests.map((r) => ({ values: embedText(r.content.parts[0].text) })) });
    }
    if (u.startsWith("https://api.tavily.com")) return json(200, { results: [] }); // tests override via `extra` when they need results
    if (u.startsWith("http://qdrant.test")) {
      const path = u.replace("http://qdrant.test", "");
      const m = /^\/collections\/([^/?]+)(.*)$/.exec(path);
      const [, name, rest] = m;
      if (init.method === "GET") return qdrantCollections[name] ? json(200, { result: { points_count: qdrantCollections[name].points.size, status: "green" } }) : json(404, {});
      if (init.method === "PUT" && rest === "") return qdrantCollections[name] = { points: new Map() }, json(200, { result: true });
      if (rest.startsWith("/index")) return json(200, { result: true });
      const body = init.body ? JSON.parse(init.body) : {};
      const col = qdrantCollections[name];
      if (!col) return json(404, {});
      if (rest.startsWith("/points/query")) {
        const must = body.filter?.must || [];
        const hits = [...col.points.values()]
          .filter((p) => must.every((c) => p.payload[c.key] === c.match.value))
          .map((p) => ({ id: p.id, score: cosine(body.query, p.vector), payload: p.payload }))
          .filter((h) => body.score_threshold === undefined || h.score >= body.score_threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, body.limit);
        return json(200, { result: { points: hits } });
      }
      if (rest.startsWith("/points/delete")) {
        const must = body.filter.must;
        for (const [id, p] of col.points) if (must.every((c) => p.payload[c.key] === c.match.value)) col.points.delete(id);
        return json(200, { result: true });
      }
      if (rest.startsWith("/points") && init.method === "PUT") {
        for (const p of body.points) col.points.set(p.id, p);
        return json(200, { result: true });
      }
    }
    throw new Error(`Unexpected fetch: ${init.method || "GET"} ${u}`);
  };
}

const realFetch = globalThis.fetch;
const env = {};
before(() => {
  for (const [k, v] of Object.entries({ QDRANT_URL: "http://qdrant.test", GEMINI_API_KEY: "g", RAG_MIN_SCORE: "0.15", RAG_SKIP_LIVE_SEARCH_SCORE: "0.2", RAG_SKIP_LIVE_MIN_PASSAGES: "1", IK_API_TOKEN: "ik", OPENROUTER_API_KEY: "or", TAVILY_API_KEY: "tvly" })) {
    env[k] = process.env[k];
    process.env[k] = v;
  }
});
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
});
beforeEach(() => {
  qdrantCollections = {};
  calls = [];
  for (const k of Object.keys(fake.db)) fake.db[k] = [];
  globalThis.fetch = stubFetch();
});

const NON_COMPETE_HTML = `
  <p id="p_1" title="Fact">The appellant resigned and joined a rival company in Pune.</p>
  <p id="p_2" title="Petitioner's Argument">The employer argues the covenant not to compete bound the employee for twelve months.</p>
  <p id="p_3" title="Court's Reasoning">Section 27 of the Contract Act renders an agreement in restraint of trade void; a post-employment non compete covenant is not enforceable.</p>
  <p id="p_4" title="Conclusion">The appeal is allowed and the injunction is set aside.</p>`;
const RENT_HTML = `<p id="p_1" title="Court's Reasoning">The landlord must return the tenant's security deposit after the tenancy ends and possession is handed back.</p>`;

test("ingesting a document stores text in Postgres and vectors in Qdrant, once", async () => {
  const { ingestIndianKanoonDoc } = await import("./ingest.js");
  const doc = { tid: 101, title: "Golikari v Century", docsource: "Supreme Court of India", html: NON_COMPETE_HTML };

  const first = await ingestIndianKanoonDoc(doc);
  assert.equal(first.skipped, false);
  assert.ok(first.chunks >= 3);

  const [row] = fake.db.corpus_documents;
  assert.equal(row.external_id, "ik:101");
  assert.equal(row.source, "supreme_court");
  assert.equal(fake.db.corpus_chunks.length, first.chunks);
  assert.ok(fake.db.corpus_chunks.every((c) => c.embedded_at), "every chunk is marked embedded");
  const points = [...qdrantCollections.vidhira_legal.points.values()];
  assert.equal(points.length, first.chunks);
  assert.ok(points.every((p) => p.vector.length === 768 && p.payload.text && p.payload.url === "https://indiankanoon.org/doc/101/"));
  assert.ok(points.some((p) => p.payload.para_class === "petitioner_arguments"));
  // Point ids are the Postgres chunk ids.
  assert.deepEqual(new Set(points.map((p) => p.id)), new Set(fake.db.corpus_chunks.map((c) => c.id)));

  const embedCallsBefore = calls.filter((c) => c.includes("generativelanguage")).length;
  const second = await ingestIndianKanoonDoc(doc);
  assert.equal(second.skipped, true);
  assert.equal(calls.filter((c) => c.includes("generativelanguage")).length, embedCallsBefore, "no re-embedding");
  assert.equal(fake.db.corpus_documents.length, 1);
});

test("retrievePassages returns the semantically closest passage and honours the threshold", async () => {
  const { ingestIndianKanoonDoc } = await import("./ingest.js");
  const { retrievePassages } = await import("./retrieve.js");
  await ingestIndianKanoonDoc({ tid: 101, title: "Golikari v Century", docsource: "Supreme Court of India", html: NON_COMPETE_HTML });
  await ingestIndianKanoonDoc({ tid: 202, title: "Tenant v Landlord", docsource: "Delhi High Court", html: RENT_HTML });

  const hits = await retrievePassages("is a non compete covenant after resignation enforceable", { limit: 3 });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].title, "Golikari v Century");
  assert.ok(hits[0].score >= hits.at(-1).score);

  const all = await retrievePassages("security deposit return by landlord", { limit: 5, threshold: null });
  assert.equal(all[0].title, "Tenant v Landlord");

  assert.deepEqual(await retrievePassages("zzzz qqqq", { threshold: 0.9 }), []);
  assert.deepEqual(await retrievePassages("   "), []);
});

test("answerLegalQuestion answers from retrieved passages and skips the paid live search once the KB is confident", async () => {
  const { answerLegalQuestion, __resetCacheForTests } = await import("../legalAssistant.js");
  const { __resetCacheForTests: resetIk } = await import("../indianKanoon.js");
  const { __resetCacheForTests: resetQu } = await import("../legalQueryUnderstanding.js");
  __resetCacheForTests(); resetIk(); resetQu();

  let orCalls = 0;
  let generationPrompt = "";
  const llm = (understanding) => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: understanding } }] }),
  });
  const UNDERSTANDING = JSON.stringify({ searchQuery: "non compete covenant after resignation enforceable section 27", topic: "employment", language: "english", isEmergency: false, emergencyReason: null });
  const ANSWER = JSON.stringify({ summary: "Per [1], a post-employment non compete is void.", immediateActions: [], stepByStep: [], yourRights: [], applicableLaws: [{ act: "Indian Contract Act", section: "27", plainMeaning: "Restraint of trade agreements are void.", sourceId: "1" }], caseLaw: [], whereToGetHelp: [], gaps: [], followUpQuestions: [], confidence: "medium" });

  globalThis.fetch = stubFetch((u, init) => {
    if (u.startsWith("https://openrouter.ai")) {
      orCalls++;
      if (orCalls % 2 === 1) return llm(UNDERSTANDING);
      generationPrompt = JSON.parse(init.body).messages.at(-1).content;
      return llm(ANSWER);
    }
    if (u.includes("indiankanoon.org/search/")) {
      return json(200, { found: 1, docs: [{ tid: 101, title: "Golikari v Century", headline: "non compete covenant after resignation", docsource: "Supreme Court of India", docsize: 10 }], categories: [] });
    }
    if (u.includes("indiankanoon.org/doc/")) return json(200, { doc: NON_COMPETE_HTML, title: "Golikari", citeList: [], citedbyList: [] });
    return null;
  });

  const first = await answerLegalQuestion("Can my employer stop me joining a competitor after I resign?");
  assert.equal(first.outcome, "answered");
  // Stage 6 (learning the live hit into Qdrant) now runs after the response is built, not
  // synchronously before it — so this first answer's own evidence is Indian Kanoon's
  // doc-level text, not a passage-level KB re-query. evidenceOrigin reflects that directly.
  assert.deepEqual(first.evidenceOrigin, { rag: 0, indianKanoon: 1, web: 0 });
  assert.equal(first.retrieval.mode, "live_search");
  assert.equal(first.retrieval.servedFromKnowledgeBase, false, "first question had to hit live search");
  assert.match(generationPrompt, /\[1\] Golikari v Century/);
  // First-call evidence is Indian Kanoon's doc-level text (Stage 3), not a Qdrant passage —
  // paragraph-class labels only appear once a question is served from the KB (see the second call below).
  assert.match(generationPrompt, /Section 27 of the Contract Act renders an agreement in restraint of trade void/);
  assert.ok(first.sources.some((s) => s.url === "https://indiankanoon.org/doc/101/"));
  assert.equal(first.sections.applicableLaws[0].sourceUrl, "https://indiankanoon.org/doc/101/");
  // Stage 6 (learnIntoRag) is fire-and-forget — give the background ingest a tick to
  // settle before relying on it being searchable for the next question.
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(qdrantCollections.vidhira_legal.points.size > 0, "the live hit was indexed");

  // Same topic, different wording → served from the knowledge base, no paid IK call.
  __resetCacheForTests();
  calls.length = 0;
  const second = await answerLegalQuestion("non compete covenant after resignation enforceable? employee joined rival");
  assert.equal(second.retrieval.servedFromKnowledgeBase, true);
  assert.equal(calls.some((c) => c.includes("indiankanoon.org")), false, "no Indian Kanoon call was made");
  assert.equal(calls.some((c) => c.includes("api.tavily.com")), false, "a confident knowledge-base hit must skip Tavily too");
  assert.deepEqual(second.evidenceOrigin, { rag: second.evidenceOrigin.rag, indianKanoon: 0, web: 0 });
  assert.ok(second.evidenceOrigin.rag > 0);
});

test("answerLegalQuestion() learns Tavily results into the knowledge base without blocking the response, and dedupes by URL", async () => {
  const { answerLegalQuestion, __resetCacheForTests } = await import("../legalAssistant.js");
  const { __resetCacheForTests: resetIk } = await import("../indianKanoon.js");
  const { __resetCacheForTests: resetQu } = await import("../legalQueryUnderstanding.js");
  __resetCacheForTests(); resetIk(); resetQu();

  const UNDERSTANDING = (q) => JSON.stringify({ searchQuery: q, topic: "tenancy", language: "english", isEmergency: false, emergencyReason: null });
  const ANSWER = JSON.stringify({ summary: "Per [1], approach the rent authority.", immediateActions: [], stepByStep: [], yourRights: [], applicableLaws: [], caseLaw: [], whereToGetHelp: [], gaps: [], followUpQuestions: [], confidence: "low" });
  const llm = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
  const WEB_URL = "https://nalsa.gov.in/rent-deposit-guide";
  const TAVILY_HIT = { title: "Rent disputes — step by step", url: WEB_URL, content: "A tenant can approach the rent authority to recover a wrongfully withheld deposit from the landlord.", score: 0.9 };

  // `extra` (stubFetch's first arg) must be a SYNCHRONOUS function returning either a
  // response shape or a falsy value to fall through to stubFetch's own Gemini/Qdrant
  // handling (see the other tests in this file) — an async function would always return
  // a truthy Promise and silently break that fallthrough.
  function mockFor(question, { gateLearnEmbed } = {}) {
    let orCalls = 0;
    let geminiCalls = 0;
    return (u, init) => {
      if (u.startsWith("https://openrouter.ai")) {
        orCalls++;
        return llm(orCalls % 2 === 1 ? UNDERSTANDING(question) : ANSWER);
      }
      if (u.startsWith("https://api.tavily.com")) return json(200, { results: [TAVILY_HIT] });
      if (u.includes("indiankanoon.org/search/")) return json(200, { found: 0, docs: [], categories: [] });
      if (gateLearnEmbed && u.startsWith("https://generativelanguage.googleapis.com")) {
        geminiCalls++;
        if (geminiCalls === 1) return null; // stage 2's retrieval embed — answer normally
        // Stage 6's learn embed (for the Tavily doc) — held open until the test releases it,
        // so we can prove answerLegalQuestion resolves without waiting on it.
        return gateLearnEmbed.then(() => json(200, { embeddings: JSON.parse(init.body).requests.map(() => ({ values: new Array(DIM).fill(0.01) })) }));
      }
      return null;
    };
  }

  let releaseLearnEmbed;
  const learnEmbedGate = new Promise((resolve) => { releaseLearnEmbed = resolve; });
  globalThis.fetch = stubFetch(mockFor("landlord deposit not returned, what can I do", { gateLearnEmbed: learnEmbedGate }));

  const resultPromise = answerLegalQuestion("landlord deposit not returned, what can I do");
  const result = await Promise.race([
    resultPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("answerLegalQuestion did not resolve — it may be waiting on the learn step")), 1000)),
  ]);
  assert.equal(result.outcome, "answered");
  assert.deepEqual(result.evidenceOrigin, { rag: 0, indianKanoon: 0, web: 1 });

  // The response above resolved while the learn step's embed call is still pending (gated) —
  // proof answerLegalQuestion does not await learnIntoRag. (The corpus_documents/corpus_chunks
  // rows are written BEFORE the embed call inside ingestWebDoc, so the meaningful "not finished
  // yet" signal is the embedding/vector step, not row existence.)
  assert.equal(fake.db.corpus_chunks.filter((c) => c.embedded_at).length, 0, "no chunk should be embedded yet — the learn step's embed call is still gated");

  releaseLearnEmbed();
  await new Promise((r) => setTimeout(r, 20)); // let the now-unblocked background job finish
  assert.equal(fake.db.corpus_documents.filter((d) => d.source === "web").length, 1, "the web result was learned into the corpus once unblocked");
  assert.ok(fake.db.corpus_chunks.some((c) => c.embedded_at), "the chunk is embedded once the gate is released");
  assert.equal(fake.db.corpus_documents.find((d) => d.source === "web").external_id, `web:${crypto.createHash("sha256").update(WEB_URL).digest("hex").slice(0, 32)}`);

  // A second, differently-worded question surfaces the SAME Tavily URL again — no gate
  // needed this time, just confirming dedupe once the background ingest settles.
  __resetCacheForTests();
  globalThis.fetch = stubFetch(mockFor("tenant security deposit refund kaise le"));
  const second = await answerLegalQuestion("tenant security deposit refund kaise le");
  assert.equal(second.evidenceOrigin.web, 1);
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(fake.db.corpus_documents.filter((d) => d.source === "web").length, 1, "the same URL must not be ingested twice (dedupe by external_id)");
});
