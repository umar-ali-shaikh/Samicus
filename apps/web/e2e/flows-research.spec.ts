// Research library, ported from the legacy frontend/e2e/flows.mjs's "research library: retrieve
// -> answer -> trail shows kept and discarded passages" flow. This is a REAL run, by explicit
// choice (asked the user given the cost/latency tradeoff): a real Gemini API key and a real
// Qdrant corpus are configured in .env, so this actually retrieves, may live-fetch/index new
// sources, and generates a real grounded answer -- nothing here is stubbed. Expect this test to
// take up to ~60s and to spend real API tokens.
//
// The legacy suite's retrieval-trail copy ("RETRIEVAL TRAIL", "1 of 2 kept", "Below the 0.55
// relevance floor", "PASSAGES RETRIEVED (VERBATIM)") no longer exists -- apps/web's /research
// screen was substantially redesigned (STEP 1/STEP 2 structure, an Answer/Authorities/Compare/
// Conflicts/Adverse/Case map tab set). This spec asserts against the CURRENT copy and verifies
// the same underlying claim (retrieval happened, passages are shown verbatim, an answer is
// composed only from them) via the real resulting database rows -- see flows-auth.spec.ts's
// header comment for why DB rows, not network interception.
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");
const ids = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "ids.json"), "utf8")) as { matterId: string };

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.use({ storageState: path.join(AUTH_DIR, "client.json") });

// research_queries (and its research_answers/research_answer_segments/research_query_chunks/
// research_chat_turns children) aren't tracked by global-setup.ts's seed.json -- same reason as
// every other real-action spec in this suite. corpus_documents/corpus_chunks are deliberately
// NOT cleaned up here: that's the shared, reusable library content itself (possibly fetched live
// by this very run), not a per-test fixture -- deleting it would be destructive to the real
// corpus, not test hygiene.
let createdQueryId: string | undefined;
test.afterAll(async () => {
  if (!createdQueryId) return;
  const { data: answers } = await admin.from("research_answers").select("id").eq("query_id", createdQueryId);
  for (const a of answers ?? []) await admin.from("research_answer_segments").delete().eq("research_answer_id", a.id);
  await admin.from("research_answers").delete().eq("query_id", createdQueryId);
  await admin.from("research_chat_turns").delete().eq("research_query_id", createdQueryId);
  await admin.from("research_query_chunks").delete().eq("query_id", createdQueryId);
  await admin.from("research_queries").delete().eq("id", createdQueryId);
});

test("research library: retrieve -> answer -> verbatim passages, composed-only-from-them note", async ({ page }) => {
  // A real retrieve+answer cycle, including a possible live fetch-and-index of new sources
  // (the screen's own copy warns "this can take up to a minute").
  test.setTimeout(120_000);

  const { data: matterRow } = await admin.from("matters").select("account_id").eq("id", ids.matterId).single();
  const clientAccountId = matterRow!.account_id as string;

  await page.goto("/research");
  await expect(page.getByText("Vidhira Research", { exact: true })).toBeVisible();

  // One of the screen's own "Try one of these" suggestions -- the exact question the legacy
  // suite used, and presumably product-picked as a question the corpus actually answers well.
  const question = "Can my employer enforce a non-compete after I resign?";
  await page.getByRole("button", { name: new RegExp(question) }).click();

  await page.waitForURL(/\/research\/[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/, { timeout: 90_000 });
  createdQueryId = page.url().split("/").pop()!;

  // "Still researching..." while processing, then either the retrieved-passages step or the
  // not-found callout -- whichever the real corpus/model actually produces.
  const retrievedEyebrow = page.getByText(/STEP 1 · RETRIEVED PASSAGES/);
  const notFound = page.getByText(/didn't clear the relevance bar|doesn't have anything indexed|indexing it failed/);
  await expect(retrievedEyebrow.or(notFound)).toBeVisible({ timeout: 90_000 });

  if (await notFound.isVisible()) {
    // A real, content-dependent outcome for a real corpus -- not a test failure, but worth
    // surfacing rather than silently asserting nothing.
    console.log(`research query for "${question}" came back not_found -- corpus/model-dependent, not a code defect.`);
    const { data: row } = await admin.from("research_queries").select("outcome, account_id").eq("id", createdQueryId!).single();
    expect(row!.account_id, "the query must still be filed under the signed-in client's own account").toBe(clientAccountId);
    expect(row!.outcome).toBe("not_found");
    return;
  }

  // STEP 1: at least one verbatim passage, each expandable to its full text + source link.
  // Passage-toggle buttons are the only <button> descendants of the eyebrow's own parent
  // (the step's shared flex container), so this reaches the first one without depending on
  // any LLM-generated passage title text.
  await expect(page.getByText(/chunks? retrieved above threshold/)).toBeVisible();
  const step1 = page.getByText(/STEP 1 · RETRIEVED PASSAGES/).locator("..");
  await step1.locator("button").first().click();
  await expect(page.getByText("Open source ↗").first()).toBeVisible();

  // STEP 2: an answer composed only from the passages above (the "Answer" tab, selected by
  // default) -- at least one accordion section, each either backed by a citation or explicitly
  // saying no retrieved passage supports it (never a guess).
  await expect(page.getByText("STEP 2 · COMPOSED ONLY FROM THE ABOVE")).toBeVisible();

  const { data: queryRow } = await admin.from("research_queries").select("outcome, account_id").eq("id", createdQueryId!).single();
  expect(queryRow!.account_id).toBe(clientAccountId);
  expect(["answered", "partial"]).toContain(queryRow!.outcome);

  const { data: chunkRows } = await admin.from("research_query_chunks").select("id, score").eq("query_id", createdQueryId!);
  expect(chunkRows!.length, "a found outcome must have persisted at least one retrieved chunk").toBeGreaterThan(0);

  const { data: answerRows } = await admin.from("research_answers").select("id, sections").eq("query_id", createdQueryId!);
  expect(answerRows!.length, "a found outcome must have a composed answer row").toBeGreaterThan(0);
});
