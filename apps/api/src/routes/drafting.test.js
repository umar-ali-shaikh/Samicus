// Route-level test: a Draft must never be downloadable while a required field is empty,
// and must never contain the raw UI placeholder hint (e.g. "Recipient Name") once filled.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../test/fakeSupabase.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";

const fake = createFakeSupabase({
  authUsers: { "tok-alice": ALICE },
  // Mirrors schema.sql's real column defaults (jsonb not null default '{}') — the fake
  // Supabase double doesn't read Postgres DEFAULTs, so these are declared explicitly.
  defaults: { document_drafts: { field_values: {}, selected_clause_ids: [], custom_clauses: [] } },
  embeds: {
    "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id),
    "document_drafts.template": (row, db) => db.doc_templates.find((t) => t.id === row.template_id),
  },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  tables: {
    doc_templates: [
      {
        id: TEMPLATE_ID,
        category: "notice",
        name: "Demand Notice",
        version: 1,
        base_sections: [{ key: "recipient", heading: "To", bodyTemplate: "To: {{recipientName}}" }],
        field_schema: [{ key: "recipientName", label: "Recipient name", placeholder: "Recipient Name", required: true }],
        retired_at: null,
      },
    ],
  },
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
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

test("a draft cannot be downloaded while a required field is empty, and renders no placeholder text once filled", async (t) => {
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

  // Download now succeeds (not asserting on actual DOCX bytes here, just that it's no
  // longer blocked by the missing-field guard).
  const res = await fetch(`${base}/drafts/${draftId}/download?format=docx`, { headers: { Authorization: "Bearer tok-alice" } });
  assert.equal(res.status, 200);
});
