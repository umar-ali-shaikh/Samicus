// Route-level tests for the contract-review domain: the "every identified clause gets a
// finding row, red flags always win" rule ported from routes/contractReview.js, the missing-
// baseline-template 400, and IDOR protection (404 not 403) the legacy route never had a test
// for. Only the embedding/Qdrant/LLM-touching pipeline pieces (matchBaselineClauses, ragEnabled)
// are mocked -- detectRedFlags and judgeClauses run for real: with zero baseline matches,
// judgeClauses's own early return means no network call ever happens, so this stays fast and
// deterministic while still exercising the real "unmatched + red-flagged" wiring end to end.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: {} };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Bob" }, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB };

const DOC_ID = "44444444-4444-4444-8444-444444444444";
const ALICE_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";

// Only ragEnabled is overridden; the other exports are stubbed (never called by this test)
// purely so that app.js's OTHER routers -- which import the real rag/ingest.js for their own
// unrelated needs (e.g. research's service.ts) -- don't fail to resolve a missing export when
// createApp() wires up every router in the same process.
mock.module("../../services/rag/ingest.js", {
  namedExports: {
    ragEnabled: () => true,
    PAYLOAD_INDEXES: ["source", "document_id", "para_class"],
    embedAndStore: async () => {
      throw new Error("not stubbed for this test");
    },
    ingestIndianKanoonDoc: async () => {
      throw new Error("not stubbed for this test");
    },
    ingestWebDoc: async () => {
      throw new Error("not stubbed for this test");
    },
    reindexPending: async () => {
      throw new Error("not stubbed for this test");
    },
  },
});
mock.module("../../services/rag/clauses.js", { namedExports: { matchBaselineClauses: async (segments: string[]) => segments.map(() => null) } });

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  storage: {
    "lease-key": Buffer.from(
      "1. Rent\n" +
        "The Tenant shall pay rent of Rs. 25,000 per month on or before the fifth day of every month by bank transfer to the Landlord's designated account, failing which a late fee of Rs. 500 per day shall apply.\n\n" +
        "2. Entry\n" +
        "The Landlord may enter the premises at any time without prior notice to the Tenant for the purposes of inspection, repair or showing the property to prospective tenants or buyers.",
    ),
  },
  unique: { users: [{ cols: ["auth_id"] }], accounts: [{ cols: ["display_name"] }] },
  embeds: {
    "account_members.account": (row: any, db: any) => db.accounts.find((a: any) => a.id === row.account_id),
    "contract_reviews.document": (row: any, db: any) => db.documents.find((d: any) => d.id === row.document_id) ?? null,
    "contract_reviews.findings": (row: any, db: any) =>
      db.contract_review_findings
        .filter((f: any) => f.contract_review_id === row.id)
        .map((f: any) => ({ ...f, library_entry: f.library_entry_id ? (db.clause_library.find((c: any) => c.id === f.library_entry_id) ?? null) : null })),
  },
  defaults: { accounts: { seat_limit: 1 }, contract_review_findings: { authority_citation: null, similarity: null } },
  tables: {
    doc_templates: [{ id: "tpl-1", category: "Agreements", retired_at: null }],
    documents: [
      {
        id: DOC_ID,
        account_id: ALICE_ACCOUNT_ID,
        matter_id: null,
        filename: "lease.txt",
        mime: "text/plain",
        size_bytes: 40,
        kind: "Agreements",
        shared_with: [],
        virus_scan_status: "pending",
        storage_key: "lease-key",
        uploaded_by: "u-alice",
      },
    ],
    clause_library: [],
    contract_review_findings: [],
  },
});
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

test("setup: provision alice, re-key her documents/accounts to her real provisioned account", async () => {
  await call("GET", "/me", { token: "tok-alice" });
  const accounts = await call("GET", "/accounts", { token: "tok-alice" });
  const realAccountId = accounts.body[0].id;
  fake.db.documents[0]!.account_id = realAccountId;
  (fake.db as any).__aliceAccountId = realAccountId;
  await call("GET", "/me", { token: "tok-bob" });
});

test("POST /contract-reviews 400s for a contract type with no baseline template", async () => {
  const res = await call("POST", "/contract-reviews", { token: "tok-alice", body: { documentId: DOC_ID, contractType: "NoSuchCategory" } });
  assert.equal(res.status, 400);
});

test("every identified clause gets a finding row; a red-flagged clause always wins even with no baseline match", async () => {
  const created = await call("POST", "/contract-reviews", {
    token: "tok-alice",
    body: { documentId: DOC_ID, contractType: "Agreements", counterpartyName: "Acme Pvt Ltd" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.clauses_identified, created.body.findings.length, "every identified clause must get a finding row");
  assert.ok(created.body.findings.every((f: any) => f.favors === null || f.favors === "counterparty"), "no baseline matches, so only red-flag findings can carry a favors verdict");
  assert.match(created.body.notes, /0 of \d+ clauses were compared/);

  const fetched = await call("GET", `/contract-reviews/${created.body.id}`, { token: "tok-alice" });
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.findings, created.body.findings);

  const list = await call("GET", "/contract-reviews", { token: "tok-alice" });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].document.filename, "lease.txt");
});

test("a review belonging to another account 404s instead of 403 -- ids are not probeable", async () => {
  const created = await call("POST", "/contract-reviews", { token: "tok-alice", body: { documentId: DOC_ID, contractType: "Agreements" } });
  const id = created.body.id;

  assert.equal((await call("GET", `/contract-reviews/${id}`, { token: "tok-bob" })).status, 404);
  const exportRes = await fetch(`${base}/contract-reviews/${id}/export`, { headers: { Authorization: "Bearer tok-bob" } });
  assert.equal(exportRes.status, 404);
});

test("the negotiation-note export is a real DOCX for the review's owner", async () => {
  const created = await call("POST", "/contract-reviews", { token: "tok-alice", body: { documentId: DOC_ID, contractType: "Agreements" } });
  const res = await fetch(`${base}/contract-reviews/${created.body.id}/export`, { headers: { Authorization: "Bearer tok-alice" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0);
});
