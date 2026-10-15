// Case law search, ported from the legacy frontend/e2e/flows.mjs's "case law search: empty
// search shows inline validation, and opening a result scrolls it into view" flow.
//
// A real run, same spirit as flows-research.spec.ts/flows-assistant.spec.ts: .env has a real
// IK_API_TOKEN (Indian Kanoon's metered API), and this makes real search + document calls
// rather than stubbing anything. Unlike those two, this never touches an LLM ("Ask AI" is a
// separate button this spec never clicks, to keep cost down) and nothing here is persisted to
// the database -- /case-law/search and /case-law/:id are pure proxies -- so there's no row to
// clean up afterward.
import path from "node:path";
import { test, expect } from "@playwright/test";

const AUTH_DIR = path.join(__dirname, ".auth");

test.use({ storageState: path.join(AUTH_DIR, "client.json") });

test("case law search: empty search shows inline validation, and opening a result scrolls it into view", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("/case-law");
  await expect(page.getByRole("heading", { name: "Case law search" })).toBeVisible();

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/Enter a search term first/)).toBeVisible();

  await page.locator("#case-law-query").fill("breach of contract");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/results/)).toBeVisible({ timeout: 30_000 });

  // Each result's bold title is the only <div style="font-weight: 700 ..."> on the page once
  // results are showing (the form's own labels use the same weight, but on <label> elements) --
  // clicking it bubbles up to the result row's own onClick, same as clicking anywhere on the card.
  const firstTitle = page.locator('div[style*="font-weight: 700"]').first();
  await firstTitle.click();

  await expect(page.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 30_000 });

  // The opened judgment must be scrolled into view, not merely appended far below a long
  // results list with nothing to show it changed -- same check as the legacy suite's.
  await page.waitForFunction(
    () => {
      const closeBtn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Close");
      const panel = closeBtn?.closest("div")?.parentElement?.parentElement; // button -> header row -> Card -> docRef wrapper
      if (!panel) return false;
      const r = panel.getBoundingClientRect();
      return r.top >= -50 && r.top < window.innerHeight;
    },
    null,
    { timeout: 10_000 }
  );
});
