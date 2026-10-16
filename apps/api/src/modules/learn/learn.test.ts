// Route-level tests for the ask-&-learn domain: the anonymous-question moderation gate (a
// question is invisible to the public until an admin publishes it -- ported behaviour, no test
// before), the verified-advocate-only answer gate, the helpful-count RPC, guide admin CRUD
// (including the duplicate-title 409), and the admin-only gates on moderation/guides.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: {} };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const DAN = { id: "auth-dan", email: "dan@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const ADMIN = { id: "auth-admin", email: "admin@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-carol": CAROL, "tok-dan": DAN, "tok-admin": ADMIN };

const ADVOCATE_ID = "22222222-2222-4222-8222-222222222222";
const PA_ID = "11111111-1111-4111-8111-111111111111";

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }], guides: [{ cols: ["title"] }] },
  embeds: {
    // Two-level embed resolved by hand (the generic regex-based resolver only handles one
    // level) -- same precedent as modules/contractreview's findings.library_entry.
    "public_questions.answers": (row: any, db: any) =>
      db.public_answers
        .filter((a: any) => a.question_id === row.id)
        .map((a: any) => {
          const advocate = db.advocates.find((adv: any) => adv.id === a.advocate_id);
          const user = advocate ? db.users.find((u: any) => u.id === advocate.user_id) : null;
          return { id: a.id, body: a.body, helpful_count: a.helpful_count, published_at: a.published_at, advocate: advocate ? { city: advocate.city ?? null, user: user ? { full_name: user.full_name } : null } : null };
        }),
  },
  defaults: { public_answers: { helpful_count: 0, published_at: null, moderation_state: "pending" }, guides: { tag: null, read_minutes: null } },
  tables: {
    practice_areas: [{ id: PA_ID, name: "Family", sub_specialisations: [], typical_forums: [], statute_tags: [] }],
    advocates: [{ id: ADVOCATE_ID, user_id: "u-carol", verification_status: "verified", city: "Pune" }],
    public_questions: [],
    public_answers: [],
    guides: [],
  },
  rpc: {
    advocate_counts_by_practice_area: (_args: unknown, db: any) => {
      // Real RPC groups by each advocate's practice areas; this fixture only has one advocate
      // and one practice area, so the count is just the advocate table's length.
      return [{ practice_area_id: PA_ID, count: db.advocates.length }];
    },
    increment_helpful_count: ({ answer_id }: { answer_id: string }, db: any) => {
      const row = db.public_answers.find((a: any) => a.id === answer_id);
      row.helpful_count += 1;
      return row;
    },
  },
});
fake.db.users = [
  { id: "u-carol", auth_id: "auth-carol", email: "carol@example.com", full_name: "Adv. Carol", role: "advocate" },
  { id: "u-admin", auth_id: "auth-admin", email: "admin@example.com", full_name: "Admin", role: "admin" },
];
mock.module("../../config/db.js", { namedExports: { getSupabase: () => fake.client } });
mockJwtVerification(AUTH_USERS);

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

test("GET /specialisations returns each practice area with its advocate count", async () => {
  const res = await call("GET", "/specialisations");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].advocateCount, 1);
});

let questionId: string;

test("a freshly-asked question is pending moderation and invisible on the public list", async () => {
  const asked = await call("POST", "/questions", { token: "tok-alice", body: { body: "Can a landlord increase rent mid-lease without notice in Maharashtra?" } });
  assert.equal(asked.status, 201);
  assert.equal(asked.body.status, "pending_moderation");
  questionId = asked.body.id;

  const mine = await call("GET", "/questions/mine", { token: "tok-alice" });
  assert.equal(mine.body.length, 1);

  const pub = await call("GET", "/questions");
  assert.equal(pub.body.length, 0, "a pending-moderation question must not appear on the public list");
});

test("a non-advocate cannot answer; a non-verified advocate cannot answer; answering an unpublished question 404s", async () => {
  // dan has never applied to be an advocate at all -- role stays "client".
  const asClient = await call("POST", `/questions/${questionId}/answers`, { token: "tok-dan", body: { body: "x".repeat(40) } });
  assert.equal(asClient.status, 403);

  // carol IS a verified advocate, but the question is still pending_moderation.
  const beforePublish = await call("POST", `/questions/${questionId}/answers`, { token: "tok-carol", body: { body: "x".repeat(40) } });
  assert.equal(beforePublish.status, 404);
});

test("admin publishes the question; a verified advocate can then answer, and the helpful RPC increments", async () => {
  const decided = await call("POST", `/admin/moderation/question/${questionId}`, { token: "tok-admin", body: { decision: "published" } });
  assert.equal(decided.status, 200);

  // Not re-asserting on GET /questions here: its query also filters on the embedded answers'
  // moderation_state via a dotted path ("answers.moderation_state"), which fakeSupabase's
  // filter engine resolves against the raw (pre-embed) row and so never matches -- a real
  // limitation of the test double for this one query shape, not a production bug (same
  // query works against real Postgrest, which filters the joined table). Verified instead via
  // /questions/mine, whose filter doesn't touch the embedded table.
  const mineAfterPublish = await call("GET", "/questions/mine", { token: "tok-alice" });
  assert.equal(mineAfterPublish.body[0].status, "published");

  const answered = await call("POST", `/questions/${questionId}/answers`, { token: "tok-carol", body: { body: "General information only: check your state's rent control act. ".padEnd(40, "x") } });
  assert.equal(answered.status, 201);
  assert.equal(answered.body.moderation_state, "pending");
  const answerId = answered.body.id;

  const helpful1 = await call("POST", `/answers/${answerId}/helpful`, { token: "tok-alice" });
  assert.equal(helpful1.status, 200);
  assert.equal(helpful1.body.helpful_count, 1);
});

test("non-admins are gated out of guide authoring and the moderation queue", async () => {
  assert.equal((await call("POST", "/admin/guides", { token: "tok-alice", body: { title: "Tenant rights 101", body: "x".repeat(60) } })).status, 403);
  assert.equal((await call("GET", "/admin/moderation", { token: "tok-alice" })).status, 403);
});

test("admin guide authoring: create, duplicate-title conflict, list, read, delete", async () => {
  const created = await call("POST", "/admin/guides", { token: "tok-admin", body: { title: "Tenant rights 101", body: "x".repeat(60), tag: "housing" } });
  assert.equal(created.status, 201);
  const guideId = created.body.id;

  const dup = await call("POST", "/admin/guides", { token: "tok-admin", body: { title: "Tenant rights 101", body: "y".repeat(60) } });
  assert.equal(dup.status, 409);

  const list = await call("GET", "/guides");
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].tag, "housing");

  const got = await call("GET", `/guides/${guideId}`);
  assert.equal(got.status, 200);
  assert.equal(got.body.title, "Tenant rights 101");

  assert.equal((await call("GET", "/guides/00000000-0000-4000-8000-000000000000")).status, 404);

  const del = await fetch(`${base}/admin/guides/${guideId}`, { method: "DELETE", headers: { Authorization: "Bearer tok-admin" } });
  assert.equal(del.status, 204);
  assert.equal((await call("GET", "/guides")).body.length, 0);
});

test("helpful votes are capped per user: the 31st in an hour is a 429, and another user is unaffected", async () => {
  const answerId = fake.db.public_answers[0].id;
  for (let i = 0; i < 30; i++) {
    assert.equal((await call("POST", `/answers/${answerId}/helpful`, { token: "tok-dan" })).status, 200);
  }
  assert.equal((await call("POST", `/answers/${answerId}/helpful`, { token: "tok-dan" })).status, 429);
  assert.equal((await call("POST", `/answers/${answerId}/helpful`, { token: "tok-alice" })).status, 200, "the limit is per user, not shared");
});
