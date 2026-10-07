// Dedicated unit tests for the shared authorization primitives in access.ts -- these are the
// project's core IDOR defences (see docs/architecture/00-inventory.md section 3), so they get
// their own direct coverage rather than only incidental coverage via route tests. This file is
// also the reusable template for Phase 3's per-domain IDOR suite: call the primitive as two
// different users and assert the non-owner is refused the same way an attacker probing a
// guessed/incremented id would be.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../test/fakeSupabase.js";

const fake = createFakeSupabase({
  unique: { account_members: [{ cols: ["account_id", "user_id"] }] },
});
mock.module("../config/db.js", { namedExports: { getSupabase: () => fake.client } });

const { HttpError, memberAccountIds, assertAccountMember, defaultAccountId, loadMatterForUser, requireSide } = await import("./access.js");

const OWNER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "22222222-2222-4222-8222-222222222222";
const ADVOCATE_USER = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const MATTER_ID = "55555555-5555-4555-8555-555555555555";
const ADVOCATE_ID = "66666666-6666-4666-8666-666666666666";

fake.db.accounts = [{ id: ACCOUNT_ID, display_name: "Owner Account", type: "individual" }];
fake.db.account_members = [{ id: "m1", account_id: ACCOUNT_ID, user_id: OWNER, role: "owner", accepted_at: "2026-01-01", created_at: "2026-01-01" }];
fake.db.advocates = [{ id: ADVOCATE_ID, user_id: ADVOCATE_USER }];
fake.db.matters = [{ id: MATTER_ID, account_id: ACCOUNT_ID, advocate_id: ADVOCATE_ID }];

test("memberAccountIds returns only accounts the user has an accepted membership in", async () => {
  assert.deepEqual(await memberAccountIds(OWNER), [ACCOUNT_ID]);
  assert.deepEqual(await memberAccountIds(OUTSIDER), []);
});

test("assertAccountMember allows the member and rejects a non-member with 403", async () => {
  const membership = await assertAccountMember(OWNER, ACCOUNT_ID);
  assert.equal(membership.role, "owner");

  await assert.rejects(() => assertAccountMember(OUTSIDER, ACCOUNT_ID), (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
    return true;
  });
});

test("assertAccountMember enforces the optional role allow-list", async () => {
  await assert.rejects(() => assertAccountMember(OWNER, ACCOUNT_ID, ["admin"]), (err) => {
    assert.equal(err.status, 403);
    return true;
  });
  await assertAccountMember(OWNER, ACCOUNT_ID, ["owner", "admin"]); // does not throw
});

test("assertAccountMember requires an accountId", async () => {
  await assert.rejects(() => assertAccountMember(OWNER, undefined), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test("defaultAccountId picks the caller's owned account", async () => {
  assert.equal(await defaultAccountId(OWNER), ACCOUNT_ID);
  assert.equal(await defaultAccountId(OUTSIDER), null);
});

test("loadMatterForUser: IDOR defence -- a non-member/non-engaged user gets 404, not 403, for someone else's matter id", async () => {
  const ctx = await loadMatterForUser({ id: OWNER }, MATTER_ID);
  assert.equal(ctx.side, "client");

  const advocateCtx = await loadMatterForUser({ id: ADVOCATE_USER }, MATTER_ID);
  assert.equal(advocateCtx.side, "advocate");

  // The actual IDOR probe: an unrelated user guesses/increments a real matter id.
  await assert.rejects(() => loadMatterForUser({ id: OUTSIDER }, MATTER_ID), (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 404, "must be 404 (not 403) so matter ids can't be distinguished from nonexistent ones by status code alone");
    return true;
  });
});

test("loadMatterForUser returns 404 for a matter id that does not exist at all (same status as the IDOR case)", async () => {
  await assert.rejects(() => loadMatterForUser({ id: OWNER }, "99999999-9999-4999-8999-999999999999"), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
});

test("requireSide allows the matching side and rejects the other with 403", async () => {
  const ctx = { side: "client" };
  requireSide(ctx, "client"); // does not throw
  assert.throws(() => requireSide(ctx, "advocate"), (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
    return true;
  });
});
