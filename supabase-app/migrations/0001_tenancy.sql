-- =====================================================================
-- StudySpace App (kommerzielle Version) – Konten, Lerngruppen, Tarife
-- ---------------------------------------------------------------------
-- NUR für das EIGENE Supabase-Projekt der neuen App ausführen – NIE in der
-- Datenbank der bisherigen privaten StudySpace-Seite.
--
-- Baut auf den gemeinsamen Tabellen (supabase/migrations 001, 002, 004–008)
-- auf und macht daraus eine mandantenfähige Datenbank:
--   • Jede Zeile gehört genau einer Lerngruppe (group_id).
--   • Lesen/Schreiben nur für angemeldete Mitglieder der AKTIVEN Gruppe
--     (Row Level Security, serverseitig – nicht über die Oberfläche).
--   • group_id wird beim Einfügen automatisch gesetzt (Trigger) und kann
--     nicht auf eine fremde Gruppe gesetzt oder verändert werden.
--   • Verweise (z. B. Aufgabe → Lerntag) müssen in derselben Gruppe liegen.
--   • Erledigungen und Fokuszeiten schreibt jede Person nur für sich selbst.
--   • Gruppen anlegen nur mit Plus; max. 8 Mitglieder; Kontingente.
--   • Keine Datei-Uploads (Anhänge gesperrt, kein Storage-Bucket).
-- Wiederholbar ausführbar.
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Konten, Gruppen, Mitgliedschaften
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  active_group_id       uuid,
  status                text not null default 'active' check (status in ('active', 'blocked')),
  -- Alle Sitzungen, die VOR diesem Zeitpunkt angemeldet wurden, sind ungültig
  sessions_valid_after  timestamptz,
  last_seen_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id     uuid references auth.users(id) on delete set null,
  invite_code  text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists groups_owner_idx on public.groups(owner_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_active_group_fk') then
    alter table public.profiles add constraint profiles_active_group_fk
      foreign key (active_group_id) references public.groups(id) on delete set null;
  end if;
end $$;

-- Lernprofil (members) je Konto und Gruppe – verknüpft über user_id
alter table public.members add column if not exists user_id uuid references auth.users(id) on delete set null;

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members(user_id) where left_at is null;

-- ---------------------------------------------------------------------
-- 2. Tarife: Berechtigungen (Plus) – getrennt von Zahlungen
-- ---------------------------------------------------------------------
-- Plus für einen Benutzer (darf Gruppen anlegen) oder direkt für eine Gruppe.
-- Quelle „admin“ = kostenlose Freischaltung, zählt NIE als Umsatz.
create table if not exists public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  plan        text not null check (plan in ('plus_monthly', 'semester_pass', 'plus_grant')),
  source      text not null check (source in ('admin', 'stripe', 'app_store', 'play_store')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                       -- null = ohne Ablaufdatum
  revoked_at  timestamptz,
  external_id text unique,                       -- Abo-/Transaktions-ID des Zahlungsanbieters
  granted_by  uuid references auth.users(id) on delete set null,
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  check (user_id is not null or group_id is not null),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists entitlements_user_idx on public.entitlements(user_id);
create index if not exists entitlements_group_idx on public.entitlements(group_id);

-- Echte Zahlungen (nur Server/Webhooks schreiben hier; bis zur Anbindung leer)
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  provider     text not null check (provider in ('stripe', 'app_store', 'play_store')),
  external_id  text not null unique,
  plan         text not null check (plan in ('plus_monthly', 'semester_pass')),
  amount_cents integer not null check (amount_cents >= 0),
  currency     text not null default 'EUR',
  status       text not null check (status in ('paid', 'refunded', 'failed')),
  occurred_at  timestamptz not null default now()
);
create table if not exists public.subscription_events (
  id          bigint generated always as identity primary key,
  provider    text not null,
  external_id text,
  kind        text not null check (kind in ('started', 'renewed', 'canceled', 'expired', 'refunded')),
  user_id     uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Administration
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists admin_audit_time_idx on public.admin_audit(occurred_at desc);

-- Tageszähler für Neuanlagen je Gruppe (gegen Anlegen/Löschen im Kreis)
create table if not exists public.group_usage (
  group_id  uuid not null references public.groups(id) on delete cascade,
  day       date not null,
  table_name text not null,
  inserts   integer not null default 0,
  primary key (group_id, day, table_name)
);

-- ---------------------------------------------------------------------
-- 4. group_id an allen Inhaltstabellen
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions',
    'attachments', 'app_settings', 'activity_log', 'focus_sessions',
    'homework', 'homework_parts', 'homework_completions', 'music_tracks'
  ] loop
    execute format('alter table public.%I add column if not exists group_id uuid references public.groups(id) on delete cascade', t);
    execute format('create index if not exists %I on public.%I(group_id)', t || '_group_idx', t);
  end loop;
end $$;

-- Einstellungen je Gruppe statt global
do $$ begin
  if exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conname = 'app_settings_pkey' and c.conrelid = 'public.app_settings'::regclass
    group by c.conname having count(*) = 1
  ) then
    -- Altbestände ohne Gruppe gibt es in einem neuen Projekt nicht
    delete from public.app_settings where group_id is null;
    alter table public.app_settings drop constraint app_settings_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_settings_pkey' and conrelid = 'public.app_settings'::regclass) then
    alter table public.app_settings alter column group_id set not null;
    alter table public.app_settings add constraint app_settings_pkey primary key (group_id, key);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Hilfsfunktionen (serverseitige Berechtigungslogik)
-- ---------------------------------------------------------------------

-- Zeitpunkt der Anmeldung dieser Sitzung (bleibt bei Token-Erneuerung gleich)
create or replace function app.session_auth_time() returns timestamptz
language sql stable as $$
  select to_timestamp(coalesce(
    (select min((x ->> 'timestamp')::bigint) from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x),
    (auth.jwt() ->> 'iat')::bigint,
    0
  ))
$$;

-- Konto aktiv und Sitzung nicht widerrufen?
create or replace function app.account_ok() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (p.sessions_valid_after is null or app.session_auth_time() > p.sessions_valid_after)
  )
$$;

-- Aktive Gruppe des angemeldeten Kontos (nur wenn wirklich Mitglied)
create or replace function app.active_group() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select p.active_group_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
    and (p.sessions_valid_after is null or app.session_auth_time() > p.sessions_valid_after)
    and exists (select 1 from public.group_members gm where gm.group_id = p.active_group_id and gm.user_id = p.id and gm.left_at is null)
$$;

-- Lernprofil des angemeldeten Kontos in der aktiven Gruppe
create or replace function app.my_member_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select gm.member_id from public.group_members gm
  where gm.group_id = app.active_group() and gm.user_id = auth.uid() and gm.left_at is null
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  -- Admin-Funktionen nur mit Zwei-Faktor-Anmeldung (aal2)
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and app.account_ok()
$$;

create or replace function app.entitlement_active(e public.entitlements) returns boolean
language sql stable as $$
  select e.revoked_at is null and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
$$;

-- Hat ein Konto selbst Plus (darf Gruppen anlegen)?
create or replace function app.user_has_plus(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.entitlements e where e.user_id = uid and app.entitlement_active(e))
$$;

-- Hat eine Gruppe Plus (eigene Freischaltung oder Plus des Inhabers)?
create or replace function app.group_has_plus(gid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.entitlements e where e.group_id = gid and app.entitlement_active(e))
      or exists (select 1 from public.groups g where g.id = gid and g.owner_id is not null and app.user_has_plus(g.owner_id))
$$;

-- Ablauf des Plus-Zugangs einer Gruppe (null = unbegrenzt, -infinity = kein Plus)
create or replace function app.group_plus_until(gid uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when bool_or(e.ends_at is null) then null
    when count(*) = 0 then '-infinity'::timestamptz
    else max(e.ends_at) end
  from public.entitlements e
  where app.entitlement_active(e)
    and (e.group_id = gid or e.user_id = (select owner_id from public.groups where id = gid))
$$;

create or replace function app.new_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + (get_byte(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end $$;

revoke all on all functions in schema app from public;
grant execute on function app.session_auth_time(), app.account_ok(), app.active_group(), app.my_member_id(),
  app.is_admin(), app.user_has_plus(uuid), app.group_has_plus(uuid), app.group_plus_until(uuid),
  app.entitlement_active(public.entitlements) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Trigger: Gruppe stempeln, Gruppengrenzen prüfen, Kontingente
-- ---------------------------------------------------------------------

-- Läuft als ERSTER Before-Trigger (Name „aa_…“): setzt group_id und verbietet Wechsel
create or replace function app.stamp_group() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.group_id is null then
      new.group_id := app.active_group();
    end if;
    if new.group_id is null then
      raise exception 'Keine aktive Lerngruppe' using errcode = '42501', hint = 'no_group';
    end if;
  elsif new.group_id is distinct from old.group_id then
    raise exception 'Die Gruppe eines Eintrags kann nicht geändert werden' using errcode = '42501', hint = 'group_immutable';
  end if;
  return new;
end $$;

-- Verweise müssen in derselben Gruppe liegen (TG_ARGV: Spalte, Zieltabelle, …)
create or replace function app.same_group_refs() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n jsonb := to_jsonb(new);
  i int := 0;
  ref uuid;
  ok boolean;
begin
  while i < tg_nargs loop
    ref := nullif(n ->> tg_argv[i], '')::uuid;
    if ref is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and group_id = $2)', tg_argv[i + 1])
        into ok using ref, new.group_id;
      if not ok then
        raise exception 'Verweis auf einen Eintrag einer anderen Gruppe' using errcode = '42501', hint = 'cross_group';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;

-- Rate Limit je Gruppe (ersetzt das globale aus 001)
create or replace function public.ss_rate_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  max_per_minute integer := tg_argv[0]::integer;
  ts_column text := coalesce(tg_argv[1], 'created_at');
  recent integer;
begin
  if to_jsonb(new) ? 'group_id' then
    execute format('select count(*) from public.%I where group_id = $1 and %I > now() - interval ''1 minute''', tg_table_name, ts_column)
      into recent using new.group_id;
  else
    execute format('select count(*) from public.%I where %I > now() - interval ''1 minute''', tg_table_name, ts_column)
      into recent;
  end if;
  if recent >= max_per_minute then
    raise exception 'Zu viele neue Einträge in kurzer Zeit. Bitte kurz warten.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  return new;
end $$;

-- Kontingente je Gruppe: aktive Einträge + Neuanlagen pro Tag
create or replace function app.enforce_quota() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  max_active integer := tg_argv[0]::integer;   -- 0 = keine Grenze
  max_per_day integer := tg_argv[1]::integer;
  label text := tg_argv[2];
  active_count integer;
  -- über jsonb, weil nicht jede Tabelle deleted_at hat (z. B. Fächer: archived_at)
  becomes_active boolean := (tg_op = 'INSERT' and (to_jsonb(new) ->> 'deleted_at') is null)
    or (tg_op = 'UPDATE' and (to_jsonb(old) ->> 'deleted_at') is not null and (to_jsonb(new) ->> 'deleted_at') is null);
begin
  if tg_op = 'INSERT' then
    insert into public.group_usage (group_id, day, table_name, inserts)
    values (new.group_id, (now() at time zone 'Europe/Berlin')::date, tg_table_name, 1)
    on conflict (group_id, day, table_name) do update set inserts = public.group_usage.inserts + 1
    returning inserts into active_count;
    if active_count > max_per_day then
      raise exception 'Tageslimit für neue % erreicht (% pro Tag). Morgen geht es weiter.', label, max_per_day
        using errcode = 'P0001', hint = 'quota_daily';
    end if;
  end if;
  if becomes_active and max_active > 0 then
    -- Gruppe sperren, damit gleichzeitige Anlagen die Grenze nicht überschreiten
    perform 1 from public.groups where id = new.group_id for update;
    execute format('select count(*) from public.%I where group_id = $1 and deleted_at is null and id <> $2', tg_table_name)
      into active_count using new.group_id, new.id;
    if active_count >= max_active then
      raise exception 'Grenze erreicht: höchstens % aktive % pro Gruppe. Erledigte oder alte Einträge löschen, um Platz zu schaffen.', max_active, label
        using errcode = 'P0001', hint = 'quota_active';
    end if;
  end if;
  return new;
end $$;

-- Inhalte nur mit aktivem Plus der Gruppe anlegen/ändern (Haken/Fokus immer erlaubt)
create or replace function app.require_plus() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.group_has_plus(new.group_id) then
    raise exception 'Der Plus-Zugang dieser Gruppe ist abgelaufen. Inhalte können angesehen, aber nicht bearbeitet werden.'
      using errcode = 'P0001', hint = 'plus_required';
  end if;
  return new;
end $$;

-- Mitglieder-Regeln je Gruppe (ersetzt die globalen aus 001)
create or replace function public.ss_member_rules() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.members where group_id = new.group_id and is_active) >= 8 then
    raise exception 'Eine Gruppe hat höchstens 8 Mitglieder' using errcode = 'P0001', hint = 'member_limit';
  end if;
  return new;
end $$;

-- Änderungsverlauf je Gruppe (wie 001, zusätzlich group_id und Hausaufgaben-Haken)
create or replace function public.ss_log_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_action text;
  v_entity_id text;
  v_summary text;
  v_actor uuid := nullif(n ->> 'changed_by', '')::uuid;
  v_details jsonb := null;
begin
  if tg_table_name in ('task_completions', 'homework_completions') then
    v_entity_id := coalesce(n ->> 'task_id', n ->> 'target_id') || ':' || (n ->> 'member_id');
    if tg_op = 'UPDATE' and (o -> 'is_completed') = (n -> 'is_completed') then
      return null;
    end if;
    v_action := case when (n ->> 'is_completed')::boolean then 'completed' else 'uncompleted' end;
    if tg_table_name = 'task_completions' then
      select t.title into v_summary from public.tasks t where t.id = (n ->> 'task_id')::uuid;
    else
      select h.title into v_summary from public.homework h where h.id = (n ->> 'homework_id')::uuid;
    end if;
    v_details := jsonb_build_object(
      'member_id', n ->> 'member_id',
      'member_name', (select m.name from public.members m where m.id = (n ->> 'member_id')::uuid)
    );
  else
    v_entity_id := coalesce(n ->> 'id', n ->> 'key');
    v_summary := coalesce(n ->> 'title', n ->> 'name', n ->> 'original_filename', n ->> 'key');
    if tg_op = 'INSERT' then
      v_action := 'created';
    else
      -- Rein technische Änderungen (Reihenfolge) nicht protokollieren.
      if (n - 'sort_order' - 'version' - 'updated_at' - 'changed_by')
         = (o - 'sort_order' - 'version' - 'updated_at' - 'changed_by') then
        return null;
      end if;
      if (o ->> 'deleted_at') is null and (n ->> 'deleted_at') is not null then
        v_action := 'archived';
      elsif (o ->> 'deleted_at') is not null and (n ->> 'deleted_at') is null then
        v_action := 'restored';
      elsif (o ->> 'archived_at') is null and (n ->> 'archived_at') is not null then
        v_action := 'archived';
      elsif (o ->> 'archived_at') is not null and (n ->> 'archived_at') is null then
        v_action := 'restored';
      elsif tg_table_name = 'members' and (o -> 'is_active') <> (n -> 'is_active') then
        v_action := case when (n ->> 'is_active')::boolean then 'restored' else 'archived' end;
      elsif tg_table_name = 'study_entries' and (o ->> 'study_date') <> (n ->> 'study_date') then
        v_action := 'moved';
        v_details := jsonb_build_object('from', o ->> 'study_date', 'to', n ->> 'study_date');
      elsif tg_table_name = 'tasks' and (o ->> 'study_entry_id') <> (n ->> 'study_entry_id') then
        v_action := 'moved';
        v_details := jsonb_build_object('from', o ->> 'study_entry_id', 'to', n ->> 'study_entry_id');
      else
        v_action := 'updated';
      end if;
    end if;
  end if;

  insert into public.activity_log (group_id, actor_member_id, actor_label, entity_type, entity_id, action, summary, details)
  values (
    (n ->> 'group_id')::uuid,
    v_actor,
    (select m.name from public.members m where m.id = v_actor),
    tg_table_name,
    v_entity_id,
    v_action,
    left(v_summary, 200),
    v_details
  );
  return null;
end;
$$;

-- Trigger anbringen
do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions',
    'app_settings', 'focus_sessions', 'homework', 'homework_parts', 'homework_completions', 'music_tracks'
  ] loop
    execute format('drop trigger if exists aa_group_stamp on public.%I', t);
    execute format('create trigger aa_group_stamp before insert or update on public.%I for each row execute function app.stamp_group()', t);
  end loop;
  -- Plus nötig für Inhalte (nicht für Haken, Fokuszeiten, eigenes Profil)
  foreach t in array array['modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'homework', 'homework_parts', 'music_tracks', 'app_settings'] loop
    execute format('drop trigger if exists ab_require_plus on public.%I', t);
    execute format('create trigger ab_require_plus before insert or update on public.%I for each row execute function app.require_plus()', t);
  end loop;
end $$;

drop trigger if exists ac_refs on public.module_topics;
create trigger ac_refs before insert or update on public.module_topics for each row execute function app.same_group_refs('module_id', 'modules');
drop trigger if exists ac_refs on public.exams;
create trigger ac_refs before insert or update on public.exams for each row execute function app.same_group_refs('module_id', 'modules');
drop trigger if exists ac_refs on public.study_entries;
create trigger ac_refs before insert or update on public.study_entries for each row execute function app.same_group_refs('module_id', 'modules', 'topic_id', 'module_topics');
drop trigger if exists ac_refs on public.tasks;
create trigger ac_refs before insert or update on public.tasks for each row execute function app.same_group_refs('study_entry_id', 'study_entries');
drop trigger if exists ac_refs on public.task_completions;
create trigger ac_refs before insert or update on public.task_completions for each row execute function app.same_group_refs('task_id', 'tasks', 'member_id', 'members');
drop trigger if exists ac_refs on public.focus_sessions;
create trigger ac_refs before insert or update on public.focus_sessions for each row execute function app.same_group_refs('member_id', 'members', 'module_id', 'modules');
drop trigger if exists ac_refs on public.homework;
create trigger ac_refs before insert or update on public.homework for each row execute function app.same_group_refs('module_id', 'modules');
drop trigger if exists ac_refs on public.homework_parts;
create trigger ac_refs before insert or update on public.homework_parts for each row execute function app.same_group_refs('homework_id', 'homework');
drop trigger if exists ac_refs on public.homework_completions;
create trigger ac_refs before insert or update on public.homework_completions for each row execute function app.same_group_refs('homework_id', 'homework', 'member_id', 'members');

-- Kontingente: 50 aktive Hausaufgaben, 100 aktive Lerntage; Neuanlagen pro Tag begrenzt
drop trigger if exists ad_quota on public.homework;
create trigger ad_quota before insert or update of deleted_at on public.homework
  for each row execute function app.enforce_quota('50', '150', 'Hausaufgaben');
drop trigger if exists ad_quota on public.study_entries;
create trigger ad_quota before insert or update of deleted_at on public.study_entries
  for each row execute function app.enforce_quota('100', '300', 'Lernplaneinträge');
drop trigger if exists ad_quota on public.tasks;
create trigger ad_quota before insert on public.tasks
  for each row execute function app.enforce_quota('0', '2000', 'Aufgaben');
drop trigger if exists ad_quota on public.homework_parts;
create trigger ad_quota before insert on public.homework_parts
  for each row execute function app.enforce_quota('0', '1500', 'Arbeitsschritte');
drop trigger if exists ad_quota on public.modules;
create trigger ad_quota before insert on public.modules
  for each row execute function app.enforce_quota('0', '60', 'Fächer');
drop trigger if exists ad_quota on public.exams;
create trigger ad_quota before insert on public.exams
  for each row execute function app.enforce_quota('0', '100', 'Prüfungen');
drop trigger if exists ad_quota on public.music_tracks;
create trigger ad_quota before insert on public.music_tracks
  for each row execute function app.enforce_quota('0', '60', 'Musiktitel');

-- Rate Limits für Haken/Fokus sinnvoll halten (gruppenbezogen)
drop trigger if exists ss_rate_limit on public.focus_sessions;
create trigger ss_rate_limit before insert on public.focus_sessions
  for each row execute function public.ss_rate_limit('30', 'created_at');

-- ---------------------------------------------------------------------
-- 7. Rechte und Row Level Security
-- ---------------------------------------------------------------------
-- Öffentliche Rolle (nicht angemeldet) hat überhaupt keinen Zugriff
do $$
declare t text;
begin
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions',
    'attachments', 'app_settings', 'activity_log', 'focus_sessions', 'homework', 'homework_parts',
    'homework_completions', 'music_tracks', 'push_devices', 'push_log', 'push_state',
    'profiles', 'groups', 'group_members', 'entitlements', 'payments', 'subscription_events',
    'admins', 'admin_audit', 'group_usage'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists ss_public_select on public.%I', t);
      execute format('drop policy if exists ss_public_insert on public.%I', t);
      execute format('drop policy if exists ss_public_update on public.%I', t);
    end if;
  end loop;
end $$;

-- Inhalte: lesen, anlegen, ändern nur in der aktiven Gruppe
do $$
declare t text;
begin
  foreach t in array array[
    'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'app_settings', 'homework', 'homework_parts', 'music_tracks'
  ] loop
    execute format('drop policy if exists app_select on public.%I', t);
    execute format('drop policy if exists app_insert on public.%I', t);
    execute format('drop policy if exists app_update on public.%I', t);
    execute format('create policy app_select on public.%I for select to authenticated using (group_id = app.active_group())', t);
    execute format('create policy app_insert on public.%I for insert to authenticated with check (group_id = app.active_group())', t);
    execute format('create policy app_update on public.%I for update to authenticated using (group_id = app.active_group()) with check (group_id = app.active_group())', t);
  end loop;
  -- Persönliche Daten: alle in der Gruppe sehen (Gruppenfortschritt, Lernzeit), aber nur für sich selbst schreiben
  foreach t in array array['task_completions', 'homework_completions', 'focus_sessions'] loop
    execute format('drop policy if exists app_select on public.%I', t);
    execute format('drop policy if exists app_insert on public.%I', t);
    execute format('drop policy if exists app_update on public.%I', t);
    execute format('create policy app_select on public.%I for select to authenticated using (group_id = app.active_group())', t);
    execute format('create policy app_insert on public.%I for insert to authenticated with check (group_id = app.active_group() and member_id = app.my_member_id())', t);
    if t <> 'focus_sessions' then
      execute format('create policy app_update on public.%I for update to authenticated using (group_id = app.active_group() and member_id = app.my_member_id()) with check (group_id = app.active_group() and member_id = app.my_member_id())', t);
    end if;
  end loop;
end $$;

-- Lernprofile: Gruppe sieht alle; ändern nur das eigene (Name, Farbe); anlegen nur per Funktion
drop policy if exists app_select on public.members;
drop policy if exists app_update on public.members;
create policy app_select on public.members for select to authenticated using (group_id = app.active_group());
create policy app_update on public.members for update to authenticated
  using (group_id = app.active_group() and user_id = auth.uid()) with check (group_id = app.active_group() and user_id = auth.uid());
revoke insert on public.members from authenticated;
revoke update on public.members from authenticated;
grant update (name, color, changed_by) on public.members to authenticated;

drop policy if exists app_select on public.activity_log;
create policy app_select on public.activity_log for select to authenticated using (group_id = app.active_group());

-- Keine Dateien in der App
revoke all on table public.attachments from authenticated;

-- Konto- und Gruppentabellen: nur lesen, ändern ausschließlich über Funktionen
revoke all on public.profiles, public.groups, public.group_members, public.entitlements, public.payments,
  public.subscription_events, public.admins, public.admin_audit, public.group_usage from authenticated;
grant select on public.profiles, public.groups, public.group_members, public.entitlements to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists app_own on public.profiles;
create policy app_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists app_own_update on public.profiles;
create policy app_own_update on public.profiles for update to authenticated using (id = auth.uid() and app.account_ok()) with check (id = auth.uid());

drop policy if exists app_mine on public.groups;
create policy app_mine on public.groups for select to authenticated using (
  app.account_ok() and exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.left_at is null)
);
drop policy if exists app_mine on public.group_members;
create policy app_mine on public.group_members for select to authenticated using (
  app.account_ok() and (user_id = auth.uid() or group_id = app.active_group())
);
drop policy if exists app_mine on public.entitlements;
create policy app_mine on public.entitlements for select to authenticated using (
  app.account_ok() and (user_id = auth.uid() or group_id in (select gm.group_id from public.group_members gm where gm.user_id = auth.uid() and gm.left_at is null))
);
-- payments, subscription_events, admins, admin_audit, group_usage: keine Policies → nur service_role / Funktionen

grant all on public.profiles, public.groups, public.group_members, public.entitlements, public.payments,
  public.subscription_events, public.admins, public.admin_audit, public.group_usage to service_role;

-- ---------------------------------------------------------------------
-- 8. Konto anlegen (bei Registrierung, auch Google/Apple)
-- ---------------------------------------------------------------------
create or replace function app.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 40), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists app_on_user_created on auth.users;
create trigger app_on_user_created after insert on auth.users for each row execute function app.on_auth_user_created();

-- ---------------------------------------------------------------------
-- 9. Funktionen für die App (RPC)
-- ---------------------------------------------------------------------
create or replace function public.app_me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return null; end if;
  return jsonb_build_object(
    'user_id', uid,
    'status', (select status from public.profiles where id = uid),
    'session_ok', app.account_ok(),
    'display_name', (select display_name from public.profiles where id = uid),
    'active_group_id', app.active_group(),
    'member_id', app.my_member_id(),
    'has_plus', app.user_has_plus(uid),
    'plus_until', (select case when bool_or(e.ends_at is null) then null else max(e.ends_at) end from public.entitlements e where e.user_id = uid and app.entitlement_active(e)),
    'is_admin', exists (select 1 from public.admins where user_id = uid),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'role', gm.role, 'is_owner', g.owner_id = uid,
        'has_plus', app.group_has_plus(g.id), 'plus_until', app.group_plus_until(g.id),
        'members', (select count(*) from public.group_members x where x.group_id = g.id and x.left_at is null),
        'invite_code', case when gm.role = 'owner' then g.invite_code end
      ) order by gm.joined_at)
      from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.user_id = uid and gm.left_at is null), '[]'::jsonb)
  );
end $$;

-- Lebenszeichen (ungefähre Online-Anzeige im Admin-Bereich)
create or replace function public.app_touch() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')
$$;

create or replace function public.app_set_display_name(p_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  update public.profiles set display_name = left(btrim(p_name), 40), updated_at = now() where id = auth.uid();
  update public.members set name = left(btrim(p_name), 40) where user_id = auth.uid() and char_length(btrim(p_name)) between 1 and 40;
end $$;

-- interne Hilfe: Lernprofil anlegen oder reaktivieren
create or replace function app.attach_member(gid uuid, uid uuid, p_role text, p_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mid uuid;
  palette text[] := array['#AFC5F5', '#C9B8F5', '#A6DED7', '#F5C9A8', '#F5B8C8', '#B8E0A8', '#F0D98C', '#A8D4F0'];
  nm text := left(btrim(coalesce(nullif(p_name, ''), (select display_name from public.profiles where id = uid), 'Ich')), 40);
begin
  select gm.member_id into mid from public.group_members gm where gm.group_id = gid and gm.user_id = uid;
  if mid is null then
    insert into public.members (group_id, user_id, name, color, sort_order, is_active)
    values (gid, uid, nm, palette[1 + (select count(*) from public.members where group_id = gid) % 8],
            (select coalesce(max(sort_order), 0) + 1 from public.members where group_id = gid), true)
    returning id into mid;
    insert into public.group_members (group_id, user_id, member_id, role) values (gid, uid, mid, p_role);
  else
    update public.members set is_active = true where id = mid;
    update public.group_members set left_at = null, role = p_role, joined_at = now() where group_id = gid and user_id = uid;
  end if;
  update public.profiles set active_group_id = gid, updated_at = now() where id = uid;
  return mid;
end $$;

create or replace function public.app_create_group(p_name text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not app.user_has_plus(uid) then
    raise exception 'Zum Erstellen einer Lerngruppe wird Plus benötigt.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  if (select count(*) from public.groups where owner_id = uid) >= 3 then
    raise exception 'Höchstens 3 eigene Lerngruppen pro Konto.' using errcode = 'P0001', hint = 'group_limit';
  end if;
  insert into public.groups (name, owner_id, invite_code) values (left(btrim(p_name), 60), uid, app.new_invite_code()) returning id into gid;
  perform app.attach_member(gid, uid, 'owner', p_display_name);
  insert into public.app_settings (group_id, key, value) values
    (gid, 'app_name', to_jsonb(left(btrim(p_name), 60))), (gid, 'group_goal_title', '"Unser gemeinsames Lernziel"'::jsonb), (gid, 'motivation_enabled', 'true'::jsonb)
  on conflict do nothing;
  return gid;
end $$;

create or replace function public.app_join_group(p_code text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  active_members integer;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  -- Zeile sperren: gleichzeitige Beitritte werden nacheinander geprüft
  select * into g from public.groups where invite_code = upper(btrim(p_code)) for update;
  if g.id is null then raise exception 'Einladungscode ungültig.' using errcode = 'P0001', hint = 'invalid_code'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = uid and left_at is null) then
    update public.profiles set active_group_id = g.id where id = uid;
    return g.id;
  end if;
  if not app.group_has_plus(g.id) then
    raise exception 'Diese Lerngruppe hat derzeit keinen aktiven Plus-Zugang.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  select count(*) into active_members from public.group_members where group_id = g.id and left_at is null;
  if active_members >= 8 then
    raise exception 'Diese Lerngruppe ist voll (höchstens 8 Mitglieder).' using errcode = 'P0001', hint = 'member_limit';
  end if;
  perform app.attach_member(g.id, uid, 'member', p_display_name);
  return g.id;
end $$;

-- Vorschau einer Einladung (Name und Belegung – keine Mitgliederdaten)
create or replace function public.app_invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', g.name, 'members', (select count(*) from public.group_members x where x.group_id = g.id and x.left_at is null), 'has_plus', app.group_has_plus(g.id))
  from public.groups g where g.invite_code = upper(btrim(p_code)) and auth.uid() is not null
$$;

create or replace function public.app_switch_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid() and left_at is null) or not app.account_ok() then
    raise exception 'Kein Mitglied dieser Gruppe' using errcode = '42501';
  end if;
  update public.profiles set active_group_id = p_group, updated_at = now() where id = auth.uid();
end $$;

-- Austreten (Haken und Lernzeiten bleiben als Verlauf erhalten, Profil wird inaktiv)
create or replace function public.app_leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if exists (select 1 from public.groups where id = p_group and owner_id = uid) then
    raise exception 'Als Inhaber kannst du die Gruppe nicht verlassen – lösche sie stattdessen.' using errcode = 'P0001', hint = 'owner_cannot_leave';
  end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = uid and left_at is null;
  update public.members set is_active = false where group_id = p_group and user_id = uid;
  update public.profiles set active_group_id = (
    select gm.group_id from public.group_members gm where gm.user_id = uid and gm.left_at is null order by gm.joined_at limit 1
  ) where id = uid;
end $$;

create or replace function public.app_remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.account_ok() or not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Nur der Inhaber kann Mitglieder entfernen' using errcode = '42501';
  end if;
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst entfernen' using errcode = 'P0001'; end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = p_user and left_at is null;
  update public.members set is_active = false where group_id = p_group and user_id = p_user;
  update public.profiles set active_group_id = null where id = p_user and active_group_id = p_group;
end $$;

create or replace function public.app_regenerate_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare code text := app.new_invite_code();
begin
  if not app.account_ok() or not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Nur der Inhaber kann den Einladungscode erneuern' using errcode = '42501';
  end if;
  update public.groups set invite_code = code, updated_at = now() where id = p_group;
  return code;
end $$;

create or replace function public.app_rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.account_ok() or not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Nur der Inhaber kann die Gruppe umbenennen' using errcode = '42501';
  end if;
  update public.groups set name = left(btrim(p_name), 60), updated_at = now() where id = p_group;
end $$;

-- Gruppe endgültig löschen (Inhaber oder Admin) – Reihenfolge wegen „restrict“-Verweisen
create or replace function app.purge_group(gid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set active_group_id = null where active_group_id = gid;
  delete from public.homework_completions where group_id = gid;
  delete from public.task_completions where group_id = gid;
  delete from public.focus_sessions where group_id = gid;
  delete from public.homework_parts where group_id = gid;
  delete from public.homework where group_id = gid;
  delete from public.tasks where group_id = gid;
  delete from public.study_entries where group_id = gid;
  delete from public.exams where group_id = gid;
  delete from public.module_topics where group_id = gid;
  delete from public.music_tracks where group_id = gid;
  delete from public.activity_log where group_id = gid;
  delete from public.app_settings where group_id = gid;
  delete from public.group_members where group_id = gid;
  delete from public.members where group_id = gid;
  delete from public.modules where group_id = gid;
  delete from public.groups where id = gid;
end $$;

create or replace function public.app_delete_group(p_group uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.account_ok() or not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Nur der Inhaber kann die Gruppe löschen' using errcode = '42501';
  end if;
  if (select name from public.groups where id = p_group) <> btrim(p_confirm_name) then
    raise exception 'Zur Bestätigung den genauen Gruppennamen eingeben.' using errcode = 'P0001', hint = 'confirm';
  end if;
  perform app.purge_group(p_group);
end $$;

-- Nutzung der Kontingente (für Hinweise in der App)
create or replace function public.app_usage() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'homework', (select count(*) from public.homework where group_id = app.active_group() and deleted_at is null),
    'homework_max', 50,
    'study_entries', (select count(*) from public.study_entries where group_id = app.active_group() and deleted_at is null),
    'study_entries_max', 100,
    'members', (select count(*) from public.group_members where group_id = app.active_group() and left_at is null),
    'members_max', 8,
    'documents_max', 0
  ) where app.active_group() is not null
$$;

-- Papierkorb: gelöschte Einträge nach 30 Tagen endgültig entfernen
create or replace function app.purge_trash() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.homework_completions c using public.homework h where c.homework_id = h.id and h.deleted_at < now() - interval '30 days';
  delete from public.homework_parts p using public.homework h where p.homework_id = h.id and h.deleted_at < now() - interval '30 days';
  delete from public.homework where deleted_at < now() - interval '30 days';
  delete from public.homework_completions c using public.homework_parts p where c.target_id = p.id and p.deleted_at < now() - interval '30 days';
  delete from public.homework_parts where deleted_at < now() - interval '30 days';
  delete from public.task_completions c using public.tasks t, public.study_entries e
    where c.task_id = t.id and t.study_entry_id = e.id and (t.deleted_at < now() - interval '30 days' or e.deleted_at < now() - interval '30 days');
  delete from public.tasks t using public.study_entries e where t.study_entry_id = e.id and e.deleted_at < now() - interval '30 days';
  delete from public.tasks where deleted_at < now() - interval '30 days';
  delete from public.study_entries where deleted_at < now() - interval '30 days';
  delete from public.exams where deleted_at < now() - interval '30 days';
  delete from public.music_tracks where deleted_at < now() - interval '30 days';
  delete from public.group_usage where day < (now() - interval '40 days')::date;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'studyspace-app-purge-trash';
    perform cron.schedule('studyspace-app-purge-trash', '17 3 * * *', 'select app.purge_trash()');
  end if;
end $$;

revoke all on function public.app_me(), public.app_touch(), public.app_set_display_name(text), public.app_create_group(text, text),
  public.app_join_group(text, text), public.app_invite_info(text), public.app_switch_group(uuid), public.app_leave_group(uuid),
  public.app_remove_member(uuid, uuid), public.app_regenerate_invite(uuid), public.app_rename_group(uuid, text),
  public.app_delete_group(uuid, text), public.app_usage() from public, anon;
grant execute on function public.app_me(), public.app_touch(), public.app_set_display_name(text), public.app_create_group(text, text),
  public.app_join_group(text, text), public.app_invite_info(text), public.app_switch_group(uuid), public.app_leave_group(uuid),
  public.app_remove_member(uuid, uuid), public.app_regenerate_invite(uuid), public.app_rename_group(uuid, text),
  public.app_delete_group(uuid, text), public.app_usage() to authenticated;
revoke all on function app.purge_group(uuid), app.purge_trash(), app.attach_member(uuid, uuid, text, text), app.new_invite_code(),
  app.stamp_group(), app.same_group_refs(), app.enforce_quota(), app.require_plus(), app.on_auth_user_created() from public, anon, authenticated;

-- Realtime: Konto-/Gruppentabellen nicht veröffentlichen (nur Inhalte, gefiltert per RLS)
