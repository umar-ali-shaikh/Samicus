// Drafting, ported from the legacy frontend/e2e/flows.mjs's "drafting: template -> fields
// autosave -> clause toggle -> live preview -> download" flow. Payloads are checked via the
// resulting document_drafts DATABASE ROW (not network interception -- see flows-auth.spec.ts's
// header comment for why), except the download itself, which the legacy flow's own title
// promised but its body never actually exercised (awkward to stub a binary file response
// against a fake backend). Against the real backend this suite runs on, there's nothing
// stopping an actual download assertion, so this version adds one.
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

// This test's own draft isn't tracked by global-setup.ts's seed.json (same reason as the
// booking/talk-now specs' intake rows), so it must clean itself up or it blocks teardown from
// deleting the shared client account via FK violation.
let createdDraftId: string | undefined;
test.afterAll(async () => {
  if (!createdDraftId) return;
  await admin.from("document_drafts").delete().eq("id", createdDraftId);
});

test("drafting: template -> fields autosave -> clause toggle -> live preview -> download", async ({ page }) => {
  // Real DOCX rendering (services/documentRender or similar) takes ~9s against this backend --
  // nothing is stubbed here, so the default 30s budget is too tight once added to everything
  // else this flow does first.
  test.setTimeout(60_000);

  const { data: template } = await admin.from("doc_templates").select("id").eq("name", "Rental Agreement").single();
  const { data: lockInClause } = await admin.from("clause_library").select("id").eq("template_id", template!.id).eq("title", "Lock-in period — 6 months").single();

  await page.goto("/drafts/new");
  await page.getByText("Rental Agreement").first().click();
  await page.waitForURL(/\/drafts\/[0-9a-f-]{36}$/);
  createdDraftId = page.url().split("/").pop()!;

  // Step 1: required fields autosave onBlur; Continue is gated on all three being filled
  await expect(page.getByLabel(/Landlord name/)).toBeVisible();
  const continueBtn = page.getByRole("button", { name: "Continue" });
  await expect(continueBtn).toBeDisabled();

  await page.getByLabel(/Landlord name/).fill("Asha Rao");
  await page.getByLabel(/Landlord name/).blur();
  await page.getByLabel(/Tenant name/).fill("Vikram Singh");
  await page.getByLabel(/Tenant name/).blur();
  await page.getByLabel(/Property address/).fill("12 MG Road, Bengaluru");
  await page.getByLabel(/Property address/).blur();
  await expect(continueBtn).toBeEnabled();

  await expect.poll(async () => {
    const { data } = await admin.from("document_drafts").select("field_values").eq("id", createdDraftId!).single();
    return data?.field_values;
  }, { timeout: 15_000 }).toMatchObject({ landlordName: "Asha Rao", tenantName: "Vikram Singh", propertyAddress: "12 MG Road, Bengaluru" });

  await continueBtn.click();

  // Step 2: clicking a clause card toggles it and autosaves immediately (no blur needed)
  await expect(page.getByText("Lock-in period")).toBeVisible();
  await page.getByText("Lock-in period").click();
  await expect.poll(async () => {
    const { data } = await admin.from("document_drafts").select("selected_clause_ids").eq("id", createdDraftId!).single();
    return data?.selected_clause_ids as string[] | undefined;
  }, { timeout: 15_000 }).toContain(lockInClause!.id);

  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: the live preview panel assembles the template with the fields just entered --
  // it's rendered alongside every step, but only now does the wizard's own copy promise it
  await expect(page.getByText("DRAFT · NOT EXECUTED")).toBeVisible();
  await expect(page.getByText(/This agreement is made between/)).toBeVisible();

  // Download: a real DOCX streamed through the BFF proxy route, not a stub
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download DOCX" }).click()]);
  expect(download.suggestedFilename()).toBe("Rental-Agreement-draft.docx");
  const downloadPath = await download.path();
  expect(downloadPath, "the download must actually complete, not fail silently").toBeTruthy();
  expect(fs.statSync(downloadPath!).size, "the downloaded DOCX must contain real bytes").toBeGreaterThan(0);

  const { data: draftAfter } = await admin.from("document_drafts").select("status").eq("id", createdDraftId!).single();
  expect(draftAfter!.status, "a successful download marks a still-draft document as rendered").toBe("rendered");
});
