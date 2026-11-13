-- =====================================================================
-- StudySpace App – Mitteilungen einschalten (einmalig, im APP-Projekt)
-- ---------------------------------------------------------------------
-- NUR im EIGENEN Supabase-Projekt der App ausführen (SQL Editor), NICHT
-- in der Datenbank der bisherigen Seite. Voraussetzungen (docs/APP.md,
-- Abschnitt „Mitteilungen“):
--   1. app_schema.sql ist (erneut) ausgeführt
--   2. Edge Function „app-push“ ist bereitgestellt, Secrets gesetzt
--
-- VORHER die beiden Platzhalter ersetzen:
--   <APP-PROJEKT-REF>    z. B. abcd1234… (aus https://abcd1234….supabase.co)
--   <APP-PUSH-SECRET>    derselbe Wert wie das Edge-Function-Secret APP_PUSH_SECRET
--
-- Was passiert:
--   • Sofort-Versand: Nach jeder neuen Hausaufgabe ruft die Datenbank die
--     Funktion „app-push“ auf (pg_net, nach dem Speichern).
--   • Sicherheitsnetz: zusätzlich alle 5 Minuten (pg_cron) – liefert
--     Mitteilungen nach der Ruhezeit oder nach Störungen nach.
-- Das Secret liegt verschlüsselt im Supabase Vault. Wiederholbar.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from vault.secrets where name = 'app_push_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'app_push_url'), 'https://<APP-PROJEKT-REF>.supabase.co/functions/v1/app-push');
  else
    perform vault.create_secret('https://<APP-PROJEKT-REF>.supabase.co/functions/v1/app-push', 'app_push_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'app_push_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'app_push_secret'), '<APP-PUSH-SECRET>');
  else
    perform vault.create_secret('<APP-PUSH-SECRET>', 'app_push_secret');
  end if;
end $$;

-- Aufruf der Funktion (scheitert nie das Speichern einer Hausaufgabe)
create or replace function app.push_kick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_push_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_push_secret');
begin
  if v_url is null or v_secret is null or v_url like '%<APP-PROJEKT-REF>%' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'app.push_kick: %', sqlerrm;
end $$;
revoke all on function app.push_kick() from public, anon, authenticated;

create or replace function app.push_after_homework() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.push_kick();
  return null;
end $$;
drop trigger if exists app_push_homework on public.homework;
create trigger app_push_homework after insert on public.homework
  for each statement execute function app.push_after_homework();

-- Sicherheitsnetz alle 5 Minuten
select cron.unschedule(jobid) from cron.job where jobname = 'studyspace-app-push';
select cron.schedule('studyspace-app-push', '*/5 * * * *', $$ select app.push_kick(); $$);

-- Kontrolle (nach ein paar Minuten):
-- select status_code, content from net._http_response order by created desc limit 5;
-- select value from public.push_state where key = 'app-push:heartbeat';
