// Messages, ported from the legacy frontend/e2e/flows.mjs's "messages: send posts the trimmed
// body to the thread" flow. Verified via the resulting messages DATABASE ROW, not network
// interception -- see flows-auth.spec.ts's header comment for why.
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");
const ids = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "ids.json"), "utf8")) as { threadId: string };

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.use({ storageState: path.join(AUTH_DIR, "client.json") });

// This test's own message isn't tracked by global-setup.ts's seed.json (global-setup.ts only
// knows about the one seed message it inserted itself), so it's cleaned up here to avoid
// blocking global-teardown.ts from deleting the shared message_threads row via FK violation.
let createdMessageId: string | undefined;
test.afterAll(async () => {
  if (!createdMessageId) return;
  await admin.from("messages").delete().eq("id", createdMessageId);
});

test("messages: send posts the trimmed body to the thread", async ({ page }) => {
  const testStart = new Date().toISOString();

  await page.goto(`/messages/${ids.threadId}`);
  // exact: the thread list beside the conversation also previews it, as "You: E2E smoke test message."
  await expect(page.getByText("E2E smoke test message.", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Type a message…").fill("  Documents attached.  ");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Documents attached.", { exact: true })).toBeVisible();

  const { data: rows } = await admin.from("messages").select("*").eq("thread_id", ids.threadId).gte("sent_at", testStart).order("sent_at", { ascending: false }).limit(1);
  const sent = rows![0];
  createdMessageId = sent.id as string;
  expect(sent.body, "leading/trailing whitespace must be trimmed before it reaches the row").toBe("Documents attached.");
});
