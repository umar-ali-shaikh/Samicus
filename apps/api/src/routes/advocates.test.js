// Route-level test for the "notify me when an advocate is available" fallback (see
// components/NoAdvocatesFallback.jsx) — the honest alternative to a dead-end empty state
// wherever an advocate search/match comes back with zero results.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../test/fakeSupabase.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const PA = "11111111-1111-4111-8111-111111111111";

const fake = createFakeSupabase({
  authUsers: { "tok-alice": ALICE },
  embeds: { "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id) },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  tables: { practice_areas: [{ id: PA, name: "Family" }] },
});
mock.module("../config/db.js", { namedExports: { getSupabase: () => fake.client } });

let server;
let base;
before(async () => {
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

test("POST /advocates/notify-when-available requires auth and persists a real row", async () => {
  const anon = await call("POST", "/advocates/notify-when-available", { body: { practiceAreaId: PA } });
  assert.equal(anon.status, 401);

  const res = await call("POST", "/advocates/notify-when-available", { token: "tok-alice", body: { practiceAreaId: PA } });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { ok: true });

  assert.equal(fake.db.notify_requests.length, 1);
  assert.equal(fake.db.notify_requests[0].topic, "advocate_availability");
  assert.equal(fake.db.notify_requests[0].practice_area_id, PA);
});

test("POST /advocates/notify-when-available works without a practiceAreaId", async () => {
  fake.db.notify_requests = [];
  const res = await call("POST", "/advocates/notify-when-available", { token: "tok-alice", body: {} });
  assert.equal(res.status, 201);
  assert.equal(fake.db.notify_requests[0].practice_area_id, null);
});
