// Route-level tests for the admin (trust & safety) domain: the whole /admin/* surface is
// gated to admin+founder (router.use), verification decision is gated tighter to admin only,
// approving flips the advocate to verified AND the user's kyc_status (ported two-step
// behaviour), sending back does the reverse and lets the advocate resubmit (now in
// modules/advocates), and a case already decided 409s instead of silently re-deciding. Also the
// break-glass matter access (admin_access_grants): reason required, every attempt logged,
// admin-only to open, admin+founder to read the log, and both parties get a timeline notice.
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
const MATTER_ID = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  defaults: {
    verification_cases: { decision: "pending", decided_at: null, reviewer_id: null, created_at: "2026-01-01T00:00:00.000Z" },
    timeline_events: { occurred_at: "2026-02-01T00:00:00.000Z" },
  },
  unique: { users: [{ cols: ["auth_id"] }] },
  embeds: {
    "matters.advocate": (row: any, db: any) => {
      const a = db.advocates.find((x: any) => x.id === row.advocate_id);
      if (!a) return null;
      const u = db.users.find((x: any) => x.id === a.user_id);
      return { id: a.id, city: a.city ?? null, user: u ? { full_name: u.full_name, avatar_url: null } : null };
    },
    "matters.practice_area": () => null,
    "matters.account": (row: any, db: any) => {
      const a = db.accounts.find((x: any) => x.id === row.account_id);
      return a ? { display_name: a.display_name, type: a.type } : null;
    },
    "admin_access_grants.actor": (row: any, db: any) => {
      const u = db.users.find((x: any) => x.id === row.actor_id);
      return u ? { full_name: u.full_name, email: u.email } : null;
    },
    "admin_access_grants.matter": (row: any, db: any) => {
      const m = db.matters.find((x: any) => x.id === row.matter_id);
      return m ? { id: m.id, reference: m.reference, title: m.title } : null;
    },
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
    accounts: [{ id: ACCOUNT_ID, display_name: "Mehta Family", type: "individual" }],
    matters: [
      {
        id: MATTER_ID, reference: "VID-2026-0001", account_id: ACCOUNT_ID, advocate_id: ADVOCATE_ID, title: "Deposit dispute",
        practice_area_id: null, forum: null, stage: "action_in_progress", next_action: null, opened_at: "2026-01-05T00:00:00.000Z",
        engaged_at: null, closed_at: null, archive_retention_until: null, created_at: "2026-01-05T00:00:00.000Z", updated_at: "2026-01-05T00:00:00.000Z",
      },
    ],
    timeline_events: [],
    tasks: [],
    hearings: [],
    documents: [{ id: "doc-1", matter_id: MATTER_ID, filename: "lease.pdf", mime: "application/pdf", size_bytes: 10, kind: "Agreements", shared_with: [], created_at: "2026-01-06T00:00:00.000Z", uploaded_by: "u-x", storage_key: "secret/key" }],
    admin_access_grants: [],
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

const REASON = "Complaint E2E-77: client says the advocate missed a hearing; checking the timeline.";

test("matter access: only an admin can open a matter; a founder can't, and a client can't see the log", async () => {
  assert.equal((await call("POST", "/admin/matter-access", { token: "tok-founder", body: { reference: "VID-2026-0001", reason: REASON } })).status, 403);
  assert.equal((await call("GET", "/admin/matter-access", { token: "tok-alice" })).status, 403);
  assert.equal(fake.db.admin_access_grants.length, 0);
});

test("matter access: an unknown reference 404s without recording anything", async () => {
  const res = await call("POST", "/admin/matter-access", { token: "tok-admin", body: { reference: "VID-NOPE", reason: REASON } });
  assert.equal(res.status, 404);
  assert.equal(fake.db.admin_access_grants.length, 0);
});

test("matter access: a too-short reason is refused but still logged as denied, and reveals nothing", async () => {
  const res = await call("POST", "/admin/matter-access", { token: "tok-admin", body: { reference: "VID-2026-0001", reason: "just looking" } });
  assert.equal(res.status, 400);
  assert.equal(res.body.matter, undefined);
  const grant = fake.db.admin_access_grants.at(-1);
  assert.equal(grant.outcome, "denied");
  assert.equal(grant.actor_id, "u-admin");
  assert.ok(fake.db.audit_logs.some((l: any) => l.action === "admin_matter_access" && l.outcome === "denied"));
  assert.equal(fake.db.timeline_events.length, 0, "a denied attempt leaves no notice -- nothing was viewed");
});

test("matter access: with a real reason the admin gets a read-only view, and both parties see a notice without the reason", async () => {
  const res = await call("POST", "/admin/matter-access", { token: "tok-admin", body: { reference: "VID-2026-0001", reason: REASON } });
  assert.equal(res.status, 200);
  assert.equal(res.body.matter.id, MATTER_ID);
  assert.equal(res.body.grant.reason, REASON);
  assert.deepEqual(res.body.documents, [{ id: "doc-1", filename: "lease.pdf", kind: "Agreements", created_at: "2026-01-06T00:00:00.000Z" }], "metadata only -- no storage key");
  assert.equal(res.body.feeProposals, undefined);
  assert.equal(res.body.invoices, undefined);

  assert.equal(fake.db.admin_access_grants.at(-1).outcome, "recorded");
  const notice = fake.db.timeline_events.at(-1);
  assert.equal(notice.actor_type, "platform");
  assert.equal(notice.type, "admin_access");
  assert.ok(!String(notice.body).includes("E2E-77"), "the admin's reason stays in the access log, not on the parties' timeline");
});

test("matter access log: readable by admin and founder, with both outcomes", async () => {
  for (const token of ["tok-admin", "tok-founder"]) {
    const res = await call("GET", "/admin/matter-access", { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.deepEqual(res.body.map((g: any) => g.outcome).sort(), ["denied", "recorded"]);
    assert.equal(res.body[0].matter.reference, "VID-2026-0001");
    assert.equal(res.body[0].actor.full_name, "Admin");
  }
});
