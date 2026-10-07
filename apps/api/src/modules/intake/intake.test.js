// Dedicated tests for the intake/matching domain: account-ownership on creation (ported from
// app.test.js), matches computation (ranking + persisted match_results + advocate summaries),
// the urgent-request outcome branches, and IDOR on consent/cancel/matches/status for another
// user's intake.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB };

const PA = "11111111-1111-4111-8111-111111111111";
const ADV = "22222222-2222-4222-8222-222222222222";

function advocateRow(id, overrides = {}) {
  return {
    id,
    user_id: `u-${id}`,
    bar_council: "Bar Council of Delhi",
    enrolment_number: "DEL/0001/2010",
    verification_status: "verified",
    availability_state: "available",
    accepts_urgent: false,
    sub_specialisations: [],
    relevant_experience: [],
    instant_fee: 2500,
    scheduled_fee: 3000,
    years_of_practice: null,
    city: "Delhi",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    advocate_practice_areas: [{ practice_area_id: PA }],
    advocate_jurisdictions: [],
    advocate_languages: [{ language: "en" }],
    advocate_consultation_modes: [{ mode: "video" }],
    ...overrides,
  };
}

const fake = createFakeSupabase({
  defaults: {
    accounts: { seat_limit: 1 },
    intake_requests: {
      description: null, counterparty_name: null, voice_transcript_id: null, situation_id: null,
      routing_confidence: null, city: null, state: null, forum: null, consent_given_at: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  },
  authUsers: AUTH_USERS,
  embeds: {
    "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id),
    "intake_requests.practice_area": (row, db) => {
      const pa = db.practice_areas.find((p) => p.id === row.routed_practice_area_id);
      return pa ? { name: pa.name } : null;
    },
    "advocates.user": (row, db) => {
      const u = db.users.find((u) => u.id === row.user_id);
      return u ? { full_name: u.full_name, avatar_url: u.avatar_url ?? null } : null;
    },
  },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  tables: {
    practice_areas: [{ id: PA, name: "Family" }],
    advocates: [advocateRow(ADV)],
  },
  rpc: {
    // Mirrors replace_match_results() in schema.sql: delete then insert, in one call.
    replace_match_results: ({ p_intake_id, p_rows }, db) => {
      db.match_results = (db.match_results || []).filter((m) => m.intake_id !== p_intake_id);
      const inserted = p_rows.map((r, i) => ({ id: `mr-${p_intake_id}-${i}`, intake_id: p_intake_id, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", ...r }));
      db.match_results.push(...inserted);
      return inserted;
    },
  },
});
// The advocate's internal `users` row must pre-exist for the "advocates.user" embed above.
fake.db.users = [{ id: `u-${ADV}`, auth_id: "auth-adv-not-logged-in", email: "adv@example.com", full_name: "Advocate Dan", role: "advocate" }];
mock.module("../../config/db.js", { namedExports: { getSupabase: () => fake.client } });
mockJwtVerification(AUTH_USERS);

let server;
let base;
before(async () => {
  const { createApp } = await import("../../app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("intake requests can only be filed against an account the caller belongs to", async () => {
  await call("GET", "/me", { token: "tok-bob" });
  const aliceAccount = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const payload = { routedPracticeAreaId: PA, urgency: "week", mode: "video", language: "en", kind: "scheduled", city: "Pune" };

  const stolen = await call("POST", "/intake-requests", { token: "tok-bob", body: { ...payload, accountId: aliceAccount.id } });
  assert.equal(stolen.status, 403);

  const own = await call("POST", "/intake-requests", { token: "tok-alice", body: { ...payload, accountId: aliceAccount.id } });
  assert.equal(own.status, 201);
  assert.equal(own.body.status, "searching");

  const invalid = await call("POST", "/intake-requests", { token: "tok-alice", body: { urgency: "never" } });
  assert.equal(invalid.status, 400);
});

test("GET /intake-requests/:id/matches ranks verified advocates and persists match_results", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const intake = (await call("POST", "/intake-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA, urgency: "week", mode: "video", language: "en", kind: "scheduled" } })).body;

  const res = await call("GET", `/intake-requests/${intake.id}/matches`, { token: "tok-alice" });
  assert.equal(res.status, 200);
  assert.equal(res.body.weightsVersion, "2026.1");
  assert.equal(res.body.matches.length, 1);
  assert.equal(res.body.matches[0].advocate_id, ADV);
  assert.equal(res.body.matches[0].advocate.bar_council, "Bar Council of Delhi");
  assert.equal(fake.db.match_results.filter((m) => m.intake_id === intake.id).length, 1);

  // Another user cannot compute/see matches for someone else's intake.
  const notMine = await call("GET", `/intake-requests/${intake.id}/matches`, { token: "tok-bob" });
  assert.equal(notMine.status, 404);
});

test("POST /urgent-requests: advocate_reviewing when an available advocate accepts urgent work, none_available otherwise", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const busy = await call("POST", "/urgent-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA } });
  assert.equal(busy.status, 200);
  assert.equal(busy.body.status, "none_available", "the only advocate fixture does not accept urgent work yet");
  assert.equal(busy.body.intake.status, "none_available");
  assert.equal(busy.body.helpline, "NALSA free legal aid helpline · 15100");

  fake.db.advocates.find((a) => a.id === ADV).accepts_urgent = true;
  const ok = await call("POST", "/urgent-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "advocate_reviewing");
  assert.equal(ok.body.candidate.advocate_id, ADV);
  assert.equal(fake.db.conflict_checks.some((c) => c.intake_id === ok.body.intake.id && c.advocate_id === ADV), true);
});

test("consent and cancel are owner-only (404 for another user), and cancel enforces the open-status rule", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const intake = (await call("POST", "/intake-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA, urgency: "week", mode: "video", language: "en", kind: "scheduled" } })).body;

  assert.equal((await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-bob" })).status, 404, "another user cannot consent for this request");
  const consented = await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-alice" });
  assert.equal(consented.status, 200);
  assert.ok(consented.body.consent_given_at);

  assert.equal((await call("POST", `/intake-requests/${intake.id}/cancel`, { token: "tok-bob" })).status, 404);
  const cancelled = await call("POST", `/intake-requests/${intake.id}/cancel`, { token: "tok-alice" });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, "declined");

  const again = await call("POST", `/intake-requests/${intake.id}/cancel`, { token: "tok-alice" });
  assert.equal(again.status, 409, "an already-declined request can no longer be cancelled");
});

test("GET /intake-requests lists only the caller's own account's intakes", async () => {
  const aliceList = await call("GET", "/intake-requests", { token: "tok-alice" });
  assert.equal(aliceList.status, 200);
  assert.ok(aliceList.body.length > 0);
  assert.ok(aliceList.body.every((i) => i.practice_area?.name === "Family" || i.practice_area === null));

  const bobList = await call("GET", "/intake-requests", { token: "tok-bob" });
  assert.equal(bobList.status, 200);
  assert.deepEqual(bobList.body, [], "bob has never filed an intake on his own account");
});
