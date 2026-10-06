-- Research Library v2: pin/tag/versioned-refresh on saved searches, structured per-case
-- summary fields + related-searches/related-cases on the AI insight layer, and a follow-up
-- chat scoped to one saved report's own evidence. Safe to run on an existing database;
-- fresh installs get the same shape from schema.sql.

alter table research_queries
  add column if not exists title text,
  add column if not exists pinned_at timestamptz,
  add column if not exists tags text[] not null default '{}',
  add column if not exists superseded_by uuid references research_queries(id);

alter table research_answers
  add column if not exists summary text,                                   -- the AI overall-summary text (was computed fresh every load and never persisted — bug fix)
  add column if not exists case_cards jsonb not null default '{}'::jsonb,  -- structured per-segment summary, keyed by chunk id (facts/issues/held/ratio/outcome/keyParagraph/gloss)
  add column if not exists related_searches jsonb not null default '[]'::jsonb,
  add column if not exists related_case_ids uuid[] not null default '{}';   -- corpus_documents.id[]

create table if not exists research_chat_turns (
  id uuid primary key default gen_random_uuid(),
  research_query_id uuid not null references research_queries(id),
  question text not null,
  answer jsonb not null,          -- {text, citations: [{segmentIndex, ...}]}
  created_at timestamptz not null default now()
);
create index if not exists research_chat_turns_query_id_idx on research_chat_turns(research_query_id);

-- schema.sql's RLS-enable loop only covered tables that existed at the time it last ran —
-- a table created afterward (this one) needs it done explicitly, same no-policies-at-all
-- posture as every other table (only the service-role API connection can read/write it).
alter table research_chat_turns enable row level security;
