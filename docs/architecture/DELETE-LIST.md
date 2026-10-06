# Delete List — Phase 0

Evidence-based candidates only. Per `docs/MASTER-PROMPT.md`'s cleanup rules, nothing here is deleted yet — this list requires explicit approval before any removal, and removal only happens in Phase 5 (except where a specific phase note below says otherwise). Full evidence trail is in `00-inventory.md` §9–10.

## Status legend
- **PENDING** — awaiting approval
- **APPROVED** — approved, not yet executed
- **DONE** — removed
- **REJECTED** — kept, decision recorded

| # | Item | Type | Why dead | Evidence | Risk if deleted | Status |
|---|---|---|---|---|---|---|
| 1 | `backend/src/seed/_tmp_clear_research.js` | Script file | One-off destructive cleanup script, not wired into any `npm` script (unlike `seed.js`, `researchExamples.js`, `demoAdvocates.js`) | `_tmp_` prefix; comment says "One-off cleanup... per explicit user request"; no `package.json` reference; no importers anywhere in repo | None functionally — but confirm it isn't kept around as a reusable one-off rerun script | PENDING |
| 2 | `scripts/debug-p17.png` | Stray artifact | Unreferenced debug screenshot | Zero references in any `*.json`/`*.md`/`*.yml`/source file; sits next to the actively-used `qa-smoke.js` but isn't itself wired to anything | None apparent | PENDING |
| 3 | `admin_access_grants` table (`backend/src/db/schema.sql:990-999`) | DB schema | Fully defined (actor, matter, reason, outcome, timestamps) but no route in any of the 23 route files reads or writes it — looks like a half-built feature, not confirmed-dead | No route references found via full-repo grep across `backend/src/routes/` | **Higher risk — schema change, not a file deletion.** The analogous `matter_access_grants` feature IS fully wired, suggesting real product intent here. Needs a product/eng decision: finish the feature, or formally drop the table (additive-only constraint in MASTER-PROMPT.md means dropping it requires explicit sign-off, not a default action) | PENDING — needs product decision, not just engineering approval |

## Not on this list (checked, confirmed alive)

For the record, these were investigated as possible candidates during the inventory pass and ruled out:
- `backend/src/scripts/researchRetrievalCheck.js` — wired to `npm run research:check`, actively used.
- `scripts/qa-smoke.js` — wired to root `package.json`'s `qa-smoke` script and documented in `docs/QA-FIXES.md`.
- All 23 backend route modules — every one is mounted in `app.js`.
- All frontend screens lazy-imported in `TabRouter.jsx` — every one is reachable from `BY_VIEW` or `FOUNDER_TABS`.
- All 8 DB migrations (001–008) — sequential and additive, none orphaned.

## Deferred (not evaluated yet — out of scope for Phase 0)

Per MASTER-PROMPT.md's cleanup rules, these categories still need a dedicated pass once the relevant phase is reached (NOT assumed dead yet):
- Vite toolchain (`vite.config.js`, `index.html`, `main.jsx`, `App.jsx`, `TabRouter.jsx`, hash-routing parts of `UIState.jsx`, `oxlint` config) — only removable after `apps/web` fully replaces the SPA (end of Phase 3 / Phase 5).
- Express static/SPA-serving code in `backend/src/app.js` (the `express.static(CLIENT_DIST)` block + catch-all `sendFile` route) — only removable once Next.js is the sole public entry point.
- `morgan`, `nodemon` — removable once `pino-http` and `tsx` are introduced in Phase 1.
- Unused `frontend/public` icons, unreferenced docs, unused exports/components — deferred to a `knip` run in Phase 5.
- Duplicated utility variants (cosine/tfidf/cache/sanitizeHtml) — not yet surveyed; to be checked during Phase 3 module-by-module ports.
