// Route-level tests for the admin (trust & safety) domain: the whole /admin/* surface is
// gated to admin+founder (router.use), verification decision is gated tighter to admin only,
// approving flips the advocate to verified AND the user's kyc_status (ported two-step
// behaviour), sending back does the reverse and lets the advocate resubmit (now in
// modules/advocates), and a case already decided 409s instead of silently re-deciding.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const ADMIN = { id: "auth-admin", email: "admin@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const FOUNDER = { id: "auth-founder", email: "founder@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-carol": CAROL, "tok-admin": ADMIN, "tok-founder": FOUNDER };

const ADVOCATE_ID = "22222222-2222-4222-8222-222222222222";
const CASE_ID = "33333333-3333-4333-8333-333333333333";

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  defaults: { verification_cases: { decision: "pending", decided_at: null, reviewer_id: null, created_at: "2026-01-01T00:00:00.000Z" } },
  unique: { users: [{ cols: ["auth_id"] }] },
  embeds: {
    "verification_cases.advocate": (row: any, db: any) => {
      const adv = db.advocates.find((a: any) => a.id === row.advocate_id);
      if (!adv) return null;
      const user = db.users.find((u: any) => u.id === adv.user_id);
      return {
        id: adv.id,
        bar_council: adv.bar_council,
        enrolment_number: adv.enrolment_number,
        enrolment_year: adv.enrolment_year,
        city: adv.city,
        years_of_practice: adv.years_of_practice,
        education: adv.education,
        verification_status: adv.verification_status,
        user: user ? { full_name: user.full_name, email: user.email } : null,
        advocate_practice_areas: [],
      };
    },
  },
  tables: {
    advocates: [{ id: ADVOCATE_ID, user_id: "u-carol", verification_status: "submitted", bar_council: "Bar Council of Maharashtra", enrolment_number: "MH/123/2020", enrolment_year: 2020, city: "Pune", years_of_practice: 5, education: [] }],
    verification_cases: [{ id: CASE_ID, advocate_id: ADVOCATE_ID, checks: [{ type: "bar_council_enrolment", status: "pending" }], decision: "pending", decided_at: null, reviewer_id: null, created_at: "2026-01-01T00:00:00.000Z" }],
    public_questions: [],
    public_answers: [],
    complaints: [],
    conflict_checks: [],
    service_orders: [],
    audit_logs: [],
  },
});
fake.db.users = [
  { id: "u-carol", auth_id: "auth-carol", email: "carol@example.com", full_name: "Adv. Carol", role: "advocate", kyc_status: "pending" },
  { id: "u-admin", auth_id: "auth-admin", email: "admin@example.com", full_name: "Admin", role: "admin" },
  { id: "u-founder", auth_id: "auth-founder", email: "founder@example.com", full_name: "Founder", role: "founder" },
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

test("the whole /admin/* surface is closed to a plain client", async () => {
  assert.equal((await call("GET", "/admin/stats", { token: "tok-alice" })).status, 403);
  assert.equal((await call("GET", "/admin/usage", { token: "tok-alice" })).status, 403);
  assert.equal((await call("GET", "/admin/verification-cases", { token: "tok-alice" })).status, 403);
});

test("founder can read admin dashboards (stats/usage/complaints) but cannot decide a verification case", async () => {
  const stats = await call("GET", "/admin/stats", { token: "tok-founder" });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.pendingVerification, 1);

  assert.equal((await call("GET", "/admin/usage", { token: "tok-founder" })).status, 200);
  assert.equal((await call("GET", "/admin/complaints", { token: "tok-founder" })).status, 200);

  const decide = await call("POST", `/admin/verification-cases/${CASE_ID}/decide`, { token: "tok-founder", body: { decision: "approved" } });
  assert.equal(decide.status, 403);
});

test("the pending case appears in the queue with the advocate's details joined", async () => {
  const res = await call("GET", "/admin/verification-cases", { token: "tok-admin" });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].advocate.bar_council, "Bar Council of Maharashtra");
});

test("sending a case back flips the advocate to documents_requested and the user's kyc to pending, and lets them resubmit", async () => {
  const decided = await call("POST", `/admin/verification-cases/${CASE_ID}/decide`, { token: "tok-admin", body: { decision: "sent_back", note: "Enrolment certificate is blurry." } });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.decision, "sent_back");
  assert.equal(decided.body.checks[0].note, "Enrolment certificate is blurry.");

  assert.equal(fake.db.advocates.find((a: any) => a.id === ADVOCATE_ID).verification_status, "documents_requested");
  assert.equal(fake.db.users.find((u: any) => u.id === "u-carol").kyc_status, "pending");

  const redecide = await call("POST", `/admin/verification-cases/${CASE_ID}/decide`, { token: "tok-admin", body: { decision: "approved" } });
  assert.equal(redecide.status, 409, "a case already decided must not be decided again");

  const notYet = await call("POST", "/advocate/resubmit", { token: "tok-carol" });
  // Carol's advocate status was just flipped to documents_requested by the decision above, so
  // this should actually succeed -- kept as a separate case below for the "nothing to resubmit" 409.
  assert.equal(notYet.status, 200);
  assert.equal(fake.db.advocates.find((a: any) => a.id === ADVOCATE_ID).verification_status, "submitted");
  assert.equal(fake.db.verification_cases.filter((c: any) => c.advocate_id === ADVOCATE_ID).length, 2, "resubmission opens a new case; the old one is kept");
});

test("resubmitting again before being sent back a second time 409s", async () => {
  const res = await call("POST", "/advocate/resubmit", { token: "tok-carol" });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Nothing to resubmit/);
});

test("approving the newest case verifies the advocate and the user's kyc_status", async () => {
  const cases = await call("GET", "/admin/verification-cases", { token: "tok-admin" });
  const newest = cases.body.find((c: any) => c.id !== CASE_ID);
  const decided = await call("POST", `/admin/verification-cases/${newest.id}/decide`, { token: "tok-admin", body: { decision: "approved" } });
  assert.equal(decided.status, 200);
  assert.equal(fake.db.advocates.find((a: any) => a.id === ADVOCATE_ID).verification_status, "verified");
  assert.equal(fake.db.users.find((u: any) => u.id === "u-carol").kyc_status, "verified");
  assert.equal(fake.db.audit_logs.filter((a: any) => a.action === "advocate_verification_decision").length, 2);
});
