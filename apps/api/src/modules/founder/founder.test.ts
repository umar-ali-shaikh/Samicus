// Route-level tests for the founder (Command Centre) domain: the role gate (founder only,
// even admins are rejected), the unknown-tab 404, and representative arithmetic from each of
// the 9 analytics tabs -- ported from services/analytics/index.js, which had no test file at
// all. Two tabs (fservices, fai) read columns via Postgres JSON-path operators
// (`result->>outcome`, `result->emergency`) that fakeSupabase's minimal select/filter engine
// cannot resolve (it only resolves plain columns and `embeds`-hinted relations, not JSON
// paths) -- those specific sub-counts are called out explicitly below rather than silently
// asserted as if verified; the real query is correct against Postgrest, this is a test-double
// gap, not a production bug (same category as the "dotted path" gap documented in
// modules/learn/learn.test.ts).
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ADMIN = { id: "auth-admin", email: "admin@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const FOUNDER = { id: "auth-founder", email: "founder@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-admin": ADMIN, "tok-founder": FOUNDER };

const BIZ_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const ADVOCATE_ID = "22222222-2222-4222-8222-222222222222";
const MATTER_ID = "33333333-3333-4333-8333-333333333333";

// Only knowledgeBaseStats is overridden; the rest are stubbed (never called by this test)
// purely so app.js's OTHER routers, which import the real @vidhira/rag/retrieve for their own
// unrelated needs (research's service.ts), don't fail to resolve a missing export when
// createApp() wires up every router in the same process.
mock.module("@vidhira/rag/retrieve", {
  namedExports: {
    knowledgeBaseStats: async () => ({ enabled: false }),
    minScore: () => 0.42,
    retrievePassages: async () => {
      throw new Error("not stubbed for this test");
    },
    lexicalSearch: async () => {
      throw new Error("not stubbed for this test");
    },
  },
});

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  defaults: { invoices: { status: "due" } },
  embeds: {
    "intake_requests.account": (row: any, db: any) => {
      const a = db.accounts.find((x: any) => x.id === row.account_id);
      return a ? { type: a.type } : null;
    },
    "advocates.user": (row: any, db: any) => {
      const u = db.users.find((x: any) => x.id === row.user_id);
      return u ? { full_name: u.full_name } : null;
    },
  },
  tables: {
    advocates: [{ id: ADVOCATE_ID, user_id: "u-carol", availability_state: "available", verification_status: "verified" }],
    accounts: [{ id: BIZ_ACCOUNT_ID, display_name: "Acme Pvt Ltd", type: "business", seat_limit: 5, gstin: "27AAAAA0000A1Z5", created_at: "2026-01-01T00:00:00Z", plan_id: null }],
    account_members: [{ id: "mem-1", account_id: BIZ_ACCOUNT_ID, user_id: "u-carol", role: "owner", accepted_at: "2026-01-01T00:00:00Z" }],
    matters: [{ id: MATTER_ID, account_id: BIZ_ACCOUNT_ID, advocate_id: ADVOCATE_ID, stage: "action_in_progress", updated_at: "2026-01-05T00:00:00Z" }],
    invoices: [
      { id: "inv-1", matter_id: MATTER_ID, total: 10000, status: "paid" },
      { id: "inv-2", matter_id: MATTER_ID, total: 4000, status: "due" },
    ],
    intake_requests: [],
    legal_assistant_turns: [],
    research_queries: [],
    users: [],
    document_drafts: [],
    contract_reviews: [],
    pack_scans: [],
    payment_orders: [],
    consultations: [],
    invoice_line_items: [],
    service_orders: [],
    services: [],
    match_results: [],
    conflict_checks: [],
    audit_logs: [],
    plans: [],
    complaints: [],
    public_questions: [],
    public_answers: [],
  },
});
fake.db.users = [
  { id: "u-carol", auth_id: "auth-carol", email: "carol@example.com", full_name: "Adv. Carol", role: "advocate", last_login_at: "2026-01-10T00:00:00Z" },
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

async function call(path: string, token?: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("only a founder can read Command Centre analytics; an admin is rejected; an unknown tab 404s", async () => {
  assert.equal((await call("/admin/analytics/founder", "tok-admin")).status, 403);
  assert.equal((await call("/admin/analytics/founder", "tok-founder")).status, 200);
  assert.equal((await call("/admin/analytics/not-a-real-tab", "tok-founder")).status, 404);
});

test("founder (overview): Demand + Users-and-supply + Product-usage + Money groups compute from live data", async () => {
  const res = await call("/admin/analytics/founder", "tok-founder");
  assert.equal(res.status, 200);
  assert.equal(res.body.tab, "founder");
  const p = res.body.payload;
  const metric = (label: string) => p.groups.flatMap((g: any) => g.metrics).find((m: any) => m.label === label);
  assert.equal(metric("Registered users").value, 3);
  assert.equal(metric("Business accounts").value, 1);
  assert.equal(metric("Verified advocates").value, 1);
  assert.equal(metric("Open matters").value, 1);
  // Money: one paid invoice is not GMV (invoices aren't payment_orders) -- gross transaction
  // value is 0 since no payment_orders are seeded; the "due" invoice shows as awaiting payment.
  assert.equal(metric("Invoices awaiting payment").value, 4000);
});

test("fdemand: 30 daily buckets, requests bucketed by city and account type", async () => {
  fake.db.intake_requests.push(
    { id: "ir-1", account_id: BIZ_ACCOUNT_ID, city: "Mumbai", kind: "normal", created_by: "u-carol", created_at: new Date().toISOString() },
    { id: "ir-2", account_id: BIZ_ACCOUNT_ID, city: "Mumbai", kind: "normal", created_by: "u-carol", created_at: new Date().toISOString() },
  );
  const res = await call("/admin/analytics/fdemand", "tok-founder");
  assert.equal(res.status, 200);
  const p = res.body.payload;
  assert.equal(p.daily.length, 30);
  assert.equal(p.dailyLabels.length, 30);
  const byCity = p.charts.find((c: any) => c.title.startsWith("Requests by city"));
  assert.deepEqual(byCity.rows[0], ["Mumbai", 2]);
  const byType = p.charts.find((c: any) => c.title.startsWith("Account type"));
  assert.deepEqual(byType.rows[0], ["Business", 2]);
});

test("fservices: enquiry counts are real; completed/abandoned for the AI assistant line are a known test-double gap (JSON-path outcome column)", async () => {
  fake.db.legal_assistant_turns.push({ id: "t-1", created_at: new Date().toISOString(), result: { outcome: "answered" } }, { id: "t-2", created_at: new Date().toISOString(), result: { outcome: "answered" } });
  const res = await call("/admin/analytics/fservices", "tok-founder");
  assert.equal(res.status, 200);
  const assistantRow = res.body.payload.rows.find((r: any) => r.service === "AI legal assistant");
  assert.equal(assistantRow.enquiries, 2, "row count is unaffected by the JSON-path select gap");
  // NOT asserting assistantRow.completed here -- see file header.
});

test("ffunnel: registered/requested/booked/paid stage counts", async () => {
  fake.db.payment_orders.push({ id: "po-1", kind: "consultation", amount_paise: 150000, status: "paid", paid_at: "2026-01-02T00:00:00Z", created_by: "u-carol" });
  const res = await call("/admin/analytics/ffunnel", "tok-founder");
  assert.equal(res.status, 200);
  const stage = (name: string) => res.body.payload.stages.find((s: any) => s.stage === name).count;
  assert.equal(stage("Registered users"), 3);
  assert.equal(stage("Made a request"), 1, "both seeded intake_requests were created_by u-carol");
  assert.equal(stage("Paid online"), 1);
});

test("frevenue: GMV, average order value and the by-kind breakdown", async () => {
  const res = await call("/admin/analytics/frevenue", "tok-founder");
  assert.equal(res.status, 200);
  const p = res.body.payload;
  const kpi = (label: string) => p.kpis.find((k: any) => k.label === label).value;
  assert.equal(kpi("Gross transaction value"), 1500);
  assert.equal(kpi("Paid orders"), 1);
  assert.equal(kpi("Average order value"), 1500);
  assert.deepEqual(p.byKind, [{ kind: "consultation", amount: 1500 }]);
});

test("fcorp: one business account's seats, matters and legal spend/outstanding", async () => {
  const res = await call("/admin/analytics/fcorp", "tok-founder");
  assert.equal(res.status, 200);
  const a = res.body.payload.accounts[0];
  assert.equal(a.name, "Acme Pvt Ltd");
  assert.equal(a.seats, 1);
  assert.equal(a.openMatters, 1);
  assert.equal(a.legalSpend, 14000);
  assert.equal(a.outstanding, 4000);
});

test("fadv: a verified advocate's accepted matters and fees billed", async () => {
  const res = await call("/admin/analytics/fadv", "tok-founder");
  assert.equal(res.status, 200);
  const row = res.body.payload.rows[0];
  assert.equal(row.name, "Adv. Carol");
  assert.equal(row.accepted, 1);
  assert.equal(row.feesBilled, 14000);
});

test("fai: the 90-day question count is real; answered/gap breakdowns are the same known JSON-path gap as fservices", async () => {
  const res = await call("/admin/analytics/fai", "tok-founder");
  assert.equal(res.status, 200);
  const kpi = (label: string) => res.body.payload.kpis.find((k: any) => k.label === label).value;
  assert.equal(kpi("Assistant questions (90d)"), 2);
});

test("fcomplaints: serves the same {kpis, complaints} shape as /admin/complaints", async () => {
  const res = await call("/admin/analytics/fcomplaints", "tok-founder");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.payload.kpis));
  assert.ok(Array.isArray(res.body.payload.complaints));
});
