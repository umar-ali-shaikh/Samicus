# AI Legal Assistant — As-Built Spec & Roadmap

> **Update (post Next.js/Express-TS migration):** this doc originally described the pre-monorepo
> `backend/`/`frontend/` layout. Paths below are updated to the current `apps/api/`/`apps/web/`
> monorepo structure (see `docs/architecture/01-target-architecture.md`); a few implementation
> details genuinely changed along the way (noted inline) — this isn't just a path rename.
>
> Retrieval now runs through a Qdrant-backed knowledge base first (passage-level RAG), falling
> back to the live Indian Kanoon search as described below. See [RAG.md](RAG.md) for the current
> architecture; sections 2–3 describe the live-search path, which is still used when the
> knowledge base cannot answer confidently or is not configured.
>
> **Current pipeline, in one place** (`answerLegalQuestion` in `services/legalAssistant.js`,
> re-checked against the code after Phase 5 — sections 2 and 4 below predate some of this, so
> where they disagree, this summary and the code win):
> prompt-injection check (short-circuits before any model call) → **Stage 1** query
> understanding → **Stage 2** Qdrant knowledge-base search → **Stage 3** Indian Kanoon live
> search, skipped once Stage 2 is confident → **Stage 4** Tavily web search over a
> government/legal-aid domain allowlist (optional, `TAVILY_API_KEY`), skipped once Stages 2–3
> already have enough evidence → **Stage 5** grounded answer → **Stage 6** fire-and-forget
> write-back of whatever Indian Kanoon/Tavily found into the knowledge base. When no stage
> finds any source, a clearly-labelled *general guidance* answer is generated instead of an
> empty "insufficient sources" card. The whole result is cached by question + filters +
> history (`getCache()`). See [SETUP.md](SETUP.md)'s pipeline notes too.

This replaces an earlier draft spec that assumed a fresh, standalone `legal-bot/` project
(separate repo, MongoDB-backed API cache, `cheerio` for HTML stripping, an `openai`-package
OpenRouter client, a `generate()` LLM facade switched by `LLM_PROVIDER`). That's not what
exists. The AI Legal Assistant is already a shipped feature of **Vidhira** (this repo), with
its own — more capable — RAG pipeline. This doc describes what's actually built, then lists
concrete, scoped gaps worth closing next.

## 1. Where it lives

It's one feature among many in the `apps/web` (Next.js) + `apps/api` (Express) monorepo, not a
separate project. The route/service/repository split below is the standard per-domain layering
every module in `apps/api/src/modules/` follows (`docs/architecture/01-target-architecture.md`
section 3) — HTTP concerns, business logic and Supabase access are three separate files, not one:

| Concern | File |
|---|---|
| Route (HTTP) | [apps/api/src/modules/assistant/router.ts](../apps/api/src/modules/assistant/router.ts) — `POST /api/legal-assistant/ask`, `GET /api/legal-assistant/session/:sessionId` |
| Business logic (history loading/budgeting, persistence orchestration) | [apps/api/src/modules/assistant/service.ts](../apps/api/src/modules/assistant/service.ts) |
| Supabase access (sessions/turns tables) | [apps/api/src/modules/assistant/repository.ts](../apps/api/src/modules/assistant/repository.ts) |
| RAG orchestration (the actual pipeline below) | [apps/api/src/services/legalAssistant.js](../apps/api/src/services/legalAssistant.js) |
| Query understanding (rewrite + language + emergency detection) | [apps/api/src/services/legalQueryUnderstanding.js](../apps/api/src/services/legalQueryUnderstanding.js) |
| Indian Kanoon client + cache | [apps/api/src/services/indianKanoon.js](../apps/api/src/services/indianKanoon.js), [indianKanoonFilters.js](../apps/api/src/services/indianKanoonFilters.js) |
| LLM client | [apps/api/src/services/openRouter.js](../apps/api/src/services/openRouter.js) |
| Shared memory/Redis cache (`getCache()`) | [apps/api/src/platform/cache.ts](../apps/api/src/platform/cache.ts) — Redis-backed when `REDIS_URL` is set, in-process `Map` otherwise; see `docs/architecture/02-security-model.md` §4 |
| HTML plain-text extraction (for the LLM prompt — distinct from the XSS-safe sanitizer below) | [apps/api/src/utils/stripHtml.js](../apps/api/src/utils/stripHtml.js) |
| XSS-safe HTML sanitizer (for browser rendering) | [apps/api/src/utils/sanitizeHtml.js](../apps/api/src/utils/sanitizeHtml.js) |
| Chat UI | [apps/web/src/app/(app)/assistant/AssistantClient.tsx](../apps/web/src/app/(app)/assistant/AssistantClient.tsx) |
| Server actions (BFF calls to apps/api) | [apps/web/src/server/assistantActions.ts](../apps/web/src/server/assistantActions.ts) |
| Chat history persistence | `legal_assistant_sessions` / `legal_assistant_turns` tables ([schema.sql](../apps/api/src/db/schema.sql)), read/written by `modules/assistant/repository.ts` |
| Relevance re-ranking orchestration (OpenRouter embeddings if configured, else local TF-IDF) | [apps/api/src/services/relevanceRanking.js](../apps/api/src/services/relevanceRanking.js) |
| OpenRouter embeddings client | [packages/rag/src/embeddings.ts](../packages/rag/src/embeddings.ts) (moved here during the Phase 4 shared-RAG-package extraction — was `backend/src/services/openRouterEmbeddings.js`; supersedes the earlier Gemini-based client this section originally described — see the historical note below) |
| Local TF-IDF fallback ranker | [apps/api/src/utils/tfidf.js](../apps/api/src/utils/tfidf.js), [cosine.js](../apps/api/src/utils/cosine.js) |
| Cost/usage counter | [apps/api/src/utils/callCounter.js](../apps/api/src/utils/callCounter.js) — Redis-backed when `REDIS_URL` is set (so counts stay accurate across horizontally-scaled instances), exposed via `GET /api/admin/usage` in [modules/admin/router.ts](../apps/api/src/modules/admin/router.ts) |

It shares the Indian Kanoon client/cache with the separate **Case Law** browse screen
(`apps/web`'s `/case-law` page / `apps/api/src/modules/caselaw/`) — that's a faceted search UI,
distinct from this conversational assistant, and both sit on the same IK client so a call from
either surface is cached once for both.

## 2. Pipeline, as actually implemented

1. **Query understanding** (`legalQueryUnderstanding.js`) — one LLM call turns the raw
   question (any of English/Hindi/Marathi/Urdu/Hinglish/Marathlish, formal or not) into
   `{ searchQuery, topic, language, isEmergency, emergencyReason }`. This is more than "extract
   a search string": it also classifies the answer's target language/script and flags
   emergencies. A regex keyword net (`EMERGENCY_PATTERNS`, English + Hindi + Hinglish) runs
   independently and is OR'd into `isEmergency` — emergency detection never depends solely on
   the model.
2. **Retrieval** — two parallel Indian Kanoon searches: the general query, and the same query
   scoped to `doctypes:laws` (bare Acts/Rules). Within each pool, candidates are scored for
   relevance via `rankRelevantDocs()` (`services/relevanceRanking.js`), which:
   - Uses **OpenRouter embeddings** (`@vidhira/rag/embeddings`,
     `sentence-transformers/all-mpnet-base-v2` by default, one batched request per pool)
     when `OPENROUTER_API_KEY` is set — real semantic cosine similarity, filtered at
     `MIN_EMBEDDING_SIMILARITY = 0.3` (loosened from an initial `0.5` once there was real
     traffic to judge false-negative rates against — still not rigorously tuned).
   - **Automatically falls back to local TF-IDF** (`utils/tfidf.js`) if `OPENROUTER_API_KEY`
     is unset, or the embeddings call fails for any reason (network, rate limit, bad key) —
     logged, not thrown. TF-IDF candidates below score `> 0` (zero shared vocabulary with
     the query) are dropped the same way.
   - Either way, this is about picking a better subset of what Indian Kanoon already
     returned, not a new retrieval source — IK's own order is exact-keyword rank, which
     regularly buries the best match for a paraphrased/conversational question, or
     returns something with essentially nothing in common with the question at all
     (especially `doctypes:laws`, a much smaller corpus than case law).
   - **Any candidate judged unrelated is dropped, not just ranked lower** — earlier
     versions took the top `LAWS_TOP_N`/`topN` regardless of relevance, which force-fed
     the model (and showed the user) completely unrelated Acts/cases whenever Indian
     Kanoon's own search had nothing better on offer (a real production incident:
     "Kerala Municipality Act" cited as a source for an FIR question). Fewer, genuinely
     relevant sources — even zero, which correctly falls through to
     `outcome: "no_evidence"` — beats padding with noise.

   Law hits are then prioritized ahead of general case-law hits before truncating to `topN`
   (default 5), because plain search skews toward judgments even when a statute provision
   would answer the question better. Known limitation of the TF-IDF fallback specifically: a
   "score > 0" bar only catches *zero*-overlap noise — two docs sharing only generic
   legal-boilerplate words (e.g. "person", "state", "authority") can still both clear it even
   if only one is actually on point. Embeddings (when configured) don't have this exact
   failure mode, but the `0.3` similarity cutoff is still not rigorously validated against
   real traffic.
3. **Evidence extraction** — per hit: try full `getDocument(tid)` text first, fall back to a
   query-targeted `getFragment` snippet if that fails/empties, fall back to the search
   headline as a last resort. Each is capped at 3000 chars after HTML is stripped (`utils/stripHtml.js`,
   not the XSS-safe sanitizer — this is plain-text extraction for an LLM prompt, a different
   job), to keep `topN` sources inside one prompt for the small, cheap paid models in use.
4. **Answer generation** — one LLM call, `response_format: json_object`, grounded strictly in
   the numbered evidence, returning **structured sections** validated by `AnswerSchema`:
   `summary`, `immediateActions`, `stepByStep`, `yourRights`, `applicableLaws`, `caseLaw`,
   `whereToGetHelp`, `gaps`, `followUpQuestions`, `confidence` — not a single prose `answer`
   string. (An earlier version of this doc listed six fields — `statute`/`judgments`/
   `interpretation`/`generalInformation`/`practicalNextSteps`/`insufficiencyNote` — that shape
   has since been replaced.) Citations are `sourceId`/`sourceIds` evidence indices that the
   server, not the model, resolves to URLs. The
   system prompt enforces inline `[n]` citations tied to real evidence indices and a strict
   per-language **script** contract (Devanagari for hindi/marathi, Nastaliq for urdu, Latin-only
   for hinglish/marathlish — no script-mixing). If the model's output isn't valid JSON, the raw
   text is recovered as `generalInformation` (`outcome: "unparsed"`) rather than discarded.
5. **Safety copy is fixed, not generated.** The disclaimer and the emergency banner are
   hardcoded strings on the server (`DISCLAIMER`, and `EMERGENCY_MESSAGES` — keyed by Stage 1's
   emergency type and by language, replacing the single `EMERGENCY_MESSAGE` this doc used to
   name; emergency helplines and custody rights are likewise server-constructed) and mirrored,
   pre-translated, client-side (`AssistantClient.tsx`) for all six language/scripts. This is deliberate:
   safety-critical framing must never depend on a model choosing to say it.
6. **Response shape** returned to the client:
   `{ outcome, understanding, emergency, sections, rawAnswer, sources, evidenceIndex,
   lawCurrencyWarning, actCitationWarning, evidenceOrigin, retrieval, disclaimer }` — richer
   than a flat `{ answer, sources, model }`, because the UI renders distinct labelled sections
   and an emergency callout, not one paragraph.

## 3. Tech actually in use (vs. what to assume)

- **Caching**: `platform/cache.ts`'s `getCache()` — Redis-backed (shared across
  horizontally-scaled instances) when `REDIS_URL` is set, falling back to an in-process `Map`
  with TTL + in-flight de-dupe otherwise. Reused independently by the IK client, the
  query-understanding step, and the whole-answer cache in `legalAssistant.js`.
  (Persistence of *sources* is the job of the Qdrant knowledge base; see [RAG.md](RAG.md).)
- **LLM access**: raw `fetch` to OpenRouter's `chat/completions`
  ([openRouter.js](../apps/api/src/services/openRouter.js)) — no `openai` npm package. On a
  failure it doesn't just retry once; it **chains through a list of fallback models** from
  different upstream providers (`FALLBACK_MODELS`), so one provider's outage or rate limit
  doesn't take the assistant down. These are **paid** models now (default
  `openai/gpt-oss-20b`, override via `OPENROUTER_MODEL`) — free-tier slugs were retired/renamed
  too often to rely on in production.
- **Provider switch: `services/llm.js`.** Every chat call goes through it; `LLM_PROVIDER`
  picks `openrouter` (default) or `anthropic` (`services/anthropic.js`, official
  `@anthropic-ai/sdk`, `CLAUDE_MODEL` default `claude-opus-5-5`, `CLAUDE_EFFORT` default
  `medium`, server-side refusal fallbacks on). Both throw the same error classes, so callers
  didn't change. Embeddings stay on OpenRouter regardless.
- **HTML handling**: `sanitize-html` (allowlist-based), not `cheerio`. `sanitizeJudgmentHtml`
  (`utils/sanitizeHtml.js`) is applied at the IK client layer for the Case Law screen, which
  renders it via `dangerouslySetInnerHTML` (so it must be safe HTML); `legalAssistant.js`
  additionally runs evidence text through `utils/stripHtml.js` (plain-text tag-stripping, a
  separate, simpler utility — not a second sanitizer) before building the LLM context.
- **Chat history is persisted** in Supabase Postgres (`modules/assistant/repository.ts`), keyed
  by a client-generated `sessionId` (stored in `localStorage` per signed-in user) and owned by
  the signed-in user. `AssistantClient.tsx` keeps `turns` in local React state as the render
  source of truth — it just rehydrates that state from
  `GET /legal-assistant/session/:sessionId` on mount instead of always starting empty.
- **Answer shape is validated**, not just typed: `zod`'s `AnswerSchema.safeParse()` gates what
  counts as `outcome: "answered"` vs `"unparsed"`, on top of the existing
  `extractJson()` (strict `JSON.parse` → brace-slice fallback) recovery.
- **Testing**: Node's built-in `node --test` (with an in-memory Supabase stand-in for route and
  RAG tests, see `apps/api/src/test/fakeSupabase.js`), matching the rest of the server
  (`indianKanoon.test.js`, `legalQueryUnderstanding.test.js`, `relevanceRanking.test.js`,
  `callCounter.test.js` all follow this pattern) — not Jest/Vitest. Route-level (HTTP) tests DO
  exist now (`modules/assistant/assistant.test.ts`, `modules/caselaw/caselaw.test.ts`) — boot the
  real Express app via `createApp().listen(0)` and hit it with real HTTP requests; this closes
  the gap this doc used to flag ("no route-level tests exist anywhere").
- **Route requires a signed-in, email-verified user** (Supabase Auth) and is rate-limited per
  user (`createRateLimiter("rl:assistant-ask:")`, 20/15min, Redis-backed when `REDIS_URL` is
  set) since every hit spends real money. The case-law routes
  sit behind the same gate.

## 4. Gaps worth closing (recommended new tech, scoped)

Status: all seven are done. #1 (Anthropic) was deferred for a while and is now implemented —
OpenRouter stays the default, and Claude is one env change away. #5 (multi-instance cache) is now also
done — both the cache and the call counter are Redis-backed when `REDIS_URL` is configured
(Phase 4/5 of the Next.js/Express-TS migration), falling back to the original single-process
behaviour otherwise.

1. **Claude/Anthropic switch** — ✅ **done.** `services/anthropic.js` (official
   `@anthropic-ai/sdk`) matches `openRouter.js`'s `chatCompletionWithMeta` shape and error
   classes; `services/llm.js` is the single seam all five chat callers (`legalAssistant.js`,
   `legalQueryUnderstanding.js`, `research.js`, `contractReview.js`, `aiCaseLawAnswer.js`) import
   from. Details worth knowing: system turns are lifted into the Messages API's `system`;
   `jsonMode` becomes a system instruction (callers already parse defensively); a caller-pinned
   OpenRouter slug (e.g. `OPENROUTER_FALLBACK_MODEL`) is ignored in favour of `CLAUDE_MODEL`;
   `max_tokens` is floored at 16000 because thinking counts against it; `fallbacks: "default"`
   (beta `server-side-fallback-2026-07-01`) re-runs a safety decline on a fallback model, and a
   decline that survives that becomes an `OpenRouterApiError` so callers take their existing
   "generation failed" path. Billed calls count under `anthropic` in `GET /api/admin/usage`.
   Tests: `services/llm.test.js` (stub client, no real calls).

2. **Chat history persistence** — ✅ **done.** `modules/assistant/repository.ts` (Supabase
   `legal_assistant_sessions`/`legal_assistant_turns` tables). Client generates a `sessionId`
   (`crypto.randomUUID()`, stored in `localStorage`) in `AssistantClient.tsx`;
   `POST /legal-assistant/ask` appends to it (best-effort — a persistence failure logs and
   still returns the already-computed answer), and
   `GET /legal-assistant/session/:sessionId` rehydrates on mount (200 + empty `turns` for a
   brand-new session, not a 404). Additive to the existing in-memory/Redis answer cache, not a
   replacement for it.

3. **No rate limiting on a costly, unauthenticated route** — ✅ **done.** The route now
   requires sign-in and is limited to 20 requests/15min **per signed-in user** (it started as
   per-IP before the auth boundary existed) on `POST /api/legal-assistant/ask`
   (`modules/assistant/router.ts`). `app.set("trust proxy", 1)` in `app.js` still matters for the
   global per-IP limiter and the per-IP fallback key — most PaaS hosts sit in front as a single
   reverse-proxy hop, and without it `req.ip` resolves to the proxy's address for every
   request.

4. **Informal JSON-shape enforcement** — ✅ **done.** A `zod` schema (`AnswerSchema` in
   `legalAssistant.js`) validates the six-field shape via `.safeParse` after `extractJson()`
   recovers a candidate object; schema failure (wrong types, not just malformed JSON) now also
   routes into the existing `"unparsed"` fallback — same behavior, typed success path.

5. **Cache is single-process, in-memory** — ✅ **done.** `platform/cache.ts`'s `getCache()` is
   Redis-backed (shared across horizontally-scaled instances) when `REDIS_URL` is configured,
   falling back to the original single-process `Map` behind the same `getOrSet()` interface
   otherwise — callers didn't change.

6. **No cost/usage observability** — ✅ **done.** `utils/callCounter.js` is a per-provider
   counter (Redis-backed when `REDIS_URL` is set, in-process `Map` otherwise — same
   memory/Redis selection pattern as `platform/cache.ts`), incremented on every successful
   (cache-missed, i.e. actually billed) call in `indianKanoon.js`'s `postToIndianKanoon`,
   `openRouter.js`'s `chatCompletion`, and `@vidhira/rag/embeddings`'s `embedTexts` (its own
   `openrouter_embeddings` bucket, kept separate from chat completions' `openrouter` since the
   two have very different per-call cost). Exposed via `GET /api/admin/usage`
   (`requireAuth` + `requireRole("admin", "founder")`, `modules/admin/router.ts`) —
   `{ callsSinceStart: { indianKanoon, openrouter, openrouter_embeddings } }`.

7. **Retrieval relevance / no semantic search** — ✅ **done**, not in the original six gaps.
   Indian Kanoon's search is exact-keyword; a paraphrased/conversational question regularly
   surfaced buried-or-wrong results, and — the concrete incident that triggered this —
   `doctypes:laws` returning something with literally nothing in common with the question
   (e.g. "Kerala Municipality Act" cited for an FIR question) because the old code took the
   top `LAWS_TOP_N`/`topN` unconditionally. Fixed with `services/relevanceRanking.js`:
   - **OpenRouter embeddings** (`@vidhira/rag/embeddings`, originally Gemini — see
     the historical note near the end of this doc for why/when that changed) when
     `OPENROUTER_API_KEY` is set — real semantic cosine similarity, filtered at
     `MIN_EMBEDDING_SIMILARITY = 0.3` (loosened from an initial `0.5` — still not rigorously
     tuned against real traffic).
   - **Local TF-IDF** (`utils/tfidf.js`) as the always-available, zero-config fallback — used
     automatically if the embeddings call fails for any reason.
     Filters at `score > 0` (zero shared vocabulary with the query).
   - Either scorer: a candidate judged unrelated is **dropped**, not ranked lower — fewer,
     genuinely relevant sources (even zero, correctly falling through to `no_evidence`) beats
     padding evidence with noise just to hit a target count.
   - **Historical note:** OpenRouter originally had no genuinely free embedding model, so
     Gemini (a second, independent provider with a free-tier API key, no card) was wired up
     for embeddings instead — `GEMINI_API_KEY`/`GEMINI_EMBEDDING_MODEL`. Once the OpenRouter
     account moved to paid credit, embeddings moved too (now `packages/rag/src/embeddings.ts`,
     `sentence-transformers/all-mpnet-base-v2` by default, overridable via
     `OPENROUTER_EMBEDDING_MODEL`) — one provider/one bill instead of two, and the paid
     OpenRouter chat models already in use made the "needs a free-tier provider" constraint
     moot. `gemini.js` was removed; see docs/RAG.md for the re-embedding migration this
     required (switching embedding models/providers always needs one, since old and new
     vectors live in incomparable coordinate spaces).

## 5. Env vars (root `.env.example`)

```env
# LLM provider switch — "openrouter" (default) or "anthropic" (now in .env.example)
LLM_PROVIDER=openrouter

# Anthropic API key + model + effort, used only when LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-opus-5-5
CLAUDE_EFFORT=medium
```

## 6. Do not regress

- The fixed, non-LLM disclaimer/emergency strings (server `DISCLAIMER`/`EMERGENCY_MESSAGE`,
  mirrored client strings in `AssistantClient.tsx`) — a deliberate safety property, not
  incidental duplication.
- The six-way language/script contract (hindi/marathi/urdu/hinglish/marathlish/english,
  script-exact) — broader and stricter than "English or Hinglish"; the query-understanding
  prompt already documents how to tell Hindi from Marathi and Hinglish from Marathlish.
- Keyword-net emergency detection running independently of the LLM.
- `doctypes:laws` priority search — without it, statute-answerable questions get buried under
  tangential case law.
- Re-ranking (`services/relevanceRanking.js`) runs on the title+headline the `/search/` call
  already returned — never an extra Indian Kanoon call per candidate. Embeddings go through
  `@vidhira/rag/embeddings` (see the historical note in §4 for why this used to be Gemini);
  TF-IDF (`utils/tfidf.js`) is the always-available, zero-config fallback, not a placeholder
  to be deleted once embeddings exist — `OPENROUTER_API_KEY` being unset (or the embeddings
  call failing for any reason) must keep degrading to it, never hard-fail.
- The zero-relevance filter (`rankRelevantDocs()` in `relevanceRanking.js`, `score > 0` for
  TF-IDF / `score >= MIN_EMBEDDING_SIMILARITY` for embeddings) is load bearing, not cosmetic —
  without it, an off-topic `doctypes:laws` or general hit gets force-included just to fill
  `LAWS_TOP_N`/`topN` slots, which is the exact bug that produced "Kerala Municipality Act" as
  a cited source for an FIR question in production. Don't revert to "always take the top N
  regardless of score."
- `app.set("trust proxy", 1)` in `app.js` — remove it (or the rate limiter) and every request
  behind the PaaS host's proxy collapses onto one IP, either breaking the per-IP limit entirely
  or making express-rate-limit throw on the X-Forwarded-For mismatch it detects.
- The chat-history write in `POST /legal-assistant/ask` is deliberately best-effort
  (fire-and-forget `.catch(...)`, not `await`ed into the response path) — a database hiccup must
  never cost the user an answer they already paid IK/OpenRouter money for.
- zod's `AnswerSchema` failure and `extractJson()` failure both route into the same
  `"unparsed"` outcome — don't split them into different client-visible states without a
  reason; the client only branches on `outcome`, not on *why* parsing failed.
- `salvageFields()` (per-field regex recovery) runs between `extractJson()` failing and the
  raw-text fallback — a real production case had a single stray character right after the
  opening brace (`{":hasSufficientEvidence":false, ...`) break `JSON.parse` on the whole
  object even though every individual `"field":"value"` pair the model wrote was fine.
  Without this tier, that entire well-structured, cited answer got discarded and the user saw
  raw curly-brace JSON text as "General information" instead. The raw-text fallback itself now
  also suppresses anything that still *looks* like broken JSON (`{` prefix or `"key":`
  pattern) rather than showing it — genuine unstructured prose is still shown as-is.
