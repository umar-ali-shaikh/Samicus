// Dedicated tests for the messages domain: thread visibility is participant-only (404-not-403
// IDOR defence, ported from app.test.js), sending/validation, read-receipt marking, and the
// GET /threads summary (counterparts, last message, unread count).
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const ADV_AUTH = { id: "auth-adv", email: "adv@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Advocate Dan" }, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-adv": ADV_AUTH };

const MATTER = "33333333-3333-4333-8333-333333333333";
const THREAD = "t-1";

const fake = createFakeSupabase({
  defaults: { messages: { sent_at: "2026-06-01T00:00:00.000Z" } },
  authUsers: AUTH_USERS,
  embeds: {
    "message_threads.matter": (row, db) => {
      const m = db.matters.find((x) => x.id === row.matter_id);
      return m ? { title: m.title, reference: m.reference } : null;
    },
  },
  tables: {
    matters: [{ id: MATTER, title: "Divorce matter", reference: "SM-TEST-00001" }],
    message_threads: [{ id: THREAD, matter_id: MATTER, updated_at: "2026-01-01T00:00:00.000Z" }],
    thread_participants: [],
    messages: [],
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

test("setup: provision alice and the advocate, make them the thread's two participants", async () => {
  await call("GET", "/me", { token: "tok-alice" });
  await call("GET", "/me", { token: "tok-adv" });
  await call("GET", "/me", { token: "tok-bob" });
  const alice = fake.db.users.find((u) => u.email === "alice@example.com");
  const adv = fake.db.users.find((u) => u.email === "adv@example.com");
  fake.db.thread_participants.push({ thread_id: THREAD, participant_id: alice.id }, { thread_id: THREAD, participant_id: adv.id });
  fake.db.messages.push({ id: "msg-1", thread_id: THREAD, sender_id: alice.id, body: "secret", attachments: [], sent_at: "2026-01-01T00:00:00.000Z", read_at: null });
});

test("thread access is participant-only: 404 (not 403) for an outsider, readable for a participant", async () => {
  assert.equal((await call("GET", `/threads/${THREAD}/messages`, { token: "tok-bob" })).status, 404, "must be 404, not 403, so thread ids can't be probed");
  assert.equal((await call("POST", `/threads/${THREAD}/messages`, { token: "tok-bob", body: { body: "hi" } })).status, 404);

  const read = await call("GET", `/threads/${THREAD}/messages`, { token: "tok-alice" });
  assert.equal(read.status, 200);
  assert.equal(read.body[0].body, "secret");
  assert.equal(read.body[0].mine, true);
});

test("opening a conversation marks the other side's messages as read", async () => {
  const beforeRead = await call("GET", `/threads/${THREAD}/messages`, { token: "tok-adv" });
  assert.equal(beforeRead.body[0].mine, false);
  assert.equal(beforeRead.body[0].read_at, null, "unread until the advocate opens it");

  const afterRead = await call("GET", `/threads/${THREAD}/messages`, { token: "tok-adv" });
  assert.ok(afterRead.body[0].read_at, "the first GET above should have marked it read");
});

test("send: trims, validates length, rate-limits by user, and bumps the thread's updated_at", async () => {
  assert.equal((await call("POST", `/threads/${THREAD}/messages`, { token: "tok-alice", body: { body: "   " } })).status, 400);
  assert.equal((await call("POST", `/threads/${THREAD}/messages`, { token: "tok-alice", body: { body: "x".repeat(5001) } })).status, 400);

  const sent = await call("POST", `/threads/${THREAD}/messages`, { token: "tok-alice", body: { body: "  hello  " } });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.body, "hello");
  assert.equal(sent.body.mine, true);
  assert.equal(fake.db.message_threads.find((t) => t.id === THREAD).updated_at !== "2026-01-01T00:00:00.000Z", true);
});

test("GET /threads: counterparts, last message, and unread count", async () => {
  // alice has now sent two messages (the seeded one + the one from the previous test) that the
  // advocate hasn't read since reading flips read_at only on the *reader's* own GET.
  const advThreads = await call("GET", "/threads", { token: "tok-adv" });
  assert.equal(advThreads.status, 200);
  const thread = advThreads.body.find((t) => t.id === THREAD);
  assert.ok(thread);
  assert.equal(thread.matter.title, "Divorce matter");
  assert.deepEqual(thread.counterparts.map((c) => c.full_name), ["Alice Rao"]);
  assert.equal(thread.lastMessage.body, "hello");
  assert.equal(thread.lastMessage.mine, false);
  assert.equal(thread.unread, 1, "only the newest message from alice is still unread by the advocate");

  const bobThreads = await call("GET", "/threads", { token: "tok-bob" });
  assert.deepEqual(bobThreads.body, [], "bob is not a participant in any thread");
});
