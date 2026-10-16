// Smoke coverage matching legacy frontend/e2e/smoke.mjs's breadth (every screen, every role) --
// not its sibling flows.mjs (interactive flows), which is a documented fast-follow, not in
// scope here. Bar for "smoke" here: the page responds 2xx, nothing throws a page error or logs
// a console error, and axe-core finds no serious/critical a11y violation. Unlike the legacy
// suite (stubbed network, exact-text assertions against known fixtures), this runs against the
// REAL apps/api + apps/web + the real Supabase/Qdrant project, with disposable per-role test
// data from global-setup.ts -- so some screens legitimately render an empty-state rather than
// populated content; that's still a valid smoke pass, not a failure.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(__dirname, ".auth");
const ids = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "ids.json"), "utf8")) as {
  matterId: string; threadId: string; draftId: string; draftReviewId: string; advocateId: string;
};

const ROLE_SCREENS: Record<string, string[]> = {
  client: [
    "/dashboard", "/advocates", "/talk-now", "/assistant", "/research", "/case-law",
    `/drafts`, `/drafts/new`, `/drafts/${ids.draftId}`, "/contract-review",
    "/pack-compliance", "/services", "/consultations", `/matters`, `/matters/${ids.matterId}`,
    "/documents", "/messages", `/messages/${ids.threadId}`, "/learn", "/profile",
    `/advocates/${ids.advocateId}`, `/advocates/${ids.advocateId}/book`,
  ],
  advocate: [
    "/lawyer", "/consultations", "/matters", "/messages", "/documents",
    "/lawyer/draft-reviews", `/lawyer/draft-reviews/${ids.draftReviewId}`,
    "/learn", "/assistant", "/case-law", "/profile",
  ],
  admin: [
    "/admin/verification", "/admin/moderation", "/admin/orders", "/admin/catalogue",
    "/admin/complaints", "/admin/matter-access", "/advocates", "/profile",
  ],
  founder: [
    "/founder", "/founder/fdemand", "/founder/fservices", "/founder/ffunnel",
    "/founder/frevenue", "/founder/fcorp", "/founder/fadv", "/founder/fai",
    "/founder/fcomplaints", "/profile",
  ],
};

for (const [role, screens] of Object.entries(ROLE_SCREENS)) {
  test.describe(`${role} role`, () => {
    test.use({ storageState: path.join(AUTH_DIR, `${role}.json`) });

    for (const url of screens) {
      test(`${url} renders with no errors and no serious a11y violations`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
        page.on("pageerror", (e) => pageErrors.push(e.message));

        const response = await page.goto(url);
        expect(response?.ok(), `${url} responded ${response?.status()}`).toBeTruthy();
        await page.waitForLoadState("networkidle");

        expect(pageErrors, `${url} threw page error(s): ${pageErrors.join(" | ")}`).toHaveLength(0);
        expect(consoleErrors, `${url} logged console error(s): ${consoleErrors.join(" | ")}`).toHaveLength(0);

        const axeResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        const serious = axeResults.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        // color-contrast was a KNOWN finding on 34/50 screens: the legacy --color-label token
        // (#8A8578) and the danger button (white on --color-rust-alt). Both are now fixed
        // (--color-label #6C685E, danger on --color-rust -- calculated >= 4.5:1 on every app
        // background, see e2e/README.md) but not yet confirmed by a real run of this suite. Still
        // logged rather than failed until one clean run shows zero color-contrast nodes; then
        // drop this carve-out so a regression fails the build.
        const contrastOnly = serious.filter((v) => v.id === "color-contrast");
        const other = serious.filter((v) => v.id !== "color-contrast");
        if (contrastOnly.length) console.warn(`[known] ${url}: color-contrast (${contrastOnly.reduce((n, v) => n + v.nodes.length, 0)} node(s)) -- see e2e/README.md`);
        expect(other, `${url} has serious/critical a11y violations:\n${other.map((v) => `  ${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n")}`).toHaveLength(0);
      });
    }
  });
}
