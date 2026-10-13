// Route-level tests for the pack-compliance domain: admin-only ruleset authoring (ported from
// routes/pack.js, which had no test file at all), the declaration/claim-rule check pipeline,
// the fail-blocks-approval rule, IDOR protection on scans (404 not 403), and the ruleset-version
// diff that flags a previously-approved scan for recheck.
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
  defaults: { pack_scans: { approved_by: null, approved_at: null, recheck_required: false, recheck_reason: null } },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  tables: { pack_rulesets: [], pack_scans: [], ruleset_diffs: [] },
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

const RULESET_V1 = {
  categoryId: "food_retail",
  categoryName: "Food & retail",
  declarations: [
    { key: "fssai_number", label: "FSSAI number", ruleRef: "FSS Act 2006 s.31", required: true, formatPattern: "^[0-9]{14}$" },
    { key: "net_weight", label: "Net weight", ruleRef: "LMPC Rules 2011", required: true },
  ],
  claimRules: [
    { pattern: "100% organic", verdict: "high_risk", ruleRef: "FSSAI organic claim guidance", substantiationRequired: true, saferPhrasing: "Made with organic ingredients", saferRationale: "Avoids an absolute claim that needs certification on file." },
    { pattern: "no added sugar", verdict: "defensible", ruleRef: "FSSAI claim guidance" },
  ],
};

test("only an admin can author a ruleset", async () => {
  const asAlice = await call("PUT", "/admin/pack-rulesets", { token: "tok-alice", body: RULESET_V1 });
  assert.equal(asAlice.status, 403);

  const asAdmin = await call("PUT", "/admin/pack-rulesets", { token: "tok-admin", body: RULESET_V1 });
  assert.equal(asAdmin.status, 201);
  assert.equal(asAdmin.body.version, 1);
});

test("GET /pack/categories lists the published ruleset", async () => {
  const res = await call("GET", "/pack/categories", { token: "tok-alice" });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].categoryId, "food_retail");
  assert.equal(res.body[0].currentVersion, 1);
});

let failingScanId: string;

test("a scan missing a required declaration and carrying a high-risk claim fails, and a failing scan cannot be approved", async () => {
  const res = await call("POST", "/pack/scans", {
    token: "tok-alice",
    body: { sku: "SKU-1", productName: "Organic Muesli", categoryId: "food_retail", declarations: { net_weight: "500g" }, claims: ["100% organic", "no added sugar"] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, "fail");
  const fssai = res.body.declaration_results.find((d: any) => d.key === "fssai_number");
  assert.equal(fssai.status, "non_compliant");
  const organicClaim = res.body.claim_results.find((c: any) => c.text === "100% organic");
  assert.equal(organicClaim.verdict, "high_risk");
  assert.equal(organicClaim.saferPhrasing, "Made with organic ingredients");
  failingScanId = res.body.id;

  const approve = await call("POST", `/pack/scans/${failingScanId}/approve`, { token: "tok-alice" });
  assert.equal(approve.status, 409);
});

test("a scan belonging to another account 404s instead of 403 -- ids are not probeable", async () => {
  assert.equal((await call("GET", `/pack/scans/${failingScanId}`, { token: "tok-bob" })).status, 404);
  assert.equal((await call("POST", `/pack/scans/${failingScanId}/approve`, { token: "tok-bob" })).status, 404);
});

let passingScanId: string;

test("fixing the declarations and dropping the risky claim passes the scan, which can then be approved", async () => {
  const res = await call("POST", "/pack/scans", {
    token: "tok-alice",
    body: { sku: "SKU-1", productName: "Organic Muesli", categoryId: "food_retail", declarations: { fssai_number: "12345678901234", net_weight: "500g" }, claims: ["no added sugar"] },
  });
  assert.equal(res.body.status, "pass");
  passingScanId = res.body.id;

  const approved = await call("POST", `/pack/scans/${passingScanId}/approve`, { token: "tok-alice" });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approved_by, "Alice Rao");
  assert.ok(approved.body.approved_at);
});

test("GET /pack/portfolio lists the caller's own scans only", async () => {
  const mine = await call("GET", "/pack/portfolio", { token: "tok-alice" });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 2);

  const bobs = await call("GET", "/pack/portfolio", { token: "tok-bob" });
  assert.equal(bobs.body.length, 0);
});

test("publishing a new ruleset version flags the approved scan for recheck and records a diff visible in /pack/drift", async () => {
  const v2 = { ...RULESET_V1, declarations: [{ ...RULESET_V1.declarations[0], formatPattern: "^[0-9]{14}X$" }, RULESET_V1.declarations[1]] };
  const published = await call("PUT", "/admin/pack-rulesets", { token: "tok-admin", body: v2 });
  assert.equal(published.status, 201);
  assert.equal(published.body.version, 2);

  const rechecked = await call("GET", `/pack/scans/${passingScanId}`, { token: "tok-alice" });
  assert.equal(rechecked.body.recheck_required, true);
  assert.match(rechecked.body.recheck_reason, /v2/);

  const drift = await call("GET", "/pack/drift", { token: "tok-alice" });
  assert.equal(drift.status, 200);
  assert.equal(drift.body.length, 1);
  assert.equal(drift.body[0].from_version, 1);
  assert.equal(drift.body[0].to_version, 2);
  assert.ok(drift.body[0].affectedProducts.some((p: any) => p.id === passingScanId));

  const bobsDrift = await call("GET", "/pack/drift", { token: "tok-bob" });
  assert.equal(bobsDrift.body[0].affectedProducts.length, 0, "bob never scanned anything, so no affected product of his can appear");
});
