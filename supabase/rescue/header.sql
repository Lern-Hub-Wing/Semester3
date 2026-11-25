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
