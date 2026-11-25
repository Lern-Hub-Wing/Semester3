-- =====================================================================
-- StudySpace App – Papierkorb leert sich nach 7 Tagen (statt 30)
-- ---------------------------------------------------------------------
-- Schonfrist: Was beim Einspielen schon im Papierkorb liegt, bleibt ab
-- jetzt noch 7 Tage wiederherstellbar. Läuft täglich per pg_cron
-- (app.purge_trash, siehe 0001) und zusätzlich beim Öffnen der App
-- (public.app_purge_trash – nur Einträge, die älter als 7 Tage sind).
-- =====================================================================
create table if not exists app.trash_policy (
  id    smallint primary key default 1 check (id = 1),
  since timestamptz not null default now()
);
insert into app.trash_policy (id) values (1) on conflict (id) do nothing;
revoke all on app.trash_policy from public, anon, authenticated;

create or replace function app.purge_trash() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cutoff timestamptz := now() - interval '7 days';
  since  timestamptz;
begin
  -- Nutzungszähler unabhängig von der Schonfrist aufräumen
  delete from public.group_usage where day < (now() - interval '40 days')::date;
  select p.since into since from app.trash_policy p where p.id = 1;
  if since is null or since > cutoff then return; end if;
  delete from public.homework_completions c using public.homework h where c.homework_id = h.id and h.deleted_at < cutoff;
  delete from public.homework_parts p using public.homework h where p.homework_id = h.id and h.deleted_at < cutoff;
  delete from public.homework where deleted_at < cutoff;
  delete from public.homework_completions c using public.homework_parts p where c.target_id = p.id and p.deleted_at < cutoff;
  delete from public.homework_parts where deleted_at < cutoff;
  delete from public.task_completions c using public.tasks t, public.study_entries e
    where c.task_id = t.id and t.study_entry_id = e.id and (t.deleted_at < cutoff or e.deleted_at < cutoff);
  delete from public.tasks t using public.study_entries e where t.study_entry_id = e.id and e.deleted_at < cutoff;
  delete from public.tasks where deleted_at < cutoff;
  delete from public.study_entries where deleted_at < cutoff;
  delete from public.exams where deleted_at < cutoff;
  delete from public.music_tracks where deleted_at < cutoff;
end $$;
revoke all on function app.purge_trash() from public, anon, authenticated;

-- Beim Öffnen der App anstoßen (falls pg_cron nicht aktiviert ist); löscht nur Abgelaufenes
create or replace function public.app_purge_trash() returns void
language sql security definer set search_path = public, pg_temp as $$
  select app.purge_trash();
$$;
revoke all on function public.app_purge_trash() from public, anon;
grant execute on function public.app_purge_trash() to authenticated;
