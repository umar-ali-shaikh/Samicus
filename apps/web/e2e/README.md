# UI tests (Playwright + axe-core, real backend)

`smoke.spec.ts` covers every screen, across all 4 roles (client, advocate, admin, founder) --
matches the legacy `frontend/e2e/smoke.mjs`'s breadth. Its sibling `flows.mjs` (interactive
flows: booking wizard, urgent help, talk now, drafting, research, assistant, messaging, matters,
advocate dashboard, plus auth mechanics) is being ported incrementally into separate
`flows-*.spec.ts` files -- `flows-auth.spec.ts` (signup, sign-in, email verification, Google
OAuth redirect, session invalidation), `flows-booking.spec.ts` (the full intake -> slot ->
pricing -> consent -> consultation wizard), `flows-talknow.spec.ts` (instant request ->
consent -> real matching), and `flows-drafting.spec.ts` (template -> fields autosave -> clause
toggle -> live preview -> a real DOCX download) are done; the rest are in progress. The legacy
suite's "urgent help"
flow is intentionally not among them -- see `flows-talknow.spec.ts`'s header comment: apps/web
was never scoped to build that wizard (`docs/MASTER-PROMPT.md`'s target_structure names only
`talk-now/`), so there is no page left to port it against. One technique from the
legacy suite does **not** carry over: it asserted on exact request payloads via browser-level
network interception, which only worked because the legacy app's client-side JS called
Supabase/the API directly from the browser. This app never does that -- every Supabase/apps/api
call happens server-side in a Server Action, invisible to Playwright's network interception
entirely (see `docs/architecture/01-target-architecture.md` section 2: "the browser never calls
Express directly"). Where the legacy suite checked a payload, the ported flows check the
resulting **database row** instead, via the same service-role admin client `global-setup.ts`
uses -- arguably a stronger check, since it validates the full round trip, not just the wire
format.

Unlike the legacy suite (stubbed network, exact-text fixture assertions), this runs against the
**real** `apps/api` + `apps/web` + the real Supabase/Qdrant project in `.env`. `global-setup.ts`
creates 4 disposable auth users plus the minimal seed data each screen needs directly via the
Supabase service-role client, performs a real sign-in through the actual `/login` form per role
(not hand-crafted cookies), and saves each as a Playwright `storageState`. `global-teardown.ts`
deletes every row and every auth user it created, win or lose -- the dev/staging project this
runs against should look identical before and after.

**Never point this at a production Supabase project.** It writes real rows into
`users`/`accounts`/`matters`/`documents`/... (cleaned up after, but still real writes while the
run is in progress).

```bash
npm run e2e -w apps/web
```

## What "smoke" means here

Per screen: the page responds 2xx, nothing throws a page error or logs a console error, and
axe-core (`wcag2a`/`wcag2aa` tags) finds no serious/critical violation -- **except** the two
known findings below, which are logged as warnings rather than failed. Some screens legitimately
render an empty-state rather than populated content (seed data is minimal, not exhaustive per
screen); that's a valid smoke pass, not a failure.

## Bugs this suite found and fixed (first full runs)

Running against the real backend for the first time surfaced three genuine, previously-unnoticed
bugs -- every existing unit/integration test had passed against each of these, for the reasons
noted:

- **`GET /doc-templates/:id` 500'd on every real template.** `fieldSchemaEntryDto`
  (`packages/contracts/src/drafting.ts`) was `.strict()` with a non-optional `required: boolean`
  and no `wide` field at all -- but `seed.js`'s own Rental Agreement template leaves `required`
  unset on some fields and sets `wide: true` on `propertyAddress`. No test fixture happened to
  include either case. Fixed by making `required` optional and declaring `wide`.
- **`GET /advocate/draft-reviews` (list) and its `:id` detail both 500'd whenever a review
  existed.** `drafting/repository.ts`'s `listReviewsForAdvocate` embedded
  `document_drafts` from `draft_reviews` with no FK hint, reasoning "exactly one FK, so it's
  unambiguous" -- true once, but `document_drafts.review_id -> draft_reviews.id` was added
  later (schema.sql's `alter table document_drafts add constraint
  document_drafts_review_id_fkey...`), making the relationship genuinely ambiguous to real
  PostgREST. `fakeSupabase`'s embed resolution doesn't model that ambiguity, so every existing
  test passed anyway. Fixed with an explicit `!draft_reviews_draft_id_fkey` hint.
- **`/assistant` logged a React hydration-mismatch on every load.** `VoiceInputButton`
  (`AssistantClient.tsx`) read `typeof window !== "undefined"` directly in render to decide
  whether to show the mic button -- always `false` on the server, so the server and the client's
  first render necessarily disagreed. Fixed with the standard `useEffect`-after-mount pattern
  (render `null` until mounted, same as the server, then re-render once client-only feature
  detection has actually run).

## Bugs `flows-auth.spec.ts` found and fixed

- **Signing in before confirming your email silently bounced back to the login screen, with
  zero feedback.** `signInAction` (`server/authActions.ts`) redirected to `/verify-email` on a
  "not confirmed" error, but `signInWithPassword()` never actually establishes a session for an
  unconfirmed user (confirmed via a temporary debug log: `/verify-email`'s own `getUser()` came
  back `null` when reached this way) -- and that page requires a real session to render, so it
  immediately redirected right back to `/login`. A user would see nothing explaining why signing
  in with the right password appeared to do nothing. Fixed by showing the message inline on
  `/login` instead of redirecting to a page that needs a session that was never there.

## Bugs `flows-drafting.spec.ts` found and fixed

- **Clicking a clause card to select it would sometimes silently deselect it again a moment
  later.** `DraftEditorClient.tsx` wrapped a clause's checkbox in a `<label>` purely for layout;
  clicking the card's title text (inside that label) makes the browser dispatch a *second*,
  synthetic click on the wrapped checkbox, and both bubble up to the card's own `onClick`. When
  the two dispatches land in the same React batch, both read the same stale `selected` and agree
  ("add" twice, no real double-toggle); when they don't -- the second dispatch fires after React
  has already re-rendered with the clause selected -- the handler reads the *new* state and
  immediately removes what the first click just added. First surfaced as an intermittent
  Playwright timeout (passed in isolation, failed under load) before being traced to this.
  Fixed by changing that wrapper to a plain `<div>`: the checkbox is read-only decoration, not an
  independent control, so there was never a reason for the browser's label-activates-control
  behavior to apply here.

## Bugs `flows-booking.spec.ts` found and fixed

- **An advocate with no consultation modes configured let a client sail through the entire
  9-step booking wizard, only to fail at the very last step with "This advocate does not offer
  that consultation mode."** `BookingWizard.tsx` defaulted `form.mode` to a hardcoded `"video"`
  whenever `advocate.consultation_modes` was empty (e.g. a profile that hasn't been fully set up
  yet), and step 4's own completion check only asked `Boolean(form.mode)` -- true regardless, so
  it silently let the client past a step that had nothing valid to offer. The client would fill
  in the issue, urgency, location, language, pick a slot, see pricing, and tick consent, before
  the server's real validation finally rejected it. Fixed by defaulting `form.mode` to `""` when
  no modes are configured (so step 4 can no longer be skipped past) and showing an explicit
  message -- "This advocate hasn't set up any consultation modes yet" -- instead of an empty,
  silently-passable step.

## Known finding: `color-contrast` (not fixed here)

34 of the 50 screens across all 4 roles log a `color-contrast` warning: the `--color-label`
design token (`#8A8578`, `apps/web/src/styles/tokens.css`) — ported as-is from the legacy
frontend — falls short of WCAG AA's 4.5:1 ratio against several of the app's own backgrounds
(measured as low as 3.06:1). One `/profile` screen also flags the "Delete account" button's rust
background against white text (4.05:1).

This is a **design decision** (picking a new token color), not an engineering one, so it's
logged rather than fixed by this suite. If/when a new value is approved, re-run
`npm run e2e -w apps/web` to confirm it clears every screen this flagged, then remove the
`color-contrast` carve-out in `smoke.spec.ts`.

## Resolved finding: `/founder/fadv` React duplicate-key warning

Previously logged "Encountered two children with the same key" here, under two hypotheses:
`Advocates` (`FounderSections.tsx`) keyed each row by `r.name` instead of a stable id, and/or
the founder analytics `advocates()` query had a real duplication bug returning the one seeded
advocate twice. Investigated directly against the live project with a temporary debug log: the
query and the component were both already correct -- the real cause was **a
genuinely orphaned advocate row (and its matter/account/message-thread dependents) left behind
by an earlier interrupted test run**, never cleaned up because `global-teardown.ts` only ever
deletes rows *its own* run tracked in `seed.json`, not pre-existing orphans. That orphan shared
the fixed literal name `"E2E Advocate"` with the current run's freshly-seeded one, producing a
real two-rows-same-name collision that both the query and the React key correctly reported.

Fixed in both directions: the orphaned rows were deleted (FK-safe, children first), **and**
`advocatePerformanceDto` gained a real `id` field (`packages/contracts/src/founder.ts`,
populated in `modules/founder/service.ts`) with `Advocates` now keying by `r.id` -- keying by a
non-unique, user-editable `name` was a real latent fragility worth closing regardless of this
specific incident's actual root cause. The `KNOWN_CONSOLE_ERRORS` carve-out in `smoke.spec.ts`
has been removed now that this doesn't reproduce.
