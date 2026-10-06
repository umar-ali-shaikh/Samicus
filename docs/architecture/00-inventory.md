# Phase 0 Inventory — Vidhira / Samicus Legal Platform

Generated as a read-only audit ahead of the Express→TS / Vite→Next.js migration. Evidence-based; anything not directly verified in the files below is marked **unclear** rather than guessed.

Scope note: the codebase is named "Vidhira" in package.json/comments but user-facing copy references "Samicus Research" — both names appear in source, unclear which is canonical going forward.

---

## 1. `backend/src/app.js`

Read in full (145 lines). Middleware order, top to bottom:

1. `app.set("trust proxy", 1)` — single reverse-proxy hop trusted (Render-style PaaS), needed for `express-rate-limit` to see real client IPs.
2. `helmet()` — CSP with `useDefaults: true` plus explicit allow-lists:
   - `script-src`: `'self'`, `https://checkout.razorpay.com`
   - `frame-src`: `'self'`, `https://api.razorpay.com`, `https://meet.jit.si`
   - `connect-src`: `'self'`, `https://*.supabase.co`, `wss://*.supabase.co`, `https://api.razorpay.com`, `https://lumberjack.razorpay.com`
   - `img-src`: `'self'`, `data:`, `https://*.googleusercontent.com`, `https://*.supabase.co`
   - `style-src`: `'self'`, `'unsafe-inline'`, `https://fonts.googleapis.com`
   - `font-src`: `'self'`, `https://fonts.gstatic.com`, `data:`
   - `crossOriginEmbedderPolicy: false`
   - `crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }` (Razorpay checkout popups need `window.opener`)
3. `cors()` — allow-list built from `process.env.CLIENT_ORIGIN` (comma-split, trimmed, defaults to `http://localhost:5173`), `credentials: true`. Origin callback allows no-origin requests (server-to-server/curl) and any origin in the list.
4. **`app.use("/api", paymentWebhook)`** — mounted **before** `express.json()`, by design: Razorpay's webhook HMAC signature covers the raw body, so this router (from `routes/payments.js`) uses `express.raw({ type: "application/json" })` internally and must see unparsed bytes.
5. `express.json({ limit: "1mb" })` — global JSON body parser (after the webhook router, so it doesn't consume the webhook's raw body first).
6. `morgan` — `"combined"` in production, `"dev"` otherwise.
7. `GET /api/health` — unauthenticated liveness check.
8. Coarse global rate limiter on `/api`: 300 requests/60s per IP (`express-rate-limit`, standard headers, no legacy headers). Comment explicitly frames this as a "backstop" — individual routes layer tighter per-user limits on top where money/abuse risk is higher.
9. A single `express.Router()` (`api`) has every route module's router attached via `.use(...)`, in this order: config, auth, indianKanoon, legalAssistant, accounts, situations, advocates, `resubmitRouter` (exported separately from `admin.js`), intake, consultations, matters, documents, messages, services, payments, research, contractReview, pack, drafting, askLearn, complaints, admin, founder, privacy. That `api` router is then mounted at `/api`.
10. `app.use("/api", 404 JSON handler)` — any unmatched `/api/*` path gets a JSON 404, explicitly to prevent falling through to the SPA shell.
11. `express.static(CLIENT_DIST)` where `CLIENT_DIST = path.join(__dirname, "../../frontend/dist")` — serves the built SPA. No-ops harmlessly if `dist` is missing (e.g., API-only dev with the Vite dev server running separately).
12. Catch-all `GET /^\/(?!api\/).*/ ` → `res.sendFile(index.html)`, falling through to `next()` (eventually the final 404 handler) if `index.html` itself is missing.
13. Final 404 handler.
14. Centralized error handler: special-cases Multer errors (413 for file-too-big, 400 otherwise), `entity.parse.failed` (bad JSON → 400), otherwise uses `err.status || 500`; for 5xx it logs server-side and returns a generic "Something went wrong" message unless `err.expose` or the error is an `HttpError` (from `services/access.js`) — i.e., 5xx internals are never leaked by default. `err.code` is only echoed back if it's an all-caps identifier-shaped string AND the error was deliberately "exposable."

**Razorpay webhook vs `express.json()` ordering: confirmed correct** — webhook router is mounted strictly before the JSON body parser.

---

## 2. Route files — full per-route inventory

`backend/src/routes/*.js` — Glob found **23 route modules** (excluding 4 `*.test.js` files: `advocates.test.js`, `app.test.js`, `drafting.test.js`, `legalAssistant.test.js`, which are part of the test suite, not route definitions) plus two re-exports from `admin.js` (`default` and `resubmitRouter`). All 23 modules are imported and mounted in `app.js` — **none of the 23 are orphaned/unmounted.**

Every file below was read in full. Total route handlers counted across all files: **~143**.

### accounts.js (6 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /accounts | requireAuth | any | direct Supabase query | none needed (no body) | filtered by `user_id` | none | Lists only the caller's own accepted memberships. |
| POST | /accounts | requireAuth | any | direct Supabase insert | zod `accountSchema` (type enum, displayName, GSTIN regex, CIN, address) | n/a (creates new) | none | Caller becomes `owner` of the new account. |
| GET | /plans | none | — | direct query | none | public data | none | No auth — plan catalogue is public. |
| POST | /accounts/:id/members | requireAuth | `requireAccountAccess("owner","admin")` | direct Supabase | manual email regex + role allow-list check | yes, via `requireAccountAccess` | none | Seat-limit enforced before insert. Creates a login-less placeholder `users` row for unregistered invitees. |
| GET | /accounts/:id/members | requireAuth | `requireAccountAccess()` (any role) | direct query | none | yes | none | |
| DELETE | /accounts/:id/members/:mid | requireAuth | `requireAccountAccess("owner","admin")` | direct delete | none | yes | none | |

### admin.js (6 routes: 5 under `/admin`, 1 in exported `resubmitRouter`)

Router-level guard: `router.use("/admin", requireAuth, requireRole("admin","founder"))` — applies to every route in this file except `resubmitRouter` (a separate router instance, guarded per-route instead).

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /admin/usage | requireAuth (router-level) | admin, founder | `utils/callCounter.getCounts()` | none | n/a | none | In-memory counters, resets on restart. |
| GET | /admin/complaints | requireAuth (router-level) | admin, founder | `services/analytics.complaints()` | none | n/a | none | |
| GET | /admin/stats | requireAuth (router-level) | admin, founder | direct counts | none | n/a | none | 7 parallel count queries. |
| GET | /admin/verification-cases | requireAuth (router-level) | admin, founder | direct query | none | n/a | none | |
| POST | /admin/verification-cases/:id/decide | requireAuth (router-level) + explicit `requireRole("admin")` on this route (narrower than the router-level admin+founder) | admin only | direct updates across 3 tables + audit log | manual `decision` enum check | loads case by id, 409s if already decided | none | Comment: "only this action can flip an advocate to verified, and it is always audit-logged." Good example of a deliberate gate. |
| POST | /advocate/resubmit (resubmitRouter) | requireAuth | advocate | direct Supabase | none | implicit via `user_id` match | none | Only resubmits if `verification_status === "documents_requested"`. |

### advocates.js (13 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /advocates | none | — | direct query + in-memory filter/sort | query-string filters only, no schema | n/a (public directory, verified-only) | none | Public by design. |
| POST | /advocates/notify-when-available | requireAuth | any | direct insert | none (body fields optional, no schema) | n/a | **none** | No rate limit on this insert-only endpoint — minor spam/DoS surface. |
| GET | /advocates/:id | none | — | direct query | none | public (verified only) | none | |
| GET | /advocates/:id/slots | none | — | `services/slots.js` | none | public | none | |
| POST | /advocate/apply | requireAuth | blocks admin/founder | direct insert + `syncRelations` | zod `applySchema` | checks not already applied (`advocateForUser`) | none | Flips caller's own `users.role` to `advocate`. |
| PATCH | /advocate/availability | requireAuth | advocate | `selfAdvocate` middleware + direct update | manual enum check | yes, scoped to caller's own advocate row via `selfAdvocate` | none | Blocks going non-offline until verified. |
| GET | /advocate/requests | requireAuth | advocate | `selfAdvocate` + `offeredIntakeIds` | none | yes — only intakes actually offered to this advocate (match_results/conflict_checks) | none | Facts/description deliberately excluded from list view. |
| GET | /advocate/requests/:id | requireAuth | advocate | `selfAdvocate` + `loadOfferedIntake` | none | yes, 404 if not offered | none | Facts released only if conflict check clear AND client consented. |
| POST | /advocate/requests/:id/conflict-check | requireAuth | advocate | `selfAdvocate` + `loadOfferedIntake` | none | yes | none | |
| POST | /advocate/requests/:id/accept | requireAuth | advocate | `selfAdvocate` + `loadOfferedIntake` + RPC `accept_intake_and_open_matter` | none | yes; also checks conflict-check is clear and advocate verified | none | Transaction via Postgres RPC. |
| POST | /advocate/requests/:id/decline | requireAuth | advocate | `selfAdvocate` + `loadOfferedIntake` | none | yes | none | |
| GET | /advocate/profile | requireAuth | advocate | direct query | none | scoped to `user_id` | none | |
| PATCH | /advocate/profile | requireAuth | advocate | `advocateForUser` + direct update + `syncRelations` | zod `profileSchema` | yes, by `user_id` | none | Bar enrolment fields locked (not in patch schema). |

### askLearn.js (12 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /questions | requireAuth | any | direct insert | zod `questionSchema` | `assertAccountMember` | **yes — 5/hour per user** | |
| GET | /questions | none | — | direct query | none | n/a, public list; `author_account_id` deliberately not selected | none | |
| GET | /questions/mine | requireAuth | any | direct query | none | filtered by caller's `defaultAccountId` | none | |
| POST | /questions/:id/answers | requireAuth | advocate (checked manually, not via `requireRole`) | direct insert | manual length check (30–4000 chars) | verifies advocate is verified; question must be published | none | |
| POST | /answers/:id/helpful | requireAuth | any | RPC `increment_helpful_count` | none | none — any signed-in user, any `:id` | **none — see Risk #1** | Comment says "rate-limit instead" of per-vote dedup, but **no rate limiter is actually attached to this route**. |
| GET | /guides | none | — | direct query | none | public | none | |
| GET | /guides/:id | none | — | direct query | none | public | none | |
| POST | /admin/guides | requireAuth | requireRole("admin") | direct insert | zod `guideSchema` | n/a | none | |
| DELETE | /admin/guides/:id | requireAuth | requireRole("admin") | direct delete | none | n/a | none | |
| GET | /admin/moderation | requireAuth | requireRole("admin") | direct queries | none | n/a | none | |
| POST | /admin/moderation/:type/:id | requireAuth | requireRole("admin") | direct update + audit log | manual decision enum + type enum | n/a | none | |
| GET | /specialisations | none | — | direct query + RPC `advocate_counts_by_practice_area` | none | public | none | |

### auth.js (2 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /me | `authenticate({ allowUnverified: true })` | any (unverified tolerated) | `loadAccounts`, `loadAdvocate` | none | self only | none | Only route that tolerates an unverified email, by design (shows the "verify your email" screen). |
| PATCH | /me | **profileLimiter (20/min) THEN requireAuth** — see Risk #2 for ordering note | any | direct update | manual per-field checks (name non-empty, lang enum, phone regex via `PhoneSchema`) | self only | **yes — 20/min per... IP, not user** (limiter has no `keyGenerator`, so it's IP-keyed, unlike every other limiter in the codebase which keys by `req.user?.id || req.ip`) | Limiter runs **before** `requireAuth` in the middleware chain, so it is IP-based, not user-based. |

### complaints.js (3 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /complaints | requireAuth | any | direct insert | zod `createSchema` | n/a (self-authored) | **yes — 10/hour per user** | |
| GET | /complaints/mine | requireAuth | any | direct query | none | filtered by `raised_by` | none | |
| PATCH | /admin/complaints/:id | requireAuth | requireRole("admin","founder") | direct update | zod `updateSchema` | n/a | none | This path starts with `/admin/` but is defined in `complaints.js`'s own router (not gated by `admin.js`'s router-level middleware, since that's a different router instance) — guarded explicitly here instead, correctly. |

### config.js (1 route)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /config | none | — | `publicPaymentConfig`, `ragEnabled` | none | n/a | none | Public capability flags only (booleans), no secrets. |

### consultations.js (6 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /consultations | requireAuth | any | `computeFees`, `isOfferedSlot`/`normalizeSchedule` | zod `bookSchema` | `assertAccountMember` on intake's account | none | Unique-constraint race on slot booking handled (409 on `23505`). |
| GET | /consultations | requireAuth | any | direct queries | none | scoped to caller's accounts + own advocate row | none | |
| PATCH | /consultations/:id | requireAuth | any | `loadConsultationForUser` | manual state allow-list per side | yes — `side` (client/advocate) computed server-side | none | 4-hour cancellation cutoff enforced server-side. |
| POST | /consultations/:id/feedback | requireAuth | any | `loadConsultationForUser` | manual integer 1–5 check | side must be "client" | none | |
| POST | /consultations/:id/room | requireAuth | any | `loadConsultationForUser` | none | yes | none | Join window enforced (15 min early / 3h late). Room token unguessable (`crypto.randomBytes(16)`). |
| POST | /consultations/:id/convert-to-matter | requireAuth | any | `loadConsultationForUser` + `openMatterThread` | none | side must be "advocate" | none | |

### contractReview.js (4 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /contract-reviews | requireAuth | any | `extractDocumentText`, `segmentContract`, `matchBaselineClauses`, `detectRedFlags`, `judgeClauses` | zod `createSchema` | `loadReadableDocument` + `assertAccountMember` (owner/admin/member) | none | Gated behind `ragEnabled()` — 503 if RAG infra isn't configured. |
| GET | /contract-reviews | requireAuth | any | direct query | none | scoped to `memberAccountIds` | none | |
| GET | /contract-reviews/:id | requireAuth | any | `loadFullReview` → `loadOwnReview` | none | `assertAccountMember`, 404 on failure (never 403) | none | |
| GET | /contract-reviews/:id/export | requireAuth | any | `loadFullReview` + `docx` rendering | none | same as above | none | |

### documents.js (5 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /documents | requireAuth | any | multer upload + `putObject` | mimetype+extension allow-list, 25MB/1-file limit (multer) | `assertAccountMember` (owner/admin/member/finance); matter ownership checked if `matterId` given | none | `virus_scan_status` always inserted as `"pending"` — comment confirms no scanner is wired in. |
| GET | /documents | requireAuth | any | direct queries (2 parallel) | query params, no schema | scoped to own accounts + advocate `shared_with` | none | |
| GET | /documents/:id/download | requireAuth | any | `loadReadableDocument` + `signedUrl` | none | owner, advocate-shared, or matter-access-grant w/ `documents` scope | none | Signed URL expires in 60s; download is audit-logged. |
| POST | /documents/:id/share | requireAuth | any | `loadReadableDocument` | none | must be owner; target advocate must be one the account actually works with (checked against `matters`+`consultations`) | none | Audit-logged. |
| DELETE | /documents/:id | requireAuth | any | `loadReadableDocument` + `removeObject` | none | must be owner; falls back to uploader-or-admin check | none | |

### drafting.js (13 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /doc-templates | requireAuth | any | direct query | none | n/a (catalogue) | none | |
| GET | /doc-templates/:id | requireAuth | any | direct query | none | n/a (catalogue) | none | |
| POST | /drafts | requireAuth | any | direct insert | none (manual template existence check) | `assertAccountMember` | none | |
| GET | /drafts | requireAuth | any | direct query | none | scoped to `memberAccountIds` | none | |
| GET | /drafts/:id | requireAuth | any | `loadOwnDraft` | none | `assertAccountMember`, 404 on fail | none | |
| PATCH | /drafts/:id | requireAuth | any | `loadOwnDraft`, `checkClauseGuards` | zod `patchSchema` | yes | none | |
| POST | /drafts/:id/preview | requireAuth | any | `loadOwnDraft`, `assembleDraft`, `missingRequiredFields` | none | yes | none | |
| GET | /drafts/:id/download | requireAuth | any | `loadOwnDraft`, `renderDocx`/`renderPdf` | query `format` manually checked | yes | none | Blocks download if required fields missing. |
| POST | /drafts/:id/reviews | requireAuth | any | `loadOwnDraft` | none (advocate existence/verified check only) | yes | none | |
| GET | /drafts/:id/reviews/:rid | requireAuth | any | `loadOwnDraft` + direct query | none | yes | none | |
| GET | /advocate/draft-reviews | requireAuth | requireRole("advocate") | `advocateForUser` + direct query | none | scoped to own advocate id | none | |
| GET | /advocate/draft-reviews/:id | requireAuth | requireRole("advocate") | `advocateForUser` + direct query + `assemble` | none | filtered by `advocate_id` in the query itself | none | |
| POST | /advocate/draft-reviews/:id/return | requireAuth | requireRole("advocate") | `advocateForUser` + direct update | zod `returnSchema` | filtered by `advocate_id` in the update | none | |

### founder.js (1 route)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /admin/analytics/:tab | requireAuth | requireRole("founder") | `services/analytics.TABS[tab]()` | `:tab` checked against `TABS` map, 404 if unknown | n/a | none | Comment: "matter contents and privileged messages are never exposed here" — aggregate-only by design. |

### indianKanoon.js (6 routes)

Router-level guard: `router.use("/case-law", requireAuth, caseLawLimiter)` applies to all 6 routes (60 requests/15min, keyed by `req.user?.id || req.ip`).

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /case-law/search | requireAuth (router-level) | any | `services/indianKanoon.search` | manual `q` required/non-empty check; no max length | n/a | 60/15min (router-level) | Every call costs real money (comment). |
| GET | /case-law/:docid | requireAuth (router-level) | any | `getDocument` | none on `:docid` | n/a | 60/15min | |
| GET | /case-law/:docid/original | requireAuth (router-level) | any | `getOriginalDocument` | none | n/a | 60/15min | |
| GET | /case-law/:docid/fragment | requireAuth (router-level) | any | `getFragment` | manual `q` required check | n/a | 60/15min | |
| GET | /case-law/:docid/meta | requireAuth (router-level) | any | `getMetainfo` | none | n/a | 60/15min | |
| GET | /case-law/ai-answer | requireAuth (router-level) | any | `answerCaseLawQuestion` (LLM + search) | manual `q` required check | n/a | 60/15min | Most expensive route in this file (search + LLM), same limit as a plain metadata fetch. |

### intake.js (7 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /intake-requests | requireAuth | any | `createIntake` | zod `intakeSchema` | `assertAccountMember` | **none** | Facts stored but not released to advocate until consent — good design; no dedicated rate limit on creation (global IP limiter only). |
| GET | /intake-requests | requireAuth | any | direct query | none | scoped to `memberAccountIds` | none | |
| GET | /intake-requests/:id/matches | requireAuth | any | `loadOwnIntake`, `rankAdvocates`, RPC `replace_match_results` | none | yes | none | |
| POST | /intake-requests/:id/consent | requireAuth | any | `loadOwnIntake` | none | yes | none | |
| POST | /urgent-requests | requireAuth | any | `createIntake`, `rankAdvocates` | zod `urgentSchema` | `assertAccountMember` (via `createIntake`) | **none** | Ignores language/mode/state filters by design for urgent matching. |
| GET | /intake-requests/:id | requireAuth | any | `loadOwnIntake` + 2 parallel queries | none | yes | none | |
| POST | /intake-requests/:id/cancel | requireAuth | any | `loadOwnIntake` | none | yes | none | |

### legalAssistant.js (2 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /legal-assistant/ask | **requireAuth** (code) — but see Risk #3, comment claims "unauthenticated" | any | `answerLegalQuestion` | zod `QuestionSchema` (1–5000 chars), `sessionId` regex-validated | `loadHistory` checks session `user_id` match, warns+ignores on mismatch rather than erroring | **yes — 20/15min per user** (`askLimiter`) | Stale/contradictory comment — see Risk #3. Persists turn fire-and-forget (errors logged, not surfaced). |
| GET | /legal-assistant/session/:sessionId | requireAuth | any | direct queries | `sessionId` regex-validated | scoped to `user_id` in the query | none | Returns empty `{turns: []}` rather than 404 for a fresh session — intentional. |

### matters.js (14 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /matters | requireAuth | any | `memberAccountIds`, `advocateForUser`, `grantedMatterIds` | none | yes, 3-way union | none | |
| GET | /tasks/mine | requireAuth | any | direct queries | none | yes | none | |
| GET | /matters/:id | requireAuth | any | `loadMatterContext` → `loadMatterForUser`/`grantedMatterIds` | none | yes, including "viewer" (access-grant) side; fee/invoice visibility gated by grant scope | none | |
| PATCH | /matters/:id | requireAuth | any | `loadMatterForUser` | zod `matterPatchSchema` | yes; client side restricted to close-only + `assertAccountMember` | none | |
| POST | /matters/:id/tasks | requireAuth | any | `loadMatterForUser`, `requireSide` | zod `taskSchema` | side must be "advocate" | none | |
| POST | /matters/:id/tasks/:tid/complete | requireAuth | any | `loadMatterForUser` | none | task's `owner_type` must match caller's side | none | |
| POST | /matters/:id/hearings | requireAuth | any | `loadMatterForUser`, `requireSide` | zod `hearingSchema` | side must be "advocate" | none | |
| POST | /matters/:id/access | requireAuth | any | `loadMatterForUser`, `requireSide` | zod `accessSchema` | side must be "client" + `assertAccountMember` (owner/admin) | none | Audit-logged. Target must already be a registered user (by email). |
| DELETE | /matters/:id/access/:gid | requireAuth | any | `loadMatterForUser`, `requireSide` | none | side must be "client" + `assertAccountMember` (owner/admin) | none | Audit-logged. |
| POST | /matters/:id/fee-proposals | requireAuth | any | `loadMatterForUser`, `requireSide` | zod `proposalSchema` | side must be "advocate" | none | |
| POST | /matters/:id/fee-proposals/:pid/accept | requireAuth | any | `loadMatterForUser`, `requireSide` | none | side must be "client" + `assertAccountMember` (owner/admin/finance); checks not already accepted/expired | none | |
| POST | /matters/:id/invoices | requireAuth | any | `loadMatterForUser`, `requireSide` | zod `invoiceSchema` | side must be "advocate" | none | |
| POST | /matters/:id/invoices/:iid/settle-offline | requireAuth | any | `loadMatterForUser`, `requireSide` | none | side must be "advocate"; refuses if online payments enabled | none | Audit-logged. |
| GET | /accounts/:id/legal-spend | requireAuth | any | `assertAccountMember` (owner/admin/finance) | none | yes | none | |

### messages.js (3 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /threads | requireAuth | any | direct queries (3 parallel) | none | scoped to `thread_participants` rows for caller | none | |
| GET | /threads/:id/messages | requireAuth | any | `assertParticipant` | none | yes, 404 if not a participant | none | Marks other side's messages read as a side-effect of GET (atypical but intentional). |
| POST | /threads/:id/messages | requireAuth | any | `assertParticipant` | manual non-empty + length ≤5000 check | yes | **yes — 30/min per user** | |

### pack.js (8 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /pack/categories | requireAuth | any | direct query | none | n/a (catalogue) | none | |
| GET | /pack/rulesets/:categoryId | requireAuth | any | direct query | none | n/a | none | |
| PUT | /admin/pack-rulesets | requireAuth | requireRole("admin") | direct insert, diff logic | zod `rulesetSchema` + `assertRegexes` (validates regex patterns compile) | n/a | none | Auto-flags affected `pack_scans` for recheck on ruleset change. |
| POST | /pack/scans | requireAuth | any | direct insert, rule evaluation | zod `scanSchema` | `assertAccountMember` (owner/admin/member) | none | No OCR — inputs are user-transcribed (comment confirms). |
| GET | /pack/scans/:id | requireAuth | any | `loadOwnScan` | none | `assertAccountMember`, 404 on fail | none | |
| POST | /pack/scans/:id/approve | requireAuth | any | `loadOwnScan` | none | `assertAccountMember` (owner/admin); blocks approving a "fail" scan | none | |
| GET | /pack/drift | requireAuth | any | direct queries | none | filters `affectedProducts` down to caller's own scans | none | |
| GET | /pack/portfolio | requireAuth | any | direct query | none | scoped to `memberAccountIds`; optional `?accountId` re-checked via `assertAccountMember` | none | |

### payments.js (4 routes, 1 webhook mounted separately in app.js)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /payments/intents | requireAuth | any | `loadPayable`, `createRazorpayOrder` | zod `intentSchema` | `assertAccountMember` inside each `loadPayable` branch, 404 on fail | **none** | Amount always computed server-side from DB, never trusts client — good. No dedicated rate limit beyond global 300/min/IP — see Risk #4. |
| POST | /payments/verify | requireAuth | any | `verifyCheckoutSignature`, `settle` | zod `verifySchema` | order's `created_by` must equal caller | **none** | HMAC-verified before settling. |
| POST | /payments/webhook (paymentWebhook router, mounted in app.js before json parser) | **none** (by necessity — Razorpay calls this directly) | — | `verifyWebhookSignature`, `settle` | signature-verified over raw body | n/a (server-to-server) | none | Correctly placed ahead of `express.json()`. |
| GET | /payments/history | requireAuth | any | direct query | none | scoped to `created_by` | none | |

### privacy.js (2 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /privacy/export | requireAuth | any | direct queries (9 parallel) | none | scoped to caller only | none | |
| POST | /privacy/delete | requireAuth | any | `memberAccountIds`, `advocateForUser`, `removeObject`, Supabase Auth admin delete | none | self only | none | Refuses while matters are engaged (statutory retention); anonymises in place rather than hard-deleting shared rows. |

### research.js (15 routes) — largest route file

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| POST | /research/retrieve | requireAuth | any | `retrieve`, `detectLanguage` | manual length check (5–1000 chars) | `assertAccountMember` | **none** | Expensive (embeddings + possible live Indian Kanoon/Tavily fetch-and-index) with no dedicated limiter — see Risk #5. |
| POST | /research/answer | requireAuth | any | `loadOwnedQuery`, `buildPersistAndSyncOutcome`, `answerFromRetrieval`, `generateResearchInsights`, `generateStructuredNote` | none (takes `retrievalId`, not raw text — the route itself is the validation boundary) | `loadOwnedQuery` → `assertAccountMember`, 404 on fail | **none** | LLM-cost-heavy; see Risk #5. |
| GET | /research/queries/:id/report | requireAuth | any | `loadQueryForReport`, `loadReport` | none | yes, with an explicit carve-out for `tags.includes("example")` rows (seeded showcase content, no owning account) | none | |
| GET | /research/queries | requireAuth | any | direct queries + aggregation | none | scoped by account, or `?tag=example` carve-out | none | |
| PATCH | /research/queries/:id | requireAuth | any | `loadOwnedQuery` | manual type checks (`pinned` boolean, `tags` array) | yes | none | |
| DELETE | /research/queries/:id | requireAuth | any | `loadOwnedQuery`, `collectSupersededChain` | none | yes | none | Cascades through the whole refresh-chain history, not just the one row. |
| POST | /research/queries/:id/refresh | requireAuth | any | `loadOwnedQuery`, `retrieve`, `buildPersistAndSyncOutcome` | none | yes | **none** | Same cost profile as `/retrieve`+`/answer` combined, no limiter. |
| POST | /research/queries/:id/ask | requireAuth | any | `loadOwnedQuery`, `answerFollowUp` | manual length check (3–500 chars) | yes | **none** | LLM call, no limiter. |
| GET | /research/queries/:id/chat | requireAuth | any | `loadOwnedQuery` + direct query | none | yes | none | |
| GET | /research/queries/:id/export.pdf | requireAuth | any | `loadOwnedQuery`, `loadReport`, `renderResearchReportPdf` | none | yes | none | |
| GET | /corpus/documents | requireAuth | any | direct query | none | n/a (shared knowledge base, read-only browse) | none | |
| GET | /corpus/documents/:id | requireAuth | any | direct query | none | n/a | none | |
| GET | /corpus/documents/:id/chunks | requireAuth | any | direct query | none | n/a | none | |
| GET | /corpus/chunks/:id | requireAuth | any | direct query | none | n/a | none | |
| GET | /corpus/status | requireAuth | any | RPC `corpus_document_stats_by_source`, `knowledgeBaseStats` | none | n/a | none | |

### services.js (8 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /services | none | — | direct query, `computeFees` | none | n/a (public catalogue) | none | |
| POST | /admin/services | requireAuth | requireRole("admin") | direct insert | zod `serviceSchema` | n/a | none | |
| PUT | /admin/services/:id | requireAuth | requireRole("admin") | direct update | zod `serviceSchema` | n/a | none | |
| DELETE | /admin/services/:id | requireAuth | requireRole("admin") | direct delete | none | blocks delete if orders exist | none | |
| POST | /services/:id/orders | requireAuth | any | direct insert | none (manual service-existence check) | `assertAccountMember` | none | |
| GET | /service-orders | requireAuth | any | direct query | none | scoped to `memberAccountIds` | none | |
| GET | /admin/service-orders | requireAuth | requireRole("admin") | direct query | none | n/a | none | |
| POST | /admin/service-orders/:id/assign | requireAuth | requireRole("admin") | direct update | none (manual advocate-verified check) | n/a | none | |

### situations.js (2 routes)

| Method | Path | Auth middleware? | Role required | Service/function called | Input validation | Ownership/object-level check | Per-route rate limit? | Notes/risks |
|---|---|---|---|---|---|---|---|---|
| GET | /situations | none | — | direct query | none | n/a (public) | none | |
| POST | /intake/route | none | — | direct query + in-memory scoring | manual type/non-empty check on `freeText` | n/a | none | Unauthenticated, no rate limit — cheap/non-sensitive (just keyword matching), low risk. |

---

## 3. `backend/src/services/access.js` — object-level authorization

Read in full (79 lines). Exports:

- **`HttpError`** — custom error class carrying `status` + arbitrary extra fields (e.g. `code`), consumed by `app.js`'s error handler.
- **`memberAccountIds(userId)`** — returns all `account_id`s where the user has an accepted `account_members` row. Used throughout the route files as the primary "which accounts can I see" primitive.
- **`assertAccountMember(userId, accountId, roles = [])`** — throws `HttpError(400)` if no `accountId`, `HttpError(403)` if not an accepted member or role not in the optional allow-list. This is the single most-used authorization primitive in the codebase (used in nearly every route file).
- **`defaultAccountId(userId)`** — picks the caller's "owner" account, or their first accepted membership, for routes that let `accountId` be omitted.
- **`advocateForUser(userId)`** — loads the caller's own `advocates` row (or null).
- **`loadMatterForUser(user, matterId)`** — the core matter-ownership check: loads the matter, returns `{ matter, side: "advocate" | "client", advocate }` if the caller is either the engaged advocate or an accepted member of the matter's account; **throws 404 (not 403)** if neither — comment explicitly states this is deliberate so matter ids can't be probed for existence.
- **`requireSide(ctx, side, message)`** — throws 403 if `ctx.side` doesn't match the expected side; used throughout `matters.js` to gate advocate-only vs client-only actions (tasks, hearings, fee proposals, invoices, access grants).

Notably, `matter_access_grants` (third-party/viewer access) and `admin_access_grants` (admin override access) are **not** read inside `access.js` itself — `matter_access_grants` lookups are done ad hoc in `matters.js` (`grantedMatterIds`) and `documents.js` (`loadReadableDocument`). `admin_access_grants` table exists in schema but — searched across all 23 route files — **no route reads or writes `admin_access_grants`**. This looks like a built-but-unwired feature; see Delete List candidate.

---

## 4. `backend/src/middleware/auth.js` — auth flow

Read in full (114 lines).

- **Token source**: `bearerToken(req)` extracts a `Bearer <token>` header; no cookie-based auth path exists.
- **Validation**: `resolveIdentity(token)` calls Supabase's `auth.getUser(token)` — i.e., token validation is fully delegated to Supabase Auth, not verified locally (no local JWT-secret check).
- **In-process identity cache**: a plain `Map<token, {user, expiresAt}>`, TTL **5 seconds** (`IDENTITY_TTL_MS`), capped at **5000 entries** (`IDENTITY_CACHE_MAX`). On overflow it first sweeps expired entries; if still full, it clears the entire cache. This is a per-process, unbounded-by-user cache — in a multi-instance deployment each instance has its own cache (no shared invalidation), and a revoked/disabled Supabase user can remain "valid" here for up to 5 seconds after revocation.
- **`authenticate({ allowUnverified })`** — the core middleware factory: 401 if no token, 401 if token doesn't resolve, 403 (`EMAIL_NOT_VERIFIED`) if the Supabase user's email isn't confirmed (unless `allowUnverified`), otherwise calls `provisionUser(authUser)` (from `services/auth/provision.js`, not read in this pass) to load/create the matching `users` row and attaches it as `req.user`. `req.authUser` (raw Supabase user) and `req.emailVerified` are also attached.
- **`requireAuth`** — `authenticate()` with defaults (verified email required).
- **`requireRole(...roles)`** — simple `req.user.role` membership check, 403 otherwise. Used extensively; roles are `client | advocate | admin | founder` per the `users` table check constraint.
- **`requireAccountAccess(...roles)`** — reads `:id`/`:accountId`/`req.body.accountId` (in that priority) and checks `account_members` directly (duplicates some of what `services/access.js`'s `assertAccountMember` does, but as Express middleware rather than an awaitable helper) — used only in `accounts.js`.

---

## 5. Database schema — tables, RLS, and migrations

`backend/src/db/schema.sql` (1134 lines) read in full, plus all 8 files in `backend/src/db/migrations/` (001–008, including the two new untracked ones: `007_research_note_v2.sql`, `008_research_not_found_reason.sql`).

### Tables (all in the `public` schema)

| Table | Purpose (one line) |
|---|---|
| users | Application user profile, linked to Supabase `auth.users` |
| plans | Subscription plan catalogue |
| accounts | Individual/family/business workspace |
| account_members | User↔account membership + role |
| subscriptions | Account's active plan + usage counters |
| practice_areas | Legal practice-area taxonomy |
| situations | Plain-language issue → practice-area routing dictionary |
| advocates | Advocate professional profile + verification status |
| advocate_practice_areas / advocate_languages / advocate_consultation_modes / advocate_jurisdictions | Advocate attribute junction tables |
| notify_requests | "Notify me when available" fallback capture |
| verification_cases | Bar Council enrolment verification workflow |
| intake_requests | Client's legal-help request (routing, urgency, consent) |
| conflict_checks | Advocate conflict-of-interest check per intake |
| match_results | Ranked advocate matches per intake |
| matters | An engaged legal matter (client+advocate) |
| tasks | To-dos on a matter |
| hearings | Court hearing dates on a matter |
| timeline_events | Append-only matter activity log |
| matter_access_grants | Third-party (e.g. family member) read access to a matter |
| fee_proposals | Advocate's fee proposal for a matter |
| invoices / invoice_line_items | Billing for a matter |
| payments | Payment capture record (escrow state) |
| message_threads / thread_participants / messages | Messaging between client and advocate |
| documents | Uploaded files (account/matter-scoped, optionally shared with an advocate) |
| doc_templates / clause_library / clause_conflicts | Document-drafting template + clause catalogue |
| document_drafts | A client's in-progress drafted document |
| draft_reviews | Advocate review of a draft |
| stamp_orders | Stamp-duty order for a draft |
| contract_reviews / contract_review_findings | Uploaded-contract AI review + findings |
| services / service_orders | Fixed-fee service catalogue + orders |
| consultations | Booked video/phone/chat/in-person consultation |
| corpus_documents / corpus_chunks | RAG knowledge-base text + metadata (vectors live in Qdrant, not Postgres) |
| research_queries | A saved "My Research" search |
| research_query_chunks | Retrieved-chunk scores for a query |
| research_answers | Built research answer (summary, case cards, structured note) |
| research_answer_segments | Individual cited passages of a research answer |
| research_chat_turns | Follow-up chat scoped to one research report |
| legal_assistant_sessions / legal_assistant_turns | AI Legal Assistant conversation history |
| public_questions / public_answers | Public Q&A (Ask & Learn) |
| guides | Editorial legal guides |
| firms | Law-firm directory entries |
| pack_rulesets | Label-compliance rule versions per product category |
| pack_scans | Label-compliance scan result |
| ruleset_diffs | Ruleset version-to-version change log |
| audit_logs | Cross-cutting audit trail (polymorphic actor/subject) |
| analytics_snapshots | Cached founder-dashboard tab payloads |
| corporate_account_health | Founder dashboard: per-account health score |
| advocate_performance_rows | Founder dashboard: per-advocate performance |
| knowledge_gaps | Founder dashboard: RAG corpus gap tracking |
| complaints | Customer complaint/escalation record |
| admin_access_grants | Admin override access to a matter (audit trail) — **appears unused by any route**, see Section 3 |
| payment_orders | Razorpay checkout-order tracking |

### RLS status

`schema.sql`'s final section (lines ~1107–1134) runs a `do $$ ... for r in select tablename from pg_tables where schemaname='public' loop execute 'alter table ... enable row level security' ... $$` over **every** table that exists at the time the script runs, then revokes all privileges from `anon`/`authenticated` and grants full access only to `service_role`. **No RLS policies are defined anywhere** (confirmed — no `create policy` statement appears in `schema.sql` or any migration). This matches the documented security model: RLS is enabled purely to deny the public `anon`/`authenticated` Supabase keys any direct table access, while the Express API (using the `service_role` key) bypasses RLS entirely and is the sole enforcement point for authorization.

Migration `002_security.sql` duplicates this same RLS-enable-everything + revoke/grant block (presumably the first time it was introduced, with `schema.sql` later updated to match for fresh installs).

Two migrations enable RLS on tables created **after** that original loop already ran, since the loop only catches tables existing at the time it executes:
- `004_research_library_v2.sql`: `alter table research_chat_turns enable row level security;` (no policies, same posture)
- `006_notify_requests.sql`: `alter table notify_requests enable row level security;` (no policies, same posture)

This means any **other** future migration that adds a new table must remember to explicitly enable RLS on it too — `schema.sql`'s loop only covers a fresh install, not an incremental upgrade. This is a process risk worth carrying into the migration plan (not found to be currently violated — `payment_orders`, added in migration `002`, is covered because `002` also re-runs the full enable-RLS loop after creating it — but it's a pattern a future migration could easily miss).

**Confirmed: no RLS policies exist anywhere** (matches the task's stated expectation).

### Migrations summary

| Migration | Purpose |
|---|---|
| 001_supabase_auth.sql | Phone+OTP → Supabase Auth (Google OAuth + email/password) cutover; adds `auth_id`, drops phone `not null`; adds `payment_orders` table; various column additions (CSAT, complaints self-service, contract review notes) |
| 002_security.sql | RLS-enable-everything + anon/authenticated revoke (the core "lock the DB to the API server" migration) |
| 003_web_source.sql | Adds `'web'` as a valid `corpus_documents.source` (Tavily fallback) |
| 004_research_library_v2.sql | Research Library v2: pin/tag/refresh-versioning on saved searches, structured case-card/related-search/related-case fields, new `research_chat_turns` table (with RLS enabled) |
| 005_research_fixes.sql | Adds `quoted_precedent` paragraph class; adds `normalized_text`/`rerun_count` dedupe columns + backfill + de-dupe data migration for pre-existing duplicate research queries |
| 006_notify_requests.sql | New `notify_requests` table (with RLS enabled) |
| 007_research_note_v2.sql (untracked, new) | Adds the 10-section structured note columns to `research_answers` (`sections`, `authorities`, `position`, `jurisdiction`, `law_as_on`, `note_schema_version`); adds `corpus_document_stats_by_source()` RPC |
| 008_research_not_found_reason.sql (untracked, new) | Adds `not_found_reason`, `top_score`, `live_fetch_ingest_failed` to `research_queries` ("honest no-match" UX) |

---

## 6. `frontend/src/shell/navConfig.js`

Read in full (103 lines). Exports:

**CLIENT_NAV(isBusiness)** (function, not a static array — conditionally includes "Pack compliance"):
| tab | label | icon |
|---|---|---|
| home | Home | faHouse |
| find | Find a lawyer | faUserTie |
| talknow | Talk now | faPhone |
| legalassistant | AI Legal Assistant | faRobot |
| research | Research library | faBookOpen |
| caselaw | Case law search | faGavel |
| draft | Draft a document | faFileLines |
| review | Contract review | faFileContract |
| pack | Pack compliance | faClipboardCheck | *(only if `isBusiness`)* |
| services | Services | faBriefcase |
| consultations | Consultations | faCalendarCheck |
| matters | My matters | faFolderOpen |
| documents | Documents | faFolder |
| messages | Messages | faMessage |
| learn | Ask & learn | faGraduationCap |
| profile | Profile | faUser |

**LAWYER_NAV**:
| tab | label | icon |
|---|---|---|
| lawyer | Dashboard | faChartLine |
| consultations | Consultations | faCalendarCheck |
| matters | Matters | faFolderOpen |
| messages | Client messages | faMessage |
| documents | Shared documents | faFolder |
| draftreviews | Draft reviews | faFileCircleCheck |
| learn | Ask & learn | faGraduationCap |
| legalassistant | AI Legal Assistant | faRobot |
| caselaw | Case law search | faGavel |
| profile | Profile & verification | faUser |

**ADMIN_NAV** (note: variable is exported as `ADMIN_NAV`, task referred to "admin nav" generically — confirmed this is its name):
| tab | label | icon |
|---|---|---|
| admin | Verification queue | faClipboardCheck |
| moderation | Moderation | faShieldHalved |
| orders | Service orders | faCartShopping |
| catalogue | Catalogue & rules | faList |
| complaints | Complaints | faTriangleExclamation |
| find | Listed advocates | faUserTie |
| profile | Profile | faUser |

**FOUNDER_NAV**:
| tab | label | icon |
|---|---|---|
| founder | Command Centre | faGaugeHigh |
| fdemand | Demand | faChartLine |
| fservices | Service performance | faBriefcase |
| ffunnel | User funnel | faFilter |
| frevenue | Revenue | faIndianRupeeSign |
| fcorp | Corporate accounts | faBuilding |
| fadv | Advocate performance | faUserTie |
| fai | AI performance | faRobot |
| fcomplaints | Complaints | faTriangleExclamation |
| profile | Profile | faUser |

**FOUNDER_TABS** = `Set(["founder","fdemand","fservices","ffunnel","frevenue","fcorp","fadv","fai","fcomplaints"])` — note `profile` is deliberately excluded from this set (it routes to the shared `Profile` screen, not `CommandCentre`).

**TAB_ALIASES** = `{ asklearn: "learn" }` — only one alias defined; exists so an old/bookmarked `#asklearn` hash still resolves instead of landing on a blank screen.

**DEFAULT_TAB** = `{ client: "home", lawyer: "lawyer", admin: "admin", founder: "founder" }`.

**viewFor(user, actAsClient)** — role→view mapping: founder→founder, admin→admin, advocate (unless `actAsClient`)→lawyer, everyone else→client. No signed-in user → "client" (unauthenticated browsing defaults to the client shell).

---

## 7. `frontend/src/state/UIState.jsx` + `frontend/src/shell/TabRouter.jsx`

### UIState.jsx (98 lines, read in full)

A single React context (`UIContext`) provided at `UIProvider`, holding:

- **`route` (`{tab, param}`)** — parsed from `window.location.hash` via `readHash()`, which strips a leading `#`/`#/`, splits on `/`, and resolves the first segment through `TAB_ALIASES`. Kept in sync with hash changes via a `hashchange` listener (covers browser back/forward or a hand-typed hash) which also resets scroll to top.
- **`modal` (`{name, props} | null`)** — a single global modal slot.
- **`toast` (string)** — single global toast message, auto-clears after 4.5s via a `setTimeout` stored in a `ref`.
- **`lang`** — persisted to `localStorage.vidhira.lang`, defaults to `"en"`.
- **`actAsClient`** — persisted to `localStorage.vidhira.asClient`, lets an advocate preview the client shell.
- **`handoff` (object keyed by target tab)** — one-shot data passed between screens (e.g., prefilling the AI Assistant from another screen); consumed via `takeHandoff(tab)` which deletes the key on read.
- **`assistantTurns` / `assistantSessionId`** — the AI Legal Assistant's conversation state, **hoisted here specifically because `TabRouter` fully unmounts the screen on every tab change** (comment confirms) — this is the nearest ancestor that survives tab switches, so switching tabs and coming back doesn't lose the conversation. Only an explicit "New conversation" action clears it.
- **`researchQuestion`** — same reasoning, holds the Research screen's typed-but-not-yet-submitted search box text across tab switches. (Submitted searches/reports are **not** kept here — they're keyed by id in the URL hash instead, reloaded fresh by `ResearchReport`/`JudgmentReader`.)
- **Sign-out reset effect**: when `status === "signed_out"` (from `useAuth()`), all of the above hoisted/one-shot state is wiped — explicitly to prevent a second person signing in on a shared device from seeing the first person's assistant conversation or research search box, since `UIProvider` sits above the signed-in/signed-out switch and never itself unmounts across that transition.
- **`go(tab, param, data)`** — the one navigation primitive: optionally stashes `data` into `handoff[tab]`, sets `window.location.hash`, closes any open modal, scrolls to top.

### TabRouter.jsx (47 lines, read in full)

- Lazy-imports ~24 screen components.
- `SHARED` object: screens common to multiple views (find, matters, consultations, documents, messages, profile, learn, legalassistant, caselaw, services).
- `BY_VIEW` maps `client | lawyer | admin | founder` → `{tab: Component}`. Client adds home/talknow/research/draft/review/pack on top of `SHARED`; lawyer adds lawyer-dashboard/draftreviews; admin is a standalone object (find, profile, admin, moderation, orders, catalogue, complaints — **not** spread from `SHARED`, so admin doesn't get messages/documents/matters/etc. even though those tabs exist in the general route space); founder is just `{profile: Profile}` since every other founder tab is handled by the `FOUNDER_TABS` special-case below.
- **Routing logic**: if `view === "founder"` and the current tab is in `FOUNDER_TABS`, render `<CommandCentre tab={tab} />` (one component handling all 9 founder dashboard tabs internally via its `tab` prop) instead of looking it up in `BY_VIEW`. Otherwise look up `BY_VIEW[view][tab]`; if undefined, render `null` (blank screen) — this is the fallback `TAB_ALIASES` exists to minimize, and the reason an unmapped hash silently shows nothing rather than erroring.
- Everything is wrapped in a single `<Suspense fallback={<Loading/>}>`.

**Hash-tab routing interaction with UIState**: `UIState` owns the single source of truth for "what tab/param are we on" (`route`), updates it either imperatively via `go()` or reactively via the `hashchange` listener, and `TabRouter` just reads `tab` out of `useUI()` to decide which lazy component to mount. Because `TabRouter` **fully unmounts** the previous screen on every tab change (no keep-alive), any state that must survive a tab round-trip has to live in `UIState` instead of screen-local state — which is exactly why `assistantTurns`/`assistantSessionId`/`researchQuestion` were hoisted there (per that file's own comments).

---

## 8. Backend test suite — baseline

Command: `npm test -w backend` → `backend/package.json`'s `test` script is `node --experimental-test-module-mocks --test`, run from the `backend` directory.

**Result: 188 / 188 passing. 0 failures, 0 cancelled, 0 skipped, 0 todo.**

```
ℹ tests 188
ℹ suites 0
ℹ pass 188
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2966.1973
```

No failures to report verbatim (there were none). Console noise during the run (expected, not failures — these are deliberate "external API unavailable, falling back" code paths being exercised by tests that intentionally don't mock every provider):
- Repeated `OpenRouter embedding re-rank failed, falling back to local TF-IDF: ...` (embeddings-not-mocked / "Cannot read properties of undefined (reading 'length')" / a deliberate `"boom"` test fixture) — these are exactly the fallback-path tests (`rankRelevantDocs() falls back to TF-IDF when the OpenRouter call fails`, etc.) printing their own expected warning, not failures.
- One `Tavily search failed, continuing without web evidence: Tavily API error 500: {"error":"Tavily is down"}` — again, a deliberate fallback-path test fixture.
- `[research:live-fetch] ...` lines are informational logging from the retrieval tests (fake Supabase/fetch mocks), not errors.
- Two `(node:...) ExperimentalWarning: Module mocking is an experimental feature...` — expected, since the test command explicitly opts into `--experimental-test-module-mocks`.

**No test failures were found or fixed** (per instructions, none needed fixing — reporting only).

---

## 9. Risk list

Specific, cited findings where auth, ownership, input validation, or rate limiting appear to be missing, inconsistent, or weaker than the surrounding pattern. Severity is relative to this codebase's own norms (most routes are well-guarded via `assertAccountMember`/`requireSide`/zod — these are the outliers).

1. **`backend/src/routes/askLearn.js:105-110` — `POST /answers/:id/helpful` has no rate limiter despite a comment promising one.**
   ```js
   router.post("/answers/:id/helpful", requireAuth, async (req, res) => {
     // One vote per call is not enforceable without a votes table; rate-limit instead.
     const { data: answer, error } = await getSupabase().rpc("increment_helpful_count", { answer_id: req.params.id });
   ```
   No `rateLimit(...)` middleware is attached to this route (unlike `questionLimiter` on `POST /questions` in the same file). Any signed-in user can call this repeatedly against any answer id to inflate `helpful_count` arbitrarily. Low business severity (a vanity counter) but the comment itself documents the intended mitigation as missing.

2. **`backend/src/routes/auth.js:60-62` — `PATCH /me`'s rate limiter is keyed by IP, not by user, and runs before `requireAuth`.**
   ```js
   const profileLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
   router.patch("/me", profileLimiter, requireAuth, async (req, res) => {
   ```
   Every other per-route limiter in the codebase (`askLearn.js`, `complaints.js`, `messages.js`, `legalAssistant.js`, `indianKanoon.js`) uses `keyGenerator: (req) => req.user?.id || req.ip`. This one has no `keyGenerator`, so it defaults to IP — meaning users behind the same NAT/proxy share one limit bucket, and it also runs *before* `requireAuth` in the chain (harmless here since it's IP-keyed anyway, but inconsistent with the rest of the codebase's convention of authenticating first).

3. **`backend/src/routes/legalAssistant.js:29-31` — stale/contradictory comment claims the route is unauthenticated; the code has `requireAuth`.**
   ```js
   // This route is unauthenticated (see note below) and every hit spends real IK +
   // OpenRouter money — a per-IP cap is the stopgap until a real auth boundary exists.
   ...
   router.post("/legal-assistant/ask", requireAuth, askLimiter, async (req, res) => {
   ```
   The comment at line 29 and the actual route definition at line 132 disagree: `requireAuth` is present, and `askLimiter`'s `keyGenerator` even says "Per signed-in user (the route is behind requireAuth), not per shared IP" three lines below the contradicting comment. Not a live security bug (auth *is* enforced), but a documentation hazard for anyone reasoning about this route's exposure during the TS migration — worth fixing the comment, and worth double-checking whether an unauthenticated version of this route ever shipped and was later locked down without the comment being updated.

4. **`backend/src/routes/payments.js` — no dedicated rate limit on `POST /payments/intents` or `POST /payments/verify`.**
   Both create real Razorpay API calls (`createRazorpayOrder`) or hit the Razorpay signature-verification path. Only the global 300/min/IP backstop from `app.js` applies. Every other cost-bearing third-party integration in the codebase (`indianKanoon.js`, `legalAssistant.js`) has a dedicated per-user limiter; payments does not.

5. **`backend/src/routes/research.js` — none of the 15 routes carry a dedicated rate limiter**, despite several being the most expensive operations in the entire backend: `POST /research/retrieve` (embeddings + possible live Indian Kanoon/Tavily fetch-and-index), `POST /research/answer` and `POST /research/queries/:id/refresh` (LLM generation + structured-note generation), `POST /research/queries/:id/ask` (LLM follow-up). Only the global 300/min/IP limiter applies. By contrast, `legalAssistant.js`'s comparable AI-answer route is capped at 20/15min per user, and `indianKanoon.js`'s case-law routes at 60/15min per user.

6. **`backend/src/routes/advocates.js:103-110` — `POST /advocates/notify-when-available` has no rate limiter.** Low severity (an insert-only notification request, not costly), but every field is optional and unvalidated against a schema.

7. **`backend/src/routes/intake.js` — `POST /intake-requests` and `POST /urgent-requests` have no dedicated rate limiter**, only the global backstop. `urgent-requests` in particular triggers advocate-matching logic and inserts a `conflict_checks` row — not free, though not an external paid API either.

8. **`admin_access_grants` table (schema.sql:990-999) is defined but never read or written by any of the 23 route files** (confirmed via full read of every route file — no `admin_access_grants` reference anywhere in `backend/src/routes/`). This is either dead schema (a feature that was designed but never wired up) or a genuine authorization gap: the schema's own comment pattern (and the analogous `matter_access_grants` which *is* fully wired through `matters.js` and `documents.js`) suggests this was meant to let an admin audit-record a reason for accessing a matter, similar to how `matter_access_grants` lets a third party view one — but no route currently grants, checks, or revokes it. Worth resolving during the TS migration: either wire it up or remove it (see also Delete List #1 below).

9. **`frontend/src/shell/TabRouter.jsx:35` — the `admin` entry in `BY_VIEW` is a standalone object, not spread from `SHARED`.** This means an admin user navigating to any `SHARED`-only tab key that isn't explicitly re-listed in the `admin` object (e.g. `matters`, `documents`, `messages`, `consultations`, `services`, `caselaw`, `legalassistant` all exist as route tabs for other views but are absent from `admin`'s object) will silently get a blank screen (`Screen` resolves to `undefined` → renders `null`) rather than an error — consistent with the documented fallback behavior, but worth flagging since it means admin-role users have no messaging/documents/matters UI at all today, which may or may not be intentional product scope (not a security bug — the backend routes still enforce their own `assertAccountMember`/role checks independently of what the frontend shell exposes).

10. **In-process auth identity cache (`backend/src/middleware/auth.js:10-21`) has no cross-instance invalidation.** A revoked/banned Supabase user can remain authenticated against any given process for up to 5 seconds (`IDENTITY_TTL_MS`) after revocation, and in a horizontally-scaled deployment each instance maintains its own independent cache with no shared invalidation signal. Likely an accepted tradeoff (5s is short), but worth carrying into the migration's threat model since Next.js/serverless deployment may change the process-lifetime assumptions this cache relies on.

---

## 10. Delete list — candidates for removal (NOT a decision, needs verification)

1. **`backend/src/seed/_tmp_clear_research.js`** — candidate, needs verification.
   - Evidence: filename is prefixed `_tmp_`; it is a one-off destructive cleanup script (empties `research_queries` and everything hanging off it) with a comment reading "One-off cleanup... per explicit user request." It is **not** referenced by any `package.json` script (compare to `seed.js`, `researchExamples.js`, `demoAdvocates.js`, which all have corresponding `npm run seed*` scripts in `backend/package.json`) and is not imported by any other file (confirmed via repo-wide grep).
   - Risk of deleting: none functionally (it's not wired into any workflow) — but confirm with whoever ran it that it isn't still needed as a one-off rerun script before removing.

2. **`scripts/debug-p17.png`** — candidate, needs verification.
   - Evidence: lives in the repo-root `scripts/` directory alongside the actively-used `qa-smoke.js` (which *is* wired into root `package.json`'s `"qa-smoke"` script and documented in `docs/QA-FIXES.md`). `debug-p17.png` itself has **zero references** anywhere in the repo (grepped `*.json`, `*.md`, `*.yml` and all source files) — it looks like a debugging screenshot artifact left behind (likely from a Playwright/overflow-check debugging session referenced in `docs/QA-FIXES.md`'s P1-7 notes) rather than a tracked fixture.
   - Risk of deleting: none apparent — it's a binary image with no code references.

3. **`admin_access_grants` table (`backend/src/db/schema.sql:990-999`)** — candidate, needs verification.
   - Evidence: see Risk #8 above — the table is defined with a full schema (actor, matter, reason, outcome, timestamps) but no route in `backend/src/routes/*.js` reads or writes it. Either this is a half-built feature that should be finished (not deleted) or genuinely dead schema.
   - Risk of deleting: **higher than the other two** — this is a schema change, not a file deletion, and the product intent (admin override access with audit trail) seems real given the parallel `matter_access_grants` feature that *is* fully wired. Recommend resolving the "finish vs. remove" question with product/eng before touching this one; flagged here only as evidence that it's currently unused code, not as a deletion recommendation.

4. **Stale comment in `backend/src/routes/legalAssistant.js:29`** (not a file to delete, but dead/misleading text worth cleaning up in the same pass) — see Risk #3.

No other dead route files, orphaned frontend screens, or unused migrations were found. All 23 backend route modules are mounted in `app.js`; all screen components lazy-imported in `TabRouter.jsx` are reachable from at least one `BY_VIEW` entry or `FOUNDER_TABS`; all 8 migrations are sequential and additive (no migration appears to undo or orphan an earlier one). `backend/src/scripts/researchRetrievalCheck.js` is live-tested (reads `services/research.js` directly) and has a corresponding `npm run research:check` script in `backend/package.json` — **not** a delete candidate. `scripts/qa-smoke.js` is likewise actively wired (root `package.json` + `docs/QA-FIXES.md`) — **not** a delete candidate.

---

## Appendix: other inventoried items (existence only, per task instructions)

- `backend/src/scripts/` — contains exactly one file: `researchRetrievalCheck.js` (confirmed live/used, see above).
- `docs/MASTER-PROMPT.md` — confirmed exists (content not summarized, per task scope).
- Other docs present: `docs/legal-ai-prompts.md`, `docs/legal-assistant-spec.md`, `docs/QA-FIXES.md`, `docs/RAG.md`, `docs/SETUP.md` (not summarized, out of scope).
- Stray artifacts found: `backend/src/seed/_tmp_clear_research.js`, `scripts/debug-p17.png` (both listed in Delete List above). No other `*.tmp`, `_tmp_*`, or `debug*.png/jpg` files found elsewhere in the repo (searched excluding `node_modules` and `.git`).
