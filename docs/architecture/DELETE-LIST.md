# Delete List — Phase 0 → Phase 5

Evidence-based candidates only. Per `docs/MASTER-PROMPT.md`'s cleanup rules, nothing here was deleted before explicit approval, and removal only happened in Phase 5 (except where a specific phase note below says otherwise). Full original evidence trail is in `00-inventory.md` §9–10 (written against the pre-monorepo `backend/` path layout; paths below are updated to their current `apps/api/` locations).

## Status legend
- **PENDING** — awaiting approval
- **APPROVED** — approved, not yet executed
- **DONE** — removed
- **REJECTED** — kept, decision recorded

| # | Item | Type | Why dead | Evidence | Risk if deleted | Status |
|---|---|---|---|---|---|---|
| 1 | `apps/api/src/seed/_tmp_clear_research.js` | Script file | One-off destructive cleanup script, not wired into any `npm` script (unlike `seed.js`, `researchExamples.js`, `demoAdvocates.js`) | `_tmp_` prefix; comment says "One-off cleanup... per explicit user request"; re-verified zero references in any source/config file (only mentioned in planning docs) | None — confirmed unused | **DONE** (Phase 5) |
| 2 | `scripts/debug-p17.png` | Stray artifact | Unreferenced debug screenshot | Re-verified zero references in any `*.json`/`*.md`/`*.yml`/source file | None | **DONE** (Phase 5) |
| 3 | `scripts/qa-smoke.js` + `docs/QA-FIXES.md` | Script + historical report | Not on the original Phase 0 list (wrongly marked "alive" below at the time — see superseded note) — `qa-smoke.js` hardcodes paths into a `backend/` directory that no longer exists post-monorepo-migration, and imports `frontend/e2e/fixtures.mjs`, which is now also gone. `QA-FIXES.md` is a dated, already-merged historical report with no forward-looking value | Grep for `backend/` paths throughout `qa-smoke.js`; `ls backend` confirms the directory doesn't exist; root `package.json`'s `"qa-smoke"` script pointed at the dead file | None — both were already fully dead before deletion | **DONE** (Phase 5) |
| 4 | `admin_access_grants` table (`apps/api/src/db/schema.sql`) | DB schema | Fully defined (actor, matter, reason, outcome, timestamps) but no route in any module reads or writes it — looks like a half-built feature, not confirmed-dead | No route references found via full-repo grep | **Higher risk — schema change, not a file deletion.** The analogous `matter_access_grants` feature IS fully wired, suggesting real product intent here. Needs a product/eng decision: finish the feature, or formally drop the table (additive-only constraint in MASTER-PROMPT.md means dropping it requires explicit sign-off, not a default action) | PENDING — needs product decision, not just engineering approval |

## Executed alongside the delete list: the Phase 5 cutover

The entire legacy `frontend/` Vite SPA workspace (and the Express static-SPA-serving block in `apps/api/src/app.js` that served its build output) were removed once the new `apps/web` Next.js app had parity, confirmed by a real Playwright + axe-core smoke suite (`apps/web/e2e/`, 50/50 passing against every screen across all 4 roles — see that suite's own README for scope and the 3 real bugs it found before this cutover). Specifically:
- `frontend/` directory deleted entirely (Vite config, `index.html`, `main.jsx`, `App.jsx`, `TabRouter.jsx`, all screens, its own `e2e/` suite, etc.)
- Root `package.json`: removed `"frontend"` from `workspaces`; `dev`/`dev:full`/`build`/`lint`/`e2e` scripts repointed at `apps/web`
- `apps/api/src/app.js`: removed the `CLIENT_DIST` constant, `express.static(CLIENT_DIST)`, and the catch-all `sendFile(index.html)` route — API-only now, Next.js is the sole public entry point
- `CLIENT_ORIGIN` defaults (`apps/api/src/app.js`, `apps/api/src/config/env.ts`, `.env`, `.env.example`) updated from the Vite dev-server port (`:5173`) to Next.js's (`:3000`)

## Not on this list (checked, confirmed alive)

For the record, these were investigated as possible candidates during the inventory pass and ruled out — still true:
- `apps/api/src/scripts/researchRetrievalCheck.js` — wired to `npm run research:check`, actively used.
- All route modules — every one is mounted in `app.js`.
- All DB migrations — sequential and additive, none orphaned.

> Superseded: the original Phase 0 pass ruled `scripts/qa-smoke.js` "alive" because it was wired to root `package.json` and documented in `QA-FIXES.md` — true at the time, but it silently went dead when `backend/` was renamed to `apps/api/` during the monorepo migration and nobody updated it. Re-evaluated and removed in Phase 5 (item 3 above).

## Deferred (addressed or re-scoped during Phase 5)

Per MASTER-PROMPT.md's cleanup rules, these categories were flagged for a dedicated pass once the relevant phase was reached:
- ~~Vite toolchain~~ — **DONE**, removed with the rest of `frontend/` above.
- ~~Express static/SPA-serving code in `app.js`~~ — **DONE**, removed above.
- `morgan` — still in active use in `app.js` for HTTP access logging; **not removed**. `pino` (not `pino-http`) was introduced in Phase 1 for app-level structured logging, but the two aren't yet redundant — swapping `morgan` for `pino-http` middleware is a real code change (not a deletion) and is out of scope for this pass. `nodemon` was already removed earlier (now `tsx watch`).
- Unreferenced docs, unused exports/components — still deferred to a `knip` run; not yet done.
- Duplicated utility variants (cosine/tfidf/cache/sanitizeHtml) — not yet surveyed.
