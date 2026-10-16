# Security model

Written at the end of Phase 5 (hardening + cutover), as the monorepo's permanent shape settles:
`apps/web` (Next.js, the only public UI) → `apps/api` (Express, private-network only) → Supabase
(Postgres + Auth + Storage) and `apps/worker` (pg-boss job processor, no public surface at all).
This describes what's actually enforced today, not aspirational policy.

## 1. Network boundary

- **The browser never talks to `apps/api` directly.** `apps/web`'s server actions / route
  handlers call `apps/api` over `API_INTERNAL_URL` (private network in production; `localhost`
  in dev). `apps/api`'s own `CLIENT_ORIGIN` CORS allow-list exists as a defence-in-depth backstop
  for any request that *does* arrive with a browser `Origin` header — in practice that's not
  `apps/web`'s own traffic (server-to-server fetches carry no `Origin`), only a hypothetical
  direct browser call.
- `app.set("trust proxy", 1)` (`apps/api/src/app.js`) trusts exactly one reverse-proxy hop (the
  PaaS host), so `req.ip` and per-IP rate limiting see the real client IP, not the proxy's.
- `helmet()` sets a real CSP (`script-src 'self'` + Razorpay's checkout origin only; `connect-src`
  scoped to Supabase + Razorpay; no wildcard origins) and `crossOriginOpenerPolicy:
  same-origin-allow-popups` (needed for Razorpay's bank-page popups, which still need
  `window.opener`).
- `/healthz` and `/readyz` are unauthenticated and deliberately unmounted outside `/api` — they
  exist for orchestrator liveness/readiness probes, not public consumption, and leak nothing
  beyond an `ok: true/false`.

## 2. AuthN: who is this request from

Sign-in (Google OAuth, email/password) happens entirely in the browser against Supabase Auth —
`apps/api` never sees a password, only the resulting access token.

`apps/api/src/middleware/auth.ts` verifies that token **locally** against the Supabase project's
JWKS (`platform/jwt.ts`), not via a per-request `auth.getUser()` round trip — cheap and stateless.
Email verification is the one exception: the JWT doesn't carry `email_confirmed_at`, so "does a
`users` row already exist for this `auth_id`" is the verified signal — that row is only ever
created once by `provisionUser` (`services/auth/provision.ts`), and only after one live Supabase
lookup confirms the email really is verified. Every request after that first one is a zero-round-
trip JWT check.

**Known trade-off, accepted deliberately**: a verified JWT stays valid for its natural (short)
lifetime even if the underlying Supabase user is banned/revoked in the interim — local JWT
verification can't see a server-side revocation. Role and account membership are re-checked
against *our* DB on every request regardless, so a role change or access revocation takes effect
immediately even though raw token validity briefly doesn't.

## 3. AuthZ: what this request is allowed to touch

Independent mechanisms, by design:

1. **Row-level security, default-deny.** `schema.sql` ends by enabling RLS on every table with
   **zero policies** — the Supabase anon/public key can read or write nothing at all. Every piece
   of data access goes through `apps/api` using the service-role key; RLS exists so that an anon
   key leak (misconfiguration, logging mistake, a browser calling Supabase directly) yields
   nothing, not a partial read.
2. **Privileged roles are allow-list-only, never client-settable.** `admin`/`founder` are granted
   by `ADMIN_EMAILS`/`FOUNDER_EMAILS` (server env, comma-separated emails), and only for an
   address Supabase has actually verified — `bootstrapRole()` in `provision.ts`. Elevation is
   applied **only** at the moment a `users` row is first created or first linked to an auth
   identity (signup, or first sign-in via a second provider) — never re-derived on a returning
   login — and every elevation is written to the audit log (`platform/audit.ts`,
   `role_elevated_on_provision`). Nothing the client sends can set or change `role`.
3. **Per-request ownership checks**, not just role checks. `services/access.ts`'s
   `assertAccountMember`/`loadMatterForUser` load the resource and check the caller is actually a
   member/party to it — ids from the client are never trusted at face value. `loadMatterForUser`
   deliberately returns **404, not 403**, when the caller isn't a party to the matter, specifically
   so a matter id can't be probed to learn whether it exists (see that function's own test suite
   for the probe case).
4. **A coarse, advisory edge gate in front of all this**, not a substitute for it.
   `packages/contracts/src/routes.ts`'s `routeManifest` declares which roles may ever load each
   `apps/web` URL; `apps/web/src/proxy.ts` (Next 16's renamed `middleware.ts`) checks it on every
   navigation and redirects a wrong-role request to that role's own home page. Resolving the
   caller's role here deliberately does **not** add a service-role key to `apps/web` or a Supabase
   custom access-token hook — it calls apps/api's own `GET /api/me` (the same authority everything
   else already trusts) and caches the answer in a short-lived cookie. If that resolution ever
   fails (cold cache, apps/api unreachable), the gate fails **open** — the request is allowed
   through unchanged, because layers 1–3 above are the actual authority and never trust this one;
   a wrong decision here can only produce a wrong redirect, never a data leak.

5. **Break-glass admin access to a matter** (`admin_access_grants`). Admins are never a party
   to a matter, so layer 3 404s them like anyone else. The only way in is
   `POST /admin/matter-access` (`requireRole("admin")` — not founder) with a matter reference and
   a written reason of at least 20 characters. Every attempt writes an `admin_access_grants` row
   and an `audit_logs` entry, as `recorded` or (reason too short) `denied`; there is no standing
   grant, so each view needs its own reason. A successful view returns a read-only subset
   (timeline, tasks, hearings, document *names*) — never fees, invoices, messages or signed
   download links — and adds a `platform` timeline event that the client and advocate both see.
   The reason itself stays in the log, not on the parties' timeline, since it may quote one side's
   complaint about the other. The log (`GET /admin/matter-access`) is readable by admin and
   founder.

A static scan (`apps/api/scripts/auditRoutes.mjs`, `npm run audit:routes -w apps/api`) walks
every router file and flags any route with neither a recognizable auth/role gate nor, for
body-bearing methods, a visible Zod validation call on `req.body` — currently 0 flagged (13
individually-reviewed exceptions, mostly deliberately-public reference-data GETs, documented in
the script's own `KNOWN_SAFE` map). It's a heuristic, not a real parser — it can't see
per-resource ownership checks that live inside `service.ts` files — so it complements layer 3
above rather than replacing it.

## 4. Rate limiting

`platform/rateLimit.ts` backs a coarse per-IP global limiter (300 req/min under `/api`, applied
before any route) plus tighter per-user limiters on routes where money or abuse is at stake (e.g.
`rl:profile:`, 20/min on `PATCH /me`; `rl:assistant-ask:`, `rl:case-law:` and `rl:research-ai:` on
every route that spends LLM/embeddings/Indian Kanoon money; `rl:payments:` on Razorpay
intents/verify; `rl:learn-helpful:` on the public helpful-vote count). Redis-backed when `REDIS_URL` is set (shared state across
horizontally-scaled instances); falls back to each instance's own in-process `Map` otherwise — a
deliberate scale/simplicity trade-off, not an oversight, since a single-instance deployment needs
nothing more.

## 5. Payments (Razorpay)

The webhook route (`modules/payments/router.ts`'s `paymentWebhook`, mounted in `app.js` **before**
`express.json()`) reads the raw request body via `express.raw()` specifically because Razorpay's
`x-razorpay-signature` HMAC covers the exact raw bytes — parsing to JSON first and re-serializing
would not reproduce the same bytes and would make every signature check fail closed (not open:
`handleWebhook` rejects on mismatch). Checkout itself happens client-side against Razorpay's own
hosted flow; `apps/api` never sees card/bank details.

## 6. File uploads & storage

Documents go to a **private** Supabase Storage bucket (created on first boot if missing), served
back only via signed, time-limited download URLs generated per-request after an ownership check —
never a public bucket URL. Uploads are **not virus-scanned** (rows are marked `pending`, never
`clean` — this is an honest limitation, not a claim of safety); contract review only ever reads
text out of PDF/DOCX/TXT, never executes anything from an uploaded file.

## 7. Error handling and logging: no internal leakage

`app.js`'s final error handler deliberately collapses any **5xx** that isn't an explicit
`HttpError`/`err.expose` down to a generic `"Something went wrong. Please try again."` — raw
database/driver error text never reaches a client response. 4xx errors (validation,
authorization) do surface their real message, since those are expected, actionable-by-the-user
failures, not internals.

Request logging (`pino-http`, replacing `morgan`) and the error handler's own `.error(err)` call
both go through `platform/logger.ts`'s shared `pino` instance, which redacts
`req.headers.authorization`, and any `password`/`token`/`accessToken`/`prompt` field at any
depth, before anything is written out — so a logged request or error can't leak a bearer token
or an AI prompt that might contain client matter facts.

## 8. Known, accepted gaps (tracked, not silently ignored)

- **`mammoth`** (DOCX parsing, used by contract review/drafting) carries a transitive moderate
  DoS advisory (`sprintf-js` via `argparse`) with no non-breaking fix available — `npm audit`'s
  only suggested fix is a forced downgrade to the ancient `0.3.x` line, which would regress DOCX
  parsing far more than the advisory's practical risk (it requires feeding `argparse`-level
  attacker-controlled format strings, not reachable from user-uploaded document content).
  Re-check on `mammoth`'s next release.
- **`eslint-config-next`**'s transitive `braces`/`micromatch`/`fast-glob` high-severity advisory
  is lint-tooling only — a devDependency that never ships, runs only on a developer's own machine
  during `npm run lint`, with no attacker-reachable input. Not fixed for the same breaking-
  downgrade reason as above.
- **Color-contrast** — the `--color-label` token and danger-button colours that failed WCAG AA on
  34/50 screens are fixed (`#6C685E`, `--color-rust`); awaiting one confirming axe run before
  `smoke.spec.ts`'s carve-out is removed — tracked in `apps/web/e2e/README.md`.
- **No email/SMS notifications** — in-app only (messages poll). Not a security gap, but relevant
  to incident response: a banned/compromised user won't be notified out-of-band.
- `npx knip` at the repo root is clean (`knip.json` ignores `pino-pretty` specifically — a
  confirmed **false positive**, loaded by `pino` via a string transport target
  (`{ target: "pino-pretty" }`) that static import analysis can't see; it is genuinely used in
  dev and must not be removed). Getting here from ~50 unused-export findings surfaced two real
  issues, not just tidiness: `apps/api/src/services/analytics/index.js` had 8 full functions
  (`overview`/`demand`/.../`ai`) + a `TABS` dispatch table that were **completely orphaned**
  after `modules/founder/service.ts` ported its own fresh copies of the same logic — deleted,
  keeping only `complaints()` (still genuinely shared). Separately,
  `services/aiCaseLawAnswer.js`'s own cache-reset helper was written with clear test-isolation
  intent (its own comment: "so tests don't leak state into each other") but never actually
  wired into `caselaw.test.ts` — wired in rather than deleted. Everything else was either a
  module-private helper that only needed its `export` keyword removed (used internally via a
  same-file dispatch table or a handful of call sites, never imported elsewhere), or a second,
  genuinely dead duplicate export (`eslint.base.js`'s unused `default` — every real consumer
  imports the named `baseConfig`; `contractReviewCreateResultDto` — never imported anywhere,
  `router.ts` reuses `contractReviewDetailDto` directly for both its create and detail
  responses).
