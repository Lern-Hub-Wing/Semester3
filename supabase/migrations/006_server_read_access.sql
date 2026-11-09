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
