-- =====================================================================
-- StudySpace App – komplettes Datenbankschema (automatisch erzeugt)
-- ---------------------------------------------------------------------
-- NUR im EIGENEN Supabase-Projekt der neuen App ausführen (SQL Editor),
-- NIEMALS in der Datenbank der bisherigen StudySpace-Seite.
-- Erzeugt mit: node scripts/build-app-schema.mjs – nicht von Hand ändern.
-- Wiederholbar ausführbar (Updates: einfach erneut ausführen).
-- =====================================================================

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


-- ===== supabase-app/migrations/0001_tenancy.sql =====
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


-- ===== supabase-app/migrations/0002_admin.sql =====
-- =====================================================================
-- StudySpace App – Admin-Bereich (Funktionen für /app/admin/)
-- ---------------------------------------------------------------------
-- NUR im eigenen Supabase-Projekt der neuen App ausführen.
-- Jede Funktion prüft serverseitig: Konto steht in public.admins UND die
-- Sitzung ist mit Zwei-Faktor bestätigt (aal2). Jede Änderung landet im
-- Audit-Log. Kostenlose Freischaltungen (source = 'admin') werden nie als
-- Umsatz gezählt. Wiederholbar ausführbar.
-- =====================================================================

create or replace function app.require_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Administratoren (mit Zwei-Faktor-Anmeldung)' using errcode = '42501', hint = 'admin_required';
  end if;
  return auth.uid();
end $$;

create or replace function app.audit(p_action text, p_type text, p_id text, p_details jsonb default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.admin_audit (admin_id, action, target_type, target_id, details) values (auth.uid(), p_action, p_type, p_id, p_details)
$$;

-- Tarif eines Kontos für die Anzeige
create or replace function app.user_plan(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when bool_or(e.plan = 'semester_pass') then 'semester_pass'
      when bool_or(e.plan = 'plus_monthly') then 'plus_monthly'
      else 'plus_grant' end
    from public.entitlements e where e.user_id = uid and app.entitlement_active(e)
    having count(*) > 0
  ), case when exists (
      select 1 from public.group_members gm where gm.user_id = uid and gm.left_at is null and app.group_has_plus(gm.group_id)
    ) then 'plus_member' else 'free' end)
$$;

-- Sitzungen eines Kontos serverseitig beenden
create or replace function app.revoke_sessions(uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Zugriffstokens: RLS lehnt alle vor diesem Zeitpunkt angemeldeten Sitzungen ab
  update public.profiles set sessions_valid_after = now(), updated_at = now() where id = uid;
  -- Aktualisierungstokens: Sitzungen in Supabase Auth löschen
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using uid;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using uid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Übersicht
-- ---------------------------------------------------------------------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  res jsonb;
begin
  perform app.require_admin();
  with u as (
    select au.id, au.created_at, p.status, p.last_seen_at, app.user_plan(au.id) as plan
    from auth.users au join public.profiles p on p.id = au.id
    where not exists (select 1 from public.admins a where a.user_id = au.id)
  ), paid as (
    select e.* from public.entitlements e where e.source <> 'admin'
  )
  select jsonb_build_object(
    'users_total', (select count(*) from u),
    'users_active_7d', (select count(*) from u where last_seen_at > now() - interval '7 days'),
    'users_online_approx', (select count(*) from u where last_seen_at > now() - interval '5 minutes'),
    'users_new_7d', (select count(*) from u where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from u where created_at > now() - interval '30 days'),
    'users_blocked', (select count(*) from u where status = 'blocked'),
    'users_free', (select count(*) from u where plan = 'free'),
    'users_plus_member', (select count(*) from u where plan = 'plus_member'),
    'groups_total', (select count(*) from public.groups),
    'groups_plus', (select count(*) from public.groups g where app.group_has_plus(g.id)),
    'trials_active', 0,
    'subscriptions_paid_active', (select count(*) from paid e where e.plan = 'plus_monthly' and app.entitlement_active(e)),
    'semester_passes_active', (select count(*) from paid e where e.plan = 'semester_pass' and app.entitlement_active(e)),
    'grants_active', (select count(*) from public.entitlements e where e.source = 'admin' and app.entitlement_active(e)),
    'expired_30d', (select count(*) from public.entitlements e where e.revoked_at is null and e.ends_at between now() - interval '30 days' and now()),
    'cancellations_30d', (select count(*) from public.subscription_events s where s.kind = 'canceled' and s.occurred_at > now() - interval '30 days'),
    'revenue_cents_total', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments),
    'revenue_cents_30d', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments where occurred_at > now() - interval '30 days'),
    -- MRR nur aus bezahlten, laufenden Monatsabos (Preis 4,99 €); Freischaltungen zählen nicht
    'mrr_cents', (select count(*) * 499 from paid e where e.plan = 'plus_monthly' and app.entitlement_active(e)),
    'payments_connected', exists (select 1 from public.payments),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', (select count(*) from u where u.created_at::date = d::date)) order by d)
      from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d), '[]'::jsonb),
    'db_time', now()
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------
create or replace function public.admin_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, email text, display_name text, status text, plan text, created_at timestamptz,
  last_sign_in_at timestamptz, last_seen_at timestamptz, online boolean, groups jsonb, is_admin boolean, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query
  with f as (
    select au.id, au.email::text, p.display_name, p.status, au.created_at, au.last_sign_in_at, p.last_seen_at
    from auth.users au join public.profiles p on p.id = au.id
    where coalesce(p_search, '') = ''
       or au.email ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
       or au.id::text = p_search
  )
  select f.id, f.email, f.display_name, f.status, app.user_plan(f.id), f.created_at, f.last_sign_in_at, f.last_seen_at,
    coalesce(f.last_seen_at > now() - interval '5 minutes', false),
    coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', gm.role))
      from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = f.id and gm.left_at is null), '[]'::jsonb),
    exists (select 1 from public.admins a where a.user_id = f.id),
    count(*) over ()
  from f order by f.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return (
    select jsonb_build_object(
      'id', au.id, 'email', au.email, 'display_name', p.display_name, 'status', p.status,
      'plan', app.user_plan(au.id), 'created_at', au.created_at, 'last_sign_in_at', au.last_sign_in_at,
      'last_seen_at', p.last_seen_at, 'email_confirmed', au.email_confirmed_at is not null,
      'providers', coalesce(au.raw_app_meta_data -> 'providers', '[]'::jsonb),
      'sessions_valid_after', p.sessions_valid_after,
      'is_admin', exists (select 1 from public.admins a where a.user_id = au.id),
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', gm.role, 'joined_at', gm.joined_at))
        from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = au.id and gm.left_at is null), '[]'::jsonb),
      'entitlements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('active', app.entitlement_active(e)) order by e.created_at desc)
        from public.entitlements e where e.user_id = au.id), '[]'::jsonb)
    )
    from auth.users au join public.profiles p on p.id = au.id where au.id = p_user
  );
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_status not in ('active', 'blocked') then raise exception 'Ungültiger Status'; end if;
  if p_user = auth.uid() then raise exception 'Das eigene Admin-Konto kann nicht gesperrt werden'; end if;
  update public.profiles set status = p_status, updated_at = now() where id = p_user;
  if not found then raise exception 'Konto nicht gefunden'; end if;
  if p_status = 'blocked' then
    perform app.revoke_sessions(p_user);
  end if;
  perform app.audit(case when p_status = 'blocked' then 'user.block' else 'user.unblock' end, 'user', p_user::text);
end $$;

create or replace function public.admin_revoke_sessions(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  perform app.revoke_sessions(p_user);
  perform app.audit('user.revoke_sessions', 'user', p_user::text);
end $$;

-- interne Hilfe: Konto aus allen Gruppen lösen; eigene Gruppen an das
-- dienstälteste Mitglied übergeben oder (ohne weitere Mitglieder) löschen
create or replace function app.detach_user(uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g record;
  heir uuid;
begin
  for g in select id from public.groups where owner_id = uid loop
    select gm.user_id into heir from public.group_members gm
      where gm.group_id = g.id and gm.user_id <> uid and gm.left_at is null order by gm.joined_at limit 1;
    if heir is null then
      perform app.purge_group(g.id);
    else
      update public.groups set owner_id = heir, updated_at = now() where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = heir;
    end if;
  end loop;
  update public.members set is_active = false, name = 'Ehemaliges Mitglied', user_id = null where user_id = uid;
  update public.group_members set left_at = now() where user_id = uid and left_at is null;
  update public.profiles set active_group_id = null where id = uid;
end $$;

-- Testkonto zurücksetzen: aus Gruppen lösen, Freischaltungen widerrufen, Sitzungen beenden
create or replace function public.admin_reset_user(p_user uuid, p_confirm_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if (select lower(email) from auth.users where id = p_user) is distinct from lower(btrim(p_confirm_email)) then
    raise exception 'Zur Bestätigung die genaue E-Mail-Adresse eingeben' using hint = 'confirm';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Admin-Konten können nicht zurückgesetzt werden'; end if;
  perform app.detach_user(p_user);
  update public.entitlements set revoked_at = now() where user_id = p_user and revoked_at is null and source = 'admin';
  delete from public.group_members where user_id = p_user;
  perform app.revoke_sessions(p_user);
  perform app.audit('user.reset', 'user', p_user::text);
end $$;

-- Konto endgültig löschen (Supabase Auth + Profil). Bezahlte Belege bleiben anonym erhalten.
create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text;
begin
  perform app.require_admin();
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'Konto nicht gefunden'; end if;
  if lower(v_email) <> lower(btrim(p_confirm_email)) then
    raise exception 'Zur Bestätigung die genaue E-Mail-Adresse eingeben' using hint = 'confirm';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Admin-Konten können nicht gelöscht werden'; end if;
  perform app.detach_user(p_user);
  perform app.revoke_sessions(p_user);
  delete from auth.users where id = p_user;
  perform app.audit('user.delete', 'user', p_user::text, jsonb_build_object('email_domain', split_part(v_email, '@', 2)));
end $$;

-- ---------------------------------------------------------------------
-- Gruppen
-- ---------------------------------------------------------------------
create or replace function public.admin_groups(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, name text, owner_id uuid, owner_email text, members bigint, has_plus boolean, plus_until timestamptz,
  homework bigint, study_entries bigint, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query
  select g.id, g.name, g.owner_id, au.email::text,
    (select count(*) from public.group_members gm where gm.group_id = g.id and gm.left_at is null),
    app.group_has_plus(g.id),
    nullif(app.group_plus_until(g.id), '-infinity'::timestamptz),
    (select count(*) from public.homework h where h.group_id = g.id and h.deleted_at is null),
    (select count(*) from public.study_entries s where s.group_id = g.id and s.deleted_at is null),
    g.created_at, count(*) over ()
  from public.groups g left join auth.users au on au.id = g.owner_id
  where coalesce(p_search, '') = '' or g.name ilike '%' || p_search || '%' or au.email ilike '%' || p_search || '%' or g.id::text = p_search
  order by g.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_group_detail(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return (
    select jsonb_build_object(
      'id', g.id, 'name', g.name, 'owner_id', g.owner_id, 'created_at', g.created_at,
      'has_plus', app.group_has_plus(g.id), 'plus_until', nullif(app.group_plus_until(g.id), '-infinity'::timestamptz),
      'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', gm.user_id, 'email', au.email, 'name', m.name, 'role', gm.role, 'joined_at', gm.joined_at) order by gm.joined_at)
        from public.group_members gm join public.members m on m.id = gm.member_id left join auth.users au on au.id = gm.user_id
        where gm.group_id = g.id and gm.left_at is null), '[]'::jsonb),
      'usage', jsonb_build_object(
        'homework', (select count(*) from public.homework h where h.group_id = g.id and h.deleted_at is null),
        'study_entries', (select count(*) from public.study_entries s where s.group_id = g.id and s.deleted_at is null),
        'exams', (select count(*) from public.exams x where x.group_id = g.id and x.deleted_at is null),
        'modules', (select count(*) from public.modules x where x.group_id = g.id and x.archived_at is null)
      ),
      'entitlements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('active', app.entitlement_active(e)) order by e.created_at desc)
        from public.entitlements e where e.group_id = g.id), '[]'::jsonb)
    ) from public.groups g where g.id = p_group
  );
end $$;

create or replace function public.admin_delete_group(p_group uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  perform app.require_admin();
  select name into v_name from public.groups where id = p_group;
  if v_name is null then raise exception 'Gruppe nicht gefunden'; end if;
  if v_name <> btrim(p_confirm_name) then raise exception 'Zur Bestätigung den genauen Gruppennamen eingeben' using hint = 'confirm'; end if;
  perform app.purge_group(p_group);
  perform app.audit('group.delete', 'group', p_group::text, jsonb_build_object('name', v_name));
end $$;

create or replace function public.admin_remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if exists (select 1 from public.groups where id = p_group and owner_id = p_user) then
    raise exception 'Der Inhaber kann nicht entfernt werden – Gruppe löschen oder Inhaber zuerst wechseln';
  end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = p_user and left_at is null;
  update public.members set is_active = false where group_id = p_group and user_id = p_user;
  update public.profiles set active_group_id = null where id = p_user and active_group_id = p_group;
  perform app.audit('group.remove_member', 'group', p_group::text, jsonb_build_object('user_id', p_user));
end $$;

-- ---------------------------------------------------------------------
-- Plus-Freischaltungen (kostenlos, kein Umsatz)
-- ---------------------------------------------------------------------
-- p_days > 0 → für N Tage; p_until → bis Datum; beides leer → unbegrenzt
create or replace function public.admin_grant_plus(p_target_type text, p_target uuid, p_days integer default null, p_until timestamptz default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_end timestamptz := case when p_days is not null then now() + make_interval(days => p_days) else p_until end;
begin
  perform app.require_admin();
  if p_target_type not in ('user', 'group') then raise exception 'Ziel muss user oder group sein'; end if;
  if p_days is not null and p_days not between 1 and 3660 then raise exception 'Tage zwischen 1 und 3660'; end if;
  if v_end is not null and v_end <= now() then raise exception 'Das Enddatum muss in der Zukunft liegen'; end if;
  if p_target_type = 'user' and not exists (select 1 from auth.users where id = p_target) then raise exception 'Konto nicht gefunden'; end if;
  if p_target_type = 'group' and not exists (select 1 from public.groups where id = p_target) then raise exception 'Gruppe nicht gefunden'; end if;
  insert into public.entitlements (user_id, group_id, plan, source, ends_at, granted_by, note)
  values (case when p_target_type = 'user' then p_target end, case when p_target_type = 'group' then p_target end,
          'plus_grant', 'admin', v_end, auth.uid(), left(p_note, 200))
  returning id into v_id;
  perform app.audit('plus.grant', p_target_type, p_target::text, jsonb_build_object('entitlement', v_id, 'ends_at', v_end, 'note', p_note));
  return v_id;
end $$;

create or replace function public.admin_extend_plus(p_entitlement uuid, p_days integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_days not between 1 and 3660 then raise exception 'Tage zwischen 1 und 3660'; end if;
  update public.entitlements
    set ends_at = greatest(coalesce(ends_at, now()), now()) + make_interval(days => p_days), revoked_at = null
    where id = p_entitlement and source = 'admin' and ends_at is not null;
  if not found then raise exception 'Nur befristete Admin-Freischaltungen können verlängert werden'; end if;
  perform app.audit('plus.extend', 'entitlement', p_entitlement::text, jsonb_build_object('days', p_days));
end $$;

create or replace function public.admin_revoke_plus(p_entitlement uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  -- Bezahlte Zugänge werden über den Zahlungsanbieter gekündigt/erstattet, nicht hier
  update public.entitlements set revoked_at = now() where id = p_entitlement and source = 'admin' and revoked_at is null;
  if not found then raise exception 'Nur aktive Admin-Freischaltungen können hier widerrufen werden'; end if;
  perform app.audit('plus.revoke', 'entitlement', p_entitlement::text);
end $$;

create or replace function public.admin_audit_log(p_limit integer default 100) returns setof public.admin_audit
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query select * from public.admin_audit order by occurred_at desc limit least(greatest(p_limit, 1), 500);
end $$;

-- Für die Admin-Oberfläche: bin ich Admin, und ist 2FA schon bestätigt?
create or replace function public.admin_whoami() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'is_admin', exists (select 1 from public.admins a where a.user_id = auth.uid()),
    'username', (select username from public.admins a where a.user_id = auth.uid()),
    'aal', auth.jwt() ->> 'aal',
    'ok', app.is_admin()
  )
$$;

revoke all on function app.require_admin(), app.audit(text, text, text, jsonb), app.revoke_sessions(uuid), app.detach_user(uuid) from public, anon, authenticated;
grant execute on function app.user_plan(uuid) to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'admin_stats()', 'admin_users(text, integer, integer)', 'admin_user_detail(uuid)', 'admin_set_user_status(uuid, text)',
    'admin_revoke_sessions(uuid)', 'admin_reset_user(uuid, text)', 'admin_delete_user(uuid, text)',
    'admin_groups(text, integer, integer)', 'admin_group_detail(uuid)', 'admin_delete_group(uuid, text)',
    'admin_remove_member(uuid, uuid)', 'admin_grant_plus(text, uuid, integer, timestamptz, text)',
    'admin_extend_plus(uuid, integer)', 'admin_revoke_plus(uuid)', 'admin_audit_log(integer)', 'admin_whoami()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Eigenes Konto löschen (Recht auf Löschung) – Bestätigung mit E-Mail
-- ---------------------------------------------------------------------
create or replace function public.app_delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  v_email text;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Admin-Konten können hier nicht gelöscht werden'; end if;
  select email into v_email from auth.users where id = uid;
  if lower(coalesce(v_email, '')) <> lower(btrim(p_confirm)) then
    raise exception 'Zur Bestätigung die E-Mail-Adresse deines Kontos eingeben.' using errcode = 'P0001', hint = 'confirm';
  end if;
  perform app.detach_user(uid);
  perform app.revoke_sessions(uid);
  delete from auth.users where id = uid;
end $$;
revoke all on function public.app_delete_my_account(text) from public, anon;
grant execute on function public.app_delete_my_account(text) to authenticated;


-- ===== supabase-app/migrations/0003_plans.sql =====
-- =====================================================================
-- StudySpace App – Tarife: Testphase, Solo, Gruppe, Beta-Käufe
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen. Wiederholbar.
--
--   Free/Test   0 €     14 Tage voller Solo-Zugriff, danach nur lesen
--   Solo        2,49 €/Monat  ·  11,99 € für 6 Monate
--   Gruppe      4,99 €/Monat  ·  24,99 € für 6 Monate (bis 8 Personen,
--               nur eine Person bezahlt; enthält alle Solo-Funktionen)
--
-- Beta: Käufe werden nur SIMULIERT (Quelle „beta“). Sie schalten frei,
-- erscheinen im Admin-Bereich getrennt und zählen nie als Umsatz.
-- Der Admin kann Beta-Käufe jederzeit abschalten (app_config).
-- Echte Zahlungen (Stripe/App Stores) schreiben später nur Server-Webhooks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema-Erweiterungen
-- ---------------------------------------------------------------------
alter table public.groups add column if not exists kind text not null default 'team';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'groups_kind_check') then
    alter table public.groups add constraint groups_kind_check check (kind in ('team', 'solo'));
  end if;
end $$;
-- Ein persönlicher Lernbereich pro Konto
create unique index if not exists groups_one_solo_per_owner on public.groups(owner_id) where kind = 'solo';

alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements add constraint entitlements_plan_check check (plan in (
  'trial', 'solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'solo_grant',
  -- frühere Bezeichnungen (bleiben gültig, zählen als Gruppe)
  'plus_monthly', 'semester_pass', 'plus_grant'
));
alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check check (source in ('admin', 'trial', 'beta', 'stripe', 'app_store', 'play_store'));
alter table public.entitlements add column if not exists auto_renew boolean not null default false;
alter table public.entitlements add column if not exists price_cents integer check (price_cents is null or price_cents >= 0);
-- Testphase nur einmal pro Konto
create unique index if not exists entitlements_one_trial on public.entitlements(user_id) where plan = 'trial';

alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments add constraint payments_plan_check check (plan in ('solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'plus_monthly', 'semester_pass'));

alter table public.subscription_events add column if not exists plan text;
alter table public.subscription_events add column if not exists amount_cents integer;
alter table public.subscription_events drop constraint if exists subscription_events_kind_check;
alter table public.subscription_events add constraint subscription_events_kind_check check (kind in ('started', 'renewed', 'canceled', 'expired', 'refunded', 'trial_started'));

alter table public.profiles add column if not exists tutorial_done_at timestamptz;

-- Schalter für den Betrieb (nur Server/Admin)
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_config (key, value) values ('beta_purchases', 'true'::jsonb) on conflict (key) do nothing;
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;

-- ---------------------------------------------------------------------
-- 2. Tarif-Logik
-- ---------------------------------------------------------------------
create or replace function app.plan_level(p text) returns text
language sql immutable as $$
  select case
    when p in ('group_monthly', 'group_semester', 'plus_monthly', 'semester_pass', 'plus_grant') then 'group'
    when p in ('solo_monthly', 'solo_semester', 'solo_grant', 'trial') then 'solo'
  end
$$;

create or replace function app.plan_price_cents(p text) returns integer
language sql immutable as $$
  select case p
    when 'solo_monthly' then 249 when 'solo_semester' then 1199
    when 'group_monthly' then 499 when 'group_semester' then 2499
    when 'plus_monthly' then 499 when 'semester_pass' then 1999
    else 0 end
$$;

create or replace function app.plan_months(p text) returns integer
language sql immutable as $$
  select case when p in ('solo_semester', 'group_semester', 'semester_pass') then 6 else 1 end
$$;

-- 'group' > 'solo' > null
create or replace function app.user_level(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when bool_or(app.plan_level(e.plan) = 'group') then 'group'
    when bool_or(app.plan_level(e.plan) = 'solo') then 'solo'
  end
  from public.entitlements e where e.user_id = uid and app.entitlement_active(e)
$$;

-- „Plus“ im bisherigen Sinn = darf Lerngruppen erstellen (Gruppenpass)
create or replace function app.user_has_plus(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.user_level(uid) = 'group', false)
$$;

-- Darf in dieser Gruppe bearbeitet werden?
--   Lerngruppe: Gruppenpass des Inhabers (oder Freischaltung der Gruppe)
--   Eigener Lernbereich: Testphase, Solo oder Gruppe des Inhabers
create or replace function app.group_has_plus(gid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.entitlements e where e.group_id = gid and app.entitlement_active(e))
      or exists (
        select 1 from public.groups g
        where g.id = gid and g.owner_id is not null
          and case when g.kind = 'solo' then app.user_level(g.owner_id) is not null else app.user_level(g.owner_id) = 'group' end
      )
$$;

-- Ablauf des Zugangs (null = unbegrenzt, -infinity = keiner)
create or replace function app.group_plus_until(gid uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  with g as (select * from public.groups where id = gid),
  e as (
    select x.* from public.entitlements x, g
    where app.entitlement_active(x)
      and (x.group_id = gid or (x.user_id = g.owner_id and (g.kind = 'solo' or app.plan_level(x.plan) = 'group')))
  )
  select case when bool_or(ends_at is null) then null when count(*) = 0 then '-infinity'::timestamptz else max(ends_at) end from e
$$;

-- Verständliche Meldung, wenn nur gelesen werden darf
create or replace function app.require_plus() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g public.groups;
begin
  if app.group_has_plus(new.group_id) then return new; end if;
  select * into g from public.groups where id = new.group_id;
  if g.kind = 'solo' and exists (select 1 from public.entitlements e where e.user_id = g.owner_id and e.plan = 'trial') then
    raise exception 'Deine 14-tägige Testphase ist beendet. Deine Inhalte bleiben sichtbar – mit StudySpace Solo kannst du wieder bearbeiten.'
      using errcode = 'P0001', hint = 'plus_required';
  elsif g.kind = 'solo' then
    raise exception 'Dein Solo-Zugang ist abgelaufen. Deine Inhalte bleiben sichtbar – zum Bearbeiten Solo verlängern.'
      using errcode = 'P0001', hint = 'plus_required';
  end if;
  raise exception 'Der Gruppenpass dieser Lerngruppe ist abgelaufen. Inhalte bleiben sichtbar, Änderungen sind erst nach einer Verlängerung wieder möglich.'
    using errcode = 'P0001', hint = 'plus_required';
end $$;

-- Persönlichen Lernbereich anlegen (oder vorhandenen liefern) und aktivieren
create or replace function app.ensure_solo_space(uid uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid;
begin
  select id into gid from public.groups where owner_id = uid and kind = 'solo';
  if gid is null then
    insert into public.groups (name, owner_id, invite_code, kind) values ('Mein Lernbereich', uid, app.new_invite_code(), 'solo') returning id into gid;
    perform app.attach_member(gid, uid, 'owner', null);
    insert into public.app_settings (group_id, key, value) values
      (gid, 'app_name', '"StudySpace"'::jsonb), (gid, 'group_goal_title', '"Mein Lernziel"'::jsonb), (gid, 'motivation_enabled', 'true'::jsonb)
    on conflict do nothing;
  end if;
  update public.profiles set active_group_id = gid, updated_at = now() where id = uid;
  return gid;
end $$;

-- ---------------------------------------------------------------------
-- 3. Funktionen für die App
-- ---------------------------------------------------------------------
create or replace function public.app_me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  best public.entitlements;
  trial public.entitlements;
begin
  if uid is null then return null; end if;
  -- bester aktiver Tarif: Gruppe vor Solo, bezahlt/Beta vor Freischaltung vor Testphase
  select * into best from public.entitlements e
  where e.user_id = uid and app.entitlement_active(e)
  order by app.plan_level(e.plan) = 'group' desc, e.plan = 'trial', e.source = 'admin', e.ends_at desc nulls first
  limit 1;
  select * into trial from public.entitlements e where e.user_id = uid and e.plan = 'trial';
  return jsonb_build_object(
    'user_id', uid,
    'status', (select status from public.profiles where id = uid),
    'session_ok', app.account_ok(),
    'display_name', (select display_name from public.profiles where id = uid),
    'active_group_id', app.active_group(),
    'member_id', app.my_member_id(),
    'level', app.user_level(uid),
    'has_plus', app.user_has_plus(uid),
    'plan', best.plan,
    'plan_source', best.source,
    'plan_id', best.id,
    'plan_until', best.ends_at,
    'plus_until', best.ends_at,
    'auto_renew', coalesce(best.auto_renew, false),
    'trial_used', trial.id is not null,
    'trial_ends_at', trial.ends_at,
    'beta_purchases', coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false),
    'tutorial_done', (select tutorial_done_at is not null from public.profiles where id = uid),
    'is_admin', exists (select 1 from public.admins where user_id = uid),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'kind', g.kind, 'role', gm.role, 'is_owner', g.owner_id = uid,
        'has_plus', app.group_has_plus(g.id), 'plus_until', app.group_plus_until(g.id),
        'members', (select count(*) from public.group_members x where x.group_id = g.id and x.left_at is null),
        'invite_code', case when gm.role = 'owner' and g.kind = 'team' then g.invite_code end
      ) order by g.kind = 'solo' desc, gm.joined_at)
      from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.user_id = uid and gm.left_at is null), '[]'::jsonb)
  );
end $$;

-- „Alleine lernen“: 14 Tage kostenlos, einmal pro Konto, ohne Zahlungsdaten
create or replace function public.app_start_trial() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not exists (select 1 from public.entitlements where user_id = uid and plan = 'trial') then
    insert into public.entitlements (user_id, plan, source, ends_at, price_cents) values (uid, 'trial', 'trial', now() + interval '14 days', 0);
    insert into public.subscription_events (provider, kind, user_id, plan, amount_cents) values ('trial', 'trial_started', uid, 'trial', 0);
  end if;
  -- Auch nach Ablauf: Lernbereich öffnen (dann nur lesbar)
  return app.ensure_solo_space(uid);
end $$;

-- Eigenen Lernbereich öffnen (falls vorhanden oder durch Tarif berechtigt)
create or replace function public.app_open_solo() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not exists (select 1 from public.groups where owner_id = uid and kind = 'solo') and app.user_level(uid) is null then
    raise exception 'Für einen eigenen Lernbereich die Testphase starten oder Solo wählen.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  return app.ensure_solo_space(uid);
end $$;

-- Beta: Kauf SIMULIEREN (keine Zahlung). Monatlich = 1 Monat (verlängert sich
-- in der Beta automatisch, bis gekündigt), Semester = 6 Monate ohne Verlängerung.
create or replace function public.app_beta_purchase(p_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  cur public.entitlements;
  new_end timestamptz;
  v_id uuid;
  v_group uuid;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false) is not true then
    raise exception 'Käufe sind gerade nicht möglich.' using errcode = 'P0001', hint = 'beta_closed';
  end if;
  if p_plan not in ('solo_monthly', 'solo_semester', 'group_monthly', 'group_semester') then
    raise exception 'Unbekannter Tarif' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subscription_events where user_id = uid and provider = 'beta' and occurred_at > now() - interval '1 day') >= 10 then
    raise exception 'Zu viele Käufe heute. Bitte morgen erneut versuchen.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  -- gleicher Tarif schon aktiv → verlängern statt doppelt anlegen
  select * into cur from public.entitlements e
  where e.user_id = uid and e.plan = p_plan and e.source = 'beta' and app.entitlement_active(e)
  order by e.ends_at desc limit 1 for update;
  if cur.id is not null then
    new_end := cur.ends_at + make_interval(months => app.plan_months(p_plan));
    update public.entitlements set ends_at = new_end, auto_renew = (app.plan_months(p_plan) = 1) where id = cur.id;
    v_id := cur.id;
  else
    new_end := now() + make_interval(months => app.plan_months(p_plan));
    insert into public.entitlements (user_id, plan, source, ends_at, auto_renew, price_cents, note)
    values (uid, p_plan, 'beta', new_end, app.plan_months(p_plan) = 1, app.plan_price_cents(p_plan), 'Beta – simulierter Kauf')
    returning id into v_id;
  end if;
  insert into public.subscription_events (provider, external_id, kind, user_id, plan, amount_cents)
  values ('beta', v_id::text, case when cur.id is null then 'started' else 'renewed' end, uid, p_plan, app.plan_price_cents(p_plan));
  -- Solo (und Gruppe) enthalten den eigenen Lernbereich; Solo öffnet ihn direkt
  if app.plan_level(p_plan) = 'solo' then
    v_group := app.ensure_solo_space(uid);
  end if;
  return jsonb_build_object('entitlement_id', v_id, 'ends_at', new_end, 'group_id', v_group);
end $$;

-- Beta: monatlichen Tarif kündigen (läuft bis zum Ende des Zeitraums)
create or replace function public.app_beta_cancel(p_entitlement uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.entitlements set auto_renew = false
  where id = p_entitlement and user_id = auth.uid() and source = 'beta' and auto_renew;
  if not found then raise exception 'Kein laufendes Monatsabo gefunden.' using errcode = 'P0001'; end if;
  insert into public.subscription_events (provider, external_id, kind, user_id, plan)
  select 'beta', id::text, 'canceled', user_id, plan from public.entitlements where id = p_entitlement;
end $$;

-- Beta: Monatsabos automatisch verlängern (täglich per pg_cron, falls vorhanden)
create or replace function app.beta_renew() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select * from public.entitlements
    where source = 'beta' and auto_renew and revoked_at is null and ends_at between now() - interval '3 days' and now() + interval '1 day'
  loop
    update public.entitlements set ends_at = greatest(ends_at, now()) + interval '1 month' where id = r.id;
    insert into public.subscription_events (provider, external_id, kind, user_id, plan, amount_cents)
    values ('beta', r.id::text, 'renewed', r.user_id, r.plan, app.plan_price_cents(r.plan));
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'studyspace-app-beta-renew';
    perform cron.schedule('studyspace-app-beta-renew', '23 4 * * *', 'select app.beta_renew()');
  end if;
end $$;

create or replace function public.app_tutorial_done() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.profiles set tutorial_done_at = coalesce(tutorial_done_at, now()) where id = auth.uid()
$$;

-- Gruppen erstellen: nur mit Gruppenpass; höchstens 3 eigene Lerngruppen
create or replace function public.app_create_group(p_name text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not app.user_has_plus(uid) then
    raise exception 'Zum Erstellen einer Lerngruppe wird ein Gruppenpass benötigt.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  if (select count(*) from public.groups where owner_id = uid and kind = 'team') >= 3 then
    raise exception 'Höchstens 3 eigene Lerngruppen pro Konto.' using errcode = 'P0001', hint = 'group_limit';
  end if;
  insert into public.groups (name, owner_id, invite_code, kind) values (left(btrim(p_name), 60), uid, app.new_invite_code(), 'team') returning id into gid;
  perform app.attach_member(gid, uid, 'owner', p_display_name);
  insert into public.app_settings (group_id, key, value) values
    (gid, 'app_name', to_jsonb(left(btrim(p_name), 60))), (gid, 'group_goal_title', '"Unser gemeinsames Lernziel"'::jsonb), (gid, 'motivation_enabled', 'true'::jsonb)
  on conflict do nothing;
  return gid;
end $$;

-- Beitreten: nur Lerngruppen (der eigene Lernbereich hat keine Einladung)
create or replace function public.app_join_group(p_code text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  active_members integer;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  -- Zeile sperren: gleichzeitige Beitritte werden nacheinander geprüft
  select * into g from public.groups where invite_code = upper(btrim(p_code)) and kind = 'team' for update;
  if g.id is null then raise exception 'Einladungscode ungültig.' using errcode = 'P0001', hint = 'invalid_code'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = uid and left_at is null) then
    update public.profiles set active_group_id = g.id where id = uid;
    return g.id;
  end if;
  if not app.group_has_plus(g.id) then
    raise exception 'Diese Lerngruppe hat derzeit keinen aktiven Gruppenpass.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  select count(*) into active_members from public.group_members where group_id = g.id and left_at is null;
  if active_members >= 8 then
    raise exception 'Diese Lerngruppe ist voll (höchstens 8 Mitglieder).' using errcode = 'P0001', hint = 'member_limit';
  end if;
  perform app.attach_member(g.id, uid, 'member', p_display_name);
  return g.id;
end $$;

create or replace function public.app_invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', g.name, 'members', (select count(*) from public.group_members x where x.group_id = g.id and x.left_at is null), 'has_plus', app.group_has_plus(g.id))
  from public.groups g where g.invite_code = upper(btrim(p_code)) and g.kind = 'team' and auth.uid() is not null
$$;

create or replace function public.app_regenerate_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare code text := app.new_invite_code();
begin
  if not app.account_ok() or not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid() and kind = 'team') then
    raise exception 'Nur der Inhaber einer Lerngruppe kann den Einladungscode erneuern' using errcode = '42501';
  end if;
  update public.groups set invite_code = code, updated_at = now() where id = p_group;
  return code;
end $$;

revoke all on function public.app_start_trial(), public.app_open_solo(), public.app_beta_purchase(text), public.app_beta_cancel(uuid), public.app_tutorial_done() from public, anon;
grant execute on function public.app_start_trial(), public.app_open_solo(), public.app_beta_purchase(text), public.app_beta_cancel(uuid), public.app_tutorial_done() to authenticated;
revoke all on function app.ensure_solo_space(uuid), app.beta_renew() from public, anon, authenticated;
grant execute on function app.plan_level(text), app.plan_price_cents(text), app.plan_months(text), app.user_level(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Admin
-- ---------------------------------------------------------------------
create or replace function app.user_plan(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select e.plan from public.entitlements e
      where e.user_id = uid and app.entitlement_active(e)
      order by app.plan_level(e.plan) = 'group' desc, e.plan = 'trial', e.source = 'admin', e.ends_at desc nulls first limit 1),
    case
      when exists (select 1 from public.group_members gm join public.groups g on g.id = gm.group_id
                   where gm.user_id = uid and gm.left_at is null and g.kind = 'team' and app.group_has_plus(g.id)) then 'plus_member'
      when exists (select 1 from public.entitlements e where e.user_id = uid and e.plan = 'trial') then 'trial_expired'
      else 'free' end)
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  res jsonb;
begin
  perform app.require_admin();
  with u as (
    select au.id, au.created_at, p.status, p.last_seen_at, app.user_plan(au.id) as plan
    from auth.users au join public.profiles p on p.id = au.id
    where not exists (select 1 from public.admins a where a.user_id = au.id)
  ),
  act as (select e.* from public.entitlements e where app.entitlement_active(e)),
  paid as (select * from act where source in ('stripe', 'app_store', 'play_store')),
  beta as (select * from act where source = 'beta'),
  plans as (select unnest(array['solo_monthly', 'solo_semester', 'group_monthly', 'group_semester']) as p)
  select jsonb_build_object(
    'users_total', (select count(*) from u),
    'users_active_7d', (select count(*) from u where last_seen_at > now() - interval '7 days'),
    'users_online_approx', (select count(*) from u where last_seen_at > now() - interval '5 minutes'),
    'users_new_7d', (select count(*) from u where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from u where created_at > now() - interval '30 days'),
    'users_blocked', (select count(*) from u where status = 'blocked'),
    'users_free', (select count(*) from u where plan in ('free', 'trial_expired')),
    'users_plus_member', (select count(*) from u where plan = 'plus_member'),
    'groups_total', (select count(*) from public.groups where kind = 'team'),
    'groups_plus', (select count(*) from public.groups g where g.kind = 'team' and app.group_has_plus(g.id)),
    'solo_spaces', (select count(*) from public.groups where kind = 'solo'),
    'group_members_total', (select count(*) from public.group_members gm join public.groups g on g.id = gm.group_id where g.kind = 'team' and gm.left_at is null),
    'trials_active', (select count(*) from act where plan = 'trial'),
    'trials_expired', (select count(*) from public.entitlements e where e.plan = 'trial' and not app.entitlement_active(e)),
    'trials_converted', (select count(distinct t.user_id) from public.entitlements t join public.entitlements x on x.user_id = t.user_id
                          where t.plan = 'trial' and x.source in ('beta', 'stripe', 'app_store', 'play_store')),
    'paid_by_plan', (select jsonb_object_agg(p, (select count(*) from paid where plan = p)) from plans),
    'beta_by_plan', (select jsonb_object_agg(p, (select count(*) from beta where plan = p)) from plans),
    'subscriptions_paid_active', (select count(*) from paid where plan in ('solo_monthly', 'group_monthly', 'plus_monthly')),
    'semester_passes_active', (select count(*) from paid where plan in ('solo_semester', 'group_semester', 'semester_pass')),
    'grants_active', (select count(*) from act where source = 'admin'),
    'expired_30d', (select count(*) from public.entitlements e where e.revoked_at is null and e.plan <> 'trial' and e.ends_at between now() - interval '30 days' and now()),
    'cancellations_30d', (select count(*) from public.subscription_events s where s.kind = 'canceled' and s.provider <> 'beta' and s.occurred_at > now() - interval '30 days'),
    'revenue_cents_total', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments),
    'revenue_cents_30d', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments where occurred_at > now() - interval '30 days'),
    -- MRR (brutto): Monatsabos voll, Semesterpässe auf 6 Monate verteilt – nur echte Zahlungsquellen
    'mrr_cents', (select coalesce(sum(case when app.plan_months(plan) = 1 then app.plan_price_cents(plan) else app.plan_price_cents(plan) / 6.0 end), 0)::int from paid),
    'payments_connected', exists (select 1 from public.payments),
    -- Beta: simuliert, NIE Umsatz
    'beta_purchases_enabled', coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false),
    'beta_active', (select count(*) from beta),
    'beta_mrr_cents', (select coalesce(sum(case when app.plan_months(plan) = 1 then app.plan_price_cents(plan) else app.plan_price_cents(plan) / 6.0 end), 0)::int from beta),
    'beta_simulated_cents', (select coalesce(sum(amount_cents), 0) from public.subscription_events where provider = 'beta' and kind in ('started', 'renewed')),
    'beta_cancellations', (select count(*) from public.subscription_events where provider = 'beta' and kind = 'canceled'),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', (select count(*) from u where u.created_at::date = d::date)) order by d)
      from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d), '[]'::jsonb),
    'db_time', now()
  ) into res;
  return res;
end $$;

-- Freischaltung mit Tarifart (Solo oder Gruppe); kostenlos, kein Umsatz
drop function if exists public.admin_grant_plus(text, uuid, integer, timestamptz, text);
create or replace function public.admin_grant_plus(p_target_type text, p_target uuid, p_days integer default null, p_until timestamptz default null, p_note text default null, p_plan text default 'plus_grant')
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_end timestamptz := case when p_days is not null then now() + make_interval(days => p_days) else p_until end;
begin
  perform app.require_admin();
  if p_target_type not in ('user', 'group') then raise exception 'Ziel muss user oder group sein'; end if;
  if p_plan not in ('plus_grant', 'solo_grant') then raise exception 'Tarif muss plus_grant (Gruppe) oder solo_grant sein'; end if;
  if p_target_type = 'group' and p_plan <> 'plus_grant' then raise exception 'Gruppen erhalten immer den Gruppenpass'; end if;
  if p_days is not null and p_days not between 1 and 3660 then raise exception 'Tage zwischen 1 und 3660'; end if;
  if v_end is not null and v_end <= now() then raise exception 'Das Enddatum muss in der Zukunft liegen'; end if;
  if p_target_type = 'user' and not exists (select 1 from auth.users where id = p_target) then raise exception 'Konto nicht gefunden'; end if;
  if p_target_type = 'group' and not exists (select 1 from public.groups where id = p_target) then raise exception 'Gruppe nicht gefunden'; end if;
  insert into public.entitlements (user_id, group_id, plan, source, ends_at, granted_by, note)
  values (case when p_target_type = 'user' then p_target end, case when p_target_type = 'group' then p_target end,
          p_plan, 'admin', v_end, auth.uid(), left(p_note, 200))
  returning id into v_id;
  perform app.audit('plus.grant', p_target_type, p_target::text, jsonb_build_object('entitlement', v_id, 'plan', p_plan, 'ends_at', v_end, 'note', p_note));
  return v_id;
end $$;

-- Betriebsschalter (z. B. Beta-Käufe an/aus)
create or replace function public.admin_set_config(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_key not in ('beta_purchases') then raise exception 'Unbekannte Einstellung'; end if;
  insert into public.app_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform app.audit('config.set', 'config', p_key, jsonb_build_object('value', p_value));
end $$;

revoke all on function public.admin_grant_plus(text, uuid, integer, timestamptz, text, text), public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_grant_plus(text, uuid, integer, timestamptz, text, text), public.admin_set_config(text, jsonb) to authenticated;
