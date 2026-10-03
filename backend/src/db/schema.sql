-- Supabase/Postgres schema — ported from the 44 Mongoose models in backend/src/models/.
-- Conversion rules (see docs/MIGRATION plan): uuid PKs; ObjectId refs -> uuid FKs;
-- arrays of scalars used as query filters -> junction tables; arrays of embedded
-- subdocs with their own identity/refs that get populated -> child tables with a
-- `position` column to preserve order; everything else embedded/Mixed -> jsonb
-- (never queried into by the DB today, so jsonb is a direct, lossless port).
-- No ON DELETE behavior is added beyond the two account_members FKs (a pure
-- membership/junction row, the uncontroversial default) — everything else stays
-- plain `references` (no action), matching Mongo's lack of enforced referential
-- integrity rather than inventing a new cascade strategy.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ===================== users / accounts / membership =====================

create table users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  email text,
  full_name text not null,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  city text,
  state text,
  kyc_status text not null default 'unverified' check (kyc_status in ('unverified', 'pending', 'verified')),
  role text not null default 'client' check (role in ('client', 'advocate', 'admin', 'founder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_set_updated_at before update on users for each row execute function set_updated_at();

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audience text not null check (audience in ('individual', 'family', 'business')),
  price_monthly numeric not null default 0,
  entitlement_consultations integer,
  entitlement_document_reviews integer,
  entitlement_seats integer
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('individual', 'family', 'business')),
  display_name text not null,
  gstin text,
  cin text,
  billing_address text,
  plan_id uuid references plans(id),
  seat_limit integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_display_name_key on accounts(display_name);
create trigger accounts_set_updated_at before update on accounts for each row execute function set_updated_at();

create table account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'finance', 'viewer')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, user_id)
);
create index account_members_user_id_idx on account_members(user_id);
create trigger account_members_set_updated_at before update on account_members for each row execute function set_updated_at();

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  plan_id uuid not null references plans(id),
  renews_at timestamptz,
  usage_counters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_account_id_idx on subscriptions(account_id);
create trigger subscriptions_set_updated_at before update on subscriptions for each row execute function set_updated_at();

-- ===================== practice areas / situations =====================

create table practice_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sub_specialisations text[] not null default '{}',
  typical_forums text[] not null default '{}',
  statute_tags text[] not null default '{}'
);

create table situations (
  id uuid primary key default gen_random_uuid(),
  label_en text not null,
  label_hi text not null,
  mapped_practice_area_id uuid not null references practice_areas(id),
  urgency_default text not null default 'week' check (urgency_default in ('today', '48h', 'week', 'deadline')),
  routing_note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger situations_set_updated_at before update on situations for each row execute function set_updated_at();

-- ===================== advocates =====================

create table advocates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id),
  bar_council text not null,
  enrolment_number text not null,
  enrolment_year integer,
  verification_status text not null default 'submitted'
    check (verification_status in ('submitted', 'documents_requested', 'under_review', 'verified', 'rejected')),
  sub_specialisations text[] not null default '{}',
  years_of_practice integer,
  education text[] not null default '{}',
  relevant_experience text[] not null default '{}',
  instant_fee numeric,
  scheduled_fee numeric,
  availability_state text not null default 'offline' check (availability_state in ('available', 'busy', 'offline')),
  accepts_urgent boolean not null default false,
  chamber_address text,
  city text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index advocates_verification_status_idx on advocates(verification_status);
create trigger advocates_set_updated_at before update on advocates for each row execute function set_updated_at();

create table advocate_practice_areas (
  advocate_id uuid not null references advocates(id),
  practice_area_id uuid not null references practice_areas(id),
  primary key (advocate_id, practice_area_id)
);

create table advocate_languages (
  advocate_id uuid not null references advocates(id),
  language text not null,
  primary key (advocate_id, language)
);

create table advocate_consultation_modes (
  advocate_id uuid not null references advocates(id),
  mode text not null check (mode in ('video', 'phone', 'chat', 'in_person')),
  primary key (advocate_id, mode)
);

create table advocate_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  advocate_id uuid not null references advocates(id),
  state text,
  forum text
);
create index advocate_jurisdictions_advocate_id_idx on advocate_jurisdictions(advocate_id);
create index advocate_jurisdictions_forum_idx on advocate_jurisdictions(forum);

-- Convenience view so route code can read an advocate "the old Mongoose way" (languages/
-- consultation_modes/jurisdictions back as arrays) without hand-writing the aggregation
-- at every call site — the junction/child tables above remain the source of truth for
-- writes and for filtering by containment.
create view advocates_full as
  select
    a.*,
    coalesce((select array_agg(language) from advocate_languages where advocate_id = a.id), '{}') as languages,
    coalesce((select array_agg(mode) from advocate_consultation_modes where advocate_id = a.id), '{}') as consultation_modes,
    coalesce((select array_agg(practice_area_id) from advocate_practice_areas where advocate_id = a.id), '{}') as practice_area_ids,
    coalesce(
      (select jsonb_agg(jsonb_build_object('state', state, 'forum', forum)) from advocate_jurisdictions where advocate_id = a.id),
      '[]'::jsonb
    ) as jurisdictions
  from advocates a;

-- ===================== verification / conflict checks =====================

create table verification_cases (
  id uuid primary key default gen_random_uuid(),
  advocate_id uuid not null references advocates(id),
  checks jsonb not null default '[]'::jsonb, -- [{type, status, evidenceKey}]
  reviewer_id uuid references users(id),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'sent_back')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger verification_cases_set_updated_at before update on verification_cases for each row execute function set_updated_at();

-- ===================== intake / matching =====================

create table intake_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  created_by uuid not null references users(id),
  description text,
  voice_transcript_id text,
  situation_id uuid references situations(id),
  routed_practice_area_id uuid references practice_areas(id),
  routing_confidence numeric,
  urgency text not null check (urgency in ('today', '48h', 'week', 'deadline')),
  city text,
  state text,
  forum text,
  mode text not null check (mode in ('video', 'phone', 'chat', 'in_person')),
  language text not null,
  kind text not null check (kind in ('instant', 'scheduled', 'urgent')),
  status text not null default 'created'
    check (status in ('created', 'searching', 'advocate_reviewing', 'matched', 'connected', 'completed', 'none_available', 'callback_scheduled', 'declined')),
  consent_given_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index intake_requests_account_id_idx on intake_requests(account_id);
create trigger intake_requests_set_updated_at before update on intake_requests for each row execute function set_updated_at();

create table conflict_checks (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references intake_requests(id),
  advocate_id uuid not null references advocates(id),
  status text not null default 'pending' check (status in ('pending', 'clear', 'conflict')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intake_id, advocate_id)
);
create trigger conflict_checks_set_updated_at before update on conflict_checks for each row execute function set_updated_at();

create table match_results (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references intake_requests(id),
  advocate_id uuid not null references advocates(id),
  rank integer,
  score_breakdown jsonb, -- {practiceArea, subSpecialisation, jurisdiction, forum, language, mode, availability, relevantExperience}
  total_score numeric,
  why_matched text,
  estimated_response_seconds integer,
  quoted_fee numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index match_results_intake_id_idx on match_results(intake_id);
create trigger match_results_set_updated_at before update on match_results for each row execute function set_updated_at();

-- ===================== matters and sub-resources =====================

create table matters (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  account_id uuid not null references accounts(id),
  advocate_id uuid not null references advocates(id),
  title text not null,
  practice_area_id uuid references practice_areas(id),
  forum text,
  stage text not null default 'intake'
    check (stage in ('intake', 'lawyer_matched', 'consultation', 'engagement_confirmed', 'action_in_progress', 'resolution', 'closed', 'archived')),
  next_action text,
  opened_at timestamptz not null default now(),
  engaged_at timestamptz,
  closed_at timestamptz,
  archive_retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matters_account_id_idx on matters(account_id);
create index matters_advocate_id_idx on matters(advocate_id);
create trigger matters_set_updated_at before update on matters for each row execute function set_updated_at();
-- Matter.STAGES (Mongoose static) is now just an ordered constant in application code,
-- not a DB concept — keep ["intake","lawyer_matched","consultation","engagement_confirmed","action_in_progress","resolution"].

create table tasks (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  label text not null,
  owner_type text not null default 'client' check (owner_type in ('client', 'advocate')),
  due_at timestamptz,
  is_statutory_deadline boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_matter_id_idx on tasks(matter_id);
create trigger tasks_set_updated_at before update on tasks for each row execute function set_updated_at();

create table hearings (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  forum text,
  court_hall text,
  listed_at timestamptz not null,
  purpose text,
  outcome_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hearings_matter_id_idx on hearings(matter_id);
create trigger hearings_set_updated_at before update on hearings for each row execute function set_updated_at();

create table timeline_events (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  type text,
  title text not null,
  body text,
  actor_type text not null check (actor_type in ('user', 'advocate', 'system', 'platform')),
  actor_id uuid, -- polymorphic (matches actor_type) — no FK, same as Mongo
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
  -- append-only: no updated_at, matching {timestamps:{createdAt:true, updatedAt:false}}
);
create index timeline_events_matter_id_idx on timeline_events(matter_id);

create table matter_access_grants (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  subject_id uuid not null, -- polymorphic (user or advocate) — no FK, same as Mongo
  subject_type text not null check (subject_type in ('user', 'advocate')),
  subject_name text,
  subject_role text,
  scope text[] not null default '{}', -- each element in ('documents','messages','tasks','fees')
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matter_access_grants_matter_id_idx on matter_access_grants(matter_id);
create trigger matter_access_grants_set_updated_at before update on matter_access_grants for each row execute function set_updated_at();

create table fee_proposals (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  advocate_id uuid not null references advocates(id),
  scope_text text,
  milestones jsonb not null default '[]'::jsonb, -- [{label, amount, trigger}]
  statutory_estimate text,
  exclusions text[] not null default '{}',
  valid_until timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fee_proposals_matter_id_idx on fee_proposals(matter_id);
create trigger fee_proposals_set_updated_at before update on fee_proposals for each row execute function set_updated_at();

create table invoices (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  total numeric not null,
  due_at timestamptz,
  status text not null default 'due' check (status in ('draft', 'due', 'paid', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_matter_id_idx on invoices(matter_id);
create trigger invoices_set_updated_at before update on invoices for each row execute function set_updated_at();

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  position integer not null default 0,
  label text,
  amount numeric,
  category text not null check (category in ('professional', 'government', 'platform')),
  tax_rate numeric not null default 0
);
create index invoice_line_items_invoice_id_idx on invoice_line_items(invoice_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  method text not null check (method in ('upi', 'card', 'net_banking')),
  gateway_ref text,
  escrow_state text not null default 'held' check (escrow_state in ('held', 'released', 'refunded')),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_invoice_id_idx on payments(invoice_id);
create trigger payments_set_updated_at before update on payments for each row execute function set_updated_at();

-- ===================== messaging =====================

create table message_threads (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references matters(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_threads_matter_id_idx on message_threads(matter_id);
create trigger message_threads_set_updated_at before update on message_threads for each row execute function set_updated_at();

create table thread_participants (
  thread_id uuid not null references message_threads(id),
  participant_id uuid not null, -- polymorphic (user or advocate) — no FK, same as Mongo
  primary key (thread_id, participant_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id),
  sender_id uuid not null, -- polymorphic — no FK, same as Mongo
  body text not null,
  attachments uuid[] not null default '{}', -- Document ids; never joined in app code today
  sent_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_thread_id_idx on messages(thread_id);

-- ===================== documents =====================

create table documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  matter_id uuid references matters(id),
  filename text not null,
  mime text,
  size_bytes bigint,
  kind text not null default 'Other' check (kind in ('Notices', 'Agreements', 'Evidence', 'Invoices', 'Other')),
  storage_key text,
  encryption_key_id text not null default 'dev-key-1',
  uploaded_by uuid not null references users(id),
  shared_with uuid[] not null default '{}', -- Advocate ids; membership checked in app code, same as Mongo
  virus_scan_status text not null default 'clean' check (virus_scan_status in ('pending', 'clean', 'infected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_account_id_idx on documents(account_id);
create index documents_matter_id_idx on documents(matter_id);
create trigger documents_set_updated_at before update on documents for each row execute function set_updated_at();

-- ===================== drafting: templates, clauses, drafts, reviews =====================

create table doc_templates (
  id uuid primary key default gen_random_uuid(),
  category text,
  name text not null,
  jurisdiction text,
  version integer not null default 1,
  locale text not null default 'en',
  blurb text,
  pages integer,
  base_sections jsonb not null default '[]'::jsonb, -- [{key, heading, bodyTemplate}] — consumed wholesale, never queried by sub-field
  field_schema jsonb not null default '[]'::jsonb, -- [{key, label, placeholder, type, required, wide, help}]
  stamp_duty_note text,
  draft_fee numeric not null default 0,
  review_fee numeric not null default 1499,
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger doc_templates_set_updated_at before update on doc_templates for each row execute function set_updated_at();

create table clause_library (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references doc_templates(id),
  title text not null,
  body_template text not null,
  rationale_note text,
  disposition text not null default 'optional' check (disposition in ('recommended', 'optional', 'review_advised')),
  risk_side text not null default 'mutual' check (risk_side in ('client', 'counterparty', 'mutual')),
  favors text not null default 'balanced' check (favors in ('drafter', 'counterparty', 'balanced')),
  requires_fields text[] not null default '{}',
  authored_by text,
  approved_by text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clause_library_template_id_idx on clause_library(template_id);
create trigger clause_library_set_updated_at before update on clause_library for each row execute function set_updated_at();

create table clause_conflicts (
  clause_id uuid not null references clause_library(id),
  conflicts_with_id uuid not null references clause_library(id),
  primary key (clause_id, conflicts_with_id)
);

create table document_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  template_id uuid not null references doc_templates(id),
  template_version integer not null,
  field_values jsonb not null default '{}'::jsonb, -- shape varies per template.field_schema
  selected_clause_ids uuid[] not null default '{}', -- resolved via a separate $in-style query, never joined
  custom_clauses jsonb not null default '[]'::jsonb, -- [{title, body}]
  status text not null default 'draft' check (status in ('draft', 'sent_for_review', 'reviewed', 'rendered')),
  render_key_docx text,
  render_key_pdf text,
  review_id uuid, -- FK added after draft_reviews exists, see below
  matter_id uuid references matters(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_drafts_account_id_idx on document_drafts(account_id);
create trigger document_drafts_set_updated_at before update on document_drafts for each row execute function set_updated_at();

create table draft_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references document_drafts(id),
  advocate_id uuid not null references advocates(id),
  fee numeric not null default 1499,
  sla_hours integer not null default 24,
  marked_up_document_id uuid references documents(id),
  comments jsonb not null default '[]'::jsonb, -- [{clauseId, severity, body}] — clauseId never joined, stored as-is
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'returned')),
  submitted_at timestamptz not null default now(),
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index draft_reviews_draft_id_idx on draft_reviews(draft_id);
create trigger draft_reviews_set_updated_at before update on draft_reviews for each row execute function set_updated_at();

alter table document_drafts add constraint document_drafts_review_id_fkey foreign key (review_id) references draft_reviews(id);

create table stamp_orders (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references document_drafts(id),
  state text,
  instrument_type text,
  duty_amount numeric,
  registration_required boolean not null default false,
  provider_ref text,
  certificate_key text,
  status text not null default 'quoted' check (status in ('quoted', 'paid', 'issued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stamp_orders_draft_id_idx on stamp_orders(draft_id);
create trigger stamp_orders_set_updated_at before update on stamp_orders for each row execute function set_updated_at();

-- ===================== contract review =====================

create table contract_reviews (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  document_id uuid not null references documents(id),
  contract_type text,
  counterparty_name text,
  clauses_identified integer,
  redline_key text,
  advocate_review_id uuid references advocates(id),
  status text not null default 'scanning' check (status in ('scanning', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contract_reviews_account_id_idx on contract_reviews(account_id);
create trigger contract_reviews_set_updated_at before update on contract_reviews for each row execute function set_updated_at();

create table contract_review_findings (
  id uuid primary key default gen_random_uuid(),
  contract_review_id uuid not null references contract_reviews(id),
  position integer not null default 0,
  clause_type text,
  clause_ref text,
  extracted_text text,
  library_entry_id uuid references clause_library(id),
  favors text check (favors in ('drafter', 'counterparty', 'balanced')),
  deviation_note text,
  recommended_ask text,
  authority_citation text
);
create index contract_review_findings_contract_review_id_idx on contract_review_findings(contract_review_id);

-- ===================== services =====================

create table services (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  description text,
  professional_fee numeric not null,
  government_fee numeric not null default 0,
  timeline_days integer,
  includes text[] not null default '{}',
  required_documents text[] not null default '{}',
  deliverables text[] not null default '{}',
  default_advocate_id uuid references advocates(id)
);

create table service_orders (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id),
  account_id uuid not null references accounts(id),
  status text not null default 'started' check (status in ('started', 'in_progress', 'delivered', 'abandoned')),
  matter_id uuid references matters(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_orders_account_id_idx on service_orders(account_id);
create trigger service_orders_set_updated_at before update on service_orders for each row execute function set_updated_at();

-- ===================== consultations =====================

create table consultations (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references intake_requests(id),
  advocate_id uuid not null references advocates(id),
  account_id uuid not null references accounts(id),
  mode text not null check (mode in ('video', 'phone', 'chat', 'in_person')),
  scheduled_start timestamptz,
  duration_minutes integer not null default 30,
  room_token text,
  state text not null default 'scheduled'
    check (state in ('scheduled', 'reminder_sent', 'in_progress', 'completed', 'notes_published', 'rescheduled', 'cancelled')),
  recording_enabled boolean not null default false,
  notes text,
  converted_matter_id uuid references matters(id),
  fee_professional numeric,
  fee_platform numeric,
  fee_gst numeric,
  fee_total numeric,
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consultations_intake_id_idx on consultations(intake_id);
create trigger consultations_set_updated_at before update on consultations for each row execute function set_updated_at();

-- ===================== corpus / research (RAG-adjacent, Mongo-backed today) =====================

create table corpus_documents (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('bare_act', 'supreme_court', 'high_court', 'rules', 'ccpa', 'asci')),
  citation text not null,
  title text not null,
  court text,
  decided_on timestamptz,
  act_name text,
  section_number text,
  amendment_as_of timestamptz,
  canonical_url text,
  raw_text text,
  treatment text,
  superseded_by uuid references corpus_documents(id),
  indexed_at timestamptz not null default now()
);

create table corpus_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references corpus_documents(id),
  ordinal integer,
  text text not null,
  char_range integer[],
  section_label text,
  paragraph_class text not null check (paragraph_class in
    ('provision', 'facts', 'issues', 'petitioner_arguments', 'respondent_arguments', 'reasoning', 'holding', 'directions')),
  para_number text,
  deep_link text,
  headnote_flag boolean not null default false,
  token_count integer,
  keywords text[] not null default '{}' -- dev-mode retrieval substitute for a real vector index
);
create index corpus_chunks_document_id_idx on corpus_chunks(document_id);

create table research_queries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id),
  text text not null,
  locale text not null default 'en',
  sources_enabled text[] not null default '{}',
  threshold numeric not null default 0.62,
  outcome text not null check (outcome in ('answered', 'partial', 'not_found')),
  model_version text not null default 'fixture-1',
  prompt_version text not null default 'v1',
  latency_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_queries_account_id_idx on research_queries(account_id);
create trigger research_queries_set_updated_at before update on research_queries for each row execute function set_updated_at();

-- Replaces Mongo's two index-correlated parallel arrays (retrievedChunkIds[] + scores[])
-- with a proper child table — a direct improvement, trivial since the table is new anyway.
create table research_query_chunks (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references research_queries(id),
  chunk_id uuid not null references corpus_chunks(id),
  score numeric,
  position integer not null default 0
);
create index research_query_chunks_query_id_idx on research_query_chunks(query_id);

create table research_answers (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references research_queries(id),
  caveat_text text,
  unsupported_span_count integer not null default 0,
  reviewed_by_advocate_id uuid references advocates(id),
  helpful boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_answers_query_id_idx on research_answers(query_id);
create trigger research_answers_set_updated_at before update on research_answers for each row execute function set_updated_at();

create table research_answer_segments (
  id uuid primary key default gen_random_uuid(),
  research_answer_id uuid not null references research_answers(id),
  position integer not null default 0,
  text text,
  chunk_id uuid not null references corpus_chunks(id)
);
create index research_answer_segments_research_answer_id_idx on research_answer_segments(research_answer_id);

-- ===================== legal assistant (Vidhira) sessions =====================

create table legal_assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger legal_assistant_sessions_set_updated_at before update on legal_assistant_sessions for each row execute function set_updated_at();

create table legal_assistant_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references legal_assistant_sessions(id),
  question text not null,
  result jsonb not null, -- the exact JSON shape answerLegalQuestion() returns (Prompt C schema after the Vidhira upgrade)
  created_at timestamptz not null default now()
);
create index legal_assistant_turns_session_id_idx on legal_assistant_turns(session_id);

-- ===================== ask/learn (public Q&A, guides, firms) =====================

create table public_questions (
  id uuid primary key default gen_random_uuid(),
  author_account_id uuid not null references accounts(id), -- app layer must mimic Mongoose's select:false (never SELECT this column back to end users)
  body text not null,
  practice_area text,
  city text,
  status text not null default 'pending_moderation' check (status in ('pending_moderation', 'published', 'rejected')),
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger public_questions_set_updated_at before update on public_questions for each row execute function set_updated_at();

create table public_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public_questions(id),
  advocate_id uuid not null references advocates(id),
  body text not null,
  published_at timestamptz,
  helpful_count integer not null default 0,
  moderation_state text not null default 'pending' check (moderation_state in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_answers_question_id_idx on public_answers(question_id);
create trigger public_answers_set_updated_at before update on public_answers for each row execute function set_updated_at();

-- Atomic $inc replacement for PublicAnswer.helpfulCount (the one real atomic update in the codebase).
create or replace function increment_helpful_count(answer_id uuid)
returns public_answers as $$
  update public_answers set helpful_count = helpful_count + 1 where id = answer_id returning *;
$$ language sql volatile;

create table guides (
  id uuid primary key default gen_random_uuid(),
  tag text,
  title text not null,
  body text,
  locale text not null default 'en',
  read_minutes integer,
  reviewed_by_advocate_id uuid references advocates(id),
  reviewed_at timestamptz,
  related_situation_ids uuid[] not null default '{}', -- never joined in app code today
  related_template_ids uuid[] not null default '{}'
);
create unique index guides_title_key on guides(title);

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  practice_areas text[] not null default '{}', -- plain strings, not refs
  advocate_ids uuid[] not null default '{}', -- never joined in app code today
  bench_strength integer,
  empanelment_note text,
  starting_fee numeric,
  verification_status text not null default 'unverified' check (verification_status in ('verified', 'unverified'))
);
create unique index firms_name_key on firms(name);

-- ===================== pack (label-compliance scanning) =====================

create table pack_rulesets (
  id uuid primary key default gen_random_uuid(),
  category_id text not null,
  category_name text,
  version integer not null,
  effective_from timestamptz,
  effective_to timestamptz,
  declarations jsonb not null default '[]'::jsonb, -- [{key, ruleRef, required, formatPattern, bilingualRequired, minFontMmByPanelArea}]
  claim_rules jsonb not null default '[]'::jsonb, -- [{pattern, verdict, ruleRef, substantiationRequired, saferPhrasing, saferRationale}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pack_rulesets_category_id_idx on pack_rulesets(category_id);
create trigger pack_rulesets_set_updated_at before update on pack_rulesets for each row execute function set_updated_at();

create table pack_scans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references accounts(id),
  sku text not null,
  product_name text,
  artwork_key text,
  artwork_version integer,
  category_id text,
  ruleset_version integer,
  declaration_results jsonb not null default '[]'::jsonb, -- [{key, status, extractedValue, ruleRef, failureKind, note}]
  claim_results jsonb not null default '[]'::jsonb, -- [{text, verdict, why, saferPhrasing, ruleRef}]
  status text not null default 'scanning' check (status in ('scanning', 'pass', 'warn', 'fail')),
  approved_by text,
  approved_at timestamptz,
  recheck_required boolean not null default false,
  recheck_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pack_scans_org_id_idx on pack_scans(org_id);
create trigger pack_scans_set_updated_at before update on pack_scans for each row execute function set_updated_at();

create table ruleset_diffs (
  id uuid primary key default gen_random_uuid(),
  category_id text,
  from_version integer,
  to_version integer,
  effective_from timestamptz,
  changes jsonb not null default '[]'::jsonb, -- [{declarationKey, changeType, summary}]
  affected_scan_ids uuid[] not null default '{}',
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ruleset_diffs_set_updated_at before update on ruleset_diffs for each row execute function set_updated_at();

-- ===================== audit / analytics / founder dashboard =====================

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null, -- polymorphic — no FK, same as Mongo
  actor_role text,
  action text not null,
  subject_type text,
  subject_id uuid, -- polymorphic — no FK, same as Mongo
  reason text,
  outcome text not null default 'recorded' check (outcome in ('recorded', 'denied')),
  ip text,
  at timestamptz not null default now()
);

create table analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tab text not null unique,
  period text not null default 'last_30_days',
  refreshed_at timestamptz not null default now(),
  payload jsonb not null, -- deeply nested, variably-shaped per-tab dashboard JSON
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger analytics_snapshots_set_updated_at before update on analytics_snapshots for each row execute function set_updated_at();

create table corporate_account_health (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text,
  plan text,
  seats integer,
  revenue_12mo numeric,
  renewal_date timestamptz,
  score numeric not null check (score >= 0 and score <= 100),
  band text not null check (band in ('healthy', 'watch', 'at_risk')),
  metric_users integer,
  metric_contracts_uploaded integer,
  metric_drafts_generated integer,
  metric_pack_scans integer,
  metric_open_matters integer,
  metric_pending_approvals integer,
  metric_compliance_alerts integer,
  metric_subscription_used_pct numeric,
  risk_narrative text
);

create table advocate_performance_rows (
  id uuid primary key default gen_random_uuid(),
  advocate_id uuid not null references advocates(id),
  period text not null default 'last_30_days',
  received integer,
  accepted integer,
  declined integer,
  response_minutes numeric,
  completed integer,
  converted integer,
  fees_billed numeric,
  csat numeric
);
create index advocate_performance_rows_advocate_id_idx on advocate_performance_rows(advocate_id);

create table knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  asked_count integer,
  missing text,
  suggested_source text,
  priority text not null default 'medium' check (priority in ('index_first', 'high', 'medium'))
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  title text,
  category text check (category in ('deliverable_delay', 'compliance_coverage', 'supply_gap', 'citation_accuracy', 'payment')),
  status text not null default 'open' check (status in ('open', 'escalated', 'resolved')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  service_involved text,
  owner text,
  root_cause text,
  corrective_action text,
  refund_amount numeric,
  linked_record_type text check (linked_record_type in ('matter', 'consultation', 'pack_scan', 'research_query', 'payment')),
  linked_record_id uuid, -- polymorphic (matches linked_record_type) — no FK, same as Mongo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger complaints_set_updated_at before update on complaints for each row execute function set_updated_at();

create table admin_access_grants (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references users(id),
  matter_id uuid not null references matters(id),
  reason text not null default '',
  outcome text not null check (outcome in ('recorded', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger admin_access_grants_set_updated_at before update on admin_access_grants for each row execute function set_updated_at();

-- Replacement for the two Mongo aggregation pipelines ($unwind+$group, $group):

-- askLearn.js's "/specialisations": count of verified advocates per practice area.
create or replace function advocate_counts_by_practice_area()
returns table (practice_area_id uuid, count bigint) as $$
  select apa.practice_area_id, count(*)
  from advocate_practice_areas apa
  join advocates a on a.id = apa.advocate_id
  where a.verification_status = 'verified'
  group by apa.practice_area_id;
$$ language sql stable;

-- research.js's "/corpus/status": count of corpus documents per source.
create or replace function corpus_document_counts_by_source()
returns table (source text, count bigint) as $$
  select source, count(*) from corpus_documents group by source;
$$ language sql stable;

-- ===================== transaction-wrapped flows (fixing pre-existing atomicity gaps) =====================

-- intake.js: MatchResult.deleteMany({intakeId}) + insertMany([...]) as one transaction.
create or replace function replace_match_results(p_intake_id uuid, p_rows jsonb)
returns setof match_results as $$
begin
  delete from match_results where intake_id = p_intake_id;
  return query
    insert into match_results (intake_id, advocate_id, rank, score_breakdown, total_score, why_matched, estimated_response_seconds, quoted_fee)
    select
      p_intake_id,
      (row->>'advocate_id')::uuid,
      (row->>'rank')::integer,
      row->'score_breakdown',
      (row->>'total_score')::numeric,
      row->>'why_matched',
      (row->>'estimated_response_seconds')::integer,
      (row->>'quoted_fee')::numeric
    from jsonb_array_elements(p_rows) as row
    returning *;
end;
$$ language plpgsql volatile;

-- payments.js: Payment.create + Invoice status update as one transaction.
create or replace function capture_payment(
  p_invoice_id uuid, p_method text, p_gateway_ref text, p_escrow_state text
) returns payments as $$
declare
  v_payment payments;
begin
  insert into payments (invoice_id, method, gateway_ref, escrow_state)
  values (p_invoice_id, p_method, p_gateway_ref, p_escrow_state)
  returning * into v_payment;

  update invoices set status = 'paid' where id = p_invoice_id;

  return v_payment;
end;
$$ language plpgsql volatile;

-- advocates.js accept-flow: IntakeRequest status update + Matter.create as one transaction.
-- stage/next_action are fixed — this function is purpose-built for exactly this transition.
create or replace function accept_intake_and_open_matter(
  p_intake_id uuid, p_account_id uuid, p_advocate_id uuid, p_title text,
  p_practice_area_id uuid, p_forum text, p_reference text
) returns matters as $$
declare
  v_matter matters;
begin
  update intake_requests set status = 'matched' where id = p_intake_id;

  insert into matters (reference, account_id, advocate_id, title, practice_area_id, forum, stage, next_action)
  values (p_reference, p_account_id, p_advocate_id, p_title, p_practice_area_id, p_forum, 'lawyer_matched', 'Advocate to schedule initial consultation')
  returning * into v_matter;

  return v_matter;
end;
$$ language plpgsql volatile;
