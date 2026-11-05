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
