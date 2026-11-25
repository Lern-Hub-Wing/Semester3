-- =====================================================================
-- StudySpace – REPARATUR der bisherigen Seite
-- (wenn versehentlich supabase-app/app_schema.sql in der Datenbank der
--  SEITE ausgeführt wurde)
-- ---------------------------------------------------------------------
-- NUR im Supabase-Projekt der bisherigen SEITE ausführen (SQL Editor),
-- NICHT im Projekt der App.
--
-- Was passiert:
--   1. Die nächtlichen App-Jobs (Papierkorb endgültig leeren, Beta-Abos)
--      werden abgeschaltet – damit nichts endgültig gelöscht wird.
--   2. Die App-Regeln (Gruppen-Pflicht, Kontingente, Plus-Pflicht,
--      App-Zugriffsregeln) werden von den Tabellen der Seite entfernt.
--   3. Die Einstellungen-Tabelle bekommt wieder ihren Schlüssel (key);
--      App-Name, Gruppenziel und Motivation werden mit den Standardwerten
--      neu angelegt (die alten Werte hatte das App-Schema gelöscht).
--   4. Alle Migrationen der Seite (001, 002, 004–010) werden erneut
--      eingespielt: Funktionen, Trigger, Rechte und Regeln wie vorher.
--
-- Es werden KEINE Lerndaten gelöscht oder verändert (Personen, Fächer,
-- Prüfungen, Lernplan, Aufgaben, Haken, Hausaufgaben, Lernzeiten, Musik,
-- „Wer schreibt?“ bleiben genau so, wie sie sind). Die zusätzlichen
-- App-Tabellen (groups, profiles, …) bleiben ungenutzt liegen und stören
-- die Seite nicht. Wiederholbar ausführbar.
-- =====================================================================

-- 1. Nächtliche App-Jobs abschalten (vor allem: Papierkorb endgültig leeren)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('studyspace-app-purge-trash', 'studyspace-app-beta-renew');
  end if;
end $$;

-- 2. App-Trigger und App-Zugriffsregeln von den Tabellen der Seite entfernen
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions',
    'attachments', 'app_settings', 'activity_log', 'focus_sessions', 'homework', 'homework_parts',
    'homework_completions', 'music_tracks', 'push_devices', 'push_log', 'push_state'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists aa_group_stamp on public.%I', t);
    execute format('drop trigger if exists ab_require_plus on public.%I', t);
    execute format('drop trigger if exists ac_refs on public.%I', t);
    execute format('drop trigger if exists ad_quota on public.%I', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and policyname like 'app\_%' loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;
drop trigger if exists app_push_device_limit on public.push_devices;
drop trigger if exists app_push_homework on public.homework;
do $$ begin
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists app_on_user_created on auth.users';
  end if;
end $$;

-- 3. Einstellungen: Schlüssel wieder „key“ (wie auf der Seite)
do $$ begin
  if exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conname = 'app_settings_pkey' and c.conrelid = 'public.app_settings'::regclass
    group by c.conname having count(*) = 2
  ) then
    alter table public.app_settings drop constraint app_settings_pkey;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'group_id') then
    alter table public.app_settings alter column group_id drop not null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_settings_pkey' and conrelid = 'public.app_settings'::regclass) then
    alter table public.app_settings add constraint app_settings_pkey primary key (key);
  end if;
end $$;
insert into public.app_settings (key, value) values
  ('app_name', '"StudySpace"'::jsonb),
  ('group_goal_title', '"Unser gemeinsames Lernziel"'::jsonb),
  ('motivation_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- 4. Migrationen der Seite erneut einspielen (stellt Funktionen, Trigger, Rechte und Regeln wieder her)

-- ===== supabase/migrations/001_schema.sql =====
-- =====================================================================
-- StudySpace – Migration 001: Tabellen, Constraints, Indizes, Trigger
-- ---------------------------------------------------------------------
-- Ausführen im Supabase SQL Editor (oder per `supabase db push`).
-- Das Skript ist idempotent geschrieben, soweit PostgreSQL das erlaubt
-- (create ... if not exists / create or replace).
--
-- Grundregeln des Datenmodells
--  * Jede Zeile hat eine stabile UUID (members, modules, tasks, ...).
--  * Erledigungsstatus hängen an (task_id, member_id) – Titel, Datum,
--    Thema oder Farbe einer Aufgabe können sich ändern, ohne dass Haken
--    verloren gehen.
--  * Es wird nichts hart gelöscht: deleted_at / archived_at markieren
--    Inhalte als gelöscht bzw. archiviert (Papierkorb).
--  * Fremdschlüssel verwenden ON DELETE RESTRICT, damit niemals
--    Fortschrittsdaten kaskadierend verschwinden.
--  * `version` wird bei jedem UPDATE serverseitig hochgezählt. Der Client
--    nutzt sie für Konflikterkennung (optimistic locking) und um alte
--    Realtime-Ereignisse zu verwerfen.
--  * `changed_by` speichert das aktive Lernprofil, das die Änderung
--    vorgenommen hat. ACHTUNG: Diese Angabe ist NICHT verifiziert, weil
--    StudySpace bewusst ohne Anmeldung funktioniert.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------

-- Setzt Zeitstempel/Version und schützt unveränderliche Spalten.
-- TG_ARGV enthält die Namen der Spalten, die nach dem Anlegen nicht mehr
-- verändert werden dürfen (z. B. 'id').
create or replace function public.ss_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  col text;
  has_created boolean := to_jsonb(new) ? 'created_at';
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    if has_created then
      new.created_at := now();
    end if;
  else
    foreach col in array tg_argv loop
      if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
        raise exception 'Spalte % ist unveränderlich', col
          using errcode = '22023', hint = 'immutable_column';
      end if;
    end loop;
    new.version := old.version + 1;
    if has_created then
      new.created_at := old.created_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Einfaches Rate Limiting gegen massenhafte Einfügungen.
-- TG_ARGV[0] = maximale Anzahl neuer Zeilen pro Minute,
-- TG_ARGV[1] = Name der Zeitstempelspalte.
create or replace function public.ss_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  max_per_minute integer := tg_argv[0]::integer;
  ts_column text := coalesce(tg_argv[1], 'created_at');
  recent integer;
begin
  execute format(
    'select count(*) from public.%I where %I > now() - interval ''1 minute''',
    tg_table_name, ts_column
  ) into recent;
  if recent >= max_per_minute then
    raise exception 'Zu viele neue Einträge in kurzer Zeit (%). Bitte kurz warten.', tg_table_name
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- members – Lernprofile
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  color       text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  integer not null default 0 check (sort_order between -100000 and 100000),
  is_active   boolean not null default true,
  changed_by  uuid,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.members
  drop constraint if exists members_changed_by_fkey,
  add constraint members_changed_by_fkey foreign key (changed_by)
    references public.members(id) on delete set null;

-- ---------------------------------------------------------------------
-- modules – Prüfungsmodule
-- ---------------------------------------------------------------------
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  color       text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (description is null or char_length(description) <= 2000),
  sort_order  integer not null default 0 check (sort_order between -100000 and 100000),
  archived_at timestamptz,
  changed_by  uuid references public.members(id) on delete set null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- module_topics – Themenbereiche eines Moduls
-- ---------------------------------------------------------------------
create table if not exists public.module_topics (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.modules(id) on delete restrict,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  sort_order  integer not null default 0 check (sort_order between -100000 and 100000),
  archived_at timestamptz,
  changed_by  uuid references public.members(id) on delete set null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists module_topics_module_idx on public.module_topics(module_id, sort_order);

-- ---------------------------------------------------------------------
-- exams – Prüfungstermine (Zeitpunkte als timestamptz = eindeutiger
-- Zeitpunkt; die Anzeige erfolgt in der gespeicherten Zeitzone)
-- ---------------------------------------------------------------------
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.modules(id) on delete restrict,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  timezone    text not null default 'Europe/Berlin'
              check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' and char_length(timezone) <= 64),
  location    text check (location is null or char_length(location) <= 200),
  notes       text check (notes is null or char_length(notes) <= 2000),
  deleted_at  timestamptz,
  changed_by  uuid references public.members(id) on delete set null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint exams_time_order check (ends_at > starts_at),
  constraint exams_max_duration check (ends_at - starts_at <= interval '24 hours')
);
create index if not exists exams_starts_idx on public.exams(starts_at);
create index if not exists exams_module_idx on public.exams(module_id);

-- ---------------------------------------------------------------------
-- study_entries – Lerntage / Lerntermine (nur Datum, keine Uhrzeit)
-- ---------------------------------------------------------------------
create table if not exists public.study_entries (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.modules(id) on delete restrict,
  topic_id    uuid references public.module_topics(id) on delete restrict,
  study_date  date not null check (study_date between date '2000-01-01' and date '2100-12-31'),
  title       text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  sort_order  integer not null default 0 check (sort_order between -100000 and 100000),
  deleted_at  timestamptz,
  changed_by  uuid references public.members(id) on delete set null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists study_entries_date_idx on public.study_entries(study_date);
create index if not exists study_entries_module_idx on public.study_entries(module_id);
create index if not exists study_entries_topic_idx on public.study_entries(topic_id);

-- Ein Thema muss zum gewählten Modul gehören.
create or replace function public.ss_check_entry_topic()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.topic_id is not null and not exists (
    select 1 from public.module_topics t
    where t.id = new.topic_id and t.module_id = new.module_id
  ) then
    raise exception 'Das Thema gehört nicht zum gewählten Modul'
      using errcode = '23514', hint = 'topic_module_mismatch';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- tasks – Aufgaben eines Lerntags
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  study_entry_id uuid not null references public.study_entries(id) on delete restrict,
  title          text not null check (char_length(btrim(title)) between 1 and 200),
  description    text check (description is null or char_length(description) <= 2000),
  sort_order     integer not null default 0 check (sort_order between -100000 and 100000),
  deleted_at     timestamptz,
  changed_by     uuid references public.members(id) on delete set null,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tasks_entry_idx on public.tasks(study_entry_id, sort_order);

-- ---------------------------------------------------------------------
-- task_completions – individueller Erledigungsstatus je Person
-- ---------------------------------------------------------------------
create table if not exists public.task_completions (
  task_id      uuid not null references public.tasks(id) on delete restrict,
  member_id    uuid not null references public.members(id) on delete restrict,
  is_completed boolean not null default false,
  completed_at timestamptz,
  changed_by   uuid references public.members(id) on delete set null,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (task_id, member_id)
);
create index if not exists task_completions_member_idx on public.task_completions(member_id);

-- completed_at wird ausschließlich serverseitig gesetzt.
create or replace function public.ss_completion_timestamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_completed then
    if tg_op = 'UPDATE' and old.is_completed then
      new.completed_at := old.completed_at;
    else
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- attachments – Metadaten zu Dateien in Supabase Storage
-- ---------------------------------------------------------------------
create table if not exists public.attachments (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid references public.modules(id) on delete restrict,
  target_type       text not null check (target_type in ('module', 'topic', 'study_entry', 'task')),
  target_id         uuid not null,
  storage_path      text not null unique
                    check (char_length(storage_path) between 3 and 400 and storage_path !~ '\.\.'),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type         text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  file_size         bigint not null check (file_size > 0 and file_size <= 52428800),
  uploaded_at       timestamptz not null default now(),
  deleted_at        timestamptz,
  changed_by        uuid references public.members(id) on delete set null,
  version           integer not null default 1,
  updated_at        timestamptz not null default now()
);
create index if not exists attachments_target_idx on public.attachments(target_type, target_id);
create index if not exists attachments_module_idx on public.attachments(module_id);

-- Bezugsobjekt muss existieren (polymorphe Referenz).
create or replace function public.ss_check_attachment_target()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ok boolean;
begin
  ok := case new.target_type
    when 'module'      then exists (select 1 from public.modules where id = new.target_id)
    when 'topic'       then exists (select 1 from public.module_topics where id = new.target_id)
    when 'study_entry' then exists (select 1 from public.study_entries where id = new.target_id)
    when 'task'        then exists (select 1 from public.tasks where id = new.target_id)
    else false
  end;
  if not ok then
    raise exception 'Bezugsobjekt für Anhang nicht gefunden'
      using errcode = '23503', hint = 'attachment_target_missing';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- app_settings – gemeinsame Einstellungen (Schlüssel/Wert)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key check (key in ('app_name', 'group_goal_title', 'motivation_enabled')),
  value      jsonb not null check (pg_column_size(value) <= 4000),
  changed_by uuid references public.members(id) on delete set null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- activity_log – Änderungsverlauf (wird nur von Triggern geschrieben)
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_member_id uuid references public.members(id) on delete set null,
  actor_label   text,           -- Name zum Zeitpunkt der Änderung (nicht verifiziert!)
  entity_type   text not null,
  entity_id     text not null,
  action        text not null,
  summary       text,
  details       jsonb
);
create index if not exists activity_log_time_idx on public.activity_log(occurred_at desc);

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
  if tg_table_name = 'task_completions' then
    v_entity_id := (n ->> 'task_id') || ':' || (n ->> 'member_id');
    if tg_op = 'UPDATE' and (o -> 'is_completed') = (n -> 'is_completed') then
      return null;
    end if;
    v_action := case when (n ->> 'is_completed')::boolean then 'completed' else 'uncompleted' end;
    select t.title into v_summary from public.tasks t where t.id = (n ->> 'task_id')::uuid;
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

  insert into public.activity_log (actor_member_id, actor_label, entity_type, entity_id, action, summary, details)
  values (
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

-- Schutz: mindestens eine aktive Person, höchstens 30 Personen insgesamt.
create or replace function public.ss_member_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.members) >= 30 then
    raise exception 'Maximal 30 Personen möglich' using errcode = 'P0001', hint = 'member_limit';
  end if;
  if tg_op = 'UPDATE' and old.is_active and not new.is_active and not exists (
    select 1 from public.members where is_active and id <> new.id
  ) then
    raise exception 'Mindestens eine Person muss aktiv bleiben' using errcode = 'P0001', hint = 'last_active_member';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger registrieren
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'attachments'] loop
    execute format('drop trigger if exists ss_touch on public.%I', t);
    execute format('create trigger ss_touch before insert or update on public.%I for each row execute function public.ss_touch(%L)', t, 'id');
    execute format('drop trigger if exists ss_log on public.%I', t);
    execute format('create trigger ss_log after insert or update on public.%I for each row execute function public.ss_log_change()', t);
  end loop;
end;
$$;

drop trigger if exists ss_touch on public.task_completions;
create trigger ss_touch before insert or update on public.task_completions
  for each row execute function public.ss_touch('task_id', 'member_id');
drop trigger if exists ss_log on public.task_completions;
create trigger ss_log after insert or update on public.task_completions
  for each row execute function public.ss_log_change();
drop trigger if exists ss_completion_ts on public.task_completions;
create trigger ss_completion_ts before insert or update on public.task_completions
  for each row execute function public.ss_completion_timestamp();

drop trigger if exists ss_touch on public.app_settings;
create trigger ss_touch before insert or update on public.app_settings
  for each row execute function public.ss_touch('key');
drop trigger if exists ss_log on public.app_settings;
create trigger ss_log after insert or update on public.app_settings
  for each row execute function public.ss_log_change();

drop trigger if exists ss_entry_topic on public.study_entries;
create trigger ss_entry_topic before insert or update of module_id, topic_id on public.study_entries
  for each row execute function public.ss_check_entry_topic();

drop trigger if exists ss_attachment_target on public.attachments;
create trigger ss_attachment_target before insert or update of target_type, target_id on public.attachments
  for each row execute function public.ss_check_attachment_target();

drop trigger if exists ss_member_rules on public.members;
create trigger ss_member_rules before insert or update on public.members
  for each row execute function public.ss_member_rules();

-- Rate Limits (neue Zeilen pro Minute, großzügig für Importe bemessen)
drop trigger if exists ss_rate_limit on public.members;
create trigger ss_rate_limit before insert on public.members
  for each row execute function public.ss_rate_limit('20', 'created_at');
drop trigger if exists ss_rate_limit on public.modules;
create trigger ss_rate_limit before insert on public.modules
  for each row execute function public.ss_rate_limit('60', 'created_at');
drop trigger if exists ss_rate_limit on public.module_topics;
create trigger ss_rate_limit before insert on public.module_topics
  for each row execute function public.ss_rate_limit('300', 'created_at');
drop trigger if exists ss_rate_limit on public.exams;
create trigger ss_rate_limit before insert on public.exams
  for each row execute function public.ss_rate_limit('60', 'created_at');
drop trigger if exists ss_rate_limit on public.study_entries;
create trigger ss_rate_limit before insert on public.study_entries
  for each row execute function public.ss_rate_limit('600', 'created_at');
drop trigger if exists ss_rate_limit on public.tasks;
create trigger ss_rate_limit before insert on public.tasks
  for each row execute function public.ss_rate_limit('2000', 'created_at');
drop trigger if exists ss_rate_limit on public.attachments;
create trigger ss_rate_limit before insert on public.attachments
  for each row execute function public.ss_rate_limit('40', 'uploaded_at');

-- Trigger-Funktionen sind keine öffentliche API.
revoke all on function public.ss_touch() from public;
revoke all on function public.ss_rate_limit() from public;
revoke all on function public.ss_check_entry_topic() from public;
revoke all on function public.ss_completion_timestamp() from public;
revoke all on function public.ss_check_attachment_target() from public;
revoke all on function public.ss_log_change() from public;
revoke all on function public.ss_member_rules() from public;


-- ===== supabase/migrations/002_security.sql =====
-- =====================================================================
-- StudySpace – Migration 002: Row Level Security, Rechte, Realtime
-- ---------------------------------------------------------------------
-- StudySpace hat bewusst KEINE Anmeldung. Jeder mit dem Link darf lesen
-- und bearbeiten. Damit die Angriffsfläche trotzdem klein bleibt, gilt:
--   * RLS ist auf allen Tabellen aktiv.
--   * Die Rollen anon/authenticated dürfen nur SELECT, INSERT und UPDATE
--     auf den nötigen Tabellen – und UPDATE nur auf ausgewählten Spalten.
--   * DELETE ist für die öffentlichen Rollen komplett gesperrt
--     (Papierkorb = Soft Delete über deleted_at / archived_at).
--   * activity_log ist nur lesbar; geschrieben wird er ausschließlich
--     durch Datenbank-Trigger.
--   * version, created_at, updated_at, completed_at werden serverseitig
--     gesetzt und sind für Clients nicht beschreibbar.
-- =====================================================================

-- Alle Standardrechte entfernen und gezielt neu vergeben.
revoke all on table
  public.members, public.modules, public.module_topics, public.exams,
  public.study_entries, public.tasks, public.task_completions,
  public.attachments, public.app_settings, public.activity_log
from anon, authenticated;

-- ---------------------------------------------------------------------
-- Rechte auf Spaltenebene
-- (UPDATE enthält die Schlüsselspalten, weil Upserts sie im SET-Teil
--  mitschicken. Der Trigger ss_touch verhindert, dass sie sich ändern.)
-- ---------------------------------------------------------------------
grant select on public.members to anon, authenticated;
grant insert (id, name, color, sort_order, is_active, changed_by) on public.members to anon, authenticated;
grant update (id, name, color, sort_order, is_active, changed_by) on public.members to anon, authenticated;

grant select on public.modules to anon, authenticated;
grant insert (id, name, color, description, sort_order, archived_at, changed_by) on public.modules to anon, authenticated;
grant update (id, name, color, description, sort_order, archived_at, changed_by) on public.modules to anon, authenticated;

grant select on public.module_topics to anon, authenticated;
grant insert (id, module_id, title, description, sort_order, archived_at, changed_by) on public.module_topics to anon, authenticated;
grant update (id, module_id, title, description, sort_order, archived_at, changed_by) on public.module_topics to anon, authenticated;

grant select on public.exams to anon, authenticated;
grant insert (id, module_id, starts_at, ends_at, timezone, location, notes, deleted_at, changed_by) on public.exams to anon, authenticated;
grant update (id, module_id, starts_at, ends_at, timezone, location, notes, deleted_at, changed_by) on public.exams to anon, authenticated;

grant select on public.study_entries to anon, authenticated;
grant insert (id, module_id, topic_id, study_date, title, description, sort_order, deleted_at, changed_by) on public.study_entries to anon, authenticated;
grant update (id, module_id, topic_id, study_date, title, description, sort_order, deleted_at, changed_by) on public.study_entries to anon, authenticated;

grant select on public.tasks to anon, authenticated;
grant insert (id, study_entry_id, title, description, sort_order, deleted_at, changed_by) on public.tasks to anon, authenticated;
grant update (id, study_entry_id, title, description, sort_order, deleted_at, changed_by) on public.tasks to anon, authenticated;

grant select on public.task_completions to anon, authenticated;
grant insert (task_id, member_id, is_completed, changed_by) on public.task_completions to anon, authenticated;
grant update (task_id, member_id, is_completed, changed_by) on public.task_completions to anon, authenticated;

-- Anhänge: Metadaten werden einmal angelegt; danach ist nur das
-- Verschieben in den Papierkorb bzw. Wiederherstellen erlaubt.
grant select on public.attachments to anon, authenticated;
grant insert (id, module_id, target_type, target_id, storage_path, original_filename, mime_type, file_size, deleted_at, changed_by)
  on public.attachments to anon, authenticated;
grant update (deleted_at, changed_by) on public.attachments to anon, authenticated;

grant select on public.app_settings to anon, authenticated;
grant insert (key, value, changed_by) on public.app_settings to anon, authenticated;
grant update (key, value, changed_by) on public.app_settings to anon, authenticated;

grant select on public.activity_log to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries',
    'tasks', 'task_completions', 'attachments', 'app_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ss_public_select on public.%I', t);
    execute format('drop policy if exists ss_public_insert on public.%I', t);
    execute format('drop policy if exists ss_public_update on public.%I', t);
    execute format('create policy ss_public_select on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy ss_public_insert on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy ss_public_update on public.%I for update to anon, authenticated using (true) with check (true)', t);
    -- Bewusst KEINE Delete-Policy.
  end loop;
end;
$$;

alter table public.activity_log enable row level security;
drop policy if exists ss_public_select on public.activity_log;
create policy ss_public_select on public.activity_log for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Realtime: Tabellen zur Publikation hinzufügen
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries',
    'tasks', 'task_completions', 'attachments', 'app_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


-- ===== supabase/migrations/004_push_focus.sql =====
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


-- ===== supabase/migrations/005_homework.sql =====
-- =====================================================================
-- StudySpace – Migration 005: Hausaufgaben
-- ---------------------------------------------------------------------
-- Kann gefahrlos mehrfach ausgeführt werden. Bestehende Daten werden
-- NICHT verändert oder gelöscht – es kommen nur neue Tabellen hinzu.
--
-- 1. homework              – Hausaufgaben (Titel, Modul, Abgabedatum …)
-- 2. homework_parts        – Unteraufgaben und geplante Arbeitseinheiten
-- 3. homework_completions  – Erledigt-Status je Person (Hausaufgabe,
--                            Unteraufgabe oder Arbeitseinheit)
-- 4. attachments           – erlaubt zusätzlich Anhänge an Hausaufgaben
--                            (nur die Prüfregel wird erweitert; vorhandene
--                            Anhänge bleiben unverändert gültig)
--
-- Rechte wie beim übrigen Lernplan: jeder mit dem Link darf lesen,
-- anlegen und ändern; Löschen nur als Papierkorb (deleted_at).
-- Das Frontend schaltet die Hausaufgaben erst frei, wenn diese Tabellen
-- existieren – bis dahin funktioniert die App unverändert weiter.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hausaufgaben
-- ---------------------------------------------------------------------
create table if not exists public.homework (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.modules(id) on delete restrict,
  title          text not null check (char_length(btrim(title)) between 1 and 200),
  description    text check (description is null or char_length(description) <= 4000),
  due_date       date not null check (due_date between date '2000-01-01' and date '2100-12-31'),
  -- Frühester Beginn (optional); liegt immer vor dem Abgabetag
  earliest_start date check (earliest_start is null or earliest_start between date '2000-01-01' and date '2100-12-31'),
  -- 1 = niedrig, 2 = normal, 3 = hoch
  priority       smallint not null default 2 check (priority between 1 and 3),
  -- Geschätzter Aufwand in Minuten (optional)
  effort_minutes integer check (effort_minutes is null or effort_minutes between 1 and 6000),
  -- Gewünschte Anzahl Arbeitseinheiten (optional)
  unit_count     smallint check (unit_count is null or unit_count between 1 and 30),
  deleted_at     timestamptz,
  changed_by     uuid references public.members(id) on delete set null,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint homework_start_before_due check (earliest_start is null or earliest_start < due_date)
);
create index if not exists homework_due_idx on public.homework(due_date);
create index if not exists homework_module_idx on public.homework(module_id);

-- ---------------------------------------------------------------------
-- 2. Unteraufgaben (kind = 'subtask') und Arbeitseinheiten (kind = 'unit')
-- ---------------------------------------------------------------------
create table if not exists public.homework_parts (
  id           uuid primary key default gen_random_uuid(),
  homework_id  uuid not null references public.homework(id) on delete restrict,
  kind         text not null check (kind in ('subtask', 'unit')),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  -- Arbeitstag einer Einheit (Unteraufgaben optional)
  planned_date date check (planned_date is null or planned_date between date '2000-01-01' and date '2100-12-31'),
  sort_order   integer not null default 0 check (sort_order between -100000 and 100000),
  deleted_at   timestamptz,
  changed_by   uuid references public.members(id) on delete set null,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint homework_parts_unit_dated check (kind <> 'unit' or planned_date is not null)
);
create index if not exists homework_parts_homework_idx on public.homework_parts(homework_id, sort_order);
create index if not exists homework_parts_date_idx on public.homework_parts(planned_date) where planned_date is not null;

-- ---------------------------------------------------------------------
-- 3. Erledigt-Status je Person
--    target_id = id der Hausaufgabe oder eines ihrer Teile
-- ---------------------------------------------------------------------
create table if not exists public.homework_completions (
  target_id    uuid not null,
  homework_id  uuid not null references public.homework(id) on delete restrict,
  member_id    uuid not null references public.members(id) on delete restrict,
  is_completed boolean not null default false,
  completed_at timestamptz,
  changed_by   uuid references public.members(id) on delete set null,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (target_id, member_id)
);
create index if not exists homework_completions_member_idx on public.homework_completions(member_id);
create index if not exists homework_completions_homework_idx on public.homework_completions(homework_id);

-- Das Ziel muss die Hausaufgabe selbst oder einer ihrer Teile sein.
create or replace function public.ss_check_homework_target()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.target_id <> new.homework_id and not exists (
    select 1 from public.homework_parts p where p.id = new.target_id and p.homework_id = new.homework_id
  ) then
    raise exception 'Das Ziel gehört nicht zu dieser Hausaufgabe'
      using errcode = '23503', hint = 'homework_target_missing';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger (gleiche Bausteine wie in Migration 001)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['homework', 'homework_parts'] loop
    execute format('drop trigger if exists ss_touch on public.%I', t);
    execute format('create trigger ss_touch before insert or update on public.%I for each row execute function public.ss_touch(%L)', t, 'id');
    execute format('drop trigger if exists ss_log on public.%I', t);
    execute format('create trigger ss_log after insert or update on public.%I for each row execute function public.ss_log_change()', t);
  end loop;
end;
$$;

-- Teile dürfen nicht zu einer anderen Hausaufgabe wandern.
drop trigger if exists ss_touch on public.homework_parts;
create trigger ss_touch before insert or update on public.homework_parts
  for each row execute function public.ss_touch('id', 'homework_id');

drop trigger if exists ss_touch on public.homework_completions;
create trigger ss_touch before insert or update on public.homework_completions
  for each row execute function public.ss_touch('target_id', 'member_id', 'homework_id');
drop trigger if exists ss_completion_ts on public.homework_completions;
create trigger ss_completion_ts before insert or update on public.homework_completions
  for each row execute function public.ss_completion_timestamp();
drop trigger if exists ss_homework_target on public.homework_completions;
create trigger ss_homework_target before insert or update on public.homework_completions
  for each row execute function public.ss_check_homework_target();

drop trigger if exists ss_rate_limit on public.homework;
create trigger ss_rate_limit before insert on public.homework
  for each row execute function public.ss_rate_limit('60', 'created_at');
drop trigger if exists ss_rate_limit on public.homework_parts;
create trigger ss_rate_limit before insert on public.homework_parts
  for each row execute function public.ss_rate_limit('600', 'created_at');
drop trigger if exists ss_rate_limit on public.homework_completions;
create trigger ss_rate_limit before insert on public.homework_completions
  for each row execute function public.ss_rate_limit('600', 'created_at');

revoke all on function public.ss_check_homework_target() from public;

-- ---------------------------------------------------------------------
-- Rechte auf Spaltenebene (wie Migration 002)
-- ---------------------------------------------------------------------
revoke all on table public.homework, public.homework_parts, public.homework_completions from anon, authenticated;

grant select on public.homework to anon, authenticated;
grant insert (id, module_id, title, description, due_date, earliest_start, priority, effort_minutes, unit_count, deleted_at, changed_by) on public.homework to anon, authenticated;
grant update (id, module_id, title, description, due_date, earliest_start, priority, effort_minutes, unit_count, deleted_at, changed_by) on public.homework to anon, authenticated;

grant select on public.homework_parts to anon, authenticated;
grant insert (id, homework_id, kind, title, planned_date, sort_order, deleted_at, changed_by) on public.homework_parts to anon, authenticated;
grant update (id, homework_id, kind, title, planned_date, sort_order, deleted_at, changed_by) on public.homework_parts to anon, authenticated;

grant select on public.homework_completions to anon, authenticated;
grant insert (target_id, homework_id, member_id, is_completed, changed_by) on public.homework_completions to anon, authenticated;
grant update (target_id, homework_id, member_id, is_completed, changed_by) on public.homework_completions to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['homework', 'homework_parts', 'homework_completions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ss_public_select on public.%I', t);
    execute format('drop policy if exists ss_public_insert on public.%I', t);
    execute format('drop policy if exists ss_public_update on public.%I', t);
    execute format('create policy ss_public_select on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy ss_public_insert on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy ss_public_update on public.%I for update to anon, authenticated using (true) with check (true)', t);
    -- Bewusst KEINE Delete-Policy.
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime (Live-Sync auf allen Geräten)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['homework', 'homework_parts', 'homework_completions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Anhänge an Hausaufgaben erlauben
--    Nur die Prüfregel wird um 'homework' erweitert – vorhandene Zeilen
--    erfüllen die neue Regel weiterhin, es wird nichts umgeschrieben.
-- ---------------------------------------------------------------------
do $$
declare
  c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.attachments'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%target_type%'
  loop
    execute format('alter table public.attachments drop constraint %I', c);
  end loop;
end;
$$;
alter table public.attachments add constraint attachments_target_type_check
  check (target_type in ('module', 'topic', 'study_entry', 'task', 'homework'));

create or replace function public.ss_check_attachment_target()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ok boolean;
begin
  ok := case new.target_type
    when 'module'      then exists (select 1 from public.modules where id = new.target_id)
    when 'topic'       then exists (select 1 from public.module_topics where id = new.target_id)
    when 'study_entry' then exists (select 1 from public.study_entries where id = new.target_id)
    when 'task'        then exists (select 1 from public.tasks where id = new.target_id)
    when 'homework'    then exists (select 1 from public.homework where id = new.target_id)
    else false
  end;
  if not ok then
    raise exception 'Bezugsobjekt für Anhang nicht gefunden'
      using errcode = '23503', hint = 'attachment_target_missing';
  end if;
  return new;
end;
$$;
revoke all on function public.ss_check_attachment_target() from public;


-- ===== supabase/migrations/006_server_read_access.sql =====
-- =====================================================================
-- StudySpace – Migration 006: Leserechte für die Push-Funktionen
-- ---------------------------------------------------------------------
-- Die Edge Functions (push-api, push-scheduler) arbeiten mit der Rolle
-- service_role. Ältere Supabase-Projekte gaben ihr automatisch Rechte auf
-- alle Tabellen; neuere Projekte tun das NICHT mehr. Dann kann der Server
-- die Lernprofile nicht lesen („Unbekanntes Lernprofil.“) und keine
-- Erinnerungen berechnen.
--
-- Diese Migration vergibt nur LESErechte an service_role. Es werden keine
-- Daten verändert, und die öffentlichen Rollen (anon/authenticated)
-- bekommen nichts dazu. Kann gefahrlos mehrfach ausgeführt werden.
-- =====================================================================

grant usage on schema public to service_role;

grant select on
  public.members, public.modules, public.module_topics, public.exams,
  public.study_entries, public.tasks, public.task_completions,
  public.attachments, public.app_settings, public.activity_log
to service_role;

-- Optionale Tabellen (nur falls die jeweilige Migration ausgeführt wurde)
do $$
declare
  t text;
begin
  foreach t in array array['focus_sessions', 'homework', 'homework_parts', 'homework_completions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to service_role', t);
    end if;
  end loop;
end;
$$;


-- ===== supabase/migrations/007_music.sql =====
-- =====================================================================
-- StudySpace – Migration 007: Musik-Bibliothek (YouTube-Links)
-- ---------------------------------------------------------------------
-- Gemeinsame Liste von YouTube-Links für den Fokus (Lofi, Regen,
-- Gewitter, Wind, Natur, Lagerfeuer, Kamin, Konzentration, Eigene).
-- Wer einen Link einträgt, macht ihn für die ganze Gruppe verfügbar.
--
-- Gespeichert wird nur die 11-stellige YouTube-Video-ID (kein beliebiger
-- Link) – abgespielt wird über den offiziellen YouTube-Player.
-- Kann gefahrlos mehrfach ausgeführt werden; bestehende Daten bleiben
-- unverändert. Ohne diese Migration funktioniert die App wie bisher,
-- nur die Musik-Bibliothek ist ausgeblendet.
-- =====================================================================

create table if not exists public.music_tracks (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('lofi', 'regen', 'gewitter', 'wind', 'natur', 'lagerfeuer', 'kamin', 'konzentration', 'eigene')),
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  youtube_id    text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  start_seconds integer check (start_seconds is null or start_seconds between 0 and 86400),
  sort_order    integer not null default 0 check (sort_order between -100000 and 100000),
  deleted_at    timestamptz,
  changed_by    uuid references public.members(id) on delete set null,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists music_tracks_category_idx on public.music_tracks(category, sort_order);

do $$
begin
  execute 'drop trigger if exists ss_touch on public.music_tracks';
  execute 'create trigger ss_touch before insert or update on public.music_tracks for each row execute function public.ss_touch(''id'')';
  execute 'drop trigger if exists ss_log on public.music_tracks';
  execute 'create trigger ss_log after insert or update on public.music_tracks for each row execute function public.ss_log_change()';
  execute 'drop trigger if exists ss_rate_limit on public.music_tracks';
  execute 'create trigger ss_rate_limit before insert on public.music_tracks for each row execute function public.ss_rate_limit(''60'', ''created_at'')';
end;
$$;

revoke all on table public.music_tracks from anon, authenticated;
grant select on public.music_tracks to anon, authenticated;
grant insert (id, category, title, youtube_id, start_seconds, sort_order, deleted_at, changed_by) on public.music_tracks to anon, authenticated;
grant update (id, category, title, youtube_id, start_seconds, sort_order, deleted_at, changed_by) on public.music_tracks to anon, authenticated;

alter table public.music_tracks enable row level security;
drop policy if exists ss_public_select on public.music_tracks;
drop policy if exists ss_public_insert on public.music_tracks;
drop policy if exists ss_public_update on public.music_tracks;
create policy ss_public_select on public.music_tracks for select to anon, authenticated using (true);
create policy ss_public_insert on public.music_tracks for insert to anon, authenticated with check (true);
create policy ss_public_update on public.music_tracks for update to anon, authenticated using (true) with check (true);
-- Bewusst KEINE Delete-Policy (Papierkorb über deleted_at).

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_tracks'
  ) then
    alter publication supabase_realtime add table public.music_tracks;
  end if;
end;
$$;


-- ===== supabase/migrations/008_focus_realtime.sql =====
-- =====================================================================
-- StudySpace 4.2 – Fokuszeiten live an alle Geräte (optional)
-- ---------------------------------------------------------------------
-- Nimmt die Tabelle focus_sessions in die Realtime-Veröffentlichung auf.
-- Damit erscheint eine gespeicherte Fokus-Session sofort in der
-- „Lernzeit diese Woche“ der anderen Gruppenmitglieder.
--
-- Es werden KEINE Daten verändert oder gelöscht und keine Rechte erweitert
-- (focus_sessions ist ohnehin für alle lesbar, siehe 004). Das Skript kann
-- gefahrlos mehrfach ausgeführt werden. Ohne diese Datei lädt die App die
-- Lernzeiten einfach jede Minute und beim Zurückkehren in die App nach.
-- =====================================================================
do $$
begin
  if to_regclass('public.focus_sessions') is null then
    raise notice 'focus_sessions fehlt – zuerst 004_push_focus.sql ausführen';
    return;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_sessions'
  ) then
    alter publication supabase_realtime add table public.focus_sessions;
  end if;
end;
$$;


-- ===== supabase/migrations/009_exam_participants.sql =====
-- =====================================================================
-- StudySpace – Wer schreibt welche Prüfung? (bisherige Seite)
-- ---------------------------------------------------------------------
-- Ein Fach kann auf einzelne Personen beschränkt werden: Nur sie sehen
-- dann das Fach, seine Prüfungen, Lerntage, Aufgaben und Hausaufgaben
-- und bekommen Erinnerungen dazu. Leer/NULL = alle (wie bisher).
--
-- Hinweis: Die Seite hat keine Anmeldung – das ist eine Anzeige-Einstellung,
-- kein Zugriffsschutz. Wer das Profil einer anderen Person wählt, sieht,
-- was diese Person sieht.
--
-- Einmal im Supabase SQL Editor ausführen. Wiederholbar, ändert keine Daten.
-- =====================================================================
alter table public.modules add column if not exists participants uuid[];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_participants_size') then
    alter table public.modules add constraint modules_participants_size check (participants is null or cardinality(participants) <= 30);
  end if;
end $$;

-- Schreibrecht nur für diese Spalte ergänzen (die übrigen bleiben wie in 002)
grant insert (participants) on public.modules to anon, authenticated;
grant update (participants) on public.modules to anon, authenticated;


-- ===== supabase/migrations/010_moved_to_app.sql =====
-- =====================================================================
-- StudySpace – Umzug in die App (bisherige Seite)
-- ---------------------------------------------------------------------
-- Erlaubt die gemeinsame Einstellung „moved_to_app“: Ist sie gesetzt,
-- leitet die Seite alle auf die App um („Wir sind umgezogen“). Die Daten
-- der Seite bleiben vollständig erhalten; die Umleitung lässt sich in den
-- Einstellungen (Umzug in die App) jederzeit wieder ausschalten.
--
-- Einmal im Supabase SQL Editor ausführen. Wiederholbar, ändert keine Daten.
-- =====================================================================
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('app_name', 'group_goal_title', 'motivation_enabled', 'moved_to_app'));


-- ===== supabase/migrations/011_trash_7_days.sql =====
-- =====================================================================
-- StudySpace – Papierkorb leert sich nach 7 Tagen (bisherige Seite)
-- ---------------------------------------------------------------------
-- Gelöschte Lerntage, Aufgaben, Hausaufgaben, Prüfungen und Musiktitel
-- werden 7 Tage nach dem Löschen endgültig entfernt.
--
-- Schonfrist: Was beim Ausführen dieser Datei schon im Papierkorb liegt,
-- bleibt ab jetzt noch 7 Tage wiederherstellbar (Stichtag in
-- ss_trash_policy.since). Archivierte Fächer/Themen und Dateien werden NIE
-- automatisch gelöscht.
--
-- Ausgelöst täglich per pg_cron (falls aktiviert) und zusätzlich beim
-- Öffnen der Seite. Einmal im Supabase SQL Editor ausführen. Wiederholbar.
-- =====================================================================
create table if not exists public.ss_trash_policy (
  id    smallint primary key default 1 check (id = 1),
  since timestamptz not null default now()
);
insert into public.ss_trash_policy (id) values (1) on conflict (id) do nothing;
alter table public.ss_trash_policy enable row level security;
revoke all on public.ss_trash_policy from public, anon, authenticated;

create or replace function public.ss_purge_trash() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cutoff timestamptz := now() - interval '7 days';
  since  timestamptz;
  total  integer := 0;
  c      integer;
begin
  select p.since into since from public.ss_trash_policy p where p.id = 1;
  -- Schonfrist: erst 7 Tage nach Einführung der Regel wird überhaupt gelöscht
  if since is null or since > cutoff then return 0; end if;

  -- Hausaufgaben (mit Teilen und Haken), dann einzeln gelöschte Teile
  delete from public.homework_completions hc using public.homework h where hc.homework_id = h.id and h.deleted_at < cutoff;
  delete from public.homework_parts hp using public.homework h where hp.homework_id = h.id and h.deleted_at < cutoff;
  delete from public.homework where deleted_at < cutoff; get diagnostics c = row_count; total := total + c;
  delete from public.homework_completions hc using public.homework_parts hp where hc.target_id = hp.id and hp.deleted_at < cutoff;
  delete from public.homework_parts where deleted_at < cutoff; get diagnostics c = row_count; total := total + c;

  -- Lerntage (mit allen Aufgaben und Haken), dann einzeln gelöschte Aufgaben
  delete from public.task_completions tc using public.tasks t, public.study_entries e
    where tc.task_id = t.id and t.study_entry_id = e.id and (t.deleted_at < cutoff or e.deleted_at < cutoff);
  delete from public.tasks t using public.study_entries e where t.study_entry_id = e.id and e.deleted_at < cutoff;
  delete from public.tasks where deleted_at < cutoff; get diagnostics c = row_count; total := total + c;
  delete from public.study_entries where deleted_at < cutoff; get diagnostics c = row_count; total := total + c;

  delete from public.exams where deleted_at < cutoff; get diagnostics c = row_count; total := total + c;
  if to_regclass('public.music_tracks') is not null then
    execute 'delete from public.music_tracks where deleted_at < $1' using cutoff; get diagnostics c = row_count; total := total + c;
  end if;
  return total;
end $$;

-- Löscht ausschließlich Einträge, die seit mehr als 7 Tagen im Papierkorb liegen –
-- darf daher von der Seite (ohne Anmeldung) beim Öffnen angestoßen werden.
revoke all on function public.ss_purge_trash() from public;
grant execute on function public.ss_purge_trash() to anon, authenticated, service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'studyspace-purge-trash';
    perform cron.schedule('studyspace-purge-trash', '41 3 * * *', 'select public.ss_purge_trash()');
  end if;
end $$;

-- Fertig. Die Seite sollte nach dem Neuladen wieder alles anzeigen.
select 'Reparatur abgeschlossen' as status;
