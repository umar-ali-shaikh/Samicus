-- Research library fixes:
--   1. a new paragraph_class, 'quoted_precedent', so a passage that quotes another case
--      verbatim is never mislabelled as this court's own reasoning (or as a bare statute).
--   2. de-duplication for "My Research": normalized_text + rerun_count, so re-running the
--      exact same question updates one card instead of piling up new ones.
-- Safe to run on an existing database; fresh installs get the same shape from schema.sql.

alter table corpus_chunks drop constraint if exists corpus_chunks_paragraph_class_check;
alter table corpus_chunks add constraint corpus_chunks_paragraph_class_check
  check (paragraph_class in
    ('provision', 'facts', 'issues', 'petitioner_arguments', 'respondent_arguments', 'reasoning', 'holding', 'directions', 'quoted_precedent'));

alter table research_queries
  add column if not exists normalized_text text,
  add column if not exists rerun_count integer not null default 1;

update research_queries
  set normalized_text = regexp_replace(lower(btrim(text)), '[^a-z0-9\s]', '', 'g')
  where normalized_text is null;

create index if not exists research_queries_account_normalized_idx on research_queries(account_id, normalized_text) where superseded_by is null;

-- Collapse pre-existing duplicates (the same question saved multiple times before this fix
-- existed): keep the most recent row per (account, normalized text) as the visible card,
-- fold its rerun_count up to the group's size, and hide the rest the same way "Refresh"
-- already hides a superseded search — via superseded_by, which the list endpoint already
-- filters on, so no other code path needs to change for the backfill to take effect.
-- rerun_count must be set from the ORIGINAL group (before any row's superseded_by changes
-- below) — these two updates cannot be merged into one WITH, since the second statement's
-- CTE would otherwise re-read the table after the first has already hidden the duplicates,
-- leaving the survivor looking like a group of one.
with grouped as (
  select id, account_id, normalized_text, created_at,
    row_number() over (partition by account_id, normalized_text order by created_at desc) as rn,
    count(*) over (partition by account_id, normalized_text) as cnt
  from research_queries
  where superseded_by is null and normalized_text is not null and normalized_text <> ''
)
update research_queries rq
  set rerun_count = grouped.cnt
  from grouped
  where rq.id = grouped.id and grouped.rn = 1 and grouped.cnt > 1;

with grouped as (
  select id, account_id, normalized_text, created_at,
    row_number() over (partition by account_id, normalized_text order by created_at desc) as rn,
    first_value(id) over (partition by account_id, normalized_text order by created_at desc) as survivor_id
  from research_queries
  where superseded_by is null and normalized_text is not null and normalized_text <> ''
)
update research_queries rq
  set superseded_by = grouped.survivor_id
  from grouped
  where rq.id = grouped.id and grouped.rn > 1;
