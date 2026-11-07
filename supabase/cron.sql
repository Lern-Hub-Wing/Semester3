-- =====================================================================
-- StudySpace – Zeitsteuerung der Push-Erinnerungen (Supabase Cron)
-- ---------------------------------------------------------------------
-- Ruft alle 5 Minuten die Edge Function „push-scheduler“ auf.
-- Ausführen im Supabase SQL Editor – NACH Migration 004 und NACHDEM die
-- Edge Functions bereitgestellt und die Secrets gesetzt wurden
-- (README, Schritt 12).
--
-- VORHER die beiden Platzhalter unten ersetzen:
--   <PROJEKT-REF>        z. B. abcd1234 (aus https://abcd1234.supabase.co)
--   <SCHEDULER-SECRET>   derselbe Wert wie das Edge-Function-Secret SCHEDULER_SECRET
--
-- Das Secret wird im Supabase Vault verschlüsselt gespeichert und steht
-- damit nicht im Klartext im Cron-Job.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secrets im Vault ablegen (bei erneutem Ausführen aktualisieren)
do $$
begin
  if exists (select 1 from vault.secrets where name = 'studyspace_project_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'studyspace_project_url'), 'https://<PROJEKT-REF>.supabase.co');
  else
    perform vault.create_secret('https://<PROJEKT-REF>.supabase.co', 'studyspace_project_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'studyspace_scheduler_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'studyspace_scheduler_secret'), '<SCHEDULER-SECRET>');
  else
    perform vault.create_secret('<SCHEDULER-SECRET>', 'studyspace_scheduler_secret');
  end if;
end $$;

-- Alten Job gleichen Namens entfernen und neu anlegen
select cron.unschedule(jobid) from cron.job where jobname = 'studyspace-push-scheduler';

select cron.schedule(
  'studyspace-push-scheduler',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_project_url') || '/functions/v1/push-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_scheduler_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Kontrolle: letzte Läufe (nach ein paar Minuten ausführen)
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'studyspace-push-scheduler') order by start_time desc limit 5;
-- select status_code, content from net._http_response order by created desc limit 5;
