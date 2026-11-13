-- push_setup.sql: Platzhalter → kein Aufruf; mit Werten → genau ein Aufruf je Speichern; Cron-Job angelegt
\set ON_ERROR_STOP on
do $$
declare v_group uuid; v_module uuid; v_member uuid;
begin
  perform ss_test.assert((select count(*) from cron.job where jobname = 'studyspace-app-push') = 1, 'Cron-Job angelegt');
  perform app.push_kick();
  perform ss_test.assert((select count(*) from net.calls) = 0, 'Platzhalter: kein Aufruf');
  update vault.secrets set secret = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/app-push' where name = 'app_push_url';
  update vault.secrets set secret = 'x-secret-for-tests-only-0123456789' where name = 'app_push_secret';

  select g.id, gm.member_id into v_group, v_member from public.groups g join public.group_members gm on gm.group_id = g.id where gm.left_at is null limit 1;
  select id into v_module from public.modules where group_id = v_group limit 1;
  if v_module is null then
    insert into public.modules (name, group_id, changed_by) values ('Push-Test', v_group, v_member) returning id into v_module;
  end if;
  insert into public.homework (module_id, title, due_date, group_id, changed_by) values (v_module, 'Blatt 1', current_date + 3, v_group, v_member), (v_module, 'Blatt 2', current_date + 4, v_group, v_member);
  perform ss_test.assert((select count(*) from net.calls) = 1, 'ein Aufruf je Speichervorgang');
  perform ss_test.assert((select headers ->> 'x-dispatch-secret' from net.calls limit 1) = 'x-secret-for-tests-only-0123456789', 'Secret im Header');
  perform ss_test.assert((select body ->> 'action' from net.calls limit 1) = 'dispatch', 'Aktion dispatch');
end $$;
