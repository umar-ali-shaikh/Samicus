-- Lock the database to the API server.
--
-- The browser ships Supabase's public "anon" key (needed for Google/email sign-in). Without
-- this migration that key could read and write every table directly through Supabase's
-- auto-generated REST API, bypassing all of the API's authorization checks. The Express API
-- uses the service-role key, which bypasses RLS, so enabling RLS with *no policies* denies
-- anon/authenticated everywhere while leaving the app untouched.

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

-- The API's service-role connection keeps full access (explicit, so it never depends on defaults).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- Private bucket for uploaded documents (the API also creates it on boot if missing).
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
