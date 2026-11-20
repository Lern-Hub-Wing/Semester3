-- KI-Lernplan: Berechtigung, Tageslimit, Tabelle gesperrt
\set ON_ERROR_STOP on
do $$
declare v_uid uuid := 'a1000000-0000-4000-8000-000000000001'; v_gid uuid; r jsonb; i int;
begin
  insert into auth.users (id, email) values (v_uid, 'ki@example.com');
  r := public.app_ai_plan_check(v_uid);
  perform ss_test.assert(r ->> 'reason' = 'no_group', 'ohne Gruppe nicht erlaubt: ' || r::text);

  -- Testphase starten → Solo-Lernbereich mit Zugang
  perform ss_test.login(v_uid);
  set local role authenticated;
  perform public.app_start_trial();
  reset role;
  r := public.app_ai_plan_check(v_uid);
  perform ss_test.assert((r ->> 'allowed')::boolean, 'Testphase darf KI-Plan: ' || r::text);
  v_gid := (r ->> 'group_id')::uuid;

  for i in 1..5 loop insert into public.ai_usage (user_id, group_id, model) values (v_uid, v_gid, 'claude-opus-5-5'); end loop;
  r := public.app_ai_plan_check(v_uid);
  perform ss_test.assert(r ->> 'reason' = 'limit', 'Tageslimit greift: ' || r::text);
  -- fehlgeschlagene Versuche zählen nicht
  delete from public.ai_usage where user_id = v_uid and id = (select max(id) from public.ai_usage where user_id = v_uid);
  insert into public.ai_usage (user_id, group_id, model, ok) values (v_uid, v_gid, 'claude-opus-5-5', false);
  perform ss_test.assert((public.app_ai_plan_check(v_uid) ->> 'allowed')::boolean, 'Fehlversuch zählt nicht');

  update public.app_config set value = '0'::jsonb where key = 'ai_plans_per_day';
  perform ss_test.assert(public.app_ai_plan_check(v_uid) ->> 'reason' = 'disabled', 'abschaltbar');
  update public.app_config set value = '5'::jsonb where key = 'ai_plans_per_day';

  perform ss_test.login(v_uid);
  set local role authenticated;
  perform ss_test.expect_error('select * from public.ai_usage', 'permission denied');
  perform ss_test.expect_error('select public.app_ai_plan_check(''a1000000-0000-4000-8000-000000000001'')', 'permission denied');
  perform ss_test.expect_error('select public.admin_ai_usage()', 'Administratoren');
  reset role;
end $$;
