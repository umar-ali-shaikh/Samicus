-- "Notify me when an advocate is available" — the honest fallback shown wherever an
-- advocate search/match comes back empty (Find a lawyer, Talk now, Urgent help), instead of
-- a dead-end button that promises something the product can't currently do.
-- Safe to run on an existing database; fresh installs get the same shape from schema.sql.

create table if not exists notify_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  account_id uuid references accounts(id),
  topic text not null,
  practice_area_id uuid references practice_areas(id),
  created_at timestamptz not null default now()
);
create index if not exists notify_requests_topic_idx on notify_requests(topic);
create index if not exists notify_requests_user_id_idx on notify_requests(user_id);

alter table notify_requests enable row level security;
