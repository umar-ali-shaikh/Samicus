// Route-level tests for the case-law domain: auth gate, the Indian-Kanoon-vs-OpenRouter error
// taxonomy (502 + specific message, not a generic 500), and the AI-answer not_found path.
// All outbound HTTP (Indian Kanoon, OpenRouter) is mocked — see services/indianKanoon.test.js
// and services/aiCaseLawAnswer.js for the lower-level pipeline's own test coverage.
import { test, mock, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";
import { __resetCacheForTests } from "../../services/indianKanoon.js";
import { __resetCacheForTests as resetAiAnswerCache } from "../../services/aiCaseLawAnswer.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const AUTH_USERS = { "tok-alice": ALICE };

const fake = createFakeSupabase({ authUsers: AUTH_USERS });
mock.module("../../config/db.js", { namedExports: { getSupabase: () => fake.client } });
mockJwtVerification(AUTH_USERS);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

// Only requests to Indian Kanoon's own API are faked — everything else (notably this test
// file's own calls into the local Express server) must delegate to the real fetch, same
// convention as modules/payments/payments.test.js's mockRazorpayFetch.
const realFetch = globalThis.fetch;
function mockIndianKanoonFetch(t: import("node:test").TestContext, body: unknown) {
  t.mock.method(globalThis, "fetch", async (url: string, opts?: RequestInit) => {
    if (String(url).includes("indiankanoon.org")) return jsonResponse(200, body);
    return realFetch(url as never, opts);
  });
}

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

beforeEach(async () => {
  process.env.IK_API_TOKEN = "ik-test";
  __resetCacheForTests();
  // GET /case-law/ai-answer shares aiCaseLawAnswer.js's own cache, keyed by
  // question+filters+topN -- reset it too so a repeated question across tests can't return a
  // stale cached answer instead of exercising this run's own mocked fetch.
  await resetAiAnswerCache();
});

async function call(path: string, token?: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("case-law routes require sign-in", async () => {
  const res = await call("/case-law/search?q=bail");
  assert.equal(res.status, 401);
});

test("GET /case-law/search sanitizes and returns Indian Kanoon results", async (t) => {
  mockIndianKanoonFetch(t, { found: 2, docs: [{ tid: 1, title: "State v. X", headline: "bail granted", docsource: "Supreme Court", docsize: 5 }], categories: [] });
  const res = await call("/case-law/search?q=bail", "tok-alice");
  assert.equal(res.status, 200);
  assert.equal(res.body.found, 2);
  assert.equal(res.body.docs[0].tid, 1);
});

test("GET /case-law/search requires a non-empty q", async () => {
  const res = await call("/case-law/search?q=", "tok-alice");
  assert.equal(res.status, 400);
});

test("a missing Indian Kanoon token surfaces as 502 with a specific message, not a generic 500", async () => {
  delete process.env.IK_API_TOKEN;
  const res = await call("/case-law/search?q=bail", "tok-alice");
  assert.equal(res.status, 502);
  assert.match(res.body.error, /invalid or missing API token/);
});

test("GET /case-law/ai-answer returns not_found when Indian Kanoon has nothing", async (t) => {
  mockIndianKanoonFetch(t, { found: 0, docs: [], categories: [] });
  const res = await call("/case-law/ai-answer?q=an+extremely+obscure+matter", "tok-alice");
  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, "not_found");
});

test("GET /case-law/:docid returns the full judgment", async (t) => {
  mockIndianKanoonFetch(t, { doc: "<p>judgment text</p>", title: "State v. X", citeList: [], citedbyList: [] });
  const res = await call("/case-law/123", "tok-alice");
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "State v. X");
});
