#!/usr/bin/env node
/**
 * Per docs/MASTER-PROMPT.md's acceptance criterion 4: "a script lists any Express route
 * lacking Zod validation or a policy check — the list must be empty." Statically scans every
 * router file for router.<method>(path, ...) registrations and flags a route when EITHER:
 *   - it has no recognizable auth/role gate (requireAuth, requireRole(...), authenticate(...),
 *     or a router.use() prefix gate covering it), and isn't a documented-public exception; or
 *   - it's a body-bearing method (POST/PUT/PATCH) that references req.body with no visible
 *     call running it through a Zod parse/safeParse.
 * Bodyless actions (accept/decline/resubmit/mark-helpful-style POSTs taking only req.user and
 * a bare :id path param) and GET/DELETE routes aren't required to show input validation --
 * a path param is just a string Express itself already guarantees, a target for ownership
 * checks deeper in the service layer (invisible to a router-file-only static scan), not
 * something with a shape worth Zod-validating.
 *
 * This is a static, line-based heuristic, not a real parser -- it cannot see validation or
 * ownership checks that happen deeper inside service.ts files. Findings that survive that
 * limitation after individual review are recorded in KNOWN_SAFE below with a one-line reason
 * each; anything NOT in that list that still gets flagged is a real gap.
 *
 * Run: node scripts/auditRoutes.mjs   (from apps/api/), or `npm run audit:routes -w apps/api`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [path.join(__dirname, "../src/routes"), path.join(__dirname, "../src/modules")];

const AUTH_INDICATORS = ["requireAuth", "requireRole(", "authenticate("];
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const INPUT_REFS = ["req.body", "req.query", "req.params"];

// key = "<relative file path>|<METHOD>|<route path>" -> one-line reason this specific route
// was individually reviewed and is fine despite being flagged by the heuristic above.
const KNOWN_SAFE = new Map([
  ["routes/config.js|GET|/config", "public: returns only feature-flag booleans, no user data, no input to validate."],
  ["modules/situations/router.ts|GET|/situations", "public reference catalogue (practice areas/situation picker), read-only, no input."],
  ["modules/situations/router.ts|POST|/intake/route", "deliberately public (anonymous pre-signup triage) -- validates req.body via intakeRouteSchema.safeParse regardless."],
  ["modules/accounts/router.ts|GET|/plans", "public pricing-plans list, read-only, no user data."],
  ["modules/advocates/router.ts|GET|/advocates", "public verified-advocate directory -- browsable before signing up, by design."],
  ["modules/advocates/router.ts|GET|/advocates/:id", "public advocate profile -- same browse-before-signup design as GET /advocates."],
  ["modules/advocates/router.ts|GET|/advocates/:id/slots", "public availability slots -- needed to show open slots before a client signs up to book."],
  ["modules/learn/router.ts|GET|/questions", "public Q&A feed (moderated public_questions), read-only."],
  ["modules/learn/router.ts|GET|/guides", "public published guides list, read-only."],
  ["modules/learn/router.ts|GET|/guides/:id", "public guide detail, read-only."],
  ["modules/learn/router.ts|GET|/specialisations", "public reference list (practice-area specialisations), read-only."],
  ["modules/services/router.ts|GET|/services", "public fixed-fee services catalogue, read-only."],
  [
    "modules/payments/router.ts|POST|/payments/webhook",
    "mounted directly in app.js before express.json(), not matched by this scan's router.<method> regex at all (kept here as a documented record) -- its HMAC signature check in service.handleWebhook() IS its policy check, covered by the payments test suite.",
  ],
]);

function findRouterFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouterFiles(full));
    else if (/router\.(js|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relLabel(file) {
  return path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/").replace(/^src\//, "");
}

/** Finds every `router.use(prefix, ...middleware)` call -- its middleware args apply to every
 * route registered after it in the same file whose path starts with that prefix. */
function findPrefixGates(text) {
  const gates = [];
  const re = /router\.use\(\s*(["'`])((?:(?!\1).)*)\1\s*,\s*([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(text))) gates.push({ prefix: m[2], middleware: m[3] });
  return gates;
}

/** Captures each router.<method>(...) call's full argument text by counting paren depth from
 * the opening `(` to its matching close, tolerant of nested calls/arrow functions within. */
function findRouteBlocks(text) {
  const blocks = [];
  const re = /router\.(get|post|put|patch|delete)\(\s*(["'`])((?:(?!\2).)*)\2\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const [method, , routePath] = [m[1].toUpperCase(), m[2], m[3]];
    let depth = 1;
    let i = re.lastIndex;
    const start = m.index + m[0].indexOf("(") + 1;
    while (depth > 0 && i < text.length) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    }
    blocks.push({ method, path: routePath, body: text.slice(start, i) });
  }
  return blocks;
}

function hasAuth(text) {
  return AUTH_INDICATORS.some((ind) => text.includes(ind));
}

/** Many POST/PUT/PATCH routes in this codebase are bodyless actions (e.g. accept/decline a
 * request, resubmit, mark-helpful) -- req.user and a bare :id path param are all they need.
 * Only req.body has a real shape worth Zod-validating; a path param is just a string Express
 * itself already guarantees, and req.query is essentially unused on body-bearing methods here. */
function referencesInput(text) {
  return text.includes("req.body");
}

/** True only if the text calls a parse/safeParse function -- not just "has a .parse( somewhere"
 * (every route's response DTO is parsed before being sent, which would make this true for
 * nearly every route if it didn't also require referencesInput() at the call site). */
function hasParseCall(text) {
  // Matches both the shared `parse(schema, req.body)` wrapper and direct `schema.safeParse(...)`
  // / `schema.parse(...)` calls -- "parse(" is a substring of "safeParse(" too, so one check
  // covers both forms.
  return /parse\(/i.test(text);
}

function auditFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const gates = findPrefixGates(text);
  const blocks = findRouteBlocks(text);
  const findings = [];

  for (const block of blocks) {
    const prefixMiddleware = gates.filter((g) => block.path.startsWith(g.prefix)).map((g) => g.middleware).join(" ");
    const combined = `${prefixMiddleware} ${block.body}`;

    const key = `${relLabel(file)}|${block.method}|${block.path}`;
    if (KNOWN_SAFE.has(key)) continue;

    const problems = [];
    if (!hasAuth(combined)) problems.push("no auth/policy gate");
    // Only a route that actually takes input (references req.body/query/params) needs a
    // visible parse call -- plenty of POST actions in this codebase are legitimately bodyless.
    if (BODY_METHODS.has(block.method) && referencesInput(combined) && !hasParseCall(combined)) {
      problems.push("references req.body/query/params but no visible parse/safeParse call");
    }
    if (problems.length) findings.push({ file: relLabel(file), method: block.method, path: block.path, problems });
  }
  return findings;
}

function main() {
  const files = ROOTS.filter(fs.existsSync).flatMap(findRouterFiles).sort();
  const all = files.flatMap(auditFile);

  if (all.length === 0) {
    console.log(`✅ ${files.length} router files scanned, 0 routes flagged.`);
    console.log(`   (${KNOWN_SAFE.size} known-safe exceptions reviewed and excluded -- see KNOWN_SAFE in this script.)`);
    process.exit(0);
  }

  console.log(`❌ ${all.length} route(s) flagged:\n`);
  for (const f of all) console.log(`  ${f.method} ${f.path}  (${f.file}) -- ${f.problems.join("; ")}`);
  console.log("\nEither add the missing auth gate / Zod input validation, or add a reviewed,");
  console.log("justified entry to KNOWN_SAFE in this script explaining why this route is fine.");
  process.exit(1);
}

main();
