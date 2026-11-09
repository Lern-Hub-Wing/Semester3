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
