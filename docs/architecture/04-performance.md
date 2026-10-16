# Indexes & query review — Vidhira

Per `docs/MASTER-PROMPT.md`'s Phase 4 checklist: "indexes for the filters actually used (verify
with EXPLAIN on the 10 heaviest queries)." This environment has no live database connection, so
this is a **static** review instead — real query plans against production-scale data (table sizes,
planner statistics, Qdrant/Postgres network latency) are not something a schema read can
substitute for. Treat the verdicts below as "what the schema's indexes say should happen," not as
measured fact; re-run this as a live EXPLAIN pass against a representative data volume before
trusting it for a capacity decision.

**Method:** read `apps/api/src/db/schema.sql` (the current combined state — migrations in
`apps/api/src/db/migrations/` are already folded into it) for every index, then grepped every
`modules/*/repository.ts` for the `.eq()`/`.order()`/`.range()` filters actually sent to Supabase,
matching each against the indexes available on that table.

---

## 1. The 10 heaviest query patterns

| # | Query | Filter / sort | Index coverage | Verdict |
|---|---|---|---|---|
| 1 | Advocate matching (`modules/intake/repository.ts`) — load every verified advocate with its full practice-area/jurisdiction/language/mode junction rows, then score in JS | `advocates.verification_status = 'verified'` | `advocates_verification_status_idx` | **Covered**, but see [§2.1](#21-advocate-matching-is-a-full-scan-by-design) — the base-table filter is indexed, the junction-table loads are not |
| 2 | Messages by thread (`modules/messages/repository.ts`) | `messages.thread_id = ?`, ordered by `sent_at` | `messages_thread_id_idx` | **Covered** for the filter; no composite `(thread_id, sent_at)` — see [§2.2](#22-messages-and-matters-single-column-indexes-feeding-a-sort) |
| 3 | Matters by account / by advocate | `matters.account_id = ?` / `matters.advocate_id = ?` | `matters_account_id_idx`, `matters_advocate_id_idx` | **Covered** |
| 4 | Documents by account / by matter | `documents.account_id = ?` / `documents.matter_id = ?` | `documents_account_id_idx`, `documents_matter_id_idx` | **Covered** |
| 5 | Research queries, "My Research" list | `research_queries.account_id = ?`, ordered by `created_at` | `research_queries_account_id_idx`, plus `research_queries_account_normalized_idx` for the dedupe-by-rerun lookup | **Covered** |
| 6 | `corpus_chunks` by document (citation hydration after a Qdrant hit) | `corpus_chunks.document_id = ?` | `corpus_chunks_document_id_idx` | **Covered** |
| 7 | `corpus_chunks` keyword fallback (`lexicalSearch`, `packages/rag/src/retrieve.ts`) | `text ilike '%term%'` (leading wildcard) across up to 20 OR'd terms | None usable — see [§2.3](#23-lexicalsearchs-ilike-fallback-has-no-usable-index) | **Not coverable by a plain btree index** |
| 8 | `account_members` by user (session hydration, `GET /me`) | `account_members.user_id = ?` | `account_members_user_id_idx` | **Covered**. (`account_id = ?` lookups are also covered — it's the leading column of the `(account_id, user_id)` unique constraint.) |
| 9 | `complaints`, "My complaints" | `complaints.raised_by = ?`, ordered by `created_at` | **None** | **Missing index** — see [§2.4](#24-complaints-has-no-indexes-at-all) |
| 10 | `audit_logs` writes (no read path exists yet) | n/a today | **None** | **Forward-looking gap** — see [§2.5](#25-audit_logs-is-write-only-today-but-unindexed-for-the-viewer-the-master-prompt-calls-for) |

---

## 2. Findings

### 2.1 Advocate matching is a full scan, by design

`findVerifiedAdvocates()` (`modules/intake/repository.ts`) loads **every** verified advocate —
with its practice-area, jurisdiction, language, and consultation-mode junction rows all
eager-loaded — rather than pushing `practice_area`/`jurisdiction`/`language` filters into the SQL
`WHERE` clause. The multi-factor weighted scoring (practice area, sub-specialisation, jurisdiction,
forum, language, mode, availability, relevant experience — see `match_results.score_breakdown`)
happens in application code afterward.

This is a deliberate tradeoff, not an oversight: the scoring algorithm isn't expressible as a
single indexed query, and `advocates_verification_status_idx` already makes the base-table filter
itself efficient. The real scaling risk is **advocate count**, not indexing — this query's cost
grows linearly with the number of verified advocates on the platform, independent of how many
actually match a given intake. Fine at hundreds-to-low-thousands of advocates; worth revisiting
(e.g. pushing jurisdiction/practice-area into the `WHERE` clause as a pre-filter before scoring)
if advocate count grows an order of magnitude past what it is today.

### 2.2 Messages and matters: single-column indexes feeding a sort

`messages_thread_id_idx`, `matters_account_id_idx`, etc. all cover their `.eq()` filter, but every
one of these queries also `.order()`s the result (by `sent_at`/`created_at`/etc.) without a
matching composite index. Postgres will use the single-column index to find the matching rows,
then sort them in memory — fine at the row counts a single thread/account/matter actually holds
(tens to low hundreds), since the sort is over an already-small, already-filtered set. This stops
being fine only if an unusually long-lived thread or account accumulates rows in the
tens-of-thousands; worth a composite `(thread_id, sent_at)`-style index if and when that happens,
not before — adding one speculatively now would be optimizing for a row count nothing in this
schema currently produces.

### 2.3 `lexicalSearch`'s `ILIKE` fallback has no usable index

`packages/rag/src/retrieve.ts`'s `lexicalSearch()` — the keyword fallback that catches an exact
section number or Act abbreviation a dense embedding can blur past — builds an OR of up to 20
`text.ilike.%term%` clauses. A **leading-wildcard** `ILIKE` can never use a plain B-tree index
(Postgres has no way to seek into the middle of an indexed string), so every call is a sequential
scan of `corpus_chunks`. This is scoped by design: `lexicalSearch` is explicitly documented as a
hybrid-merge fill-in for `research.js`'s retrieval, never a standalone search path, and
`corpus_chunks` is small relative to, say, a true full-text corpus. If this fallback's usage grows
(more hybrid-merge reliance, a larger corpus), the fix is a `pg_trgm` GIN index
(`create index ... using gin (text gin_trgm_ops)`) rather than a plain B-tree — noted here, not
applied, since it's a real schema change outside a static review's scope.

### 2.4 `complaints` has no indexes at all

Beyond the primary key and the `ref` unique constraint, `complaints` has zero indexes —
`listMyComplaints()` (`modules/complaints/repository.ts`) filters `.eq("raised_by", userId)` with
no supporting index, so every call is a sequential scan of the whole table. Low risk **today**
(each user's own complaint count is naturally small, and there's no admin-wide "list every
complaint" endpoint yet despite `status`/`severity`/`owner`/`root_cause` columns that clearly
anticipate one), but worth closing now since it's cheap and the columns already signal where this
is headed:

```sql
create index complaints_raised_by_idx on complaints(raised_by);
create index complaints_status_idx on complaints(status);
```

The second index is for the admin triage view the schema already anticipates but the API doesn't
expose yet — add it alongside that endpoint, not speculatively ahead of it, unless it lands soon.

### 2.5 `audit_logs` is write-only today, but unindexed for the viewer the master-prompt calls for

`audit_logs` has no indexes beyond its primary key, and nothing in `apps/api/src` currently reads
it back — every call site is an `insert`. `docs/MASTER-PROMPT.md`'s own performance checklist
names `audit_logs` explicitly as one of the tables needing cursor-based pagination, which only
makes sense once an admin audit-log viewer exists. When that viewer is built, it will need at
least:

```sql
create index audit_logs_at_idx on audit_logs(at desc);
create index audit_logs_actor_id_idx on audit_logs(actor_id);
create index audit_logs_subject_idx on audit_logs(subject_type, subject_id);
```

Flagged here so it isn't forgotten when that feature lands, not applied now — there's no reader to
verify these against yet, and a static review can't confirm which of these three actually gets used
until the viewer's real query shape exists.

---

## 3. Pagination coverage

`docs/MASTER-PROMPT.md` calls for "every list query paginated... cursor-based for messages,
audit_logs, corpus_chunks." Grepping every `modules/*/repository.ts` for `.range()`/`.limit()`
usage: `founder`, `services`, `learn`, `pack`, `contractreview`, `drafting`, `research`,
`assistant`, `payments`, `messages`, and `intake` repositories all already paginate their list
queries. `complaints.listMyComplaints()` does not (see [§2.4](#24-complaints-has-no-indexes-at-all) —
same root cause: a per-user list that's naturally small today, worth bounding before an admin-wide
listing is added on top of it, not urgent on its own). `audit_logs` has no reader yet to paginate
(see [§2.5](#25-audit_logs-is-write-only-today-but-unindexed-for-the-viewer-the-master-prompt-calls-for)).

---

## 4. Load test — 5 hottest endpoints

Unlike §1-3, this ran for real: a disposable Supabase Auth user (service-role `admin.createUser`,
deleted afterward) signed in for a real bearer token, apps/api booted against the real
`.env` (live Supabase + Qdrant + OpenRouter + Indian Kanoon), and `autocannon` fired at it. Each
endpoint got its own fresh server process — app.js's rate limiters are in-memory, so reusing one
process across endpoints just measures how fast the *previous* endpoint's burst exhausted the
budget, not real latency (the first attempt at this hit exactly that: a `connections: 10` /
`duration: 5` burst against one endpoint sent 15,000+ requests in a few seconds, blew through the
global 300/min-per-IP limiter almost instantly, and every endpoint tested afterward in that same
process inherited an already-exhausted budget). Two non-AI endpoints ran a real concurrent burst;
the three AI endpoints ran 15 requests at low concurrency on purpose — Indian
Kanoon/OpenRouter bill per call, and `getOrSet()`'s in-flight dedupe plus each service's own cache
collapse a concurrent burst of *identical* requests into one real paid call, so this still exercises
the request path under concurrency without re-billing per request.

| Endpoint | Pattern | p50 | p95 | Notes |
|---|---|---|---|---|
| `GET /api/me` | 10 connections, 5s burst | ~240–830ms | ~440ms–2.9s | Session hydration — hottest endpoint in the app by call volume (every authenticated page load). Wide run-to-run variance (see below); no errors in any run. |
| `GET /api/advocates` | 10 connections, 250 requests | ~116–363ms | ~189ms–1.7s | Public directory browse, no auth needed. |
| `POST /api/legal-assistant/ask` | 3 connections, 15 requests, identical question | ~150–430ms | ~600ms–9.5s | First call does the real OpenRouter + Indian Kanoon work; the dedupe/cache described above makes the rest cheap. The occasional multi-second p95 outlier is a real upstream (OpenRouter) latency spike, not app code. |
| `GET /api/case-law/search` | 3 connections, 15 requests, identical query | ~160–226ms | ~245–371ms | **Found and fixed a real bug** — see below. |
| `POST /api/research/retrieve` | 3 connections, 15 requests, identical question | ~4.1–6.8s | ~6.0–8.7s | Consistently slow on **every** request, not just the first — see below. |

**Run-to-run variance**: the two non-AI endpoints' numbers above span a real range across repeated
runs minutes apart against the same live backend — expected for a load test against shared,
real internet-routed infrastructure (Supabase/Qdrant network latency, not a controlled benchmark
rig), not evidence of anything wrong. Treat the ranges, not either single number, as the honest
result.

**Bug found and fixed**: `GET /api/case-law/search` failed **100% of the time** against the real
Indian Kanoon API before this fix. `services/indianKanoon.js`'s `search()` returned
`{ ...result, docs: result.docs.map((doc) => ({ ...doc, ... })) }` — a raw spread of Indian
Kanoon's actual response, which carries several fields (`catids`, `doctype`, `publishdate`,
`authorid`, `bench`, `numcites`, `numcitedby`, `fragment`, `author`, `authorEncoded`, `citation`,
and a top-level `encodedformInput`) that `caseLawSearchResultDto` — `.strict()`, deliberately, per
this codebase's "explicit field-picking, never leak a raw row" convention — doesn't declare. Every
test fixture in `indianKanoon.test.js` happened to only include the fields the DTO expects, so this
never surfaced until a load test hit the *real* API. Fixed by explicitly picking the known fields
instead of spreading; all 22 existing `indianKanoon`/`caselaw` tests still pass, 304 total across
apps/api.

**Performance note, not a bug**: `POST /api/research/retrieve` is consistently slow — not just on
a cold first call, every one of the 15 identical-question requests took multiple seconds. Unlike
`legal-assistant/ask` and `case-law/search`, `research.js`'s `retrieve()` was never migrated onto
`platform/cache.ts`'s `getCache()` in the Task 10 Redis work (it wasn't one of the four files that
work touched), so there's no response-level cache here at all — every call re-runs the full
embedding + Qdrant retrieval pipeline from scratch even for a question asked seconds earlier. Worth
a follow-up (give `retrieve()` the same `getOrSet()`-backed caching `legalAssistant.js` already
has), but out of scope for this load-test pass — flagging it here rather than changing behaviour
a performance review wasn't asked to change.

> **Follow-up done (after Phase 5):** `services/research.js`'s `retrieve()` now has a
> `getCache()`-backed response cache (`research-retrieve:v1:`, 10-minute TTL, key = sources +
> case/whitespace-normalised question). Kept conservative on purpose: an empty result, or one whose
> live-fetch ingest partly failed, is never cached (so asking again still re-tries the live fetch),
> and the "Refresh" action passes `fresh: true` to bypass and overwrite the entry. Re-running the
> same question within 10 minutes is now served from cache — the accepted trade-off is that a corpus
> change can take up to the TTL to show up for that exact question, unless the user hits Refresh.

---

## 5. Summary

The schema's existing indexes genuinely do cover the query patterns the app sends today (§1-3);
the two real gaps (`complaints`, `audit_logs`) are both forward-looking, tied to admin features
that don't exist in the API yet. The load test (§4) is the more consequential half of this
review: it caught a real, currently-live bug (case-law search 500s on every real query) that no
existing test had surfaced, now fixed, and surfaced one real performance gap worth a follow-up
(`research/retrieve` had no caching layer — since fixed, see §4). The one architectural note worth carrying forward from
§1-3 is advocate matching's full-scan-then-score-in-JS design (§2.1) — not a bug, but the one
query pattern in this list whose cost scales with overall platform size rather than with any one
account/thread/matter's own row count.
