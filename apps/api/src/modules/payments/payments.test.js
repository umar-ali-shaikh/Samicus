// Dedicated tests for the payments domain: disabled-by-default (ported from app.test.js),
// per-kind ownership checks and fee maths on intent creation, signature verification
// (computed with real HMAC against a test secret, not mocked), the webhook path, idempotent
// settlement, and history scoping. The only mocked piece is the outbound Razorpay Orders API
// call (t.mock.method(globalThis, "fetch", ...), same convention as services/*.test.js).
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const realFetch = globalThis.fetch;

// Mocked per-test (not via a file-level beforeEach) because it must delegate to the real
// fetch for the test's own HTTP calls into the local Express server -- only requests to
// Razorpay's API are faked.
function mockRazorpayFetch(t) {
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    if (String(url).includes("api.razorpay.com")) {
      return { ok: true, json: async () => ({ id: `order_${crypto.randomUUID().slice(0, 8)}` }) };
    }
    return realFetch(url, opts);
  });
}

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB };

const ADV = "22222222-2222-4222-8222-222222222222";
const CONSULTATION = "55555555-5555-4555-8555-555555555555";
const MATTER = "33333333-3333-4333-8333-333333333333";
const INVOICE = "66666666-6666-4666-8666-666666666666";

const fake = createFakeSupabase({
  defaults: { accounts: { seat_limit: 1 }, payment_orders: { currency: "INR", provider: "razorpay", status: "created", provider_payment_id: null, method: null, paid_at: null, updated_at: "2026-01-01T00:00:00.000Z" } },
  authUsers: AUTH_USERS,
  embeds: {
    "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id),
    "invoices.matter": (row, db) => {
      const m = db.matters.find((x) => x.id === row.matter_id);
      return m ? { account_id: m.account_id } : null;
    },
  },
  tables: { matters: [], consultations: [], invoices: [], payment_orders: [] },
  rpc: {
    capture_payment: ({ p_invoice_id, p_method, p_gateway_ref, p_escrow_state }, db) => {
      const payment = { id: `pay-${p_invoice_id}`, invoice_id: p_invoice_id, method: p_method, gateway_ref: p_gateway_ref, escrow_state: p_escrow_state };
      db.payments = db.payments || [];
      db.payments.push(payment);
      const inv = db.invoices.find((i) => i.id === p_invoice_id);
      if (inv) inv.status = "paid";
      return payment;
    },
  },
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

test("payments report as disabled instead of faking a capture", async () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  const cfg = await call("GET", "/config");
  assert.equal(cfg.body.payments.enabled, false);
  const res = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "consultation", id: "00000000-0000-0000-0000-000000000000" } });
  assert.equal(res.status, 503);
  assert.equal(res.body.code, "PAYMENTS_DISABLED");
  assert.equal((await call("POST", "/payments/verify", { token: "tok-alice", body: { orderId: "x".repeat(10), paymentId: "y".repeat(10), signature: "z".repeat(10) } })).status, 503);
});

// The rest of this suite exercises the "enabled" path -- with a FAKE Razorpay key/secret that
// never leaves this process, since createRazorpayOrder is mocked and no real network call is
// ever made.
const TEST_KEY_SECRET = "test-razorpay-secret";
let account;

test("setup: enable payments with a test secret, provision alice+bob, seed a consultation and an invoice", async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;

  await call("GET", "/me", { token: "tok-alice" });
  await call("GET", "/me", { token: "tok-bob" });
  account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];

  fake.db.consultations.push({ id: CONSULTATION, account_id: account.id, advocate_id: ADV, fee_total: 3000, paid_at: null, state: "scheduled" });
  fake.db.matters.push({ id: MATTER, account_id: account.id, advocate_id: ADV });
  fake.db.invoices.push({ id: INVOICE, matter_id: MATTER, total: 5000, status: "due" });
});

test("GET /config reports payments enabled once keys are set", async () => {
  const cfg = await call("GET", "/config");
  assert.equal(cfg.body.payments.enabled, true);
  assert.equal(cfg.body.payments.keyId, "rzp_test_fake");
});

test("create intent: ownership is enforced per kind, amount is computed server-side, never paid twice", async (t) => {
  mockRazorpayFetch(t);
  const stolen = await call("POST", "/payments/intents", { token: "tok-bob", body: { kind: "consultation", id: CONSULTATION } });
  assert.equal(stolen.status, 404, "bob is not on alice's account");

  const ok = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "consultation", id: CONSULTATION } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.amountPaise, 300000);
  assert.equal(ok.body.keyId, "rzp_test_fake");
  assert.equal(fake.db.payment_orders.length, 1);
  assert.equal(fake.db.payment_orders[0].account_id, account.id);

  fake.db.consultations.find((c) => c.id === CONSULTATION).paid_at = "2026-02-01T00:00:00Z";
  const alreadyPaid = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "consultation", id: CONSULTATION } });
  assert.equal(alreadyPaid.status, 409);
  fake.db.consultations.find((c) => c.id === CONSULTATION).paid_at = null;
});

test("create intent for an invoice: requires owner/admin/finance role on the matter's account, GST maths excluded (invoice total is pre-computed)", async (t) => {
  mockRazorpayFetch(t);
  const res = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "invoice", id: INVOICE } });
  assert.equal(res.status, 201);
  assert.equal(res.body.amountPaise, 500000);

  assert.equal((await call("POST", "/payments/intents", { token: "tok-bob", body: { kind: "invoice", id: INVOICE } })).status, 404);
});

test("verify: real HMAC signature required, order must belong to the caller, settlement updates the subject and is idempotent", async (t) => {
  mockRazorpayFetch(t);
  const intent = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "consultation", id: CONSULTATION } });
  const orderId = intent.body.orderId;
  const paymentId = "pay_fake12345";
  const validSignature = crypto.createHmac("sha256", TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  const badSig = await call("POST", "/payments/verify", { token: "tok-alice", body: { orderId, paymentId, signature: "0".repeat(64) } });
  assert.equal(badSig.status, 400);

  const wrongUser = await call("POST", "/payments/verify", { token: "tok-bob", body: { orderId, paymentId, signature: validSignature } });
  assert.equal(wrongUser.status, 404);

  const ok = await call("POST", "/payments/verify", { token: "tok-alice", body: { orderId, paymentId, signature: validSignature, method: "upi" } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true, kind: "consultation", subjectId: CONSULTATION });
  const consultation = fake.db.consultations.find((c) => c.id === CONSULTATION);
  assert.ok(consultation.paid_at);
  assert.equal(consultation.payment_method, "upi");

  // Re-verifying the same order (e.g. the browser retried) must not error or double-charge.
  const again = await call("POST", "/payments/verify", { token: "tok-alice", body: { orderId, paymentId, signature: validSignature, method: "upi" } });
  assert.equal(again.status, 200);
});

test("verify: an invoice payment captures via the RPC and flips the invoice to paid", async (t) => {
  mockRazorpayFetch(t);
  const intent = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "invoice", id: INVOICE } });
  const orderId = intent.body.orderId;
  const paymentId = "pay_invoice123";
  const signature = crypto.createHmac("sha256", TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  const res = await call("POST", "/payments/verify", { token: "tok-alice", body: { orderId, paymentId, signature, method: "card" } });
  assert.equal(res.status, 200);
  assert.equal(fake.db.invoices.find((i) => i.id === INVOICE).status, "paid");
  assert.ok(fake.db.payments.some((p) => p.invoice_id === INVOICE && p.gateway_ref === paymentId));
});

test("webhook: bad signature is rejected, a valid payment.captured event settles the order", async (t) => {
  mockRazorpayFetch(t);
  // Reset from the earlier "verify" test, which already paid this same seeded consultation.
  fake.db.consultations.find((c) => c.id === CONSULTATION).paid_at = null;
  const intent = await call("POST", "/payments/intents", { token: "tok-alice", body: { kind: "consultation", id: CONSULTATION } });
  const orderId = intent.body.orderId;

  const payload = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_webhook1", order_id: orderId, method: "upi" } } } });

  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
  const badRes = await fetch(`${base}/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": "nope" }, body: payload });
  assert.equal(badRes.status, 400);

  const goodSig = crypto.createHmac("sha256", "webhook-secret").update(payload).digest("hex");
  const goodRes = await fetch(`${base}/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": goodSig }, body: payload });
  assert.equal(goodRes.status, 200);
  assert.ok(fake.db.consultations.find((c) => c.id === CONSULTATION).paid_at, "the webhook settled the order even without /verify ever being called");
});

test("GET /payments/history: scoped to the caller's own created orders", async () => {
  const aliceHistory = await call("GET", "/payments/history", { token: "tok-alice" });
  assert.equal(aliceHistory.status, 200);
  assert.ok(aliceHistory.body.length > 0);
  assert.ok(aliceHistory.body.every((h) => h.amount_paise !== undefined));

  const bobHistory = await call("GET", "/payments/history", { token: "tok-bob" });
  assert.deepEqual(bobHistory.body, []);
});
