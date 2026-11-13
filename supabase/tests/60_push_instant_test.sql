-- push_instant.sql: ohne Vault-Werte still, mit Werten genau ein Aufruf je Speichern
\set ON_ERROR_STOP on
do $$
declare v_module uuid := (select id from public.modules limit 1);
begin
  insert into public.homework (module_id, title, due_date) values (v_module, 'Ohne Einrichtung', current_date + 2);
  perform ss_test.assert((select count(*) from net.calls) = 0, 'ohne cron.sql: kein Aufruf');
  perform vault.create_secret('https://abcdefghijklmnopqrst.supabase.co', 'studyspace_project_url');
  perform vault.create_secret('scheduler-secret-for-tests-0123456789', 'studyspace_scheduler_secret');
  insert into public.homework (module_id, title, due_date) values (v_module, 'Blatt 1', current_date + 3), (v_module, 'Blatt 2', current_date + 4);
  perform ss_test.assert((select count(*) from net.calls) = 1, 'ein Aufruf je Speichervorgang');
  perform ss_test.assert((select url from net.calls limit 1) = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/push-scheduler', 'Ziel push-scheduler');
  perform ss_test.assert((select headers ->> 'x-scheduler-secret' from net.calls limit 1) = 'scheduler-secret-for-tests-0123456789', 'Secret im Header');
  -- Fehler beim Aufruf verhindern das Speichern nicht
  drop function net.http_post(text, jsonb, jsonb, int);
  insert into public.homework (module_id, title, due_date) values (v_module, 'Trotzdem gespeichert', current_date + 5);
  perform ss_test.assert((select count(*) from public.homework where title = 'Trotzdem gespeichert') = 1, 'Hausaufgabe trotz Fehler gespeichert');
end $$;
