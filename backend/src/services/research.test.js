import { test, mock, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createFakeSupabase } from "../test/fakeSupabase.js";

// ---- same fake-Supabase/Qdrant/OpenRouter-embeddings harness as rag/rag.test.js ----
const fake = createFakeSupabase({ unique: { corpus_documents: [{ cols: ["external_id"] }] } });
mock.module("../config/db.js", { namedExports: { getSupabase: () => fake.client } });

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
const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

function stubFetch(extra = () => null) {
  return async (url, init = {}) => {
    const u = String(url);
    const handled = extra(u, init);
    if (handled) return handled;

    if (u.startsWith("https://openrouter.ai/api/v1/embeddings")) {
      const body = JSON.parse(init.body);
      return json(200, { data: body.input.map((text) => ({ embedding: embedText(text) })) });
    }
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
  for (const [k, v] of Object.entries({ QDRANT_URL: "http://qdrant.test", RAG_MIN_SCORE: "0.3", OPENROUTER_API_KEY: "or" })) {
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
  for (const k of Object.keys(fake.db)) fake.db[k] = [];
  globalThis.fetch = stubFetch();
});

test("retrieve() prefers a document's citable passage over its own higher-scoring party argument", async () => {
  const { ingestIndianKanoonDoc } = await import("./rag/ingest.js");
  const { retrieve } = await import("./research.js");

  const html = `
    <p id="p_1" title="Petitioner's Argument">non compete covenant resignation enforceable employee rival company</p>
    <p id="p_2" title="Court's Reasoning">employee rival company covenant void section restraint</p>`;
  await ingestIndianKanoonDoc({ tid: 1, title: "Golikari v Century", docsource: "Supreme Court of India", html });

  const { results } = await retrieve("non compete covenant resignation enforceable employee rival company");
  const own = results.filter((r) => r.chunk.document.title === "Golikari v Century");
  assert.equal(own.length, 1, "diversification keeps exactly one passage for this document");
  assert.equal(own[0].chunk.paragraph_class, "reasoning", "the citable passage must win the document's one slot, not the higher-scoring argument");
});

test("retrieve() boosts a Supreme Court passage above a higher-scoring High Court one when the question names the Supreme Court", async () => {
  const { ingestIndianKanoonDoc } = await import("./rag/ingest.js");
  const { retrieve } = await import("./research.js");

  // Crafted so the High Court chunk starts out scoring higher (more exact word overlap with
  // the query) than the Supreme Court chunk — the court boost must still be enough to flip
  // the order once the question names "Supreme Court".
  await ingestIndianKanoonDoc({
    tid: 10,
    title: "Wife v Husband (HC)",
    docsource: "Calcutta High Court",
    html: `<p id="p_1" title="Court's Reasoning">wife maintenance rights divorce section 125 petition allowed fully</p>`,
  });
  await ingestIndianKanoonDoc({
    tid: 11,
    title: "Wife v Husband (SC)",
    docsource: "Supreme Court of India",
    html: `<p id="p_1" title="Court's Reasoning">wife maintenance rights divorce</p>`,
  });

  const { results } = await retrieve("Supreme Court cases on maintenance rights of wife after divorce");
  const scResult = results.find((r) => r.chunk.document.title === "Wife v Husband (SC)");
  const hcResult = results.find((r) => r.chunk.document.title === "Wife v Husband (HC)");
  assert.ok(scResult && hcResult, "both documents are retrieved");
  assert.equal(scResult.chunk.document.source, "supreme_court");
  assert.ok(scResult.score > hcResult.score, "the Supreme Court passage must outrank the High Court one once boosted");
});

test("retrieve() fetches and indexes a live source when the library has nothing for the question, and returns it in the same call", async () => {
  const { retrieve } = await import("./research.js");
  process.env.IK_API_TOKEN = "ik-test";

  globalThis.fetch = stubFetch((u) => {
    if (u.includes("indiankanoon.org/search/")) {
      return json(200, { found: 1, docs: [{ tid: 999, title: "Freshly Found Case", headline: "maintenance under section 125", docsource: "Supreme Court of India", docsize: 10 }], categories: [] });
    }
    if (u.includes("indiankanoon.org/doc/")) {
      return json(200, { doc: `<p id="p_1" title="Court's Reasoning">maintenance under section 125 is payable to the wife</p>`, title: "Freshly Found Case", citeList: [], citedbyList: [] });
    }
    return null;
  });

  const { fetchedNewSources, results } = await retrieve("maintenance under section 125");
  assert.equal(fetchedNewSources, true, "the empty library must trigger a live fetch");
  assert.ok(results.some((r) => r.chunk.document.title === "Freshly Found Case"), "the newly-fetched source must be searchable in the same call, not just a later one");

  delete process.env.IK_API_TOKEN;
});
