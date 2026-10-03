// UI smoke test: renders every screen for every role in a real Chromium against a stubbed
// API + stubbed Supabase session, and fails on any uncaught error, console error or missing
// content. Run (after `npm run build`): node frontend/e2e/smoke.mjs
//   needs: playwright (npm i -D playwright, or a global install) + a Chromium binary.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { handle, personas, IDS } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", process.env.E2E_DIST || "dist-e2e");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const file = path.join(dist, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(target)] || "text/html" });
  fs.createReadStream(target).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const SCREENS = {
  client: ["home", "find", "talknow", "legalassistant", "research", "caselaw", "draft", "review", "pack", "services", "consultations", "matters", `matters/${IDS.matter}`, "documents", "messages", "learn", "profile"],
  advocate: ["lawyer", "consultations", "matters", "messages", "documents", "draftreviews", "learn", "legalassistant", "caselaw", "profile"],
  admin: ["admin", "moderation", "orders", "catalogue", "complaints", "find", "profile"],
  founder: ["founder", "fdemand", "fservices", "ffunnel", "frevenue", "fcorp", "fadv", "fai", "fcomplaints", "profile"],
};
const EXPECT = { // text that proves the screen rendered real data, not just chrome
  home: "Hello, Meera", find: "Rohan Iyer", talknow: "Talk now", legalassistant: "AI Legal Assistant", research: "Research library", caselaw: "Case law search", draft: "Rental Agreement", review: "Contract review",
  pack: "Pack compliance", services: "Legal notice drafting", consultations: "Rohan Iyer", matters: "Contract & commercial recovery matter", documents: "lease-agreement.pdf", messages: "Please share the purchase order", learn: "Your rights on arrest",
  profile: "Your details", lawyer: "Incoming requests", draftreviews: "Rental Agreement", admin: "Anil Kumar", moderation: "What is bail?", orders: "Legal notice drafting", catalogue: "Fixed-fee service catalogue", complaints: "Late deliverable",
  founder: "4 new requests", fdemand: "Daily requests", fservices: "AI legal assistant", ffunnel: "Registered users", frevenue: "Gross transaction value", fcorp: "Verdanta Foods", fadv: "Rohan Iyer", fai: "Legal knowledge gaps", fcomplaints: "Late deliverable",
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const failures = [];
const missing = new Set();

for (const [role, tabs] of Object.entries(SCREENS)) {
  const persona = personas[role];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const session = { access_token: "tok", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: { id: "auth-1", email: "x@example.com", email_confirmed_at: new Date().toISOString() } };
  await ctx.addInitScript((s) => localStorage.setItem("sb-fake-auth-token", JSON.stringify(s)), session);
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : undefined;
    const data = handle(req.method(), url.pathname, persona, body);
    if (data === undefined) { missing.add(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not stubbed" }) }); }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await ctx.route("**/fake.supabase.co/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|not stubbed|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });

  for (const tab of tabs) {
    errors.length = 0;
    // Pack compliance is only offered on business accounts, so switch the active account for it.
    const accountFor = tab === "pack" ? IDS.bizAccount : IDS.account;
    await page.goto(`${base}/?blank`);
    await page.evaluate((id) => localStorage.setItem("samicus.account", id), accountFor);
    await page.goto(`${base}/?tab=${encodeURIComponent(tab)}#${tab}`); // new query string → full navigation
    const key = tab.split("/")[0];
    const expected = EXPECT[key];
    try {
      await page.waitForFunction((t) => document.body.innerText.includes(t), expected, { timeout: 10000 });
    } catch {
      failures.push(`[${role}] #${tab}: expected text "${expected}" not rendered. Body: ${(await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, " ")}`);
    }
    if (errors.length) failures.push(`[${role}] #${tab}: ${errors.join(" | ")}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${role}-${key}.png` });
  }
  await ctx.close();
}

await browser.close();
server.close();
if (missing.size) console.log("Unstubbed endpoints hit:\n  " + [...missing].join("\n  "));
if (failures.length) { console.error(`\nFAILED (${failures.length}):\n` + failures.join("\n")); process.exit(1); }
console.log(`OK — rendered ${Object.values(SCREENS).flat().length} screens across ${Object.keys(SCREENS).length} roles with no errors.`);
