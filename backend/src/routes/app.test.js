// Route-level tests of authentication and authorization, run against the real Express app
// with an in-memory Supabase stand-in (see src/test/fakeSupabase.js).
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../test/fakeSupabase.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao", picture: "https://x/a.png" }, app_metadata: { provider: "google" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: null, user_metadata: {}, app_metadata: { provider: "email" } };
const DAN = { id: "auth-dan", email: "dan_the@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Dan" }, app_metadata: { provider: "email" } };
const OPS = { id: "auth-ops", email: "ops@vidhira.in", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { name: "Ops" }, app_metadata: { provider: "google" } };

const PA = "11111111-1111-4111-8111-111111111111";
const ADV = "22222222-2222-4222-8222-222222222222";

const fake = createFakeSupabase({
  defaults: { consultations: { state: "scheduled" }, verification_cases: { decision: "pending" } },
  authUsers: { "tok-alice": ALICE, "tok-bob": BOB, "tok-carol": CAROL, "tok-ops": OPS, "tok-dan": DAN },
  embeds: { "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id) },
  unique: {
    users: [{ cols: ["auth_id"] }],
    accounts: [{ cols: ["display_name"] }],
    consultations: [{ cols: ["advocate_id", "scheduled_start"], when: (r) => ["scheduled", "reminder_sent", "in_progress"].includes(r.state ?? "scheduled") }],
  },
  tables: {
    practice_areas: [{ id: PA, name: "Family" }],
    advocates: [
      { id: ADV, user_id: "u-adv", verification_status: "verified", scheduled_fee: 3000, instant_fee: 2500, weekly_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:00", slotMinutes: 60 }, advocate_consultation_modes: [{ mode: "video" }] },
    ],
  },
});
mock.module("../config/db.js", { namedExports: { getSupabase: () => fake.client } });

let server;
let base;
before(async () => {
  process.env.ADMIN_EMAILS = "ops@vidhira.in";
  const { createApp } = await import("../app.js");
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

test("API routes require a valid, email-verified session", async () => {
  assert.equal((await call("GET", "/accounts")).status, 401);
  const bad = await call("GET", "/accounts", { token: "nope" });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, "NOT_AUTHENTICATED");

  const unverified = await call("GET", "/accounts", { token: "tok-carol" });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.code, "EMAIL_NOT_VERIFIED");

  // /me tells an unverified user why they are blocked, so the UI can show the verify screen.
  const me = await call("GET", "/me", { token: "tok-carol" });
  assert.equal(me.status, 403);
  assert.equal(me.body.code, "EMAIL_NOT_VERIFIED");
  assert.equal(me.body.email, "carol@example.com");
  assert.equal(fake.db.users?.find((u) => u.email === "carol@example.com"), undefined, "no account is created before verification");
});

test("first verified login provisions the user + personal account exactly once", async () => {
  const first = await call("GET", "/me", { token: "tok-alice" });
  assert.equal(first.status, 200);
  assert.equal(first.body.user.full_name, "Alice Rao");
  assert.equal(first.body.user.role, "client");
  assert.equal(first.body.user.avatar_url, "https://x/a.png");
  assert.equal(first.body.provider, "google");
  assert.equal(first.body.accounts.length, 1);
  assert.equal(first.body.accounts[0].myRole, "owner");

  await call("GET", "/me", { token: "tok-alice" });
  assert.equal(fake.db.users.filter((u) => u.email === "alice@example.com").length, 1);
  assert.equal(fake.db.accounts.length, 1);
  assert.equal(fake.db.account_members.length, 1);
});

test("an allow-listed verified email becomes admin; nobody can self-assign a role", async () => {
  const ops = await call("GET", "/me", { token: "tok-ops" });
  assert.equal(ops.body.user.role, "admin");
  const patch = await call("PATCH", "/me", { token: "tok-alice", body: { role: "founder", fullName: "Alice R" } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.user.role, "client");
  assert.equal(patch.body.user.full_name, "Alice R");
  const forbidden = await call("GET", "/admin/stats", { token: "tok-alice" });
  assert.equal(forbidden.status, 403);
});

test("signing in with Google links to an existing email/password user instead of duplicating", async () => {
  fake.db.users.push({ id: "u-legacy", email: "legacy@example.com", full_name: "Legacy", auth_id: null, role: "client" });
  fake.db.account_members.push({ id: "m-legacy", account_id: "acc-legacy", user_id: "u-legacy", role: "owner", accepted_at: "2026-01-01" });
  fake.db.accounts.push({ id: "acc-legacy", display_name: "Legacy", type: "individual" });
  const originalGetUser = fake.client.auth.getUser;
  fake.client.auth.getUser = async (t) =>
    t === "tok-legacy"
      ? { data: { user: { id: "auth-legacy", email: "Legacy@Example.com", email_confirmed_at: "2026-01-01", user_metadata: {}, app_metadata: {} } }, error: null }
      : originalGetUser(t);
  const res = await call("GET", "/me", { token: "tok-legacy" });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, "u-legacy");
  assert.equal(fake.db.users.filter((u) => u.email?.toLowerCase() === "legacy@example.com").length, 1);
  assert.equal(fake.db.users.find((u) => u.id === "u-legacy").auth_id, "auth-legacy");
});

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

test("consultation booking: consent, real slots, and no double-booking", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const intake = (await call("POST", "/intake-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA, urgency: "week", mode: "video", language: "en", kind: "scheduled" } })).body;

  const slotsRes = await call("GET", `/advocates/${ADV}/slots`);
  assert.equal(slotsRes.status, 200);
  const slot = slotsRes.body.flatMap((d) => d.slots).find((s) => !s.full);
  assert.ok(slot, "advocate has bookable slots");

  const book = (extra = {}) => call("POST", "/consultations", { token: "tok-alice", body: { intakeId: intake.id, advocateId: ADV, mode: "video", scheduledStart: slot.startsAt, ...extra } });

  assert.equal((await book()).status, 409, "must consent before booking");
  assert.equal((await call("POST", `/intake-requests/${intake.id}/consent`, { token: "bob" })).status, 401);
  assert.equal((await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-bob" })).status, 404, "another user cannot consent for this request");
  assert.equal((await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-alice" })).status, 200);

  assert.equal((await book({ scheduledStart: "2026-10-06T10:17:00+05:30" })).status, 409, "off-grid time is rejected");
  assert.equal((await book({ mode: "phone" })).status, 400, "advocate does not offer phone");

  const ok = await book();
  assert.equal(ok.status, 201);
  assert.equal(ok.body.fee_total, 3000 + 99 + Math.round((3000 + 99) * 0.18));

  const again = await book();
  assert.equal(again.status, 409, "same slot cannot be booked twice");

  const after = (await call("GET", `/advocates/${ADV}/slots`)).body.flatMap((d) => d.slots).find((s) => s.startsAt === slot.startsAt);
  assert.equal(after.full, true, "the booked slot now shows as full");
});

test("matters and messages are invisible to people outside them", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  fake.db.matters = [{ id: "m-1", account_id: account.id, advocate_id: ADV, title: "T", reference: "R", stage: "intake", opened_at: "2026-01-01" }];
  fake.db.message_threads = [{ id: "t-1", matter_id: "m-1" }];
  const alice = fake.db.users.find((u) => u.email === "alice@example.com");
  fake.db.thread_participants = [{ thread_id: "t-1", participant_id: alice.id }];
  fake.db.messages = [{ id: "msg-1", thread_id: "t-1", sender_id: alice.id, body: "secret", sent_at: "2026-01-01T00:00:00Z" }];

  assert.equal((await call("GET", "/matters/m-1", { token: "tok-bob" })).status, 404);
  assert.equal((await call("GET", "/threads/t-1/messages", { token: "tok-bob" })).status, 404);
  assert.equal((await call("POST", "/threads/t-1/messages", { token: "tok-bob", body: { body: "hi" } })).status, 404);

  const read = await call("GET", "/threads/t-1/messages", { token: "tok-alice" });
  assert.equal(read.status, 200);
  assert.equal(read.body[0].body, "secret");
  const sent = await call("POST", "/threads/t-1/messages", { token: "tok-alice", body: { body: "  hello  " } });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.body, "hello");
  assert.equal((await call("POST", "/threads/t-1/messages", { token: "tok-alice", body: { body: "   " } })).status, 400);
});

test("documents: type allow-list and owner-only downloads", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const upload = async (token, name, type) => {
    const form = new FormData();
    form.set("accountId", account.id);
    form.set("kind", "Agreements");
    form.set("file", new Blob(["hello contract"], { type }), name);
    const res = await fetch(`${base}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, body: await res.json() };
  };

  assert.equal((await upload("tok-alice", "evil.exe", "application/x-msdownload")).status, 415);
  assert.equal((await upload("tok-bob", "a.pdf", "application/pdf")).status, 403, "not a member of the account");

  const ok = await upload("tok-alice", "lease.pdf", "application/pdf");
  assert.equal(ok.status, 201);
  assert.equal(ok.body.virus_scan_status, "pending", "never claims a scan that did not happen");
  assert.equal(ok.body.storage_key, undefined, "storage key is not exposed");

  assert.equal((await call("GET", `/documents/${ok.body.id}/download`, { token: "tok-bob" })).status, 404);
  const dl = await call("GET", `/documents/${ok.body.id}/download`, { token: "tok-alice" });
  assert.equal(dl.status, 200);
  assert.match(dl.body.url, /^https:\/\/signed\.example\//);
});

test("payments report as disabled instead of faking a capture", async () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  const cfg = await call("GET", "/config");
  assert.equal(cfg.body.payments.enabled, false);
  const res = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "consultation", id: "00000000-0000-0000-0000-000000000000" } });
  assert.equal(res.status, 503);
  assert.equal(res.body.code, "PAYMENTS_DISABLED");
});

test("unknown API paths return JSON 404 and server errors never leak internals", async () => {
  const res = await call("GET", "/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Not found");
});

test("concurrent first requests create exactly one user and one personal account", async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => call("GET", "/me", { token: "tok-dan" })));
  assert.ok(results.every((r) => r.status === 200), `all succeed, got ${results.map((r) => r.status)}`);
  assert.equal(fake.db.users.filter((u) => u.auth_id === "auth-dan").length, 1);
  const dan = fake.db.users.find((u) => u.auth_id === "auth-dan");
  assert.equal(fake.db.account_members.filter((m) => m.user_id === dan.id).length, 1);
});

test("an email is matched exactly, never as a LIKE pattern ('_' is not a wildcard)", async () => {
  fake.db.users.push({ id: "u-victim", email: "danxthe@example.com", full_name: "Victim", auth_id: null, role: "client" });
  await call("GET", "/me", { token: "tok-dan" }); // dan_the@example.com must NOT link to danxthe@example.com
  assert.equal(fake.db.users.find((u) => u.id === "u-victim").auth_id, null);
});

test("advocate onboarding: apply → hidden until verified → PATCH keeps untouched fields", async () => {
  const body = {
    barCouncil: "Bar Council of Maharashtra & Goa", enrolmentNumber: "MAH/1234/2015", practiceAreaIds: [PA], city: "Pune",
    languages: ["en", "hi"], consultationModes: ["video"], subSpecialisations: ["Bail"], keywords: ["criminal"],
    jurisdictions: [{ state: "Maharashtra", forum: "Sessions Court" }], scheduledFee: 3000,
  };
  assert.equal((await call("POST", "/advocate/apply", { token: "tok-bob", body: { ...body, practiceAreaIds: [] } })).status, 400);
  const applied = await call("POST", "/advocate/apply", { token: "tok-bob", body });
  assert.equal(applied.status, 201);
  assert.equal(applied.body.verification_status, "submitted");
  assert.equal((await call("POST", "/advocate/apply", { token: "tok-bob", body })).status, 409, "cannot apply twice");

  const bob = fake.db.users.find((u) => u.email === "bob@example.com");
  assert.equal(bob.role, "advocate");
  assert.equal(fake.db.verification_cases.length, 1);

  // Not listed, and cannot go live, until an admin verifies.
  assert.equal((await call("GET", "/advocates")).body.some((a) => a.id === applied.body.id), false);
  const live = await call("PATCH", "/advocate/availability", { token: "tok-bob", body: { availabilityState: "available" } });
  assert.equal(live.status, 403);

  // PATCH with a single field must not wipe the arrays it wasn't given (Zod 4 .partial() applies defaults).
  const patch = await call("PATCH", "/advocate/profile", { token: "tok-bob", body: { scheduledFee: 4000 } });
  assert.equal(patch.status, 200);
  const row = fake.db.advocates.find((a) => a.id === applied.body.id);
  assert.equal(row.scheduled_fee, 4000);
  assert.deepEqual(row.sub_specialisations, ["Bail"]);
  assert.deepEqual(row.keywords, ["criminal"]);
  assert.equal(fake.db.advocate_languages.filter((l) => l.advocate_id === row.id).length, 2);
  assert.equal(fake.db.advocate_jurisdictions.filter((j) => j.advocate_id === row.id).length, 1);

  // Admin approval flips the gate.
  const caseId = fake.db.verification_cases[0].id;
  assert.equal((await call("POST", `/admin/verification-cases/${caseId}/decide`, { token: "tok-alice", body: { decision: "approved" } })).status, 403);
  const decided = await call("POST", `/admin/verification-cases/${caseId}/decide`, { token: "tok-ops", body: { decision: "approved" } });
  assert.equal(decided.status, 200);
  assert.equal(fake.db.advocates.find((a) => a.id === row.id).verification_status, "verified");
  assert.equal((await call("POST", `/admin/verification-cases/${caseId}/decide`, { token: "tok-ops", body: { decision: "approved" } })).status, 409, "decided once");
  assert.equal((await call("PATCH", "/advocate/availability", { token: "tok-bob", body: { availabilityState: "available" } })).status, 200);
});
