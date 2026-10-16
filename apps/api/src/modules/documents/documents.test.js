// Dedicated tests for the documents domain: upload type allow-list and ownership (ported from
// app.test.js), the owner-only/shared-with-me visibility rules, sharing's advocate allow-list,
// the viewer-via-matter-access-grant read path, and delete permissions.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const ADV_AUTH = { id: "auth-adv", email: "adv@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const OTHER_ADV_AUTH = { id: "auth-adv2", email: "adv2@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-carol": CAROL, "tok-adv": ADV_AUTH, "tok-adv2": OTHER_ADV_AUTH };

const ADV = "22222222-2222-4222-8222-222222222222";
const OTHER_ADV = "44444444-4444-4444-8444-444444444444";
const MATTER = "33333333-3333-4333-8333-333333333333";

const fake = createFakeSupabase({
  defaults: { accounts: { seat_limit: 1 }, documents: { shared_with: [] } },
  authUsers: AUTH_USERS,
  embeds: { "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id) },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  tables: {
    matters: [],
    consultations: [],
    documents: [],
    matter_access_grants: [],
    advocates: [{ id: ADV, user_id: "u-adv" }, { id: OTHER_ADV, user_id: "u-adv2" }],
  },
});
// The advocates' internal `users` rows must pre-exist for provisionUser's auth_id lookup to
// find them on first call (same pattern as modules/advocates/advocates.test.js).
fake.db.users = [
  { id: "u-adv", auth_id: "auth-adv", email: "adv@example.com", full_name: "Advocate Dan", role: "advocate" },
  { id: "u-adv2", auth_id: "auth-adv2", email: "adv2@example.com", full_name: "Advocate Eve", role: "advocate" },
];
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

async function upload(token, { name, type, accountId, matterId, kind = "Agreements" }) {
  const form = new FormData();
  if (accountId) form.set("accountId", accountId);
  if (matterId) form.set("matterId", matterId);
  form.set("kind", kind);
  form.set("file", new Blob(["hello contract"], { type }), name);
  const res = await fetch(`${base}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let account;

test("setup: provision everyone, seed a matter linking alice's account to the advocate", async () => {
  await call("GET", "/me", { token: "tok-alice" });
  await call("GET", "/me", { token: "tok-bob" });
  await call("GET", "/me", { token: "tok-carol" });
  account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  fake.db.matters.push({ id: MATTER, account_id: account.id, advocate_id: ADV });
});

test("upload: type allow-list, account-membership check, and the response never exposes storage_key", async () => {
  assert.equal((await upload("tok-alice", { name: "evil.exe", type: "application/x-msdownload", accountId: account.id })).status, 415);
  assert.equal((await upload("tok-bob", { name: "a.pdf", type: "application/pdf", accountId: account.id })).status, 403, "not a member of the account");

  const ok = await upload("tok-alice", { name: "lease.pdf", type: "application/pdf", accountId: account.id });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.virus_scan_status, "pending", "never claims a scan that did not happen");
  assert.equal(ok.body.storage_key, undefined, "storage key is not exposed");
  assert.equal(ok.body.kind, "Agreements");
});

test("upload: rejects a matterId that isn't on the given account", async () => {
  const res = await upload("tok-alice", { name: "x.pdf", type: "application/pdf", accountId: account.id, matterId: "99999999-9999-4999-8999-999999999999" });
  assert.equal(res.status, 404);
});

test("GET /documents/:id/download: 404 for an outsider, signed URL + audit log for the owner", async () => {
  const doc = (await upload("tok-alice", { name: "private.pdf", type: "application/pdf", accountId: account.id })).body;

  assert.equal((await call("GET", `/documents/${doc.id}/download`, { token: "tok-bob" })).status, 404);
  const dl = await call("GET", `/documents/${doc.id}/download`, { token: "tok-alice" });
  assert.equal(dl.status, 200);
  assert.match(dl.body.url, /^https:\/\/signed\.example\//);
  assert.ok(fake.db.audit_logs?.some((l) => l.action === "document_downloaded" && l.subject_id === doc.id));
});

test("share: owner-only, and only with an advocate the account actually works with", async () => {
  const doc = (await upload("tok-alice", { name: "share-me.pdf", type: "application/pdf", accountId: account.id })).body;

  const notOwner = await call("POST", `/documents/${doc.id}/share`, { token: "tok-bob", body: { advocateId: ADV, share: true } });
  assert.equal(notOwner.status, 404, "bob can't even see this document to attempt sharing it");

  const strangerAdvocate = await call("POST", `/documents/${doc.id}/share`, { token: "tok-alice", body: { advocateId: OTHER_ADV, share: true } });
  assert.equal(strangerAdvocate.status, 403, "alice's account has never worked with this advocate");

  const shared = await call("POST", `/documents/${doc.id}/share`, { token: "tok-alice", body: { advocateId: ADV, share: true } });
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.body.shared_with, [ADV]);

  // Now the advocate can read (but not re-share) it.
  const advDownload = await call("GET", `/documents/${doc.id}/download`, { token: "tok-adv" });
  assert.equal(advDownload.status, 200);
  const advTriesShare = await call("POST", `/documents/${doc.id}/share`, { token: "tok-adv", body: { advocateId: ADV, share: false } });
  assert.equal(advTriesShare.status, 403, "only the owner can change sharing");

  const unshared = await call("POST", `/documents/${doc.id}/share`, { token: "tok-alice", body: { advocateId: ADV, share: false } });
  assert.equal(unshared.status, 200);
  assert.deepEqual(unshared.body.shared_with, []);
  assert.equal((await call("GET", `/documents/${doc.id}/download`, { token: "tok-adv" })).status, 404, "revoked sharing removes the advocate's access immediately");
});

test("GET /documents: owned docs plus docs shared with the caller as an advocate", async () => {
  const doc = (await upload("tok-alice", { name: "list-me.pdf", type: "application/pdf", accountId: account.id })).body;
  await call("POST", `/documents/${doc.id}/share`, { token: "tok-alice", body: { advocateId: ADV, share: true } });

  const aliceList = await call("GET", "/documents", { token: "tok-alice" });
  assert.equal(aliceList.status, 200);
  assert.ok(aliceList.body.some((d) => d.id === doc.id && d.owned === true));

  const advList = await call("GET", "/documents", { token: "tok-adv" });
  const seen = advList.body.find((d) => d.id === doc.id);
  assert.ok(seen, "the advocate sees the document shared with them");
  assert.equal(seen.owned, false);
  assert.equal(seen.sharedWithMe, true);

  const bobList = await call("GET", "/documents", { token: "tok-bob" });
  assert.ok(!bobList.body.some((d) => d.id === doc.id), "bob has no relationship to this document");
});

test("a matter access grant scoped to 'documents' lets an outsider download without being able to share or delete", async () => {
  const doc = (await upload("tok-alice", { name: "grant-me.pdf", type: "application/pdf", accountId: account.id, matterId: MATTER })).body;
  // The grant's subject_id is carol's internal user id, not her auth id -- she was already
  // provisioned in the setup test, so her users row exists by now.
  const carolInternal = fake.db.users.find((u) => u.email === "carol@example.com");
  fake.db.matter_access_grants.push({ id: "grant-1", matter_id: MATTER, subject_id: carolInternal.id, subject_type: "user", scope: ["documents"], revoked_at: null });

  const dl = await call("GET", `/documents/${doc.id}/download`, { token: "tok-carol" });
  assert.equal(dl.status, 200);

  const shareAttempt = await call("POST", `/documents/${doc.id}/share`, { token: "tok-carol", body: { advocateId: ADV, share: true } });
  assert.equal(shareAttempt.status, 403, "a viewer is not the owner");

  const deleteAttempt = await call("DELETE", `/documents/${doc.id}`, { token: "tok-carol" });
  assert.equal(deleteAttempt.status, 403);
});

test("delete: the uploader or an account admin/owner can delete; another ordinary member cannot", async () => {
  const doc = (await upload("tok-alice", { name: "delete-me.pdf", type: "application/pdf", accountId: account.id })).body;
  const notOwner = await call("DELETE", `/documents/${doc.id}`, { token: "tok-bob" });
  assert.equal(notOwner.status, 404);

  const ok = await call("DELETE", `/documents/${doc.id}`, { token: "tok-alice" });
  assert.equal(ok.status, 204);
  assert.equal((await call("GET", `/documents/${doc.id}/download`, { token: "tok-alice" })).status, 404, "actually gone");
});

// A minimal fake clamd: reads one INSTREAM upload and answers with `verdict` (or drops the
// connection when verdict is null), so the real platform/clamav.ts protocol code is exercised.
async function withFakeClamd(verdict, fn) {
  const net = await import("node:net");
  const received = [];
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length >= 14 && buf.subarray(buf.length - 4).readUInt32BE(0) === 0) {
        received.push(buf.subarray(14, buf.length - 4).toString("utf8")); // skip "zINSTREAM\0" (10 bytes) + the first 4-byte length
        if (verdict === null) return socket.destroy();
        socket.end(`stream: ${verdict}\0`);
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = String(server.address().port);
  try {
    await fn(received);
  } finally {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    await new Promise((r) => server.close(r));
  }
}

test("upload + ClamAV: a clean verdict marks the document clean, and the file bytes were what got scanned", async () => {
  await withFakeClamd("OK", async (received) => {
    const res = await upload("tok-alice", { name: "scanned.pdf", type: "application/pdf", accountId: account.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.virus_scan_status, "clean");
    assert.deepEqual(received, ["hello contract"]);
  });
});

test("upload + ClamAV: an infected file is refused with 422, never stored, and audit-logged", async () => {
  const before = Object.keys(fake.storage).length;
  const docsBefore = fake.db.documents.length;
  await withFakeClamd("Eicar-Test-Signature FOUND", async () => {
    const res = await upload("tok-alice", { name: "eicar.pdf", type: "application/pdf", accountId: account.id });
    assert.equal(res.status, 422);
    assert.match(res.body.error, /flagged by our malware scanner/);
  });
  assert.equal(Object.keys(fake.storage).length, before, "nothing reached the bucket");
  assert.equal(fake.db.documents.length, docsBefore, "no document row");
  assert.ok(fake.db.audit_logs.some((l) => l.action === "document_upload_blocked_malware" && l.reason === "Eicar-Test-Signature" && l.outcome === "denied"));
});

test("upload + ClamAV: an unreachable scanner leaves the upload pending, not clean, and doesn't block it", async () => {
  await withFakeClamd(null, async () => {
    const res = await upload("tok-alice", { name: "unscanned.pdf", type: "application/pdf", accountId: account.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.virus_scan_status, "pending");
  });
});
