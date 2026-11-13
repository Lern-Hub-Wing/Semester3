-- =====================================================================
-- StudySpace – Mitteilung „neue Hausaufgabe“ SOFORT verschicken
-- ---------------------------------------------------------------------
-- Ohne diese Datei prüft die Zeitsteuerung nur alle 5 Minuten (cron.sql):
-- Eine neue Hausaufgabe kommt dann mit bis zu 5 Minuten Verspätung – und
-- gar nicht, wenn sie vorher wieder gelöscht wurde.
--
-- Mit dieser Datei ruft die Datenbank die Edge Function „push-scheduler“
-- direkt nach dem Speichern einer neuen Hausaufgabe auf (pg_net).
--
-- Einmal im Supabase SQL Editor ausführen – NACH supabase/cron.sql
-- (nutzt dieselben, dort im Vault gespeicherten Werte; nichts ersetzen).
-- Ändert keine Daten, legt nur eine Funktion und einen Trigger an.
-- Wiederholbar. Rückgängig: drop trigger ss_push_homework on public.homework;
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.ss_push_kick()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_project_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_scheduler_secret');
begin
  if v_url is null or v_secret is null or v_url like '%<PROJEKT-REF>%' then
    return null; -- cron.sql noch nicht eingerichtet: still bleiben
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/push-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-scheduler-secret', v_secret),
    body := '{"reason":"homework"}'::jsonb,
    timeout_milliseconds := 30000
  );
  return null;
exception when others then
  -- Das Speichern der Hausaufgabe darf nie an der Mitteilung scheitern
  raise warning 'ss_push_kick: %', sqlerrm;
  return null;
end;
$$;
revoke all on function public.ss_push_kick() from public, anon, authenticated;

drop trigger if exists ss_push_homework on public.homework;
create trigger ss_push_homework after insert on public.homework
  for each statement execute function public.ss_push_kick();

-- Kontrolle: eine Hausaufgabe anlegen, dann
-- select status_code, content from net._http_response order by created desc limit 3;
