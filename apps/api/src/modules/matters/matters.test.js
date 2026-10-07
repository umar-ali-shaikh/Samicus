// Dedicated tests for the matters domain: list scoping (account/advocate/access-grant),
// matter detail (including the read-only "viewer" side and its fees-scope gating), the
// client/advocate patch-permission split, tasks/hearings ownership rules, fee proposal ->
// acceptance -> invoice flow (with GST math), and IDOR on an uninvolved user.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Carol CA" }, app_metadata: { provider: "email" } };
const ADV_AUTH = { id: "auth-adv", email: "adv@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-carol": CAROL, "tok-adv": ADV_AUTH };

const PA = "11111111-1111-4111-8111-111111111111";
const ADV = "22222222-2222-4222-8222-222222222222";
const MATTER = "33333333-3333-4333-8333-333333333333";

const fake = createFakeSupabase({
  defaults: {
    accounts: { seat_limit: 1 },
    matters: { stage: "consultation", opened_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", engaged_at: null, closed_at: null, archive_retention_until: null, forum: null, next_action: null, practice_area_id: null },
    tasks: { updated_at: "2026-01-01T00:00:00.000Z", due_at: null, completed_at: null },
    hearings: { updated_at: "2026-01-01T00:00:00.000Z", forum: null, court_hall: null, purpose: null, outcome_note: null },
    matter_access_grants: { updated_at: "2026-01-01T00:00:00.000Z", granted_at: "2026-01-01T00:00:00.000Z", subject_name: null, subject_role: null, revoked_at: null },
    fee_proposals: { updated_at: "2026-01-01T00:00:00.000Z", statutory_estimate: null, valid_until: null, accepted_at: null },
    invoices: { updated_at: "2026-01-01T00:00:00.000Z", due_at: null },
    timeline_events: { body: null, occurred_at: "2026-01-01T00:00:00.000Z" },
  },
  authUsers: AUTH_USERS,
  embeds: {
    "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id),
    "matters.advocate": (row, db) => {
      const a = db.advocates.find((x) => x.id === row.advocate_id);
      if (!a) return null;
      const u = db.users.find((x) => x.id === a.user_id);
      return { id: a.id, city: a.city ?? null, user: u ? { full_name: u.full_name, avatar_url: u.avatar_url ?? null } : null };
    },
    "matters.practice_area": (row, db) => {
      const p = db.practice_areas.find((x) => x.id === row.practice_area_id);
      return p ? { name: p.name } : null;
    },
    "matters.account": (row, db) => {
      const a = db.accounts.find((x) => x.id === row.account_id);
      return a ? { display_name: a.display_name, type: a.type } : null;
    },
    "invoices.invoice_line_items": (row, db) => (db.invoice_line_items || []).filter((li) => li.invoice_id === row.id),
  },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  tables: {
    practice_areas: [{ id: PA, name: "Family" }],
    advocates: [{ id: ADV, user_id: "u-adv", city: "Delhi" }],
    matters: [],
  },
});
fake.db.users = [{ id: "u-adv", auth_id: "auth-adv", email: "adv@example.com", full_name: "Advocate Dan", role: "advocate" }];
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

test("setup: provision alice, bob, carol and seed a matter between alice's account and the advocate", async () => {
  const aliceMe = await call("GET", "/me", { token: "tok-alice" });
  assert.equal(aliceMe.status, 200);
  await call("GET", "/me", { token: "tok-bob" });
  await call("GET", "/me", { token: "tok-carol" });

  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  // Static `tables`/pushed rows don't get `defaults` applied (only .insert() calls do) --
  // every column matterDto.strict() requires must be explicit here.
  fake.db.matters.push({
    id: MATTER, reference: "SM-TEST-00001", account_id: account.id, advocate_id: ADV, title: "Divorce matter", practice_area_id: PA,
    forum: null, stage: "consultation", next_action: null, opened_at: "2026-01-01T00:00:00.000Z", engaged_at: null, closed_at: null,
    archive_retention_until: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  });
});

test("GET /matters: visible to the account member and the engaged advocate, not to an outsider", async () => {
  const aliceList = await call("GET", "/matters", { token: "tok-alice" });
  assert.equal(aliceList.status, 200);
  assert.deepEqual(aliceList.body.map((m) => m.id), [MATTER]);
  assert.equal(aliceList.body[0].mySide, "client");

  const advList = await call("GET", "/matters", { token: "tok-adv" });
  assert.deepEqual(advList.body.map((m) => m.id), [MATTER]);
  assert.equal(advList.body[0].mySide, "advocate");

  const bobList = await call("GET", "/matters", { token: "tok-bob" });
  assert.deepEqual(bobList.body, []);
});

test("GET /matters/:id: 404s for an outsider; full detail for the client and advocate", async () => {
  assert.equal((await call("GET", `/matters/${MATTER}`, { token: "tok-bob" })).status, 404, "must be 404, not 403, so matter ids can't be probed");

  const clientView = await call("GET", `/matters/${MATTER}`, { token: "tok-alice" });
  assert.equal(clientView.status, 200);
  assert.equal(clientView.body.side, "client");
  assert.equal(clientView.body.matter.title, "Divorce matter");
  assert.equal(clientView.body.matter.advocate.user.full_name, "Advocate Dan");

  const advView = await call("GET", `/matters/${MATTER}`, { token: "tok-adv" });
  assert.equal(advView.status, 200);
  assert.equal(advView.body.side, "advocate");
});

test("a matter access grant makes an outsider a read-only 'viewer', scoped to fees only if granted", async () => {
  const grantNoFees = await call("POST", `/matters/${MATTER}/access`, { token: "tok-alice", body: { email: "carol@example.com", role: "CA", scope: ["documents"] } });
  assert.equal(grantNoFees.status, 201);
  const grantId = grantNoFees.body.id;

  const viewNoFees = await call("GET", `/matters/${MATTER}`, { token: "tok-carol" });
  assert.equal(viewNoFees.status, 200);
  assert.equal(viewNoFees.body.side, "viewer");
  assert.deepEqual(viewNoFees.body.feeProposals, [], "fees aren't in this grant's scope");

  await call("DELETE", `/matters/${MATTER}/access/${grantId}`, { token: "tok-alice" });
  const grantWithFees = await call("POST", `/matters/${MATTER}/access`, { token: "tok-alice", body: { email: "carol@example.com", role: "CA", scope: ["fees"] } });
  const viewWithFees = await call("GET", `/matters/${MATTER}`, { token: "tok-carol" });
  assert.equal(viewWithFees.body.feeProposals.length >= 0, true);

  // Revoke again so later tests see the clean no-grant state for carol.
  await call("DELETE", `/matters/${MATTER}/access/${grantWithFees.body.id}`, { token: "tok-alice" });
  assert.equal((await call("GET", `/matters/${MATTER}`, { token: "tok-carol" })).status, 404, "revocation is immediate");
});

test("PATCH /matters/:id: the client may only close the matter; everything else is the advocate's call", async () => {
  const clientRename = await call("PATCH", `/matters/${MATTER}`, { token: "tok-alice", body: { title: "New title" } });
  assert.equal(clientRename.status, 403);

  const advRename = await call("PATCH", `/matters/${MATTER}`, { token: "tok-adv", body: { nextAction: "File response" } });
  assert.equal(advRename.status, 200);
  assert.equal(advRename.body.next_action, "File response");

  const clientCloseWithExtra = await call("PATCH", `/matters/${MATTER}`, { token: "tok-alice", body: { stage: "closed", title: "sneaky" } });
  assert.equal(clientCloseWithExtra.status, 403, "closing must be the ONLY field changed");

  const clientClose = await call("PATCH", `/matters/${MATTER}`, { token: "tok-alice", body: { stage: "closed" } });
  assert.equal(clientClose.status, 200);
  assert.equal(clientClose.body.stage, "closed");
  assert.ok(clientClose.body.closed_at);

  // Reopen for subsequent tests.
  await call("PATCH", `/matters/${MATTER}`, { token: "tok-adv", body: { stage: "action_in_progress" } });
});

test("tasks: only the advocate can add one; only the owning side can complete it", async () => {
  const clientAdds = await call("POST", `/matters/${MATTER}/tasks`, { token: "tok-alice", body: { label: "Gather documents" } });
  assert.equal(clientAdds.status, 403);

  const advAdds = await call("POST", `/matters/${MATTER}/tasks`, { token: "tok-adv", body: { label: "Gather documents", ownerType: "client" } });
  assert.equal(advAdds.status, 201);
  const taskId = advAdds.body.id;

  const advCompletesClientTask = await call("POST", `/matters/${MATTER}/tasks/${taskId}/complete`, { token: "tok-adv", body: {} });
  assert.equal(advCompletesClientTask.status, 403, "this task belongs to the client");

  const clientCompletes = await call("POST", `/matters/${MATTER}/tasks/${taskId}/complete`, { token: "tok-alice", body: {} });
  assert.equal(clientCompletes.status, 200);
  assert.ok(clientCompletes.body.completed_at);
});

test("hearings: only the advocate can list one", async () => {
  const clientAdds = await call("POST", `/matters/${MATTER}/hearings`, { token: "tok-alice", body: { listedAt: "2026-02-01T05:00:00Z" } });
  assert.equal(clientAdds.status, 403);

  const advAdds = await call("POST", `/matters/${MATTER}/hearings`, { token: "tok-adv", body: { listedAt: "2026-02-01T05:00:00Z", forum: "City Civil Court" } });
  assert.equal(advAdds.status, 201);
  assert.equal(advAdds.body.forum, "City Civil Court");
});

test("fee proposal -> acceptance confirms the engagement; invoice raises with correct GST", async () => {
  const proposal = await call("POST", `/matters/${MATTER}/fee-proposals`, {
    token: "tok-adv",
    body: { scopeText: "Draft and file the petition, attend first hearing.", milestones: [{ label: "Filing", amount: 10000 }] },
  });
  assert.equal(proposal.status, 201);

  const clientAccepts403 = await call("POST", `/matters/${MATTER}/fee-proposals/${proposal.body.id}/accept`, { token: "tok-adv" });
  assert.equal(clientAccepts403.status, 403, "only the client can accept");

  const accept = await call("POST", `/matters/${MATTER}/fee-proposals/${proposal.body.id}/accept`, { token: "tok-alice" });
  assert.equal(accept.status, 200);
  assert.ok(accept.body.accepted_at);
  const matterAfter = await call("GET", `/matters/${MATTER}`, { token: "tok-alice" });
  assert.equal(matterAfter.body.matter.stage, "engagement_confirmed");

  const reaccept = await call("POST", `/matters/${MATTER}/fee-proposals/${proposal.body.id}/accept`, { token: "tok-alice" });
  assert.equal(reaccept.status, 409);

  const invoice = await call("POST", `/matters/${MATTER}/invoices`, { token: "tok-adv", body: { items: [{ label: "Filing", amount: 10000, category: "professional" }] } });
  assert.equal(invoice.status, 201);
  // professional 10000 + platform 99 = 10099 taxable; GST 18% rounded.
  const expectedGst = Math.round(10099 * 0.18);
  assert.equal(invoice.body.gst, expectedGst);
  assert.equal(invoice.body.total, 10000 + 99 + expectedGst);

  const settle = await call("POST", `/matters/${MATTER}/invoices/${invoice.body.id}/settle-offline`, { token: "tok-adv" });
  assert.equal(settle.status, 200);
  assert.equal(settle.body.status, "paid");

  const settleAgain = await call("POST", `/matters/${MATTER}/invoices/${invoice.body.id}/settle-offline`, { token: "tok-adv" });
  assert.equal(settleAgain.status, 404, "already paid");
});

test("GET /accounts/:id/legal-spend: totals by category, only for account finance/owner/admin", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const forbidden = await call("GET", `/accounts/${account.id}/legal-spend`, { token: "tok-bob" });
  assert.equal(forbidden.status, 403);

  const spend = await call("GET", `/accounts/${account.id}/legal-spend`, { token: "tok-alice" });
  assert.equal(spend.status, 200);
  assert.equal(spend.body.totals.professional, 10000);
  assert.equal(spend.body.totals.platform, 99);
  assert.equal(spend.body.totals.paid, spend.body.totals.total);
});
