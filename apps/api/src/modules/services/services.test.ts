// Route-level tests for the fixed-fee services domain: admin-only catalogue authoring, the
// computed professional/platform/GST fee breakdown on GET /services, ordering + the admin
// assign-a-verified-advocate flow, and the "a service with orders cannot be deleted" guard --
// none of which routes/services.js had a test for.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: {} };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const ADMIN = { id: "auth-admin", email: "admin@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-carol": CAROL, "tok-admin": ADMIN };

const ADVOCATE_ID = "22222222-2222-4222-8222-222222222222";

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  defaults: { accounts: { seat_limit: 1 }, service_orders: { matter_id: null, paid_at: null, advocate_id: null, notes: null } },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  embeds: {
    "account_members.account": (row: any, db: any) => db.accounts.find((a: any) => a.id === row.account_id),
    "service_orders.service": (row: any, db: any) => {
      const s = db.services.find((x: any) => x.id === row.service_id);
      return s ? { name: s.name, category: s.category, professional_fee: s.professional_fee, government_fee: s.government_fee } : null;
    },
    "service_orders.account": (row: any, db: any) => {
      const a = db.accounts.find((x: any) => x.id === row.account_id);
      return a ? { display_name: a.display_name } : null;
    },
    "service_orders.advocate": (row: any, db: any) => {
      if (!row.advocate_id) return null;
      const adv = db.advocates.find((x: any) => x.id === row.advocate_id);
      const user = adv ? db.users.find((u: any) => u.id === adv.user_id) : null;
      return adv ? { id: adv.id, user: user ? { full_name: user.full_name } : null } : null;
    },
  },
  tables: {
    advocates: [{ id: ADVOCATE_ID, user_id: "u-carol", verification_status: "verified" }],
    services: [],
    service_orders: [],
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

const NEW_SERVICE = { category: "Property", name: "Sale Deed Review", professionalFee: 2000, governmentFee: 500, timelineDays: 5, includes: ["Clause-by-clause review"] };

let serviceId: string;

test("only an admin can publish a service; a non-admin is rejected", async () => {
  const asAlice = await call("POST", "/admin/services", { token: "tok-alice", body: NEW_SERVICE });
  assert.equal(asAlice.status, 403);

  const asAdmin = await call("POST", "/admin/services", { token: "tok-admin", body: NEW_SERVICE });
  assert.equal(asAdmin.status, 201);
  serviceId = asAdmin.body.id;
});

test("GET /services computes the professional/platform/GST fee breakdown", async () => {
  const res = await call("GET", "/services");
  assert.equal(res.status, 200);
  const s = res.body.find((x: any) => x.id === serviceId);
  assert.equal(s.fees.professionalFee, 2000);
  assert.equal(s.fees.platformFee, 99);
  assert.equal(s.fees.gst, Math.round((2000 + 99) * 0.18));
  assert.equal(s.fees.total, 2000 + 99 + Math.round((2000 + 99) * 0.18));
  assert.equal(s.gov, 500);
});

let orderId: string;

test("a client can order the service; it shows up on their own list with the service joined", async () => {
  const created = await call("POST", `/services/${serviceId}/orders`, { token: "tok-alice", body: {} });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "started");
  orderId = created.body.id;

  const mine = await call("GET", "/service-orders", { token: "tok-alice" });
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].service.name, "Sale Deed Review");
});

test("admin sees the unassigned order; assigning an unverified advocate 404s; assigning carol marks it in_progress", async () => {
  const adminList = await call("GET", "/admin/service-orders", { token: "tok-admin" });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body[0].advocate, null);

  const badAssign = await call("POST", `/admin/service-orders/${orderId}/assign`, { token: "tok-admin", body: { advocateId: "99999999-9999-4999-8999-999999999999" } });
  assert.equal(badAssign.status, 404);

  const assigned = await call("POST", `/admin/service-orders/${orderId}/assign`, { token: "tok-admin", body: { advocateId: ADVOCATE_ID } });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.status, "in_progress");
  assert.equal(assigned.body.advocate_id, ADVOCATE_ID);
});

test("a service with orders cannot be deleted; deleting one with none succeeds", async () => {
  const blocked = await call("DELETE", `/admin/services/${serviceId}`, { token: "tok-admin" });
  assert.equal(blocked.status, 409);

  const other = await call("POST", "/admin/services", { token: "tok-admin", body: { ...NEW_SERVICE, name: "Unused Service" } });
  const del = await fetch(`${base}/admin/services/${other.body.id}`, { method: "DELETE", headers: { Authorization: "Bearer tok-admin" } });
  assert.equal(del.status, 204);
});
