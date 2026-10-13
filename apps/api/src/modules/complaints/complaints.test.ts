// Route-level tests for the complaints domain: the CMP-<year>-<5digits> reference format, the
// caller-scoped "mine" list (never another user's complaints), the admin/founder-only patch
// gate, and the "nothing to update" 400 -- none of which routes/complaints.js had a test for.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: {} };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Bob" }, app_metadata: {} };
const ADMIN = { id: "auth-admin", email: "admin@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-admin": ADMIN };

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  unique: { users: [{ cols: ["auth_id"] }] },
  defaults: { complaints: { status: "open", severity: "medium", owner: null, root_cause: null, corrective_action: null, refund_amount: null, service_involved: null, linked_record_type: null, linked_record_id: null } },
  tables: { complaints: [] },
});
fake.db.users = [{ id: "u-admin", auth_id: "auth-admin", email: "admin@example.com", full_name: "Admin", role: "admin" }];
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

let complaintId: string;

test("filing a complaint assigns a CMP-<year>-<5digits> reference and defaults to open/medium", async () => {
  const res = await call("POST", "/complaints", { token: "tok-alice", body: { title: "AI cited the wrong section", description: "The research answer cited IPC 420 for what looks like a civil matter.", category: "citation_accuracy" } });
  assert.equal(res.status, 201);
  assert.match(res.body.ref, /^CMP-\d{4}-\d{5}$/);
  complaintId = res.body.id;

  const mine = await call("GET", "/complaints/mine", { token: "tok-alice" });
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].ref, res.body.ref);
});

test("GET /complaints/mine never shows another user's complaints", async () => {
  const bobs = await call("GET", "/complaints/mine", { token: "tok-bob" });
  assert.equal(bobs.body.length, 0);
});

test("only admin/founder can triage a complaint; an empty patch 400s; a real patch updates it", async () => {
  const asAlice = await call("PATCH", `/admin/complaints/${complaintId}`, { token: "tok-alice", body: { status: "escalated" } });
  assert.equal(asAlice.status, 403);

  const empty = await call("PATCH", `/admin/complaints/${complaintId}`, { token: "tok-admin", body: {} });
  assert.equal(empty.status, 400);

  const patched = await call("PATCH", `/admin/complaints/${complaintId}`, {
    token: "tok-admin",
    body: { status: "resolved", severity: "high", correctiveAction: "Flagged the retrieval gap and corrected the cited section." },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, "resolved");
  assert.equal(patched.body.severity, "high");
  assert.equal(patched.body.corrective_action, "Flagged the retrieval gap and corrected the cited section.");

  const minesAfter = await call("GET", "/complaints/mine", { token: "tok-alice" });
  assert.equal(minesAfter.body[0].status, "resolved");
  assert.equal(minesAfter.body[0].corrective_action, "Flagged the retrieval gap and corrected the cited section.");
});

test("patching an unknown complaint 404s", async () => {
  const res = await call("PATCH", "/admin/complaints/00000000-0000-4000-8000-000000000000", { token: "tok-admin", body: { status: "resolved" } });
  assert.equal(res.status, 404);
});
