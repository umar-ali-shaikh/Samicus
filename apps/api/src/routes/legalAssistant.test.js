// Route-level tests for the legal-assistant conversation-memory wiring (P0-1): loading
// the last few turns of a session, enforcing that a session belongs to the caller before
// its history is used, and the length cap on `question` (P2-11). The actual RAG pipeline
// (answerLegalQuestion) is mocked out entirely — these tests only exercise what the route
// itself does around it.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../test/fakeSupabase.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Bob" }, app_metadata: { provider: "email" } };

const fake = createFakeSupabase({
  authUsers: { "tok-alice": ALICE, "tok-bob": BOB },
  unique: { users: [{ cols: ["auth_id"] }], legal_assistant_sessions: [{ cols: ["session_id"] }] },
});
mock.module("../config/db.js", { namedExports: { getSupabase: () => fake.client } });

let capturedHistory;
let capturedQuestion;
mock.module("../services/legalAssistant.js", {
  namedExports: {
    answerLegalQuestion: async (question, _filters, _topN, history) => {
      capturedQuestion = question;
      capturedHistory = history;
      return {
        outcome: "answered",
        understanding: { searchQuery: question, topic: "general", language: "english", speakerRole: "unclear" },
        emergency: { flag: false, reason: null, emergencyType: null, message: null, custodyOfRelative: false },
        sections: { summary: "A short answer.", immediateActions: [], stepByStep: [], yourRights: [], applicableLaws: [], caseLaw: [], whereToGetHelp: [], gaps: [], followUpQuestions: [], confidence: "medium", groundedInEvidence: true },
        rawAnswer: null,
        sources: [],
        evidenceIndex: {},
        lawCurrencyWarning: false,
        evidenceOrigin: { rag: 0, indianKanoon: 0, web: 0 },
        disclaimer: "disclaimer text",
      };
    },
    OpenRouterAuthError: class OpenRouterAuthError extends Error {},
    OpenRouterApiError: class OpenRouterApiError extends Error {},
    IndianKanoonAuthError: class IndianKanoonAuthError extends Error {},
    IndianKanoonApiError: class IndianKanoonApiError extends Error {},
  },
});

let server;
let base;
before(async () => {
  const { createApp } = await import("../app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function ask(token, body) {
  const res = await fetch(`${base}/legal-assistant/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("a brand-new session passes no history", async () => {
  fake.db.legal_assistant_sessions = [];
  fake.db.legal_assistant_turns = [];
  const sessionId = "sess-alice-1";

  const res = await ask("tok-alice", { question: "mera malik 3 mahine se salary nahi de raha", sessionId });
  assert.equal(res.status, 200);
  assert.deepEqual(capturedHistory, []);
});

test("a follow-up in the same session gets the prior turn's question + answer summary", async () => {
  fake.db.legal_assistant_sessions = [];
  fake.db.legal_assistant_turns = [];
  const sessionId = "sess-alice-2";

  await ask("tok-alice", { question: "mera malik 3 mahine se salary nahi de raha", sessionId });
  // persistTurn is fire-and-forget — give its microtask a tick to land before the next ask.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fake.db.legal_assistant_turns.length, 1, "the first turn must have been persisted before the follow-up");

  await ask("tok-alice", { question: "What documents do I need?", sessionId });

  assert.equal(capturedQuestion, "What documents do I need?");
  assert.equal(capturedHistory.length, 1);
  assert.equal(capturedHistory[0].question, "mera malik 3 mahine se salary nahi de raha");
  assert.equal(capturedHistory[0].summary, "A short answer.");
});

test("a session that belongs to another user never leaks its history", async () => {
  fake.db.legal_assistant_sessions = [];
  fake.db.legal_assistant_turns = [];
  const sessionId = "sess-shared-attempt";

  // Alice starts (and therefore owns) this session.
  await ask("tok-alice", { question: "pati roz marta hai ghar se nikal diya", sessionId });
  await new Promise((r) => setTimeout(r, 10));

  // Bob reuses the same sessionId string — must get no history, not Alice's.
  await ask("tok-bob", { question: "what should I do next?", sessionId });
  assert.deepEqual(capturedHistory, []);
});

test("only the last 3 turns are loaded, most recent kept, oldest dropped first", async () => {
  fake.db.legal_assistant_sessions = [];
  fake.db.legal_assistant_turns = [];
  const sessionId = "sess-alice-cap";

  for (let i = 1; i <= 4; i++) {
    await ask("tok-alice", { question: `turn ${i}`, sessionId });
    await new Promise((r) => setTimeout(r, 10));
  }
  await ask("tok-alice", { question: "turn 5", sessionId });

  assert.equal(capturedHistory.length, 3);
  assert.deepEqual(capturedHistory.map((h) => h.question), ["turn 2", "turn 3", "turn 4"]);
});

test("POST /legal-assistant/ask rejects a question over 5000 characters with a friendly 400", async () => {
  const res = await ask("tok-alice", { question: "a".repeat(5001) });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /5,?000/);
});

test("POST /legal-assistant/ask accepts exactly 5000 characters", async () => {
  fake.db.legal_assistant_sessions = [];
  fake.db.legal_assistant_turns = [];
  const res = await ask("tok-alice", { question: "a".repeat(5000) });
  assert.equal(res.status, 200);
});
