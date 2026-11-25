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
