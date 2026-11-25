-- =====================================================================
-- 0007: Umzug von der Seite, Codes, Rechtliches, „Wer schreibt?“ (RLS)
-- =====================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('61000000-0000-4000-8000-000000000001', 'luk@example.com'),
  ('61000000-0000-4000-8000-000000000002', 'mathis@example.com'),
  ('61000000-0000-4000-8000-000000000003', 'code@example.com');

-- Umzugsdatei wie von der Seite (gekürzt): 2 Personen, Chemie nur für Luk, Mathe für alle
create temp table move_file as select $json${
  "format": "studyspace-umzug", "version": 1,
  "tables": {
    "members": [
      {"id": "11111111-1111-4111-8111-0000000000a1", "name": "Luk", "color": "#AFC5F5", "sort_order": 1, "is_active": true},
      {"id": "11111111-1111-4111-8111-0000000000a3", "name": "Mathis", "color": "#AADCCB", "sort_order": 2, "is_active": true}
    ],
    "modules": [
      {"id": "22222222-2222-4222-8222-0000000000c1", "name": "Chemie", "color": "#F2B8A2", "sort_order": 1, "participants": ["11111111-1111-4111-8111-0000000000a1"]},
      {"id": "22222222-2222-4222-8222-0000000000c2", "name": "Mathe", "color": "#AFC5F5", "sort_order": 2, "participants": null}
    ],
    "module_topics": [],
    "exams": [{"id": "44444444-4444-4444-8444-0000000000e1", "module_id": "22222222-2222-4222-8222-0000000000c1", "starts_at": "2027-01-15T07:30:00Z", "ends_at": "2027-01-15T10:00:00Z", "timezone": "Europe/Berlin"}],
    "study_entries": [
      {"id": "55555555-5555-4555-8555-0000000000d1", "module_id": "22222222-2222-4222-8222-0000000000c1", "study_date": "2026-11-24", "title": "Theorie Atombau", "sort_order": 1},
      {"id": "55555555-5555-4555-8555-0000000000d2", "module_id": "22222222-2222-4222-8222-0000000000c2", "study_date": "2026-11-24", "title": "Analysis", "sort_order": 1}
    ],
    "tasks": [
      {"id": "66666666-6666-4666-8666-0000000000f1", "study_entry_id": "55555555-5555-4555-8555-0000000000d1", "title": "Atombau lernen", "sort_order": 1},
      {"id": "66666666-6666-4666-8666-0000000000f2", "study_entry_id": "55555555-5555-4555-8555-0000000000d2", "title": "Blatt 1", "sort_order": 1}
    ],
    "task_completions": [{"task_id": "66666666-6666-4666-8666-0000000000f2", "member_id": "11111111-1111-4111-8111-0000000000a3", "is_completed": true}],
    "homework": [{"id": "77777777-7777-4777-8777-0000000000b1", "module_id": "22222222-2222-4222-8222-0000000000c2", "title": "Blatt 2", "due_date": "2026-12-01", "priority": 2}],
    "homework_parts": [], "homework_completions": [],
    "focus_sessions": [{"id": "88888888-8888-4888-8888-000000000001", "member_id": "11111111-1111-4111-8111-0000000000a3", "module_id": "22222222-2222-4222-8222-0000000000c2", "started_at": "2026-11-20T10:00:00Z", "ended_at": "2026-11-20T10:30:00Z", "duration_seconds": 1800}],
    "music_tracks": [],
    "app_settings": [{"key": "app_name", "value": "Semester 3"}, {"key": "moved_to_app", "value": {"url": "x"}}],
    "attachments": [{"id": "99999999-9999-4999-8999-000000000001"}]
  }
}$json$::jsonb as data;
grant select on move_file to authenticated;

-- 1. Nur Admins (mit Zwei-Faktor) dürfen übernehmen
do $$
begin
  perform ss_test.login('61000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.expect_error('select public.admin_import_site((select data from move_file), ''luk@example.com'', ''11111111-1111-4111-8111-0000000000a1'', ''Semester 3'')', 'Administrator');
  reset role;
end $$;

-- 2. Übernahme: alles in eine neue Gruppe, Rohdatei gesichert, kein zweites Mal
do $$
declare res jsonb; gid uuid;
begin
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  perform ss_test.expect_error('select public.admin_import_site((select data from move_file), ''niemand@example.com'', ''11111111-1111-4111-8111-0000000000a1'', ''Semester 3'')', 'Kein App-Konto');
  res := public.admin_import_site((select data from move_file), 'LUK@example.com', '11111111-1111-4111-8111-0000000000a1', 'Semester 3');
  gid := (res ->> 'group_id')::uuid;
  perform ss_test.assert((res -> 'counts' ->> 'members')::int = 2 and (res -> 'counts' ->> 'tasks')::int = 2 and (res -> 'counts' ->> 'homework')::int = 1 and (res -> 'counts' ->> 'focus_sessions')::int = 1, 'alle Daten übernommen');
  perform ss_test.assert((res -> 'counts' ->> 'app_settings')::int = 1, 'nur bekannte Einstellungen (ohne „umgezogen“)');
  perform ss_test.assert((res ->> 'attachments_skipped')::int = 1, 'Dateien werden gezählt, aber nicht übernommen');
  perform ss_test.assert(res ->> 'invite_code' ~ '^[A-HJ-NP-Z2-9]{8}$', 'Einladungscode erzeugt');
  perform ss_test.expect_error('select public.admin_import_site((select data from move_file), ''luk@example.com'', ''11111111-1111-4111-8111-0000000000a1'', ''Semester 3'')', 'bereits übernommen');
  reset role;
  perform ss_test.assert((select count(*) from public.site_imports where group_id = gid) = 1, 'Rohdatei als Sicherheitskopie gespeichert');
  perform ss_test.assert((select count(*) from public.activity_log where group_id = gid) = 1, 'Verlauf: nur ein Hinweis statt hunderter Einträge');
  perform ss_test.assert(app.group_has_plus(gid), 'Gruppenpass ohne Ablauf');
end $$;

-- 3. Luk (Inhaber) sieht alles, auch Chemie
do $$
begin
  perform ss_test.login('61000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.modules) = 2, 'Luk sieht beide Fächer');
  perform ss_test.assert((select count(*) from public.tasks) = 2 and (select count(*) from public.exams) = 1, 'Luk sieht Chemie-Aufgaben und -Prüfung');
  perform ss_test.assert((public.app_me() ->> 'member_id')::uuid = '11111111-1111-4111-8111-0000000000a1', 'Luk ist mit seiner Person verbunden');
  reset role;
end $$;

-- 4. Mathis tritt per Code bei, wählt „Wer bist du?“ und sieht Chemie NICHT
do $$
declare code text := (select g.invite_code from public.groups g join public.site_imports s on s.group_id = g.id limit 1);
declare res jsonb; mine uuid;
begin
  perform ss_test.login('61000000-0000-4000-8000-000000000002');
  set local role authenticated;
  res := public.app_redeem_code(lower(left(code, 4)) || ' ' || right(code, 4));
  perform ss_test.assert(res ->> 'kind' = 'group' and (res ->> 'claimable')::int = 1, 'Beitritt per Code (Leerzeichen/Kleinschreibung egal), eine Person wählbar');
  perform ss_test.assert(jsonb_array_length(public.app_claimable_members()) = 1 and public.app_claimable_members() -> 0 ->> 'name' = 'Mathis', '„Wer bist du?“ zeigt Mathis');
  mine := (public.app_me() ->> 'member_id')::uuid;
  perform public.app_claim_member('11111111-1111-4111-8111-0000000000a3');
  perform ss_test.assert((public.app_me() ->> 'member_id')::uuid = '11111111-1111-4111-8111-0000000000a3', 'mit alter Person verbunden');
  perform ss_test.assert((select count(*) from public.task_completions where member_id = '11111111-1111-4111-8111-0000000000a3') = 1, 'alte Haken bleiben');
  perform ss_test.assert((select count(*) from public.focus_sessions where member_id = '11111111-1111-4111-8111-0000000000a3') = 1, 'alte Lernzeit bleibt');
  perform ss_test.assert(not exists (select 1 from public.members where id = mine), 'vorläufiges Profil entfernt');
  perform ss_test.expect_error('select public.app_claim_member(''11111111-1111-4111-8111-0000000000a1'')', 'schon mit einem Konto');
  -- Wer schreibt? Chemie ist für Mathis unsichtbar – serverseitig
  perform ss_test.assert((select count(*) from public.modules) = 1 and (select name from public.modules) = 'Mathe', 'Mathis sieht nur Mathe');
  perform ss_test.assert((select count(*) from public.exams) = 0, 'Chemie-Prüfung unsichtbar');
  perform ss_test.assert((select count(*) from public.study_entries) = 1 and (select count(*) from public.tasks) = 1, 'Chemie-Lernplan unsichtbar');
  perform ss_test.assert(not exists (select 1 from public.activity_log where entity_type = 'tasks' and entity_id = '66666666-6666-4666-8666-0000000000f1'), 'kein Verlauf zu Chemie');
  update public.study_entries set title = 'manipuliert' where id = '55555555-5555-4555-8555-0000000000d1';
  reset role;
  perform ss_test.assert((select title from public.study_entries where id = '55555555-5555-4555-8555-0000000000d1') = 'Theorie Atombau', 'Mathis kann Chemie auch nicht ändern');
end $$;

-- 5. Tarif-Codes: Admin erstellt, Nutzer löst ein (einmal pro Konto, begrenzt), Fehlversuche begrenzt
do $$
declare c public.promo_codes; res jsonb; i int;
begin
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  select * into c from public.admin_create_codes('plus_grant', 30, 1, 1, null, 'Für Mathis');
  perform ss_test.assert(c.code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'Code im Format XXXX-XXXX');
  perform ss_test.assert(jsonb_array_length(public.admin_codes()) >= 1, 'Admin sieht Codes');
  reset role;
  perform ss_test.login('61000000-0000-4000-8000-000000000003');
  set local role authenticated;
  res := public.app_redeem_code(c.code);
  perform ss_test.assert(res ->> 'kind' = 'plan' and res ->> 'plan' = 'plus_grant', 'Tarif-Code eingelöst');
  perform ss_test.assert(public.app_me() ->> 'level' = 'group', 'Gruppenpass aktiv');
  perform ss_test.assert(public.app_redeem_code(c.code) ->> 'kind' = 'invalid', 'Code nur einmal einlösbar');
  perform ss_test.assert(public.app_redeem_code('ABC') ->> 'message' like 'Code ungültig%', 'falsches Format');
  for i in 1..8 loop
    perform public.app_redeem_code('ZZZZ-ZZZZ');
  end loop;
  perform ss_test.expect_error('select public.app_redeem_code(''ZZZZ-ZZZZ'')', 'Zu viele Versuche');
  reset role;
  perform ss_test.assert((select source from public.entitlements where note = 'Code ' || c.code) = 'code', 'Quelle „code“, kein Umsatz');
end $$;

-- 6. Rechtliches: Zustimmung mit Fassung; Impressum nur vom Admin, öffentlich lesbar
do $$
begin
  perform ss_test.login('61000000-0000-4000-8000-000000000003');
  set local role authenticated;
  perform ss_test.assert(public.app_me() ->> 'terms_version' is null, 'noch nicht zugestimmt');
  perform public.app_accept_terms('2026-11-25');
  perform ss_test.assert(public.app_me() ->> 'terms_version' = '2026-11-25', 'Zustimmung gespeichert');
  perform ss_test.expect_error('select public.admin_set_config(''legal_imprint'', ''{"name":"X"}'')', 'Administrator');
  reset role;
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  perform ss_test.expect_error('select public.admin_set_config(''legal_imprint'', ''{"name":"Test"}'')', 'Pflicht');
  perform public.admin_set_config('legal_imprint', '{"name":"Test Betreiber","street":"Musterweg 1","city":"12345 Musterstadt","email":"kontakt@example.com"}');
  reset role;
  set local role anon;
  perform ss_test.assert(public.app_legal_info() -> 'imprint' ->> 'name' = 'Test Betreiber', 'Impressum auch ohne Anmeldung lesbar');
  reset role;
end $$;
