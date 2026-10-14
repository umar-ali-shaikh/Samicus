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

Three independent mechanisms, by design:

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

## 4. Rate limiting

`platform/rateLimit.ts` backs a coarse per-IP global limiter (300 req/min under `/api`, applied
before any route) plus tighter per-user limiters on routes where money or abuse is at stake (e.g.
`rl:profile:`, 20/min on `PATCH /me`). Redis-backed when `REDIS_URL` is set (shared state across
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

## 7. Error handling: no internal leakage

`app.js`'s final error handler (line ~125) deliberately collapses any **5xx** that isn't an
explicit `HttpError`/`err.expose` down to a generic `"Something went wrong. Please try again."` —
raw database/driver error text never reaches a client response. 4xx errors (validation,
authorization) do surface their real message, since those are expected, actionable-by-the-user
failures, not internals.

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
- **`admin_access_grants`** table (`schema.sql`) is fully defined but has no route reading or
  writing it yet — looks like a half-built feature, not confirmed dead. Needs a product decision
  (finish it or formally drop it); see `DELETE-LIST.md` item 4. Left untouched either way.
- **Color-contrast** (`--color-label` design token) falls short of WCAG AA on 34/50 screens per
  `apps/web/e2e`'s real axe-core run — a design-token decision, not an engineering one; tracked in
  `apps/web/e2e/README.md`, not silently suppressed.
- **No email/SMS notifications** — in-app only (messages poll). Not a security gap, but relevant
  to incident response: a banned/compromised user won't be notified out-of-band.
