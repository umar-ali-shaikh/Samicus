// Interactive UI flows (auth, booking, urgent, drafting, research, assistant, messaging) in a
// real Chromium against a stubbed API + stubbed Supabase endpoints. Assertions also check the
// payloads the UI sends, so contract drift between client and server shows up here.
//   node frontend/e2e/flows.mjs   (after `npm run build` with fake VITE_SUPABASE_* values)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

const results = [];
async function flow(name, fn) {
  try { await fn(); results.push(`ok   ${name}`); } catch (err) { results.push(`FAIL ${name}\n       ${String(err.stack || err).split("\n").slice(0, 4).join("\n       ")}`); }
}

async function newPage({ session = true, api = {}, supabase = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (session) {
    const s = { access_token: "tok", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: { id: "auth-1", email: "x@example.com", email_confirmed_at: new Date().toISOString() } };
    await ctx.addInitScript((v) => localStorage.setItem("sb-fake-auth-token", JSON.stringify(v)), s);
  }
  const calls = [];
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : undefined;
    const key = `${req.method()} ${url.pathname.replace(/^\/api/, "")}`;
    calls.push({ key, body });
    const override = api[key] ?? Object.entries(api).find(([k]) => k.includes("*") && new RegExp(`^${k.replace(/\*/g, "[^/]+")}$`).test(key))?.[1];
    if (override !== undefined) {
      const out = typeof override === "function" ? override(body, calls) : override;
      if (out && out.__status) return route.fulfill({ status: out.__status, contentType: "application/json", body: JSON.stringify(out.body) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    }
    const data = handle(req.method(), url.pathname, personas.client, body);
    return route.fulfill({ status: data === undefined ? 404 : 200, contentType: "application/json", body: JSON.stringify(data === undefined ? { error: "not stubbed" } : data) });
  });
  const sbCalls = [];
  await ctx.route("**/fake.supabase.co/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    sbCalls.push({ method: req.method(), path: u.pathname, search: u.search, body: req.postData() });
    const h = supabase[`${req.method()} ${u.pathname}`];
    if (h) return route.fulfill({ status: h.status || 200, contentType: "application/json", body: JSON.stringify(h.body ?? {}) });
    if (u.pathname.endsWith("/authorize")) return route.fulfill({ status: 200, contentType: "text/html", body: "<html>google</html>" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, ctx, calls, sbCalls, errors };
}

const text = (page, t, timeout = 6000) => page.waitForFunction((x) => document.body.innerText.includes(x), t, { timeout });
const notText = (page, t, timeout = 6000) => page.waitForFunction((x) => !document.body.innerText.includes(x), t, { timeout });

await flow("signed out: login screen, Google OAuth starts PKCE redirect with the right provider", async () => {
  const { page, sbCalls } = await newPage({ session: false });
  await page.goto(base);
  await text(page, "Welcome back");
  await text(page, "Continue with Google");
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await page.waitForFunction(() => location.href.includes("/auth/v1/authorize"), null, { timeout: 6000 });
  const u = new URL(page.url());
  assert.equal(u.searchParams.get("provider"), "google");
  assert.ok(u.searchParams.get("code_challenge"), "PKCE challenge present");
  assert.ok(u.searchParams.get("redirect_to")?.startsWith(base));
  void sbCalls;
});

await flow("sign up with email → 'verify your email' screen; resend works", async () => {
  const { page, sbCalls } = await newPage({ session: false, supabase: {
    "POST /auth/v1/signup": { body: { id: "u1", email: "new@example.com", identities: [{ id: "i1" }], user_metadata: {} } },
    "POST /auth/v1/resend": { body: {} },
  } });
  await page.goto(base);
  await text(page, "Welcome back");
  await page.getByRole("link", { name: "Create an account" }).click();
  await text(page, "Create your account");
  await page.getByLabel("Full name").fill("Asha Verma");
  await page.getByLabel("Email").fill("new@example.com");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await text(page, "Verify your email");
  await text(page, "new@example.com");
  const signup = sbCalls.find((c) => c.path.endsWith("/auth/v1/signup"));
  assert.ok(signup, "signup called");
  const sent = JSON.parse(signup.body);
  assert.equal(sent.email, "new@example.com");
  assert.equal(sent.data.full_name, "Asha Verma", "name is passed as user metadata");
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await text(page, "Verification email sent");
  assert.ok(sbCalls.some((c) => c.path.endsWith("/auth/v1/resend")));
});

await flow("short password is rejected client-side before any request", async () => {
  const { page, sbCalls } = await newPage({ session: false });
  await page.goto(base);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Asha Verma");
  await page.getByLabel("Email").fill("a@b.co");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await text(page, "at least 8 characters");
  assert.equal(sbCalls.filter((c) => c.path.endsWith("/signup")).length, 0);
});

await flow("signed in but email unverified → verify screen; continues once the API accepts the session", async () => {
  let verified = false;
  const { page } = await newPage({ api: { "GET /me": () => (verified ? handle("GET", "/me", personas.client) : { __status: 403, body: { error: "verify", code: "EMAIL_NOT_VERIFIED", email: "x@example.com" } }) } });
  await page.goto(base);
  await text(page, "Verify your email");
  verified = true;
  await page.getByRole("button", { name: "I've verified my email" }).click();
  await text(page, "Hello, Meera");
});

await flow("expired API session (401) signs the user out to the login screen", async () => {
  const { page } = await newPage({ api: { "GET /me": { __status: 401, body: { error: "expired", code: "NOT_AUTHENTICATED" } } } });
  await page.goto(base);
  await text(page, "Welcome back");
});

await flow("booking wizard: intake → matches → slots → consent → consultation (payload checks)", async () => {
  const { page, calls } = await newPage({ api: {
    "POST /intake-requests": (b) => ({ id: IDS.intake, status: "searching", ...b }),
    [`GET /intake-requests/${IDS.intake}/matches`]: { weightsVersion: "x", matches: [{ id: "m1", advocate_id: IDS.adv, why_matched: "Matched because this advocate handles vendor recovery.", quoted_fee: 3200, advocate: { scheduled_fee: 3200, user: { full_name: "Rohan Iyer" } } }] },
    [`POST /intake-requests/${IDS.intake}/consent`]: { id: IDS.intake },
    "POST /consultations": (b) => ({ id: "c0ffee00-0000-4000-8000-000000000001", ...b }),
  } });
  await page.goto(`${base}/#home`);
  await text(page, "Hello, Meera");
  await page.getByPlaceholder(/landlord is refusing/).fill("My vendor has not paid ₹4 lakh for six months despite reminders.");
  await page.getByRole("button", { name: "Vendor won't pay / contract breach" }).click();
  await text(page, "Describe the issue");
  await text(page, "Contract & commercial recovery");
  const next = () => page.getByRole("button", { name: /^Continue$/ }).click();
  await next();                       // 1 → 2
  await page.getByText("Within 48 hours").click(); await next();   // 2 → 3
  await page.getByLabel("City").fill("Pune"); await next();        // 3 → 4
  await next();                       // 4 → 5 (video)
  await next();                       // 5 → 6 (creates the intake)
  await text(page, "Advocates matched to your issue");
  await text(page, "Matched because this advocate handles vendor recovery.");
  const intakeCall = calls.find((c) => c.key === "POST /intake-requests");
  assert.equal(intakeCall.body.urgency, "48h");
  assert.equal(intakeCall.body.situationId, IDS.situation);
  assert.equal(intakeCall.body.kind, "scheduled");
  assert.equal(intakeCall.body.city, "Pune");
  assert.equal(intakeCall.body.accountId, IDS.account);
  await page.getByRole("button", { name: /Rohan Iyer/ }).click(); await next(); // → 7
  await text(page, "Choose a date and slot");
  await page.locator("button", { hasText: /^[A-Z][a-z]{2}, \d/ }).first().click();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "10:00 (booked)" }).isDisabled();
  await next();                       // 7 → 8
  await text(page, "Transparent pricing");
  await text(page, "₹3,200");
  await text(page, "₹3,893"); // 3200 + 99 + round(18% of 3299)
  await next();                       // 8 → 9
  await text(page, "doesn't collect payments online");
  assert.equal(await page.getByRole("button", { name: "Confirm booking" }).isDisabled(), true, "needs consent first");
  await page.locator('input[type="checkbox"]').last().check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await text(page, "Your consultation is booked");
  const keys = calls.map((c) => c.key);
  assert.ok(keys.indexOf(`POST /intake-requests/${IDS.intake}/consent`) < keys.indexOf("POST /consultations"), "consent is recorded before booking");
  const booking = calls.find((c) => c.key === "POST /consultations").body;
  assert.equal(booking.advocateId, IDS.adv);
  assert.equal(booking.intakeId, IDS.intake);
  assert.match(booking.scheduledStart, /T0[34]:30:00\.000Z$/, "09:00 IST sent as UTC instant");
});

await flow("urgent help: safety screen → category → waits → advocate accepts → join call", async () => {
  let accepted = false;
  const CRIM = "00000000-0000-4000-8000-0000000000aa";
  const { page, calls } = await newPage({ api: {
    "GET /specialisations": [{ id: CRIM, name: "Criminal defence", advocateCount: 1 }, { id: IDS.area, name: "General advisory", advocateCount: 1 }],
    "POST /urgent-requests": { intake: { id: IDS.intake }, status: "advocate_reviewing", candidate: {} },
    [`POST /intake-requests/${IDS.intake}/consent`]: {},
    [`GET /intake-requests/${IDS.intake}`]: () => ({ intake: { id: IDS.intake, status: accepted ? "matched" : "advocate_reviewing" }, consultation: accepted ? { id: IDS.consult, mode: "phone", fee_total: 3500, paid_at: null, advocate: { id: IDS.adv, user: { full_name: "Rohan Iyer" } } } : null, matter: null }),
    [`POST /consultations/${IDS.consult}/room`]: { roomUrl: "https://meet.jit.si/Vidhira-abc", consultation: {} },
  } });
  await page.goto(`${base}/#home`);
  await page.getByRole("button", { name: "Get urgent help now" }).click();
  await text(page, "Is anyone in immediate danger?");
  await text(page, "Call 112 now");
  await page.getByRole("button", { name: /No immediate danger/ }).click();
  await page.getByRole("button", { name: "Arrest / search" }).click();
  assert.equal(await page.getByRole("button", { name: "Find an advocate now" }).isDisabled(), true, "consent required");
  await page.locator('input[type="checkbox"]').last().check();
  await page.getByRole("button", { name: "Find an advocate now" }).click();
  await text(page, "Waiting for an advocate to accept");
  const urgent = calls.find((c) => c.key === "POST /urgent-requests").body;
  assert.equal(urgent.routedPracticeAreaId, CRIM, "'Arrest / search' routes to Criminal defence");
  assert.equal(urgent.urgency, "today");
  accepted = true;
  await text(page, "Advocate matched", 9000);
  await text(page, "Online payment isn't enabled");
  await page.getByRole("button", { name: "Join call" }).click();
  await page.waitForSelector('iframe[src="https://meet.jit.si/Vidhira-abc"]');
});

await flow("talk now: requires consent + situation, then sends an instant request and computes matches", async () => {
  const { page, calls } = await newPage({ api: {
    "POST /intake-requests": (b) => ({ id: IDS.intake, ...b }),
    [`POST /intake-requests/${IDS.intake}/consent`]: {},
    [`GET /intake-requests/${IDS.intake}/matches`]: { matches: [{ id: "m1" }] },
    [`GET /intake-requests/${IDS.intake}`]: () => ({ intake: { id: IDS.intake, status: "searching" }, consultation: null, matter: null }),
  } });
  await page.goto(`${base}/#talknow`);
  await text(page, "Only the category and city are shared");
  const go = page.getByRole("button", { name: "Find an available advocate" });
  assert.equal(await go.isDisabled(), true);
  await page.getByLabel("What's going on?").fill("Landlord threatens to evict me tonight without notice.");
  await page.getByLabel("What kind of issue is it?").selectOption({ label: "Vendor won't pay / contract breach" });
  await page.getByRole("checkbox").check();
  await go.click();
  await text(page, "Waiting for an advocate to accept");
  const body = calls.find((c) => c.key === "POST /intake-requests").body;
  assert.equal(body.kind, "instant");
  assert.equal(body.urgency, "today");
  assert.ok(calls.some((c) => c.key.endsWith("/matches")), "matches computed so advocates are offered the request");
});

await flow("drafting: template → fields autosave → clause toggle → live preview → download", async () => {
  const { page, calls } = await newPage({ api: { "GET /drafts": [] } });
  await page.goto(`${base}/#draft`);
  await page.getByText("Rental Agreement").first().click();
  await text(page, "Landlord name");
  await page.getByLabel(/Landlord name/).fill("Asha Rao");
  await page.getByLabel(/Landlord name/).blur();
  await page.getByRole("button", { name: "Continue" }).click();
  await text(page, "Lock-in period");
  await page.getByText("Lock-in period").click();
  await text(page, "DRAFT · NOT EXECUTED");
  const patches = calls.filter((c) => c.key.startsWith("PATCH /drafts/"));
  assert.ok(patches.some((c) => c.body.fieldValues?.landlordName === "Asha Rao"), "field saved");
  assert.ok(patches.some((c) => c.body.selectedClauseIds?.includes(IDS.clause)), "clause saved");
  await page.waitForFunction(() => document.body.innerText.includes("This agreement is made between"));
  assert.ok(calls.some((c) => c.key.endsWith("/preview")), "preview requested");
});

await flow("research library: retrieve → answer → trail shows kept and discarded passages", async () => {
  const { page, calls } = await newPage();
  await page.goto(`${base}/#research`);
  await page.getByPlaceholder(/Ask a question of Indian statutes/).fill("Is a non compete after resignation enforceable?");
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await text(page, "RETRIEVAL TRAIL");
  await text(page, "1 of 2 kept");
  await text(page, "Below the 0.55 relevance floor");
  await text(page, "PASSAGES RETRIEVED (VERBATIM)");
  assert.deepEqual(calls.filter((c) => c.key === "POST /research/answer").map((c) => Object.keys(c.body)), [["retrievalId"]], "answer step takes a retrieval id, never a bare question");
});

await flow("AI assistant: header 'Ask Vidhira' hand-off asks the question and shows evidence provenance", async () => {
  const { page, calls } = await newPage();
  await page.goto(`${base}/#home`);
  await page.getByPlaceholder("Ask Vidhira a legal question…").fill("Can my landlord keep my deposit?");
  await page.getByPlaceholder("Ask Vidhira a legal question…").press("Enter");
  await text(page, "Per [1], a tenant may recover a deposit.");
  await text(page, "from the indexed knowledge base");
  const ask = calls.find((c) => c.key === "POST /legal-assistant/ask").body;
  assert.equal(ask.question, "Can my landlord keep my deposit?");
  assert.match(ask.sessionId, /^[0-9a-f-]{36}$/);

  // Regression: asking a SECOND question from the header while ALREADY on #legalassistant
  // (no tab change, so the screen never remounts) used to be silently dropped — the
  // hand-off was set but nothing ever re-read it after the initial mount.
  await page.getByPlaceholder("Ask Vidhira a legal question…").fill("What if the landlord deducted cleaning charges?");
  await page.getByPlaceholder("Ask Vidhira a legal question…").press("Enter");
  await text(page, "What if the landlord deducted cleaning charges?");
  assert.equal(calls.filter((c) => c.key === "POST /legal-assistant/ask").length, 2, "the second header question must reach the API, not be dropped");
});

await flow("sign out clears every app key from storage (shared-device hygiene)", async () => {
  const { page } = await newPage();
  await page.goto(`${base}/#home`);
  await text(page, "Hello, Meera");
  // Simulate leftover state from this session (account selection, a persisted assistant
  // chat session key) that must never survive into whoever uses this browser next.
  await page.evaluate(() => {
    localStorage.setItem("vidhira.account", "stale-account-id");
    localStorage.setItem("legalAssistant.sessionId.some-user", "stale-session-id");
    sessionStorage.setItem("whatever.else", "1");
  });
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await text(page, "Welcome back");
  const remaining = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  assert.equal(remaining.local, 0, "localStorage must be fully cleared on sign-out");
  assert.equal(remaining.session, 0, "sessionStorage must be fully cleared on sign-out");
});

await flow("case law search: empty search shows inline validation, and opening a result scrolls it into view", async () => {
  const { page } = await newPage();
  await page.goto(`${base}/#caselaw`);
  await text(page, "Case law search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await text(page, "Enter a search term");

  await page.getByPlaceholder(/breach of contract/).fill("deposit dispute");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await text(page, "X vs Y");
  await page.getByText("X vs Y").first().click();
  await text(page, "Full judgment text");
  // The opened judgment must be scrolled into view, not merely appended far below a long
  // results list with nothing to show it changed.
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll("div")].find((d) => d.textContent?.includes("Full judgment text"));
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight;
  }, null, { timeout: 6000 });
});

await flow("messages: send posts the trimmed body to the thread", async () => {
  const { page, calls } = await newPage();
  await page.goto(`${base}/#messages`);
  await text(page, "Please share the purchase order");
  await page.getByPlaceholder("Type a message…").fill("  Documents attached.  ");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 300));
  const sent = calls.find((c) => c.key.startsWith("POST /threads/") && c.key.endsWith("/messages"));
  assert.equal(sent.body.body, "Documents attached.");
});

await flow("matter: client sees fees and can't see advocate-only tools; tasks complete via API", async () => {
  const { page, calls } = await newPage();
  await page.goto(`${base}/#matters`);
  await text(page, "Contract & commercial recovery matter");
  await page.getByRole("button", { name: "Tasks & hearings" }).click();
  await text(page, "Upload purchase order");
  assert.equal(await page.getByText("Add a task").count(), 0, "advocate-only form hidden from clients");
  await page.getByLabel("Upload purchase order").click();
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(calls.some((c) => c.key.endsWith(`/tasks/00000000-0000-4000-8000-000000000002/complete`) && c.body.completed === true));
  await page.getByRole("button", { name: "Fees" }).click();
  await text(page, "Online payment isn't enabled");
  await text(page, "Fee proposal");
});

await flow("advocate dashboard: conflict check gates acceptance", async () => {
  const ctx = await newPage({ api: {
    "POST /advocate/requests/*/conflict-check": { status: "clear" },
  } });
  const { page } = ctx;
  // Use the advocate persona for /me
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(handle("GET", "/me", personas.advocate)) }));
  await page.goto(`${base}/#lawyer`);
  await text(page, "Incoming requests");
  await text(page, "Conflict check: pending");
  assert.equal(await page.getByRole("button", { name: "Accept request" }).isDisabled(), true);
});

await browser.close();
server.close();
console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
console.log(`\nAll ${results.length} flows passed.`);
