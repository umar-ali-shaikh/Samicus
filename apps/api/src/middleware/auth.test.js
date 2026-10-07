// Dedicated unit tests for middleware/auth.ts's core auth decisions: missing/invalid token,
// unverified email, the one-time-provisioning round trip for a brand-new verified user, the
// zero-round-trip fast path for a returning user, and the role gate. platform/jwt.js is mocked
// (see test/mockAuth.js) since it verifies against a real JWKS endpoint that test fixtures
// can't produce a valid signature for.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../test/fakeSupabase.js";
import { mockJwtVerification } from "../test/mockAuth.js";

const VERIFIED_NEW = { id: "auth-new", email: "new@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "New Person" }, app_metadata: { provider: "email" } };
const UNVERIFIED = { id: "auth-unverified", email: "pending@example.com", email_confirmed_at: null, user_metadata: {}, app_metadata: { provider: "email" } };
const AUTH_USERS = { "tok-new": VERIFIED_NEW, "tok-unverified": UNVERIFIED };

const fake = createFakeSupabase({ authUsers: AUTH_USERS, unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] } });
mock.module("../config/db.js", { namedExports: { getSupabase: () => fake.client } });
mockJwtVerification(AUTH_USERS);

const { authenticate, requireAuth, requireRole, AUTH_ERRORS } = await import("./auth.js");

function mockReqRes(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, params: {}, body: {} };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { req, res };
}

// Middleware either calls next() or sends a response directly (e.g. a 401/403 short-circuit)
// -- never both -- so this must resolve on whichever happens first.
function runMiddleware(mw, req, res) {
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const result = originalJson(body);
      resolve();
      return result;
    };
    Promise.resolve(mw(req, res, (err) => (err ? reject(err) : resolve()))).catch(reject);
  });
}

test("requireAuth rejects a missing token with 401 NOT_AUTHENTICATED", async () => {
  const { req, res } = mockReqRes(null);
  await runMiddleware(requireAuth, req, res);
  assert.equal(res.statusCode, AUTH_ERRORS.missing.status);
  assert.equal(res.body.code, "NOT_AUTHENTICATED");
});

test("requireAuth rejects a token that fails JWT verification with 401", async () => {
  const { req, res } = mockReqRes("tok-does-not-exist");
  await runMiddleware(requireAuth, req, res);
  assert.equal(res.statusCode, AUTH_ERRORS.invalid.status);
  assert.equal(res.body.code, "NOT_AUTHENTICATED");
});

test("requireAuth rejects an unverified user with 403 EMAIL_NOT_VERIFIED and does not provision a row", async () => {
  const { req, res } = mockReqRes("tok-unverified");
  await runMiddleware(requireAuth, req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
  assert.equal(fake.db.users?.find((u) => u.auth_id === "auth-unverified"), undefined);
});

test("authenticate({allowUnverified:true}) lets an unverified user through with req.emailVerified=false", async () => {
  const { req, res } = mockReqRes("tok-unverified");
  await runMiddleware(authenticate({ allowUnverified: true }), req, res);
  assert.equal(res.statusCode, null, "must call next(), not respond");
  assert.equal(req.emailVerified, false);
  assert.equal(req.authUser.email, "pending@example.com");
});

test("requireAuth provisions a brand-new verified user on first call (the one-time round trip), then takes the fast path on the next call", async () => {
  const { req, res } = mockReqRes("tok-new");
  await runMiddleware(requireAuth, req, res);
  assert.equal(res.statusCode, null);
  assert.equal(req.user.email, "new@example.com");
  assert.equal(req.emailVerified, true);
  const createdId = req.user.id;

  // Second call: a users row now exists for this auth_id, so this must take the fast path
  // (no re-provisioning, same row returned) rather than erroring or duplicating the user.
  const { req: req2, res: res2 } = mockReqRes("tok-new");
  await runMiddleware(requireAuth, req2, res2);
  assert.equal(res2.statusCode, null);
  assert.equal(req2.user.id, createdId);
  assert.equal(fake.db.users.filter((u) => u.auth_id === "auth-new").length, 1, "must not create a duplicate row on the second call");
});

test("requireRole allows a matching role and rejects others with 403", () => {
  const allow = requireRole("admin", "founder");
  let called = false;
  allow({ user: { role: "admin" } }, {}, () => { called = true; });
  assert.equal(called, true);

  const { res } = mockReqRes(null);
  let nextCalled = false;
  requireRole("admin")({ user: { role: "client" } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
