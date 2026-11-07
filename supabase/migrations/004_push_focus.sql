-- =====================================================================
-- StudySpace – Migration 004: Push-Benachrichtigungen und Fokuszeiten
-- ---------------------------------------------------------------------
-- Kann gefahrlos mehrfach ausgeführt werden. Bestehende Lernplandaten
-- werden NICHT verändert – es kommen nur neue Tabellen hinzu.
--
-- 1. focus_sessions – gespeicherte Fokusphasen (öffentlich lesbar und
--    einfügbar wie der übrige Lernplan; kein Ändern, kein Löschen).
-- 2. push_devices / push_log / push_state – Push-Abonnements. Diese
--    Tabellen sind für die öffentlichen Rollen (anon/authenticated)
--    KOMPLETT gesperrt: Endpoints und Schlüssel sind nicht auslesbar.
--    Zugriff ausschließlich über die Edge Functions (service_role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fokuszeiten
-- ---------------------------------------------------------------------
create table if not exists public.focus_sessions (
  id               uuid primary key,
  member_id        uuid not null references public.members(id) on delete restrict,
  module_id        uuid references public.modules(id) on delete set null,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 60 and 14400),
  created_at       timestamptz not null default now(),
  constraint focus_sessions_order check (ended_at > started_at),
  constraint focus_sessions_not_future check (ended_at <= created_at + interval '5 minutes'),
  constraint focus_sessions_plausible check (duration_seconds <= extract(epoch from (ended_at - started_at)) + 60)
);
create index if not exists focus_sessions_member_idx on public.focus_sessions(member_id, started_at);
create index if not exists focus_sessions_started_idx on public.focus_sessions(started_at);

drop trigger if exists ss_rate_limit on public.focus_sessions;
create trigger ss_rate_limit before insert on public.focus_sessions
  for each row execute function public.ss_rate_limit('30', 'created_at');

revoke all on table public.focus_sessions from anon, authenticated;
grant select on public.focus_sessions to anon, authenticated;
grant insert (id, member_id, module_id, started_at, ended_at, duration_seconds) on public.focus_sessions to anon, authenticated;

alter table public.focus_sessions enable row level security;
drop policy if exists ss_public_select on public.focus_sessions;
drop policy if exists ss_public_insert on public.focus_sessions;
create policy ss_public_select on public.focus_sessions for select to anon, authenticated using (true);
create policy ss_public_insert on public.focus_sessions for insert to anon, authenticated with check (true);
-- Bewusst keine Update-/Delete-Policy.

-- ---------------------------------------------------------------------
-- 2. Push-Geräte (ein Eintrag je Browser-/PWA-Installation)
-- ---------------------------------------------------------------------
create table if not exists public.push_devices (
  id              uuid primary key default gen_random_uuid(),
  -- SHA-256 (hex) des geheimen Gerätetokens; der Token selbst liegt nur im Gerät
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Für welches Lernprofil dieses Gerät Erinnerungen erhält (Gerätepräferenz, NICHT verifiziert)
  member_id       uuid references public.members(id) on delete set null,
  endpoint        text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh          text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth            text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  platform        text check (length(platform) <= 40),
  user_agent      text check (length(user_agent) <= 300),
  enabled         boolean not null default true,
  prefs           jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and length(prefs::text) <= 2000),
  -- Zuletzt gesehener Eintrag im Änderungsverlauf (für „Lernplan aktualisiert“)
  plan_cursor     bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_success_at timestamptz,
  last_error      text check (length(last_error) <= 500),
  failure_count   integer not null default 0
);
create index if not exists push_devices_member_idx on public.push_devices(member_id) where enabled;

drop trigger if exists ss_rate_limit on public.push_devices;
create trigger ss_rate_limit before insert on public.push_devices
  for each row execute function public.ss_rate_limit('20', 'created_at');

-- Versandprotokoll + Deduplizierung: (device_id, dedupe_key) ist eindeutig.
-- Der Scheduler legt die Zeile VOR dem Versand an („pending“) – damit kann
-- auch ein doppelt laufender Scheduler dieselbe Nachricht nie zweimal senden.
create table if not exists public.push_log (
  id          bigint generated always as identity primary key,
  device_id   uuid not null references public.push_devices(id) on delete cascade,
  kind        text not null check (length(kind) <= 40),
  dedupe_key  text not null check (length(dedupe_key) <= 200),
  title       text not null check (length(title) <= 120),
  body        text not null check (length(body) <= 400),
  url         text check (length(url) <= 200),
  status      text not null check (status in ('pending', 'sent', 'failed', 'expired', 'merged')),
  http_status integer,
  error       text check (length(error) <= 500),
  meta        jsonb,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (device_id, dedupe_key)
);
create index if not exists push_log_device_kind_idx on public.push_log(device_id, kind, created_at desc);
create index if not exists push_log_created_idx on public.push_log(created_at);

-- Kleine Zustandstabelle des Schedulers (z. B. „Modul X zu 100 % erledigt seit …“)
create table if not exists public.push_state (
  key        text primary key check (length(key) <= 200),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Öffentliche Rollen: kein Zugriff. RLS aktiv, ohne Policies → alles gesperrt.
revoke all on table public.push_devices, public.push_log, public.push_state from anon, authenticated;
alter table public.push_devices enable row level security;
alter table public.push_log enable row level security;
alter table public.push_state enable row level security;
grant all on table public.push_devices, public.push_log, public.push_state to service_role;
grant usage, select on all sequences in schema public to service_role;

-- updated_at automatisch pflegen
create or replace function public.ss_push_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists ss_push_touch on public.push_devices;
create trigger ss_push_touch before update on public.push_devices
  for each row execute function public.ss_push_touch();

-- Alte Protokolleinträge aufräumen (wird vom Scheduler aufgerufen)
create or replace function public.ss_push_cleanup()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_log where created_at < now() - interval '60 days';
  delete from public.push_devices where enabled = false and updated_at < now() - interval '90 days';
$$;
revoke all on function public.ss_push_cleanup() from public, anon, authenticated;
grant execute on function public.ss_push_cleanup() to service_role;
