// config/env.ts's blank-means-unset rule: .env.example ships optional integrations as blank
// lines, and the docs say blank turns them off -- so a copied .env.example must boot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "./env.js";

const REQUIRED = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "service-role" };

test("blank optional values are treated as unset, not as invalid", () => {
  const res = parseEnv({ ...REQUIRED, QDRANT_URL: "", VIDEO_BASE_URL: "", CLAUDE_EFFORT: "", CLAMAV_PORT: "", RAG_MIN_SCORE: " " });
  assert.equal(res.success, true, JSON.stringify(!res.success && res.error.issues));
  assert.equal(res.data!.QDRANT_URL, undefined);
  assert.equal(res.data!.VIDEO_BASE_URL, "https://meet.jit.si", "falls back to the default");
  assert.equal(res.data!.CLAMAV_PORT, 3310, "not coerced to 0");
  assert.equal(res.data!.RAG_MIN_SCORE, 0.55);
});

test("a blank required value still fails loudly", () => {
  const res = parseEnv({ ...REQUIRED, SUPABASE_URL: "" });
  assert.equal(res.success, false);
});

test("a real but malformed value still fails", () => {
  assert.equal(parseEnv({ ...REQUIRED, QDRANT_URL: "not a url" }).success, false);
});
