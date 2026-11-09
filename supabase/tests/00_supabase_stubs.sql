-- Minimaler Nachbau der Supabase-Umgebung für lokale Tests mit reinem
-- PostgreSQL. NICHT in Supabase ausführen – dort existiert all das bereits.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase vergibt standardmäßig alle Rechte an neue Tabellen für anon/authenticated;
-- das bilden wir nach, damit getestet wird, dass Migration 002 sie wirklich entzieht.
-- service_role bekommt hier bewusst KEINE Standardrechte (wie in neueren
-- Supabase-Projekten) – die Migrationen müssen sie ausdrücklich vergeben.
alter default privileges in schema public grant all on tables to anon, authenticated;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text not null,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
create or replace function storage.extension(name text) returns text language sql immutable as $f$
  select reverse(split_part(reverse(name), '.', 1))
$f$;
grant execute on function storage.extension(text) to anon, authenticated;
