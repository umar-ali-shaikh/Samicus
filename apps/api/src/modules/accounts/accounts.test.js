// Dedicated route-level tests for the accounts domain -- previously had no dedicated coverage
// at all (only incidentally exercised via provisioning in app.test.js). Covers the behaviours
// routes/accounts.js had but never had tests for: seat-limit enforcement, placeholder-user
// invites, and the IDOR boundary on every :id-scoped route.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const OUTSIDER = { id: "auth-outsider", email: "outsider@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Outsider" }, app_metadata: { provider: "email" } };
const AUTH_USERS = { "tok-alice": ALICE, "tok-outsider": OUTSIDER };

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  defaults: { accounts: { seat_limit: 1 } },
  embeds: { "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id) },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }], account_members: [{ cols: ["account_id", "user_id"] }] },
});
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

test("GET /plans is public and lists plans by ascending price", async () => {
  fake.db.plans = [
    { id: "p2", name: "Pro", audience: "business", price_monthly: 999 },
    { id: "p1", name: "Free", audience: "individual", price_monthly: 0 },
  ];
  const res = await call("GET", "/plans");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((p) => p.name), ["Free", "Pro"]);
});

test("POST /accounts creates a business account with the caller as owner", async () => {
  const res = await call("POST", "/accounts", { token: "tok-alice", body: { type: "business", displayName: "Alice & Co" } });
  assert.equal(res.status, 201);
  assert.equal(res.body.myRole, "owner");
  assert.equal(res.body.type, "business");
  assert.equal(res.body.seat_limit, 10, "business accounts get a 10-seat limit");
});

test("POST /accounts rejects an invalid GSTIN with the field-level Zod message", async () => {
  const res = await call("POST", "/accounts", { token: "tok-alice", body: { type: "business", displayName: "Bad GSTIN Co", gstin: "not-a-gstin" } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /gstin/i);
});

test("POST /accounts rejects a duplicate display name with 409", async () => {
  await call("POST", "/accounts", { token: "tok-alice", body: { type: "family", displayName: "Duplicate Name" } });
  const res = await call("POST", "/accounts", { token: "tok-alice", body: { type: "family", displayName: "Duplicate Name" } });
  assert.equal(res.status, 409);
});

test("members: seat limit is enforced", async () => {
  const created = await call("POST", "/accounts", { token: "tok-alice", body: { type: "family", displayName: "Small Family" } });
  const accountId = created.body.id;
  // family seat_limit is 4; owner already occupies 1 seat.
  for (let i = 0; i < 3; i++) {
    const res = await call("POST", `/accounts/${accountId}/members`, { token: "tok-alice", body: { email: `member${i}@example.com` } });
    assert.equal(res.status, 201);
  }
  const overLimit = await call("POST", `/accounts/${accountId}/members`, { token: "tok-alice", body: { email: "onetoomany@example.com" } });
  assert.equal(overLimit.status, 409);
  assert.match(overLimit.body.error, /limited to 4 members/);
});

test("members: inviting an unregistered email creates a login-less placeholder user", async () => {
  const created = await call("POST", "/accounts", { token: "tok-alice", body: { type: "business", displayName: "Placeholder Co" } });
  const accountId = created.body.id;
  const res = await call("POST", `/accounts/${accountId}/members`, { token: "tok-alice", body: { email: "new-invitee@example.com", fullName: "New Invitee", role: "admin" } });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, "new-invitee@example.com");
  assert.equal(res.body.role, "admin");

  const dup = await call("POST", `/accounts/${accountId}/members`, { token: "tok-alice", body: { email: "new-invitee@example.com" } });
  assert.equal(dup.status, 409, "already a member");
});

test("members: inviting as 'owner' is rejected (enum validation)", async () => {
  const created = await call("POST", "/accounts", { token: "tok-alice", body: { type: "business", displayName: "No Second Owner Co" } });
  const res = await call("POST", `/accounts/${created.body.id}/members`, { token: "tok-alice", body: { email: "x@example.com", role: "owner" } });
  assert.equal(res.status, 400);
});

test("IDOR: a non-member cannot list, add to, or remove from someone else's account", async () => {
  const created = await call("POST", "/accounts", { token: "tok-alice", body: { type: "business", displayName: "Private Co" } });
  const accountId = created.body.id;

  const list = await call("GET", `/accounts/${accountId}/members`, { token: "tok-outsider" });
  assert.equal(list.status, 403);

  const add = await call("POST", `/accounts/${accountId}/members`, { token: "tok-outsider", body: { email: "intruder@example.com" } });
  assert.equal(add.status, 403);

  const remove = await call("DELETE", `/accounts/${accountId}/members/00000000-0000-4000-8000-000000000000`, { token: "tok-outsider" });
  assert.equal(remove.status, 403);
});

test("GET /accounts requires authentication", async () => {
  const res = await call("GET", "/accounts");
  assert.equal(res.status, 401);
});
