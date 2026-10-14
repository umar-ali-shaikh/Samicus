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

## 4. Summary

No urgent fixes — the schema's existing indexes genuinely do cover the query patterns the app
sends today. The two real gaps (`complaints`, `audit_logs`) are both **forward-looking**: cheap to
close, but tied to admin features (a complaints triage view, an audit-log viewer) that don't exist
in the API yet, so there's no real query shape to index against until they do. The one
architectural note worth carrying forward is advocate matching's full-scan-then-score-in-JS
design (§2.1) — not a bug, but the one query pattern in this list whose cost scales with overall
platform size rather than with any one account/thread/matter's own row count.
