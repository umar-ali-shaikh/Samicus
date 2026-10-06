-- Samicus Research "honest no-match": a bare "No match" badge with no explanation looks the
-- same whether the corpus genuinely has nothing on the topic, the best candidate just missed
-- the relevance threshold narrowly, or the auto-fetch-and-index step found a live source and
-- failed to index it. These three columns let the UI tell those apart. Safe to run on an
-- existing database; fresh installs get the same shape from schema.sql.

alter table research_queries
  add column if not exists not_found_reason text check (not_found_reason in ('corpus_gap', 'ingest_failed', 'below_threshold')),
  add column if not exists top_score numeric,
  add column if not exists live_fetch_ingest_failed boolean not null default false;
