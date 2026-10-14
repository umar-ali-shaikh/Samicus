# Rollback plan — Phase 5 cutover

Covers rolling back the one irreversible-in-practice step of this migration: deleting the legacy
`frontend/` Vite SPA and repointing `apps/api` + root scripts at `apps/web`/Next.js as the sole
public entry point. Everything else in the migration (Phases 1–4: monorepo split, auth rewrite,
domain-slice ports, worker/scale) already has its own git history and isn't re-litigated here.

## Trigger conditions

Roll back if, after deploying `apps/web` as the public entry point, any of:
- A screen or flow that `apps/web/e2e`'s smoke suite doesn't cover (see its README's documented
  scope cut — `flows.mjs`'s deep interactive flows weren't ported) breaks for real users in a way
  that blocks a core job (sign-in, booking, messaging, payments, drafting).
- `apps/api`'s error rate or p95 latency regresses materially against the `04-performance.md`
  baseline after the cutover (new traffic pattern: `apps/web`'s server actions instead of the old
  SPA's direct browser calls).
- A security-relevant regression surfaces that `02-security-model.md`'s known-gaps list doesn't
  already cover.

## Rollback steps (git-level)

The cutover is exactly 3 commits-worth of change (root `package.json`, `apps/api/src/app.js`,
`.env`/`.env.example`/docs, plus the `frontend/` deletion itself) on top of a clean, tagged state.
To revert:

```bash
# 1. Identify the commit(s) that performed the cutover (this doc's own commit and its
#    immediate predecessors — check `git log --oneline -- frontend apps/api/src/app.js` for the
#    exact range once committed).
git log --oneline -- frontend/ package.json apps/api/src/app.js

# 2. Revert them in reverse order (newest first), which restores frontend/ from git history —
#    nothing is lost, git still has every byte.
git revert <cutover-commit-sha>

# 3. Reinstall (frontend/'s own node_modules aren't in git) and verify both stacks boot:
npm install
npm run dev:full   # confirm the legacy SPA at :5173 (Vite's default) still works, alongside apps/web
```

Because `apps/api/src/app.js`'s static-SPA-serving block (`express.static(CLIENT_DIST)` + the
catch-all `sendFile`) is restored by the same revert, `apps/api` immediately regains its ability
to serve the legacy SPA's build output from one origin, exactly as before the cutover.

## Rollback steps (deploy-level, if already live)

If the legacy `frontend/` deploy target (whatever hosted its build output) was decommissioned:
1. Re-point the production domain back at the last-known-good `apps/api`+`frontend/` single-
   origin deployment (the revert above reproduces that build).
2. Leave `apps/web`'s deployment running in parallel at its own subdomain/path rather than tearing
   it down — rollback should be "stop sending users here," not "delete the new thing," so the next
   cutover attempt doesn't start from zero.
3. `apps/api`'s `CLIENT_ORIGIN` must be set back to the legacy SPA's dev/production origin
   (`:5173` in dev) if it was already changed to `apps/web`'s origin — see
   `02-security-model.md` §1 for why this mostly only matters for the hypothetical direct-browser-
   to-API path, not the server-to-server path `apps/web` uses.

## What does NOT need rolling back

- **Phases 1–4** (monorepo split, auth/JWT rewrite, domain-slice module ports, Redis/worker
  scale-out) are independent of the frontend choice — `apps/api` serves either frontend
  identically. Rolling back the frontend cutover does not require touching any of that.
- **`packages/contracts`, `packages/rag`, `apps/worker`** have no frontend dependency at all.
- The two small `DELETE-LIST.md` file deletions (`_tmp_clear_research.js`, `debug-p17.png`) and
  the dead `qa-smoke.js`/`QA-FIXES.md` removal are independent, low-risk, and not part of this
  trigger condition — no reason to revert those even if the frontend cutover itself is rolled back.

## Post-rollback follow-up

A rollback here means `apps/web` had a real gap this suite's scope cut let through. Before
attempting the cutover again: extend `apps/web/e2e` to cover whatever broke (ideally by finally
porting `flows.mjs`'s interactive-flow coverage, the suite's own documented fast-follow), and
re-run the full suite clean (see this phase's own lesson: never let anything else write to
`apps/web/.next` while its dev server is running the suite — a corrupted Turbopack cache mid-run
produces false failures indistinguishable from real ones without checking the server log).
