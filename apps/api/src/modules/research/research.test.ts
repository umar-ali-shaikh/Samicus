// Route-level tests for the research-library domain: the dedupe-by-normalized-text
// "update in place" behaviour, IDOR protection (404 not 403, ids aren't probeable), the
// not_found path, and the supersede-chain delete on Refresh. The retrieval/scoring/generation
// pipeline itself (services/research.js) is mocked out entirely -- its own test suite
// (services/research.test.js) covers that; these tests only exercise what this module's
// router/service/repository do around it.
import { test, mock, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Bob" }, app_metadata: { provider: "email" } };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB };

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  defaults: {
    accounts: { seat_limit: 1 },
    research_queries: { rerun_count: 1, locale: "en", sources_enabled: [], threshold: 0.42, not_found_reason: null, live_fetch_ingest_failed: false, model_version: "test", prompt_version: "v1", latency_ms: null, pinned_at: null, tags: [], superseded_by: null, title: null, normalized_text: null, updated_at: "2026-01-01T00:00:00.000Z" },
    research_answers: { caveat_text: null, unsupported_span_count: 0, reviewed_by_advocate_id: null, helpful: null, summary: null, case_cards: {}, related_searches: [], related_case_ids: [], sections: null, authorities: null, position: null, jurisdiction: null, law_as_on: null, note_schema_version: null, updated_at: "2026-01-01T00:00:00.000Z" },
    research_chat_turns: {},
  },
  embeds: {
    "account_members.account": (row: any, db: any) => db.accounts.find((a: any) => a.id === row.account_id),
    "research_query_chunks.chunk": (row: any, db: any) => {
      const chunk = db.corpus_chunks.find((c: any) => c.id === row.chunk_id);
      const document = chunk ? db.corpus_documents.find((d: any) => d.id === chunk.document_id) : null;
      return chunk ? { ...chunk, document } : null;
    },
    "research_answer_segments.chunk": (row: any, db: any) => {
      const chunk = db.corpus_chunks.find((c: any) => c.id === row.chunk_id);
      const document = chunk ? db.corpus_documents.find((d: any) => d.id === chunk.document_id) : null;
      return chunk ? { ...chunk, document } : null;
    },
  },
  tables: { accounts: [], account_members: [], corpus_documents: [], corpus_chunks: [], research_queries: [], research_query_chunks: [], research_answers: [], research_answer_segments: [], research_chat_turns: [] },
});
mock.module("../../config/db.js", { namedExports: { getSupabase: () => fake.client } });
mockJwtVerification(AUTH_USERS);

// The RAG pipeline itself is mocked wholesale -- a controllable fake keeps these tests fast,
// deterministic and independent of Qdrant/OpenRouter/Indian Kanoon.
let retrieveResult: { fetchedNewSources: boolean; liveFetch: { attempted: boolean; docsFound: number; ingestErrors: number }; results: Array<{ score: number; chunk: Record<string, unknown> }> };
mock.module("../../services/research.js", {
  namedExports: {
    retrieve: async () => retrieveResult,
    detectLanguage: async () => "english",
    relevanceThreshold: () => 0.42,
    researchNoteV2Enabled: () => false,
    answerFromRetrieval: async (_text: string, retrieved: Array<{ score: number; chunk: Record<string, unknown> }>) => {
      const threshold = 0.42;
      const kept = retrieved.filter((r) => r.score >= threshold);
      if (kept.length === 0) return { outcome: "not_found", segments: [], discardedCount: retrieved.length, unsupportedSpanCount: 0, topScore: retrieved[0]?.score ?? null, reason: "corpus_gap" };
      return {
        outcome: "answered",
        segments: kept.map((r) => ({ text: r.chunk.text, chunkId: r.chunk.id, score: r.score, documentId: (r.chunk.document as any)?.id, documentTitle: (r.chunk.document as any)?.title, source: (r.chunk.document as any)?.source })),
        discardedCount: 0,
        unsupportedSpanCount: 0,
        topScore: kept[0]!.score,
        reason: null,
      };
    },
    generateResearchInsights: async () => ({ summary: "A grounded summary [1].", glosses: {}, caseCards: {}, relatedSearches: [] }),
    findRelatedCases: async () => [],
    generateStructuredNote: async () => null,
    answerFollowUp: async () => ({ text: null, citedIndexes: [] }),
    caseMismatchNote: () => null,
  },
});

let server: import("http").Server;
let base: string;
before(async () => {
  const { createApp } = await import("../../app.js");
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}/api`;
});
after(() => server.close());

async function call(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function seedChunk(id: string, documentId: string, text: string) {
  fake.db.corpus_chunks.push({ id, document_id: documentId, ordinal: 0, text, paragraph_class: "holding", para_number: null, section_label: null });
}
function seedDocument(id: string, title: string) {
  fake.db.corpus_documents.push({ id, title, source: "supreme_court", citation: title, court: "Supreme Court", canonical_url: `https://indiankanoon.org/doc/${id}/`, indexed_at: "2026-01-01T00:00:00Z" });
}

let account: any;
// Account/corpus fixtures are seeded once (below) and persist across tests; only the
// per-search tables are reset between tests to keep each test's assertions isolated.
beforeEach(() => {
  for (const k of ["research_queries", "research_query_chunks", "research_answers", "research_answer_segments", "research_chat_turns"]) fake.db[k] = [];
});

test("setup: provision alice+bob, seed one account and corpus document/chunk", async () => {
  await call("GET", "/me", { token: "tok-alice" });
  await call("GET", "/me", { token: "tok-bob" });
  account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  seedDocument("doc-1", "State v. Example");
  seedChunk("chunk-1", "doc-1", "The court held the respondent liable.");
});

test("POST /research/retrieve + /research/answer: a fresh question is answered and persisted", async () => {
  retrieveResult = { fetchedNewSources: false, liveFetch: { attempted: false, docsFound: 0, ingestErrors: 0 }, results: [{ score: 0.9, chunk: fake.db.corpus_chunks[0] }] };

  const retrieved = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "What did the court hold in this matter?", accountId: account.id } });
  assert.equal(retrieved.status, 200);
  assert.equal(fake.db.research_queries.length, 1);
  const retrievalId = retrieved.body.retrievalId;

  const answered = await call("POST", "/research/answer", { token: "tok-alice", body: { retrievalId } });
  assert.equal(answered.status, 200);
  assert.equal(answered.body.status, "done");
  assert.equal(answered.body.outcome, "answered");
  assert.equal(answered.body.segments.length, 1);
  assert.equal(answered.body.aiSummary, "A grounded summary [1].");

  const report = await call("GET", `/research/queries/${retrievalId}/report`, { token: "tok-alice" });
  assert.equal(report.status, 200);
  assert.deepEqual(report.body.segments, answered.body.segments);
});

test("re-running the exact same question (ignoring case/punctuation) updates the existing card in place, bumping rerun_count", async () => {
  retrieveResult = { fetchedNewSources: false, liveFetch: { attempted: false, docsFound: 0, ingestErrors: 0 }, results: [{ score: 0.9, chunk: fake.db.corpus_chunks[0] }] };

  const first = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "What did the court hold?", accountId: account.id } });
  await call("POST", "/research/answer", { token: "tok-alice", body: { retrievalId: first.body.retrievalId } });

  const second = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "what did the COURT hold???", accountId: account.id } });
  assert.equal(second.body.retrievalId, first.body.retrievalId, "same normalized text must update the same row, not create a new one");
  assert.equal(fake.db.research_queries.length, 1);
  assert.equal(fake.db.research_queries[0].rerun_count, 2);
});

test("a question with no matching evidence is reported as not_found with a reason", async () => {
  retrieveResult = { fetchedNewSources: false, liveFetch: { attempted: false, docsFound: 0, ingestErrors: 0 }, results: [] };

  const retrieved = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "an entirely unrelated question", accountId: account.id } });
  const answered = await call("POST", "/research/answer", { token: "tok-alice", body: { retrievalId: retrieved.body.retrievalId } });
  assert.equal(answered.body.outcome, "not_found");
  assert.equal(answered.body.segments.length, 0);
});

test("a query belonging to another account 404s instead of 403 -- ids are not probeable", async () => {
  retrieveResult = { fetchedNewSources: false, liveFetch: { attempted: false, docsFound: 0, ingestErrors: 0 }, results: [{ score: 0.9, chunk: fake.db.corpus_chunks[0] }] };
  const retrieved = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "a private question", accountId: account.id } });
  const id = retrieved.body.retrievalId;

  assert.equal((await call("GET", `/research/queries/${id}/report`, { token: "tok-bob" })).status, 404);
  assert.equal((await call("PATCH", `/research/queries/${id}`, { token: "tok-bob", body: { pinned: true } })).status, 404);
  assert.equal((await call("DELETE", `/research/queries/${id}`, { token: "tok-bob" })).status, 404);
});

test("Refresh supersedes the old query; deleting the new head also removes the superseded history (no FK violation)", async () => {
  retrieveResult = { fetchedNewSources: false, liveFetch: { attempted: false, docsFound: 0, ingestErrors: 0 }, results: [{ score: 0.9, chunk: fake.db.corpus_chunks[0] }] };
  const retrieved = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "a question worth refreshing", accountId: account.id } });
  await call("POST", "/research/answer", { token: "tok-alice", body: { retrievalId: retrieved.body.retrievalId } });

  const refreshed = await call("POST", `/research/queries/${retrieved.body.retrievalId}/refresh`, { token: "tok-alice" });
  assert.equal(refreshed.status, 200);
  const newId = refreshed.body.searchId;
  assert.notEqual(newId, retrieved.body.retrievalId);
  assert.equal(fake.db.research_queries.find((q: any) => q.id === retrieved.body.retrievalId).superseded_by, newId);

  const del = await call("DELETE", `/research/queries/${newId}`, { token: "tok-alice" });
  assert.equal(del.status, 200);
  assert.equal(fake.db.research_queries.length, 0, "both the head and the superseded row must be gone together");
});

test("GET /research/queries lists caseCount/topCourt for the account's own history only", async () => {
  retrieveResult = { fetchedNewSources: false, liveFetch: { attempted: false, docsFound: 0, ingestErrors: 0 }, results: [{ score: 0.9, chunk: fake.db.corpus_chunks[0] }] };
  const retrieved = await call("POST", "/research/retrieve", { token: "tok-alice", body: { text: "a listed question", accountId: account.id } });
  await call("POST", "/research/answer", { token: "tok-alice", body: { retrievalId: retrieved.body.retrievalId } });

  const list = await call("GET", "/research/queries", { token: "tok-alice" });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].caseCount, 1);
  assert.equal(list.body[0].topCourt, "Supreme Court");

  const bobList = await call("GET", "/research/queries", { token: "tok-bob" });
  assert.deepEqual(bobList.body, []);
});
