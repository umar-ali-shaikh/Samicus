# Legal review checklist (before launch)

Engineering can't sign off on legal content. This list is for the qualified advocate reviewing
Vidhira before launch: every place the product puts legal words in front of a user, with the file
it lives in, so nothing is missed and every change lands in the right place. Tick each item and
note the reviewer, the date, and any changes requested.

Reviewer: ____________________ Enrolment no.: ____________________ Date: ____________

## 1. Document templates and clause library

Seeded on first boot by `apps/api/src/seed/seed.js` (`doc_templates` + `clause_library`). Re-seeding
replaces each template's clauses, so make corrections in that file, not in the database.

- [ ] **Rental Agreement** — every field, the body, and each clause's `body_template`,
      `rationale_note`, `disposition` (recommended / optional / review_advised), `risk_side` and
      `favors`. The notes quote market positions (e.g. "2-3 months for residential" deposits in
      Bengaluru); confirm or correct them, and say whether they should be state-specific.
- [ ] **Employment** template and clauses (same fields as above).
- [ ] **NDA** template and clauses.
- [ ] **Legal notice** template and clauses.
- [ ] The drafting screen's e-stamping note
      (`apps/web/src/app/(app)/drafts/[draftId]/DraftEditorClient.tsx`): "e-Stamping is not
      handled in the app — your advocate can advise on stamp duty and registration for your
      state." Is that enough, or should the download carry a per-state stamp-duty warning?

## 2. AI legal assistant: fixed safety copy

These strings are deliberately **not** written by the model (see `docs/legal-assistant-spec.md` §6,
"Do not regress"). All are in `apps/api/src/services/legalAssistant.js`, translated for
English/Hindi/Marathi/Urdu/Hinglish/Marathlish. Review the translations too, not just the English.

- [ ] `DISCLAIMER` — shown on every answer.
- [ ] `EMERGENCY_MESSAGES` — the banner for each emergency type.
- [ ] `CYBER_FRAUD_HELPLINES` and `DOMESTIC_VIOLENCE_HELPLINES` — numbers, names and when-to-use
      text are current and correct.
- [ ] `CUSTODY_RELATIVE_RIGHTS` and `CUSTODY_HELPLINES` — the rights of someone whose relative is
      in police custody (arrest, detention). These must be accurate as of the current BNSS.
- [ ] `rentDepositLegalNoticeTemplate()` — the security-deposit legal notice the assistant offers
      for tenancy-deposit questions.
- [ ] `SYSTEM_PROMPT` and `GENERAL_GUIDANCE_SYSTEM_PROMPT` — the rules the model is given (never
      imply it's a lawyer, cite only the evidence, etc.). Check that the posture is right; the
      wording is engineering's to tune.
- [ ] The client-side mirror of the disclaimer/emergency strings in
      `apps/web/src/app/(app)/assistant/AssistantClient.tsx` matches the server copy.
- [ ] Research library notes and contract review findings carry the same not-legal-advice
      framing (`apps/api/src/services/research.js`, `apps/api/src/services/contractReview.js`).

## 3. Urgent help and Talk now

- [ ] `/urgent-help` (`apps/web/src/app/(app)/urgent-help/UrgentHelpClient.tsx`):
  - the danger screen ("call 112 now"), and "You have the right to inform someone of your choice
    and to consult a lawyer";
  - the "While you wait" guidance ("you may remain silent beyond identifying yourself…") —
    accurate, and safe to show to someone being questioned?
  - the category → practice-area mapping (e.g. "Domestic violence" → Family).
- [ ] The NALSA helpline text returned when no advocate is free
      (`apps/api/src/modules/intake/service.ts`: "NALSA free legal aid helpline · 15100").
- [ ] Consent wording on Talk now, urgent help and the booking wizard
      (`TalkNowClient.tsx`, `UrgentHelpClient.tsx`, `components/booking/BookingWizard.tsx`):
      it must cover what's shared, with whom, and when (after the conflict check clears).

## 4. Fees, engagement and conflicts

- [ ] Fee proposal display and acceptance (`apps/web/src/components/matters/Fees.tsx`): "The
      advocate makes no representation about the outcome", accepting = engagement confirmed.
- [ ] Platform fee and GST lines on invoices (`apps/api/src/services/matching.js` `PLATFORM_FEE`,
      `GST_RATE`) — compatible with Bar Council of India rules on fee-sharing and advertising.
- [ ] Neutral, never-paid ranking of advocates in the directory, as claimed in `README.md` — a BCI
      advertising/solicitation question as much as a product one.
- [ ] The conflict check (`apps/api/src/modules/advocates/service.ts` `runConflictCheck`) only
      compares the counterparty name with the advocate's open matters' client names. Is that an
      adequate first screen, given that the advocate still confirms?

## 5. Admin access to matters

- [ ] Break-glass matter access (`docs/architecture/02-security-model.md` §3 item 5): an admin can
      view a matter's timeline, tasks, hearings and document *names* after recording a reason; both
      parties see "Vidhira trust & safety reviewed this matter". Compatible with privilege and
      confidentiality obligations? Should the parties also be told the reason?

## 6. Content not in the codebase

Admins author these in the app, so they live in the database, not in files. Review them in the
admin Catalogue screen (`/admin/catalogue`) before launch:

- [ ] Learn-section guides.
- [ ] Pack-compliance rulesets (what each SKU is checked against).
- [ ] Service catalogue descriptions and fixed fees.

## 7. Third-party terms

- [ ] **Indian Kanoon API terms.** The RAG pipeline keeps a *persistent* passage index of
      judgments fetched from Indian Kanoon (Qdrant, see `docs/RAG.md`) and writes live-search
      results back into it. Confirm the API terms allow storing and re-serving that content, or
      set `QDRANT_URL` empty to turn the index off.
- [ ] Indian Kanoon responses are also cached (`apps/api/src/platform/cache.ts`; the assistant
      for 1h, research retrieval for 10 minutes). Same question.
- [ ] Tavily web results (government/legal-aid allowlist, `apps/api/src/services/tavily.js`) are
      written back into the index too — same question for those sources.
- [ ] If `LLM_PROVIDER=anthropic` or `DOCUMENT_OCR=anthropic` is turned on, client facts and
      uploaded contracts go to Anthropic (as they already go to OpenRouter by default). Confirm the
      privacy policy and client consent cover the provider actually in use.

## Sign-off

- [ ] All items above reviewed; requested changes listed below and handed to engineering.

Changes requested:

1.
2.
3.
