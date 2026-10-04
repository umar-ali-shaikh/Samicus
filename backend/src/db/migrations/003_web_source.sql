-- Tavily (web) fallback: the RAG corpus can now hold trusted-domain web pages alongside
-- Indian Kanoon statutes/judgments. Safe to run on an existing database; fresh installs
-- get the same shape from schema.sql.

alter table corpus_documents drop constraint if exists corpus_documents_source_check;
alter table corpus_documents add constraint corpus_documents_source_check
  check (source in ('bare_act', 'supreme_court', 'high_court', 'rules', 'ccpa', 'asci', 'tribunal', 'other', 'web'));
