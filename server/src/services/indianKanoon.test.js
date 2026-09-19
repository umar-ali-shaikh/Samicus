import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  search,
  getDocument,
  getOriginalDocument,
  getFragment,
  getMetainfo,
  IndianKanoonAuthError,
  IndianKanoonApiError,
  __resetCacheForTests,
} from "./indianKanoon.js";

// All HTTP is mocked below — this suite never makes a real network call.
let originalToken;

before(() => {
  originalToken = process.env.IK_API_TOKEN;
  process.env.IK_API_TOKEN = "test-token";
});

after(() => {
  process.env.IK_API_TOKEN = originalToken;
});

beforeEach(() => {
  __resetCacheForTests();
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test("search() sends the right path/headers and sanitizes headline HTML", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    calls.push({ url, opts });
    return jsonResponse(200, {
      found: 1,
      docs: [{ tid: 123, title: "State v. X", headline: "<p>onload=<script>alert(1)</script>bail</p>", docsource: "Supreme Court", docsize: 10 }],
      categories: [],
    });
  });

  const result = await search("bail", { court: "supremecourt" }, 0);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.indiankanoon\.org\/search\/\?/);
  assert.match(calls[0].url, /formInput=bail\+doctypes%3Asupremecourt/);
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers.Authorization, "Token test-token");
  assert.equal(calls[0].opts.headers.Accept, "application/json");

  assert.equal(result.docs[0].headline.includes("<script"), false);
  assert.match(result.docs[0].headline, /bail/);
});

test("search() caches identical requests — fetch is only called once", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse(200, { found: 0, docs: [], categories: [] });
  });

  await search("cheque bounce", {}, 0);
  await search("cheque bounce", {}, 0);

  assert.equal(calls, 1);
});

test("getDocument() sanitizes the doc HTML and caps maxcites/maxcitedby at 50", async (t) => {
  let seenUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    seenUrl = url;
    return jsonResponse(200, { doc: "<p onclick=\"evil()\">judgment text</p>", title: "T", citeList: [], citedbyList: [] });
  });

  const result = await getDocument("999", 500, 500);

  assert.match(seenUrl, /maxcites=50/);
  assert.match(seenUrl, /maxcitedby=50/);
  assert.equal(result.doc.includes("onclick"), false);
  assert.match(result.doc, /judgment text/);
});

test("getOriginalDocument() and getMetainfo() hit the right paths", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    return jsonResponse(200, { doc: "<p>orig</p>" });
  });

  await getOriginalDocument("42");
  await getMetainfo("42");

  assert.equal(urls[0], "https://api.indiankanoon.org/origdoc/42/");
  assert.equal(urls[1], "https://api.indiankanoon.org/docmeta/42/");
});

test("getFragment() sends formInput and sanitizes returned headline", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(url, /\/docfragment\/7\/\?formInput=deposit/);
    return jsonResponse(200, { headline: "<b>deposit</b><script>bad()</script>" });
  });

  const result = await getFragment("7", "deposit");
  assert.equal(result.headline.includes("<script"), false);
  assert.match(result.headline, /deposit/);
});

test("403 throws IndianKanoonAuthError immediately, no retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse(403, { error: "bad token" });
  });

  await assert.rejects(() => search("x"), IndianKanoonAuthError);
  assert.equal(calls, 1);
});

test("missing IK_API_TOKEN throws IndianKanoonAuthError without calling fetch", async (t) => {
  const saved = process.env.IK_API_TOKEN;
  delete process.env.IK_API_TOKEN;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return jsonResponse(200, {}); });

  await assert.rejects(() => search("x"), IndianKanoonAuthError);
  assert.equal(calls, 0);

  process.env.IK_API_TOKEN = saved;
});

test("a 400 (bad request) throws IndianKanoonApiError immediately, no retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse(400, { error: "bad query" });
  });

  await assert.rejects(() => search("x"), IndianKanoonApiError);
  assert.equal(calls, 1);
});

test("a 500 retries up to 2 times, then throws IndianKanoonApiError", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse(500, { error: "server error" });
  });

  await assert.rejects(() => search("x"), IndianKanoonApiError);
  assert.equal(calls, 3); // 1 original attempt + 2 retries
});

test("a 500 that recovers on retry succeeds and stops retrying", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls < 2) return jsonResponse(500, { error: "server error" });
    return jsonResponse(200, { found: 0, docs: [], categories: [] });
  });

  const result = await search("x");
  assert.equal(calls, 2);
  assert.equal(result.found, 0);
});

test("a network error retries, then throws IndianKanoonApiError after exhausting retries", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  });

  await assert.rejects(() => search("x"), IndianKanoonApiError);
  assert.equal(calls, 3);
});
