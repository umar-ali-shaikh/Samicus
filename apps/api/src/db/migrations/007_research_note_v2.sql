-- Samicus Research v2: structured 10-section answer (behind RESEARCH_NOTE_V2), per-passage
-- score/court already existed in research_query_chunks/corpus_documents — this adds the
-- places the structured note itself is persisted, plus a per-source "indexed to" stat for
-- the corpus cards. Safe to run on an existing database; fresh installs get the same shape
-- from schema.sql.

alter table research_answers
  add column if not exists sections jsonb,         -- the 10 fixed sections, each {id,title,status,paragraphs:[{text,cites:[n]}]}
  add column if not exists authorities jsonb,       -- [{n,title,court,citation,source,url}], derived from this answer's own segments
  add column if not exists position jsonb,          -- {label:"Settled law"|"Unsettled"|"Conflicting"|null, note}
  add column if not exists jurisdiction text,
  add column if not exists law_as_on timestamptz,
  add column if not exists note_schema_version text; -- 'v2' once the structured note above is populated; null means pre-v2 row

-- Per-source document count AND the most recent indexed_at for that source — the existing
-- corpus_document_counts_by_source() only has the count, which is all /corpus/status needed
-- before the Research page wanted an "indexed to <date>" line per corpus card.
create or replace function corpus_document_stats_by_source()
returns table (source text, count bigint, indexed_at timestamptz) as $$
  select source, count(*), max(indexed_at) from corpus_documents group by source;
$$ language sql stable;
