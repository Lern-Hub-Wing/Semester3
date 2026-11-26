-- =====================================================================
-- 0009: Persönliche Umzugs-Codes (Person + Fortschritt + Lifetime),
--       Lifetime-Kauf, Admin-Rechte für normale Konten
-- =====================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('71000000-0000-4000-8000-000000000001', 'luk2@example.com'),
  ('71000000-0000-4000-8000-000000000002', 'diana@example.com'),
  ('71000000-0000-4000-8000-000000000003', 'amina@example.com'),
  ('71000000-0000-4000-8000-000000000004', 'kaeufer@example.com');

create temp table move_file2 as select $json${
  "format": "studyspace-umzug", "version": 1,
  "tables": {
    "members": [
      {"id": "11111111-1111-4111-8111-0000000000b1", "name": "Luk", "color": "#AFC5F5", "sort_order": 1, "is_active": true},
      {"id": "11111111-1111-4111-8111-0000000000b2", "name": "Diana", "color": "#CBB8F5", "sort_order": 2, "is_active": true},
      {"id": "11111111-1111-4111-8111-0000000000b3", "name": "Amina", "color": "#AADCCB", "sort_order": 3, "is_active": true}
    ],
    "modules": [{"id": "22222222-2222-4222-8222-0000000000d1", "name": "Statik", "color": "#AFC5F5", "sort_order": 1, "participants": null}],
    "module_topics": [], "exams": [],
    "study_entries": [{"id": "55555555-5555-4555-8555-0000000000e1", "module_id": "22222222-2222-4222-8222-0000000000d1", "study_date": "2026-11-24", "title": "Kräfte", "sort_order": 1}],
    "tasks": [
      {"id": "66666666-6666-4666-8666-0000000000a1", "study_entry_id": "55555555-5555-4555-8555-0000000000e1", "title": "Blatt 1", "sort_order": 1},
      {"id": "66666666-6666-4666-8666-0000000000a2", "study_entry_id": "55555555-5555-4555-8555-0000000000e1", "title": "Blatt 2", "sort_order": 2}
    ],
    "task_completions": [
      {"task_id": "66666666-6666-4666-8666-0000000000a1", "member_id": "11111111-1111-4111-8111-0000000000b2", "is_completed": true},
      {"task_id": "66666666-6666-4666-8666-0000000000a2", "member_id": "11111111-1111-4111-8111-0000000000b2", "is_completed": true}
    ],
    "homework": [], "homework_parts": [], "homework_completions": [],
    "focus_sessions": [{"id": "88888888-8888-4888-8888-0000000000b2", "member_id": "11111111-1111-4111-8111-0000000000b2", "module_id": "22222222-2222-4222-8222-0000000000d1", "started_at": "2026-11-20T10:00:00Z", "ended_at": "2026-11-20T10:45:00Z", "duration_seconds": 2700}],
    "music_tracks": [], "app_settings": []
  }
}$json$::jsonb as data;
grant select on move_file2 to authenticated;
create temp table move_state (k text primary key, v text);
grant all on move_state to authenticated;

-- 1. Admin übernimmt und erzeugt je Person einen Code (Lifetime, Gruppe)
do $$
declare res jsonb; gid uuid; codes jsonb; people jsonb;
begin
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  res := public.admin_import_site((select data from move_file2), 'luk2@example.com', '11111111-1111-4111-8111-0000000000b1', 'Semester 3 Test');
  gid := (res ->> 'group_id')::uuid;
  people := public.admin_move_people(gid);
  perform ss_test.assert(jsonb_array_length(people -> 'people') = 3, 'drei Personen in der Umzugsliste');
  perform ss_test.assert((select (p ->> 'tasks_done')::int from jsonb_array_elements(people -> 'people') p where p ->> 'name' = 'Diana') = 2, 'Fortschritt je Person sichtbar');
  perform ss_test.expect_error(format('select public.admin_create_move_codes(%L, array[%L]::uuid[])', gid, '11111111-1111-4111-8111-0000000000b1'), 'schon mit einem Konto');
  codes := public.admin_create_move_codes(gid, array['11111111-1111-4111-8111-0000000000b2', '11111111-1111-4111-8111-0000000000b3']::uuid[], 'plus_grant', null, 'Danke fürs Testen!');
  perform ss_test.assert(jsonb_array_length(codes) = 2, 'je Person ein Code');
  -- erneut erzeugen ersetzt den offenen Code (alter wird gesperrt)
  codes := public.admin_create_move_codes(gid, array['11111111-1111-4111-8111-0000000000b2', '11111111-1111-4111-8111-0000000000b3']::uuid[], 'plus_grant', null, 'Danke fürs Testen!');
  perform ss_test.assert(jsonb_array_length(public.admin_move_groups()) >= 1, 'übernommene Gruppen auswählbar');
  reset role;
  perform ss_test.assert((select count(*) from public.promo_codes where member_id = '11111111-1111-4111-8111-0000000000b2' and revoked_at is null) = 1, 'nur ein offener Code je Person');
  insert into move_state values ('gid', gid::text),
    ('diana', (select c ->> 'code' from jsonb_array_elements(codes) c where c ->> 'name' = 'Diana')),
    ('amina', (select c ->> 'code' from jsonb_array_elements(codes) c where c ->> 'name' = 'Amina'));
end $$;

-- 2. Diana löst ihren Code ein: Gruppe + ihre Person mit Fortschritt + Lifetime
do $$
declare res jsonb; gid uuid := (select v::uuid from move_state where k = 'gid');
begin
  perform ss_test.login('71000000-0000-4000-8000-000000000002');
  set local role authenticated;
  res := public.app_redeem_code((select v from move_state where k = 'diana'), 'Diana');
  perform ss_test.assert(res ->> 'kind' = 'move' and res ->> 'member_name' = 'Diana' and res ->> 'group_name' = 'Semester 3 Test', 'Umzugs-Code: Willkommen als Diana in der Gruppe');
  perform ss_test.assert(res ->> 'ends_at' is null and res ->> 'plan' = 'plus_grant' and res ->> 'welcome' = 'Danke fürs Testen!', 'Lifetime-Zugang mit persönlicher Nachricht');
  perform ss_test.assert((res ->> 'tasks_done')::int = 2, 'ihr Fortschritt ist da (2 Haken)');
  perform ss_test.assert((public.app_me() ->> 'member_id')::uuid = '11111111-1111-4111-8111-0000000000b2', 'Konto ist mit „Diana“ verbunden');
  perform ss_test.assert((select count(*) from public.task_completions where member_id = '11111111-1111-4111-8111-0000000000b2' and is_completed) = 2, 'Haken sichtbar');
  perform ss_test.assert((select count(*) from public.focus_sessions where member_id = '11111111-1111-4111-8111-0000000000b2') = 1, 'Lernzeit übernommen');
  -- derselbe Code geht kein zweites Mal
  perform ss_test.assert(public.app_redeem_code((select v from move_state where k = 'diana')) ->> 'kind' = 'invalid', 'Code nur einmal gültig');
  reset role;
  perform ss_test.assert(app.user_level('71000000-0000-4000-8000-000000000002') = 'group', 'Diana hat Gruppen-Zugang');
  perform ss_test.assert(exists (select 1 from public.entitlements where user_id = '71000000-0000-4000-8000-000000000002' and ends_at is null and source = 'code'), 'ohne Ablauf (Lifetime), als Freischaltung – kein Umsatz');
  perform ss_test.assert((select count(*) from public.members where group_id = gid) = 3, 'keine doppelte Person angelegt');
end $$;

-- 3. Amina war schon per Einladungscode beigetreten – ihr Umzugs-Code verbindet trotzdem richtig
do $$
declare res jsonb; gid uuid := (select v::uuid from move_state where k = 'gid'); inv text;
begin
  select invite_code into inv from public.groups where id = gid;
  perform ss_test.login('71000000-0000-4000-8000-000000000003');
  set local role authenticated;
  perform public.app_join_group(inv, 'Amina neu');
  res := public.app_redeem_code((select v from move_state where k = 'amina'));
  perform ss_test.assert(res ->> 'kind' = 'move' and (public.app_me() ->> 'member_id')::uuid = '11111111-1111-4111-8111-0000000000b3', 'Amina mit ihrer bisherigen Person verbunden');
  reset role;
  perform ss_test.assert((select count(*) from public.members where group_id = gid) = 3, 'vorläufige Person wieder entfernt');
end $$;

-- 4. Lifetime kaufen (Beta) – kein zweites Mal
do $$
declare res jsonb;
begin
  perform ss_test.login('71000000-0000-4000-8000-000000000004');
  set local role authenticated;
  res := public.app_beta_purchase('solo_lifetime');
  perform ss_test.assert((res ->> 'lifetime')::boolean and res ->> 'ends_at' is null, 'Solo Lifetime ohne Ablauf');
  perform ss_test.expect_error('select public.app_beta_purchase(''solo_lifetime'')', 'bereits dauerhaften');
  res := public.app_beta_purchase('group_lifetime');
  perform ss_test.assert(res ->> 'ends_at' is null, 'Aufstieg auf Gruppe Lifetime möglich');
  perform ss_test.expect_error('select public.app_beta_purchase(''solo_lifetime'')', 'bereits dauerhaften');
  reset role;
  perform ss_test.assert(app.plan_price_cents('solo_lifetime') = 2999 and app.plan_price_cents('group_lifetime') = 5999, 'Lifetime-Preise');
  perform ss_test.assert(app.user_level('71000000-0000-4000-8000-000000000004') = 'group', 'Gruppe Lifetime = Gruppen-Stufe');
end $$;

-- 5. Admin-Rechte an ein normales Konto (nur mit Zwei-Faktor, nicht selbst entziehbar)
do $$
begin
  perform ss_test.login('71000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.expect_error('select public.admin_grant_admin(''luk2@example.com'')', 'Administrator');
  reset role;
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  perform public.admin_grant_admin('LUK2@example.com');
  perform public.admin_grant_admin('luk2@example.com');
  perform ss_test.expect_error('select public.admin_grant_admin(''niemand@example.com'')', 'Kein App-Konto');
  perform ss_test.expect_error('select public.admin_revoke_admin(''ad000000-0000-4000-8000-0000000000ad'')', 'eigenen Admin-Rechte');
  reset role;
  perform ss_test.assert(exists (select 1 from public.admins where user_id = '71000000-0000-4000-8000-000000000001'), 'Luks App-Konto ist Admin');
  -- Ohne Zwei-Faktor bleibt der Admin-Bereich zu
  perform ss_test.login('71000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.assert(not (public.admin_whoami() ->> 'ok')::boolean and (public.admin_whoami() ->> 'is_admin')::boolean, 'Admin, aber erst nach Zwei-Faktor freigeschaltet');
  reset role;
end $$;
