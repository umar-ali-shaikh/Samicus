-- Move from phone+OTP login to Supabase Auth (Google OAuth + email/password with
-- email verification). Safe to run on an existing database; fresh installs get the same
-- shape from schema.sql.

alter table users add column if not exists auth_id uuid unique references auth.users(id) on delete set null;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists last_login_at timestamptz;
alter table users alter column phone drop not null;
create unique index if not exists users_email_lower_key on users (lower(email)) where email is not null;

-- Ingested legal sources beyond the original curated list (Indian Kanoon tribunals etc.).
alter table corpus_documents drop constraint if exists corpus_documents_source_check;
alter table corpus_documents add constraint corpus_documents_source_check
  check (source in ('bare_act', 'supreme_court', 'high_court', 'rules', 'ccpa', 'asci', 'tribunal', 'other'));
alter table corpus_documents add column if not exists external_id text;
create unique index if not exists corpus_documents_external_id_key on corpus_documents(external_id);
alter table corpus_chunks add column if not exists embedded_at timestamptz;

-- Advocate working hours (drives bookable slots) — no hard-coded fake availability.
alter table advocates add column if not exists weekly_schedule jsonb not null default
  '{"days":[1,2,3,4,5,6],"start":"09:00","end":"19:00","slotMinutes":60}'::jsonb;

-- One advocate cannot be double-booked for the same slot.
create unique index if not exists consultations_advocate_slot_key
  on consultations(advocate_id, scheduled_start)
  where state in ('scheduled', 'reminder_sent', 'in_progress');


-- Conflict checks compare the named counterparty against the advocate's existing clients.
alter table intake_requests add column if not exists counterparty_name text;

-- Online payments (Razorpay). One row per checkout attempt.
create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('consultation', 'invoice', 'service_order', 'draft_review')),
  subject_id uuid not null,
  account_id uuid not null references accounts(id),
  created_by uuid not null references users(id),
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  provider_payment_id text,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  method text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_orders_subject_idx on payment_orders(kind, subject_id);

alter table service_orders add column if not exists paid_at timestamptz;
alter table service_orders add column if not exists advocate_id uuid references advocates(id);
alter table service_orders add column if not exists notes text;
alter table draft_reviews add column if not exists paid_at timestamptz;

-- Post-consultation feedback (feeds the founder CSAT figure — never shown publicly).
alter table consultations add column if not exists csat_rating smallint check (csat_rating between 1 and 5);
alter table consultations add column if not exists csat_comment text;

-- Complaints are now raised by users; extend for self-service intake.
alter table complaints add column if not exists raised_by uuid references users(id);
alter table complaints add column if not exists description text;
alter table complaints drop constraint if exists complaints_category_check;
alter table complaints add constraint complaints_category_check
  check (category in ('deliverable_delay', 'compliance_coverage', 'supply_gap', 'citation_accuracy', 'payment', 'advocate_conduct', 'other'));

alter table contract_review_findings add column if not exists similarity numeric;
alter table contract_review_findings add column if not exists why_it_matters text;
alter table contract_reviews add column if not exists notes text;
alter table contract_reviews drop constraint if exists contract_reviews_status_check;
alter table contract_reviews add constraint contract_reviews_status_check check (status in ('scanning', 'done', 'failed'));

-- AI assistant conversations belong to a user.
alter table legal_assistant_sessions add column if not exists user_id uuid references users(id) on delete cascade;
create index if not exists legal_assistant_sessions_user_id_idx on legal_assistant_sessions(user_id);

-- Unused convenience view (froze the advocates column list); superseded by explicit selects.
drop view if exists advocates_full;
