// AI Legal Assistant, ported from the legacy frontend/e2e/flows.mjs's "AI assistant: header 'Ask
// Vidhira' hand-off asks the question and shows evidence provenance" flow, including its second-
// question regression check. Also a real run (same choice as flows-research.spec.ts): a real
// Gemini API key is configured, so this makes real /legal-assistant/ask calls -- expect it to
// take a while and spend real API tokens.
//
// The legacy flow's own trigger -- a global header "Ask Vidhira" input that hands a question off
// to the assistant screen -- was never built in apps/web; AssistantClient.tsx is a self-contained
// chat page with its own input, nothing in the header. So this spec asks directly on /assistant
// instead of via a hand-off. The regression itself still applies and is still worth testing: the
// legacy bug was a second question, asked without the screen remounting, being silently dropped.
// Here that's a second question typed into the SAME mounted /assistant page without navigating
// away -- the same "does state correctly accumulate across turns in one mount" question, just
// reached through this app's real entry point instead of a page that was never built.
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.use({ storageState: path.join(AUTH_DIR, "client.json") });

// legal_assistant_sessions.user_id cascades on user delete, but legal_assistant_turns.session_id
// does not cascade on session delete -- so global-teardown.ts's user deletion would be blocked by
// this test's own leftover turns unless they're cleaned up first.
let createdSessionRowId: string | undefined;
test.afterAll(async () => {
  if (!createdSessionRowId) return;
  await admin.from("legal_assistant_turns").delete().eq("session_id", createdSessionRowId);
  await admin.from("legal_assistant_sessions").delete().eq("id", createdSessionRowId);
});

test("AI assistant: a real question gets a grounded answer with evidence provenance; a second question in the same session is not dropped", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/assistant");
  await expect(page.getByText("Vidhira — AI Legal Assistant")).toBeVisible();
  await expect(page.getByText("Not a substitute for a lawyer.")).toBeVisible();

  const input = page.getByPlaceholder(/Mujhe FIR ke baare mein/);
  const askBtn = page.getByRole("button", { name: "Ask" });
  await expect(askBtn).toBeDisabled();

  const q1 = "What are my rights if I am arrested?";
  await input.fill(q1);
  await askBtn.click();
  await expect(page.getByText(q1)).toBeVisible();
  // Evidence provenance line renders once an answer actually lands (Researching sources… until then)
  await expect(page.getByText(/from the indexed knowledge base|live Indian Kanoon source|trusted web source/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("This answer is written by AI.")).toBeVisible();

  // Regression: a second question, asked in the SAME mounted page (no navigation), must not be
  // silently dropped -- both turns must remain visible and the second must get its own answer.
  const q2 = "What does FIR stand for?";
  await input.fill(q2);
  await askBtn.click();
  await expect(page.getByText(q1), "the first turn must still be there, not replaced").toBeVisible();
  await expect(page.getByText(q2)).toBeVisible();
  await expect(page.getByText(/from the indexed knowledge base|live Indian Kanoon source|trusted web source/).nth(1), "the second question must get its own answer, not be dropped").toBeVisible({ timeout: 90_000 });

  const sessionId = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((k) => k.startsWith("legalAssistant.sessionId."));
    return key ? window.localStorage.getItem(key) : null;
  });
  expect(sessionId, "the client must persist a session id so a reload can rehydrate the conversation").toBeTruthy();

  const { data: sessionRow } = await admin.from("legal_assistant_sessions").select("id").eq("session_id", sessionId!).single();
  expect(sessionRow, "askAssistantAction must create a real session row for this client-generated id").toBeTruthy();
  createdSessionRowId = sessionRow!.id as string;

  const { data: turnRows } = await admin.from("legal_assistant_turns").select("question").eq("session_id", createdSessionRowId).order("created_at", { ascending: true });
  expect(turnRows, "both turns must be persisted, not just the first").toHaveLength(2);
  expect(turnRows![0]!.question).toBe(q1);
  expect(turnRows![1]!.question).toBe(q2);
});
