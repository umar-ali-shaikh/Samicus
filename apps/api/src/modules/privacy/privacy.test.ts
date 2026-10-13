// Route-level tests for the privacy domain: the export only ever contains the caller's own
// data (ported behaviour, no prior test), the statutory-retention block on deletion while
// matters are engaged (client side and advocate side), and that deletion actually anonymises
// the user, deletes their sole-owned documents (and the underlying storage object), and removes
// their account memberships.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: {} };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Bob" }, app_metadata: {} };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-carol": CAROL };

const ADVOCATE_ID = "22222222-2222-4222-8222-222222222222";

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  storage: { "alice-doc-key": Buffer.from("a private document") },
  defaults: { accounts: { seat_limit: 1 } },
  embeds: {
    "account_members.account": (row: any, db: any) => db.accounts.find((a: any) => a.id === row.account_id),
    "legal_assistant_sessions.turns": (row: any, db: any) => db.legal_assistant_turns.filter((t: any) => t.session_id === row.session_id).map((t: any) => ({ question: t.question, created_at: t.created_at })),
  },
  tables: {
    advocates: [{ id: ADVOCATE_ID, user_id: "u-carol", verification_status: "verified", availability_state: "available" }],
    matters: [],
    documents: [],
    intake_requests: [],
    consultations: [],
    public_questions: [],
    complaints: [],
    payment_orders: [],
    legal_assistant_sessions: [],
    legal_assistant_turns: [],
  },
});
fake.db.users = [{ id: "u-carol", auth_id: "auth-carol", email: "carol@example.com", full_name: "Adv. Carol", role: "advocate" }];
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

let aliceAccountId: string;
let aliceUserId: string;

test("setup: provision alice and bob, seed one of alice's documents and an AI session", async () => {
  aliceUserId = (await call("GET", "/me", { token: "tok-alice" })).body.user.id;
  aliceAccountId = (await call("GET", "/accounts", { token: "tok-alice" })).body[0].id;
  await call("GET", "/me", { token: "tok-bob" });

  fake.db.documents.push({ id: "doc-alice-1", account_id: aliceAccountId, filename: "lease.pdf", kind: "Agreements", size_bytes: 100, storage_key: "alice-doc-key", created_at: "2026-01-01T00:00:00Z", shared_with: [], virus_scan_status: "pending", uploaded_by: aliceUserId, matter_id: null });
  fake.db.legal_assistant_sessions.push({ session_id: "sess-1", user_id: aliceUserId, created_at: "2026-01-01T00:00:00Z" });
  fake.db.legal_assistant_turns.push({ id: "turn-1", session_id: "sess-1", question: "Can my landlord evict me without notice?", created_at: "2026-01-01T00:00:00Z" });
});

test("export only ever contains the caller's own data", async () => {
  const res = await call("POST", "/privacy/export", { token: "tok-alice" });
  assert.equal(res.status, 200);
  assert.equal(res.body.documents.length, 1);
  assert.equal(res.body.documents[0].filename, "lease.pdf");
  assert.equal(res.body.aiAssistantHistory[0].turns[0].question, "Can my landlord evict me without notice?");

  const bobsExport = await call("POST", "/privacy/export", { token: "tok-bob" });
  assert.equal(bobsExport.body.documents.length, 0, "bob's export must never include alice's document");
  assert.equal(bobsExport.body.aiAssistantHistory.length, 0);
});

test("deletion is blocked while the caller has an engaged matter as a client", async () => {
  fake.db.matters.push({ id: "matter-1", account_id: aliceAccountId, advocate_id: ADVOCATE_ID, stage: "action_in_progress" });
  const res = await call("POST", "/privacy/delete", { token: "tok-alice" });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /engaged/);
  fake.db.matters = fake.db.matters.filter((m: any) => m.id !== "matter-1");
});

test("deletion is blocked while the caller has an open matter as an advocate", async () => {
  fake.db.matters.push({ id: "matter-2", account_id: aliceAccountId, advocate_id: ADVOCATE_ID, stage: "action_in_progress" });
  const res = await call("POST", "/privacy/delete", { token: "tok-carol" });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /open matters as an advocate/);
  fake.db.matters = fake.db.matters.filter((m: any) => m.id !== "matter-2");
});

test("with no engaged matters, deletion anonymises the user, deletes their sole-owned documents and storage object, and removes memberships", async () => {
  const res = await fetch(`${base}/privacy/delete`, { method: "POST", headers: { Authorization: "Bearer tok-alice" } });
  assert.equal(res.status, 204);

  const aliceUser = fake.db.users.find((u: any) => u.email === null && u.full_name === "Deleted user");
  assert.ok(aliceUser, "alice's user row must be anonymised in place, not deleted");
  assert.equal(aliceUser.auth_id, null);

  assert.equal(fake.db.documents.find((d: any) => d.id === "doc-alice-1"), undefined, "her sole-owned document row must be gone");
  assert.equal((fake.storage as Record<string, unknown>)["alice-doc-key"], undefined, "the underlying storage object must be removed too");
  assert.equal(fake.db.account_members.filter((m: any) => m.user_id === aliceUser.id).length, 0);
});
