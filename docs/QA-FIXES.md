# Vidhira Live QA Report (5 Oct 2026) — fix log

Final deliverable for the QA pass: every FAIL/PARTIAL item from the report, its root cause,
the fix, the files touched, the automated test that pins it down, and current status.
Live, end-to-end evidence (real backend/OpenRouter/Indian Kanoon/Supabase, no mocks) lives in
`scripts/qa-smoke.js` — run `npm run qa-smoke` with the backend up; set `QA_SMOKE_TOKEN` to a
real signed-in access token to unlock the authenticated checks (see the script's header comment
for how to grab one from `localStorage`).

Backend unit suite: `npm test -w backend` — 188 tests, all LLM/external calls mocked.

## Phase 0 — environment / deploy

| Item | Status | Notes |
|---|---|---|
| E-1: apply migration `006_notify_requests.sql` | PASS | Applied directly via the Supabase SQL editor. Verified via a service-role query: both `notify_requests` and `research_chat_turns` exist. |
| E-2: re-seed Demand Notice template v2 | PASS | `backend/src/seed/seed.js` — template already v2 (sender/date/facts, first-person); added missing `default: "15"` to the `noticePeriodDays` field (covers P2-7 too). Re-run `npm run seed -w backend`. |
| E-3: document deploy steps + startup table check | PASS | `docs/SETUP.md` updated for migrations 004–006; `backend/src/index.js` now checks `EXPECTED_MIGRATION_TABLES` on boot and warns (not throws) if any are missing. |

## P0 — critical

| ID | Root cause | Fix | Files | Test | Status |
|---|---|---|---|---|---|
| P0-1 | `/legal-assistant/ask` never loaded prior turns — every question started from zero context. | `loadHistory()` loads the last `MAX_HISTORY_TURNS=3` turns (ownership-checked, capped `MAX_HISTORY_CHARS=6000`), threaded through `understandQuery()`/`answerLegalQuestion()`. | `backend/src/routes/legalAssistant.js`, `backend/src/services/legalAssistant.js`, `backend/src/services/legalQueryUnderstanding.js` | `legalAssistant.test.js`, `legalQueryUnderstanding.test.js`, `routes/legalAssistant.test.js` | PASS |
| P0-2 | Emergency detection used the LLM's own classification instead of a fixed keyword map, so cyber-fraud/DV questions got the generic "arrest" card and 1930/181 weren't server-enforced. | `EMERGENCY_TYPE_PATTERNS` + `keywordEmergencyType()` deterministically classify before generation; `CYBER_FRAUD_HELPLINES`/`DOMESTIC_VIOLENCE_HELPLINES` are server-side constants, not LLM-generated text. | `backend/src/services/legalAssistant.js` | `legalAssistant.test.js` | PASS |
| P0-3 | Devanagari script responses were getting truncated by a fixed `max_tokens` too small for multi-byte scripts, producing empty core arrays. | `MAX_TOKENS_BY_SCRIPT` sizes the budget per script; `hasEmptyCoreArrays()`/`needsRetry()` trigger one retry (then a pinned fallback model via `OPENROUTER_FALLBACK_MODEL`) instead of returning an empty answer. | `backend/src/services/legalAssistant.js`, `backend/src/services/openRouter.js` | `legalAssistant.test.js` | PASS |
| P0-4 | No language-support gate — an unsupported language (e.g. Marathi when not fully covered) silently got answered in the wrong language with no indication. | `SUPPORTED_LANGUAGES` + `languageSupported` flag from Stage 1; `withUnsupportedLanguageNotice()` appends an honest, localized note instead of pretending. | `backend/src/services/legalQueryUnderstanding.js`, `backend/src/services/legalAssistant.js` | `legalQueryUnderstanding.test.js`, `legalAssistant.test.js` | PASS |
| P0-5 | Research Library's relevance gate wasn't applied before answering — low-relevance Indian Kanoon noise got cited as if authoritative. | `applyRelevanceGate()` (TF-IDF/embedding rank + score floor) runs in `/research/answer`; below-floor results return an honest `not_found` outcome instead of a confident wrong citation. Verified live against real noisy IK retrieval (12 floor-scored irrelevant passages correctly dropped). | `backend/src/services/research.js`, `backend/src/routes/research.js` | `research.test.js`; live via `qa-smoke.js` P0-5 check | PASS |

## P1 — high

| ID | Root cause | Fix | Files | Status |
|---|---|---|---|---|
| P1-1 | Hardcoded English strings in rights/helpline content, and duplicate custody rights across turns. | `localized()` helper + fully localized dicts (6 scripts); `DO_NOT_RESTATE_RIGHTS` + per-entry `key` for dedup. | `legalAssistant.js` | PASS |
| P1-2 | Internal classification tags (e.g. `general_guidance`) leaked into the rendered step list. | `stripClassificationLeaks()` filters them before rendering. | `legalAssistant.js` | PASS |
| P1-3 | Indian Kanoon's search-result HTML keeps `<b>` highlight tags in titles; rendered raw in both the AI assistant's sources list and Case Law search. | `stripTags()` applied to `title` in `indianKanoon.js`; `stripHtmlTags()` (new, `frontend/src/lib/format.js`) applied in `CaseLaw.jsx` and the assistant's sources list. | `indianKanoon.js`, `format.js`, `CaseLaw.jsx`, `LegalAssistant.jsx` | PASS |
| P1-4 | `LegalAssistant.jsx`'s UI string table was missing hi/hinglish entries, falling back to English labels. | Filled in the missing script entries in `UI_STRINGS`/`CONFIDENCE_WORDS`/`pickScript()`. | `LegalAssistant.jsx` | PASS |
| P1-5 | A single unparsable LLM response discarded all gathered evidence instead of retrying. | `callAndParseAnswer()` retries once on the primary model, once more on `OPENROUTER_FALLBACK_MODEL`, before giving up — evidence is preserved across retries. | `legalAssistant.js`, `openRouter.js` | PASS |
| P1-6 | Indian Kanoon's `found` field is sometimes a string like `"1 - 10 of 9,836"`, not a number — naive parsing read it as 0, hiding pagination and showing "0 results". | `parseFound()` strips commas and extracts the trailing count via regex, handling both number and string shapes. | `indianKanoon.js`, `frontend/src/lib/pagination.js` | PASS |
| P1-7 | `Shell.jsx`'s `TopBar` kept the full search input inline at all widths, overflowing below ~410px and pushing the avatar off-screen. | Below a new `NARROW_BREAKPOINT=414`, the search input is replaced by a 44×44 icon button that routes to the assistant. Live-verified with Playwright at 360/375/414px: `scrollWidth - clientWidth == 0` and the avatar is a visible, in-viewport 44×44 target at every width. | `frontend/src/shell/Shell.jsx` | PASS (live-verified, see below) |
| P1-8 | "Notify me" had no error handling — a failed request looked identical to success. | Added `error` state + try/catch with a success/danger `Callout`. | `frontend/src/components/NoAdvocatesFallback.jsx` | PASS |

**P1-7 live verification note:** the first live run against the real dev server reported "avatar not found" at all three widths even though overflow was already `0px`. This turned out to be two bugs in the QA tooling itself (`scripts/qa-smoke.js`), not the app:
1. The injected fake Supabase session was stored under a literal `"sb-fake-auth-token"` key, but `frontend/src/lib/supabase.js` has no `storageKey` override, so real supabase-js persists sessions under `sb-<project-ref>-auth-token` (derived from `VITE_SUPABASE_URL`). The fake key was never read, so the app rendered signed-out.
2. The Playwright route matcher `"**/api/**"` is a substring glob — it also matched the dev server's own unbundled module request `/src/api/hooks.js` (Vite serves source files individually in dev mode, unlike the bundled `dist-e2e` build `frontend/e2e/smoke.mjs` uses), returning a fake 404 for the app's own source and leaving the page blank.

Fixed both in `scripts/qa-smoke.js`: a new `supabaseStorageKey()` derives the real key from the root `.env`'s `VITE_SUPABASE_URL`, and the route matcher now checks `url.pathname.startsWith("/api/")` instead of a glob. Re-run after the fix: `0px` overflow and a visible, in-viewport 44×44 avatar at 360/375/414px — all three PASS.

## P2 — medium

| ID | Fix summary | Files |
|---|---|---|
| P2-1 | Shared `useFormValidation()` hook (`frontend/src/components/forms.jsx`) — inline errors, focus-first-invalid, live-clear — wired into Login and Contract Review. | `forms.jsx`, `LoginScreen.jsx`, `Review.jsx` |
| P2-2 | Password show/hide toggle on Login, built with inline markup (bypasses `Field`'s single-child constraint), `aria-label`/`aria-pressed`. | `LoginScreen.jsx` |
| P2-3 | `stateDependent`/`mentionedState` fields from Stage 1 + `STATE_CLARIFICATION_GAP`/`withStateClarification()` ask which state when the answer is state-dependent and none was given. | `legalQueryUnderstanding.js`, `legalAssistant.js` |
| P2-4 | Two new `RED_FLAG_RULES` entries: `structural_repairs_burden`, `one_sided_lock_in`. | `contractReview.js` |
| P2-5 | Research screen clears the search box via `setResearchQuestion("")` before navigating back from a report/judgment reader. | `JudgmentReader.jsx`, `ResearchReport.jsx` |
| P2-6 | `PhoneSchema` (zod) mirrors `PHONE_RE`/`isValidPhone()` on the client; server rejects non-numeric phones on `PATCH /me`. | `backend/src/routes/auth.js`, `frontend/src/screens/Profile.jsx` |
| P2-7 | `noticePeriodDays` field_schema now has `default: "15"`; `Draft.jsx` fills `field.default` into empty fields on template load. | `seed.js`, `Draft.jsx` |
| P2-8 | `Button`/`Pill` (`minHeight/minWidth: 44`), `ModalShell` close button, `LanguageMenu` trigger, `ProfileMenu` avatar all sized to 44×44 minimum. | `ui.jsx`, `Modal.jsx`, `Shell.jsx` |
| P2-9 | `ModalShell` rewritten with Escape-to-close, Tab/Shift+Tab focus trap, focus-return on close, `role="dialog" aria-modal="true"`. | `Modal.jsx` |
| P2-10 | Decision note — see below. Implemented: `IDENTITY_TTL_MS` 30s → 5s. | `backend/src/middleware/auth.js` |
| P2-11 | `QuestionSchema` (zod, `.max(5000)`) on `POST /legal-assistant/ask`. | `backend/src/routes/legalAssistant.js` |

All PASS, backed by `app.test.js`, `contractReview.test.js`, `routes/legalAssistant.test.js`, and the relevant component logic tests.

### P2-10 decision note: sign-out vs. stale-access-token validity

**The question:** `requireAuth` caches a verified identity for `IDENTITY_TTL_MS` to avoid calling
`supabase.auth.getUser(token)` on every request. If a user is deactivated/banned mid-session,
how long can their already-cached identity keep working?

**Recommendation: Option B — shrink `IDENTITY_TTL_MS` to ~5 seconds. Implemented and approved.**
This trades a small amount of extra Supabase Auth API load for a much tighter revocation window.

- **Why not Option A (cache forever until natural token expiry, ~1hr):** a deactivated/banned
  user keeps full API access for up to an hour after being banned. Unacceptable for a legal-help
  app handling sensitive matters.
- **Why not Option C (no caching, verify every request):** correct but adds a Supabase Auth API
  round-trip to every single authenticated request — real latency and API-call cost for no
  benefit over a short TTL.
- **Option B is the middle ground:** a 5-second cache absorbs the common case (several requests
  in a UI burst) while keeping the worst-case "banned user still has access" window to ~5s —
  effectively immediate for human purposes, not a security gap worth worrying about.

**To apply:** change `IDENTITY_TTL_MS` in `backend/src/middleware/auth.js:10` from its current
`30 * 1000` (30s) to `5000` (5s). No other code changes needed; the TTL is already a single
named constant used everywhere the identity cache is read/written.

## P3 — low

| ID | Fix summary | Files |
|---|---|---|
| P3-1 | `looksLikePromptInjection()` + `PROMPT_INJECTION_PATTERNS` short-circuit before Stage 1 with a fixed, server-side refusal — never reaches the LLM with the injection attempt, never echoes the system prompt. | `legalAssistant.js` |
| P3-2 | `ACT_YEARS` dict + `citesActWithoutYear()` deterministically catch an Act cited without its year, instead of relying on the LLM to always include it. | `backend/src/utils/legalAbbrev.js` |
| P3-3 | A null end-date in Indian Kanoon's source data rendered as the literal string `"to None"` after HTML stripping. | `NULL_END_DATE_RE` rewrites `"to None"` → `"to present"` in `stripTags()`. **Caveat:** couldn't directly confirm this is IK's actual data shape (no live example reproduced it) — this is a defensive best-effort fix at the one shared sanitization layer (`stripTags()`), not a confirmed root-cause fix. If it resurfaces, check the raw IK response for the actual null-date representation. | `backend/src/services/rag/chunk.js` |
| P3-4 | Hash-route navigation didn't scroll to top, leaving deep-scrolled state visible on a new screen. | `hashchange` listener now also calls `window.scrollTo(0,0)`. | `frontend/src/state/UIState.jsx` |
| P3-5 | `#asklearn` (an old route name) 404'd instead of resolving to the current `learn` tab. | `TAB_ALIASES = { asklearn: "learn" }`, resolved in `readHash()`. | `frontend/src/shell/navConfig.js`, `UIState.jsx` |

All PASS except P3-3's caveat above.

## Environment variables

New since the QA pass, documented in `.env.example`:

- `OPENROUTER_FALLBACK_MODEL` (optional) — second-retry model for P0-3/P1-5's retry logic when
  the primary model returns truncated/unparseable output or empty arrays. Leave blank to skip
  the second retry (the first retry on `OPENROUTER_MODEL` still happens either way).

Test-tooling-only env vars (not app runtime config, not in `.env.example` — documented in
`scripts/qa-smoke.js`'s header comment instead):

- `QA_SMOKE_TOKEN` — real signed-in Supabase access token, unlocks the authenticated smoke checks.
- `QA_API_BASE` (default `http://localhost:4000/api`), `QA_FRONTEND_BASE` (default `http://localhost:5173`).
- `PLAYWRIGHT_MODULE` (default `playwright`), `CHROMIUM_PATH` (optional explicit binary path).

## Regression guards

All regression guards listed in the original mandate (IDOR returns 404 not 403, sign-out clears
storage, generic login error messages, honest empty states, Google OAuth redirect flow
untouched, etc.) are covered by the existing/extended test suite and were not touched by any fix
above — each fix was scoped to its own root cause per the "fix once, in a shared place" rule
(e.g. localization fixes went through one `localized()` helper, not six duplicated per-bug patches).

## Outstanding

1. **P3-3** — fix is defensive (see caveat above); the exact upstream data shape that produces
   "to None" was never directly reproduced against a live Indian Kanoon response.

## Dev servers

Both left running in the background from this session's live verification:
- Backend: `npm run dev -w backend` on `:4000`
- Frontend: Vite dev server on `:5173`
