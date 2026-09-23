# AI Legal Assistant — As-Built Spec & Roadmap

This replaces an earlier draft spec that assumed a fresh, standalone `legal-bot/` project
(separate repo, MongoDB-backed API cache, `cheerio` for HTML stripping, an `openai`-package
OpenRouter client, a `generate()` LLM facade switched by `LLM_PROVIDER`). That's not what
exists. The AI Legal Assistant is already a shipped feature of **Samicus** (this repo), with
its own — more capable — RAG pipeline. This doc describes what's actually built, then lists
concrete, scoped gaps worth closing next.

## 1. Where it lives

It's one feature among many in the existing `client/` + `server/` npm-workspaces app, not a
separate project:

| Concern | File |
|---|---|
| Route | [server/src/routes/legalAssistant.js](../server/src/routes/legalAssistant.js) — `POST /api/legal-assistant/ask` |
| RAG orchestration | [server/src/services/legalAssistant.js](../server/src/services/legalAssistant.js) |
| Query understanding (rewrite + language + emergency detection) | [server/src/services/legalQueryUnderstanding.js](../server/src/services/legalQueryUnderstanding.js) |
| Indian Kanoon client + cache | [server/src/services/indianKanoon.js](../server/src/services/indianKanoon.js), [indianKanoonFilters.js](../server/src/services/indianKanoonFilters.js) |
| LLM client | [server/src/services/openRouter.js](../server/src/services/openRouter.js) |
| Generic TTL cache | [server/src/utils/cache.js](../server/src/utils/cache.js) |
| HTML sanitizer | [server/src/utils/sanitizeHtml.js](../server/src/utils/sanitizeHtml.js) |
| Chat UI | [client/src/screens/LegalAssistant.jsx](../client/src/screens/LegalAssistant.jsx) |
| API client | [client/src/api/legalAssistantClient.js](../client/src/api/legalAssistantClient.js) |
| Chat history persistence | [server/src/models/LegalAssistantSession.js](../server/src/models/LegalAssistantSession.js) |
| Relevance re-ranking orchestration (Gemini embeddings if configured, else local TF-IDF) | [server/src/services/relevanceRanking.js](../server/src/services/relevanceRanking.js) |
| Gemini embeddings client (optional) | [server/src/services/gemini.js](../server/src/services/gemini.js) |
| Local TF-IDF fallback ranker | [server/src/utils/tfidf.js](../server/src/utils/tfidf.js), [server/src/utils/cosine.js](../server/src/utils/cosine.js) |
| Cost/usage counter | [server/src/utils/callCounter.js](../server/src/utils/callCounter.js), exposed via `GET /api/admin/usage` in [admin.js](../server/src/routes/admin.js) |

It shares the Indian Kanoon client/cache with the separate **Case Law** browse screen
(`CaseLaw.jsx` / `indianKanoon.js` route) — that's a faceted search UI, distinct from this
conversational assistant, and both sit on the same IK client so a call from either surface is
cached once for both.

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
   - Uses **Gemini embeddings** (`services/gemini.js`, `gemini-embedding-001`,
     `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT` task types via one batched
     `batchEmbedContents` call per pool) when `GEMINI_API_KEY` is set — real semantic
     cosine similarity, filtered at `MIN_EMBEDDING_SIMILARITY = 0.5` (a starting
     heuristic, not empirically tuned).
   - **Automatically falls back to local TF-IDF** (`utils/tfidf.js`) if `GEMINI_API_KEY`
     is unset, or the Gemini call fails for any reason (network, rate limit, bad key) —
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
   if only one is actually on point. Gemini embeddings (when configured) don't have this exact
   failure mode, but the `0.5` similarity cutoff is unvalidated against real traffic.
3. **Evidence extraction** — per hit: try full `getDocument(tid)` text first, fall back to a
   query-targeted `getFragment` snippet if that fails/empties, fall back to the search
   headline as a last resort. Each is capped at 3000 chars after HTML is stripped, to fit
   `topN` sources into one free-model-sized prompt.
4. **Answer generation** — one LLM call, `response_format: json_object`, grounded strictly in
   the numbered evidence, returning **six structured fields**
   (`statute`/`judgments`/`interpretation`/`generalInformation`/`practicalNextSteps`/
   `insufficiencyNote` + `hasSufficientEvidence`) — not a single prose `answer` string. The
   system prompt enforces inline `[n]` citations tied to real evidence indices and a strict
   per-language **script** contract (Devanagari for hindi/marathi, Nastaliq for urdu, Latin-only
   for hinglish/marathlish — no script-mixing). If the model's output isn't valid JSON, the raw
   text is recovered as `generalInformation` (`outcome: "unparsed"`) rather than discarded.
5. **Safety copy is fixed, not generated.** The disclaimer and the emergency banner are
   hardcoded strings on the server (`DISCLAIMER`, `EMERGENCY_MESSAGE`) and mirrored, pre-translated,
   client-side (`UI_STRINGS` in `LegalAssistant.jsx`) for all six language/scripts. This is
   deliberate: safety-critical framing must never depend on a model choosing to say it.
6. **Response shape** returned to the client:
   `{ outcome, understanding, emergency, sections, rawAnswer, sources, disclaimer }` — richer
   than a flat `{ answer, sources, model }`, because the UI renders distinct labelled sections
   and an emergency callout, not one paragraph.

## 3. Tech actually in use (vs. what to assume)

- **Caching**: an in-process `Map` with TTL + in-flight de-dupe
  ([utils/cache.js](../server/src/utils/cache.js)), reused independently by the IK client, the
  query-understanding step, and the whole-answer cache in `legalAssistant.js`. **Not** a
  MongoDB `apiCache` collection — the codebase already has full Mongoose/MongoDB (30+ models)
  but deliberately didn't route this through it, since nothing here needs to survive a restart
  and the app runs as one process.
- **LLM access**: raw `fetch` to OpenRouter's `chat/completions`
  ([openRouter.js](../server/src/services/openRouter.js)) — no `openai` npm package. On a 429
  it doesn't just retry once; it **chains through a list of fallback free models** from
  different upstream providers (`FALLBACK_MODELS`), since free-tier pools rate-limit
  independently of each other.
- **No Anthropic/Claude integration yet.** `openRouter.js` is the only provider; there's no
  `LLM_PROVIDER` switch or `llm.js` facade today.
- **HTML handling**: `sanitize-html` (allowlist-based), not `cheerio`. It's applied once, at
  the IK client layer (`sanitizeJudgmentHtml`), and serves two different consumers: the Case
  Law screen renders it via `dangerouslySetInnerHTML` (so it must be safe HTML), while
  `legalAssistant.js` additionally regex-strips it to plain text before building the LLM
  context. One sanitizer, two downstream uses — no need for a second HTML library.
- **Chat history is persisted** via `LegalAssistantSession` (Mongoose), keyed by a
  client-generated `sessionId` stored in `localStorage`. `LegalAssistant.jsx` still keeps
  `turns` in local React state as the render source of truth — it just rehydrates that state
  from `GET /legal-assistant/session/:sessionId` on mount instead of always starting empty.
- **Answer shape is validated**, not just typed: `zod`'s `AnswerSchema.safeParse()` gates what
  counts as `outcome: "answered"` vs `"unparsed"`, on top of the existing
  `extractJson()` (strict `JSON.parse` → brace-slice fallback) recovery.
- **Testing**: Node's built-in `node --test` + `mongodb-memory-server`, matching the rest of
  the server (`indianKanoon.test.js`, `legalQueryUnderstanding.test.js`, `cache.test.js`,
  `indianKanoonFilters.test.js`, `callCounter.test.js` all follow this pattern) — not
  Jest/Vitest. No route-level (supertest-style) tests exist anywhere in the server — the new
  rate limiter/session endpoints were verified with ad hoc boot scripts during development, not
  a checked-in test suite; that's a gap of its own if it matters later.
- **Route is unauthenticated**, matching the sibling `indianKanoon.js` route — still no real
  auth boundary — but is now rate-limited (`express-rate-limit`, 20/15min per IP) since every
  hit spends real money and there was previously no cap at all.

## 4. Gaps worth closing (recommended new tech, scoped)

Status as of 2026-09-23: #2, #3, #4, #6, #7 are done. #1 (Anthropic) was explicitly deferred —
OpenRouter remains the only *chat* provider, no new API key needed there. #5 (multi-instance
cache) is still open but was already flagged "not urgent" and remains so (single-process
deployment). #7 (retrieval relevance/embeddings) wasn't in the original six gaps — added after
a production incident (irrelevant Acts cited as sources for an FIR question) traced back to
"always take the top N candidates regardless of relevance."

1. **Claude/Anthropic switch** — *deferred, not implemented.* Genuinely missing. Add
   `server/src/services/anthropic.js` using `@anthropic-ai/sdk`, matching
   `openRouter.js`'s call shape (`chatCompletion(messages, opts) -> string`). Introduce a thin
   `LLM_PROVIDER` env switch (`openrouter` default, `anthropic`) at one seam — either inline in
   the two call sites (`legalAssistant.js`, `legalQueryUnderstanding.js`) or behind a new
   `services/llm.js` facade so neither file imports a provider SDK directly. New dependency:
   `@anthropic-ai/sdk`. New env vars: `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`.

2. **Chat history persistence** — ✅ **done.** `server/src/models/LegalAssistantSession.js`
   (`sessionId`, `turns: [{ question, result, createdAt }]`, upserted per turn). Client
   generates a `sessionId` (`crypto.randomUUID()`, stored in `localStorage`) in
   `LegalAssistant.jsx`; `POST /legal-assistant/ask` appends to it (best-effort — a persistence
   failure logs and still returns the already-computed answer), and
   `GET /legal-assistant/session/:sessionId` rehydrates on mount (200 + empty `turns` for a
   brand-new session, not a 404). Additive to the existing in-memory answer cache, not a
   replacement for it.

3. **No rate limiting on a costly, unauthenticated route** — ✅ **done.** `express-rate-limit`,
   20 requests/15min per IP, on `POST /api/legal-assistant/ask`
   (`routes/legalAssistant.js`). Requires `app.set("trust proxy", 1)` in `app.js` — Render
   sits in front as a single reverse-proxy hop, and without this `req.ip` resolves to the
   proxy's address for every request.

4. **Informal JSON-shape enforcement** — ✅ **done.** A `zod` schema (`AnswerSchema` in
   `legalAssistant.js`) validates the six-field shape via `.safeParse` after `extractJson()`
   recovers a candidate object; schema failure (wrong types, not just malformed JSON) now also
   routes into the existing `"unparsed"` fallback — same behavior, typed success path.

5. **Cache is single-process, in-memory** — still open, still not urgent. Fine today (the app
   deliberately runs as one process per the README), but a known constraint: if this ever
   scales to multiple instances, cache hits (and the cost savings they represent) stop being
   shared. If it becomes one, back `utils/cache.js` with a Mongo collection behind the same
   `getOrSet()` interface so callers don't change.

6. **No cost/usage observability** — ✅ **done.** `server/src/utils/callCounter.js` is a tiny
   in-memory per-provider counter, incremented on every successful (cache-missed, i.e.
   actually billed) call in `indianKanoon.js`'s `postToIndianKanoon`, `openRouter.js`'s
   `callModel`, and `gemini.js`'s `embedTexts`. Exposed via `GET /api/admin/usage`
   (`requireAuth` + `requireRole("admin")`, matching `admin.js`'s existing pattern) —
   `{ callsSinceStart: { indianKanoon, openrouter, gemini } }`. Resets on restart, same
   single-process tradeoff as the cache (#5).

7. **Retrieval relevance / no semantic search** — ✅ **done**, not in the original six gaps.
   Indian Kanoon's search is exact-keyword; a paraphrased/conversational question regularly
   surfaced buried-or-wrong results, and — the concrete incident that triggered this —
   `doctypes:laws` returning something with literally nothing in common with the question
   (e.g. "Kerala Municipality Act" cited for an FIR question) because the old code took the
   top `LAWS_TOP_N`/`topN` unconditionally. Fixed with `services/relevanceRanking.js`:
   - **Gemini embeddings** (`services/gemini.js`) when `GEMINI_API_KEY` is set — real semantic
     cosine similarity, `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT` task types, filtered at
     `MIN_EMBEDDING_SIMILARITY = 0.5` (unvalidated against real traffic — tighten/loosen once
     there's a feel for false positive/negative rates).
   - **Local TF-IDF** (`utils/tfidf.js`) as the always-available, zero-cost, zero-config
     fallback — used automatically if `GEMINI_API_KEY` is unset or the Gemini call fails.
     Filters at `score > 0` (zero shared vocabulary with the query).
   - Either scorer: a candidate judged unrelated is **dropped**, not ranked lower — fewer,
     genuinely relevant sources (even zero, correctly falling through to `no_evidence`) beats
     padding evidence with noise just to hit a target count.
   - OpenRouter (the chat/LLM provider) has no genuinely free embedding model as of this
     writing — verified directly against model pages, not just search summaries, which were
     stale/wrong here. Gemini is a second, independent provider chosen specifically because
     Google AI Studio issues free API keys with no credit card. New env vars:
     `GEMINI_API_KEY` (optional), `GEMINI_EMBEDDING_MODEL` (optional, defaults to
     `gemini-embedding-001`).

## 5. Env vars to add (`server/.env.example`)

```env
# LLM provider switch — "openrouter" (default, current) or "anthropic"
LLM_PROVIDER=openrouter

# Anthropic API key + model, used only when LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-5
```

## 6. Do not regress

- The fixed, non-LLM disclaimer/emergency strings (server `DISCLAIMER`/`EMERGENCY_MESSAGE`,
  mirrored client `UI_STRINGS`) — a deliberate safety property, not incidental duplication.
- The six-way language/script contract (hindi/marathi/urdu/hinglish/marathlish/english,
  script-exact) — broader and stricter than "English or Hinglish"; the query-understanding
  prompt already documents how to tell Hindi from Marathi and Hinglish from Marathlish.
- Keyword-net emergency detection running independently of the LLM.
- `doctypes:laws` priority search — without it, statute-answerable questions get buried under
  tangential case law.
- Re-ranking (`services/relevanceRanking.js`) runs on the title+headline the `/search/` call
  already returned — never an extra Indian Kanoon call per candidate. OpenRouter has no
  genuinely free embedding model (verified directly against their model pages, not just search
  summaries, which were stale/wrong there) — Gemini (a different provider, its own free-tier
  API key) is what's actually wired up for real embeddings; TF-IDF (`utils/tfidf.js`) is the
  always-available, zero-config fallback, not a placeholder to be deleted once Gemini exists.
  `GEMINI_API_KEY` must stay optional — the pipeline has to keep working with zero external
  cost for anyone who never sets it.
- The zero-relevance filter (`rankRelevantDocs()` in `relevanceRanking.js`, `score > 0` for
  TF-IDF / `score >= MIN_EMBEDDING_SIMILARITY` for Gemini) is load bearing, not cosmetic —
  without it, an off-topic `doctypes:laws` or general hit gets force-included just to fill
  `LAWS_TOP_N`/`topN` slots, which is the exact bug that produced "Kerala Municipality Act" as
  a cited source for an FIR question in production. Don't revert to "always take the top N
  regardless of score."
- `app.set("trust proxy", 1)` in `app.js` — remove it (or the rate limiter) and every request
  behind Render's proxy collapses onto one IP, either breaking the per-IP limit entirely or
  making express-rate-limit throw on the X-Forwarded-For mismatch it detects.
- The chat-history write in `POST /legal-assistant/ask` is deliberately best-effort
  (fire-and-forget `.catch(...)`, not `await`ed into the response path) — a Mongo hiccup must
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
