// Route-level tests for the drafting domain: the original download-blocked-while-required-
// field-empty guard (ported from routes/drafting.test.js), IDOR protection (404 not 403, ids
// aren't probeable) which the legacy test never covered, and the advocate-review request/
// return round trip. The document-assembly engine (services/drafting.js) and DOCX/PDF renderer
// (services/draftRender.js) are the real modules, not mocked -- only Supabase is faked.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: {} };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Bob" }, app_metadata: {} };
const CAROL = { id: "auth-carol", email: "carol@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-carol": CAROL };

const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";
const ADVOCATE_ID = "22222222-2222-4222-8222-222222222222";

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  // Mirrors schema.sql's real column defaults -- the fake Supabase double doesn't read
  // Postgres DEFAULTs, so these are declared explicitly.
  defaults: {
    document_drafts: { field_values: {}, selected_clause_ids: [], custom_clauses: [], status: "draft", review_id: null, updated_at: "2026-01-01T00:00:00.000Z" },
    draft_reviews: { comments: [], status: "pending", submitted_at: "2026-01-01T00:00:00.000Z", returned_at: null },
  },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  embeds: {
    "document_drafts.template": (row: any, db: any) => db.doc_templates.find((t: any) => t.id === row.template_id) ?? null,
    "draft_reviews.draft": (row: any, db: any) => {
      const draft = db.document_drafts.find((d: any) => d.id === row.draft_id);
      if (!draft) return null;
      return { id: draft.id, template: db.doc_templates.find((t: any) => t.id === draft.template_id) ?? null };
    },
  },
  tables: {
    doc_templates: [
      {
        id: TEMPLATE_ID,
        category: "notice",
        name: "Demand Notice",
        version: 1,
        jurisdiction: null,
        blurb: null,
        pages: null,
        draft_fee: 0,
        review_fee: 1499,
        base_sections: [{ key: "recipient", heading: "To", bodyTemplate: "To: {{recipientName}}" }],
        field_schema: [{ key: "recipientName", label: "Recipient name", placeholder: "Recipient Name", required: true }],
        stamp_duty_note: null,
        retired_at: null,
      },
    ],
    advocates: [{ id: ADVOCATE_ID, user_id: "u-carol", verification_status: "verified" }],
  },
});
// Carol's users row must exist for provisionUser's auth_id lookup to find her as an
// already-provisioned advocate on first call (same precedent as modules/advocates/advocates.test.js).
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
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

test("a draft cannot be downloaded while a required field is empty, and renders no placeholder text once filled", async () => {
  const created = await call("POST", "/drafts", { token: "tok-alice", body: { templateId: TEMPLATE_ID } });
  assert.equal(created.status, 201);
  const draftId = created.body.id;

  const blockedDocx = await call("GET", `/drafts/${draftId}/download?format=docx`, { token: "tok-alice" });
  assert.equal(blockedDocx.status, 422);
  assert.match(blockedDocx.body.error, /Recipient name/);

  const preview = await call("POST", `/drafts/${draftId}/preview`, { token: "tok-alice" });
  assert.deepEqual(preview.body.missingRequiredFields, ["Recipient name"]);
  assert.ok(!JSON.stringify(preview.body.blocks).includes("Recipient Name"), "must never render the raw placeholder hint");
  assert.match(JSON.stringify(preview.body.blocks), /NOT FILLED IN/);

  const patched = await call("PATCH", `/drafts/${draftId}`, { token: "tok-alice", body: { fieldValues: { recipientName: "Acme Pvt Ltd" } } });
  assert.equal(patched.status, 200);

  const previewAfter = await call("POST", `/drafts/${draftId}/preview`, { token: "tok-alice" });
  assert.deepEqual(previewAfter.body.missingRequiredFields, []);
  assert.match(JSON.stringify(previewAfter.body.blocks), /Acme Pvt Ltd/);

  const res = await fetch(`${base}/drafts/${draftId}/download?format=docx`, { headers: { Authorization: "Bearer tok-alice" } });
  assert.equal(res.status, 200);
});

test("a draft belonging to another account 404s instead of 403 on every endpoint -- ids are not probeable", async () => {
  const created = await call("POST", "/drafts", { token: "tok-alice", body: { templateId: TEMPLATE_ID } });
  const draftId = created.body.id;

  assert.equal((await call("GET", `/drafts/${draftId}`, { token: "tok-bob" })).status, 404);
  assert.equal((await call("PATCH", `/drafts/${draftId}`, { token: "tok-bob", body: { fieldValues: { recipientName: "x" } } })).status, 404);
  assert.equal((await call("POST", `/drafts/${draftId}/preview`, { token: "tok-bob" })).status, 404);
  assert.equal((await call("GET", `/drafts/${draftId}/download?format=docx`, { token: "tok-bob" })).status, 404);
  assert.equal((await call("POST", `/drafts/${draftId}/reviews`, { token: "tok-bob", body: { advocateId: ADVOCATE_ID } })).status, 404);
});

test("requesting a review needs a verified advocate; a verified advocate can request, view and return it", async () => {
  const created = await call("POST", "/drafts", { token: "tok-alice", body: { templateId: TEMPLATE_ID } });
  const draftId = created.body.id;
  await call("PATCH", `/drafts/${draftId}`, { token: "tok-alice", body: { fieldValues: { recipientName: "Acme Pvt Ltd" } } });

  const unknownAdvocate = await call("POST", `/drafts/${draftId}/reviews`, { token: "tok-alice", body: { advocateId: "99999999-9999-4999-8999-999999999999" } });
  assert.equal(unknownAdvocate.status, 404);

  const requested = await call("POST", `/drafts/${draftId}/reviews`, { token: "tok-alice", body: { advocateId: ADVOCATE_ID } });
  assert.equal(requested.status, 201);
  assert.equal(requested.body.fee, 1499);
  const reviewId = requested.body.id;

  const draftAfterRequest = await call("GET", `/drafts/${draftId}`, { token: "tok-alice" });
  assert.equal(draftAfterRequest.body.status, "sent_for_review");

  // A non-advocate is gated out of the whole advocate surface, same requireRole("advocate") as the legacy route.
  assert.equal((await call("GET", "/advocate/draft-reviews", { token: "tok-alice" })).status, 403);

  const list = await call("GET", "/advocate/draft-reviews", { token: "tok-carol" });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, reviewId);

  const detail = await call("GET", `/advocate/draft-reviews/${reviewId}`, { token: "tok-carol" });
  assert.equal(detail.status, 200);
  assert.match(JSON.stringify(detail.body.draft.blocks), /Acme Pvt Ltd/);

  const returned = await call("POST", `/advocate/draft-reviews/${reviewId}/return`, { token: "tok-carol", body: { comments: [{ severity: "warn", body: "Consider adding a cure period." }] } });
  assert.equal(returned.status, 200);
  assert.equal(returned.body.status, "returned");

  const draftAfterReturn = await call("GET", `/drafts/${draftId}`, { token: "tok-alice" });
  assert.equal(draftAfterReturn.body.status, "reviewed");
});
