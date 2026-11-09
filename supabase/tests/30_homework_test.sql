-- =====================================================================
-- Verhaltenstests für Migration 005 (Hausaufgaben).
-- Läuft nach 20_push_focus_test.sql (nutzt ss_test.* und die Seed-Daten).
-- =====================================================================
\set ON_ERROR_STOP on

-- Vorher: Anzahl bestehender Lernplandaten merken (dürfen sich nicht ändern)
create temporary table ss_before as
  select (select count(*) from public.study_entries) as entries,
         (select count(*) from public.tasks) as tasks,
         (select count(*) from public.task_completions) as completions,
         (select count(*) from public.attachments) as attachments;
grant select on ss_before to anon;

begin;
set local role anon;

-- Anlegen: Hausaufgabe mit Unteraufgabe und zwei Arbeitseinheiten
insert into public.homework (id, module_id, title, due_date, earliest_start, priority, unit_count, changed_by)
values ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-000000000005', 'Übungsblatt 3', date '2026-12-10', date '2026-12-01', 3, 2,
        '11111111-1111-4111-8111-000000000001');
insert into public.homework_parts (id, homework_id, kind, title, planned_date, sort_order) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000001', 'subtask', 'Aufgabe 1 rechnen', null, 0),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 'unit', 'Einheit 1', date '2026-12-03', 1),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'aaaaaaaa-0000-4000-8000-000000000001', 'unit', 'Einheit 2', date '2026-12-08', 2);
select ss_test.assert((select count(*) from public.homework_parts where homework_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 3, 'Teile angelegt');

-- Prüfregeln
select ss_test.expect_error($$insert into public.homework (module_id, title, due_date) values ('22222222-2222-4222-8222-000000000005', '   ', date '2026-12-10')$$, 'homework_title_check');
select ss_test.expect_error($$insert into public.homework (module_id, title, due_date, earliest_start)
  values ('22222222-2222-4222-8222-000000000005', 'x', date '2026-12-10', date '2026-12-10')$$, 'homework_start_before_due');
select ss_test.expect_error($$insert into public.homework (module_id, title, due_date, priority) values ('22222222-2222-4222-8222-000000000005', 'x', date '2026-12-10', 7)$$, 'homework_priority_check');
select ss_test.expect_error($$insert into public.homework_parts (homework_id, kind, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'unit', 'ohne Datum')$$, 'homework_parts_unit_dated');
select ss_test.expect_error($$insert into public.homework_parts (homework_id, kind, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'quatsch', 'x')$$, 'homework_parts_kind_check');

-- Erledigt je Person: Hausaufgabe selbst und ein Teil
insert into public.homework_completions (target_id, homework_id, member_id, is_completed)
values ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', true),
       ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000002', true);
select ss_test.assert((select completed_at is not null from public.homework_completions
  where target_id = 'aaaaaaaa-0000-4000-8000-000000000012' and member_id = '11111111-1111-4111-8111-000000000001'), 'completed_at serverseitig gesetzt');
-- Fremdes Ziel wird abgelehnt
select ss_test.expect_error($$insert into public.homework_completions (target_id, homework_id, member_id, is_completed)
  values ('22222222-2222-4222-8222-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', true)$$, 'Ziel gehört nicht');

-- Abgabetermin verschieben + Einheit umplanen: Erledigungen bleiben erhalten
update public.homework set due_date = date '2026-12-14' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.homework_parts set planned_date = date '2026-12-12' where id = 'aaaaaaaa-0000-4000-8000-000000000013';
select ss_test.assert((select version from public.homework where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 2, 'Version erhöht');
select ss_test.assert((select count(*) from public.homework_completions where homework_id = 'aaaaaaaa-0000-4000-8000-000000000001' and is_completed) = 2, 'Erledigungen bleiben nach Terminänderung erhalten');

-- Teile können nicht in eine andere Hausaufgabe wandern
select ss_test.expect_error($$update public.homework_parts set homework_id = gen_random_uuid() where id = 'aaaaaaaa-0000-4000-8000-000000000011'$$, 'unveränderlich');
-- Kein echtes Löschen, nur Papierkorb
select ss_test.expect_error($$delete from public.homework where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'permission denied');
select ss_test.expect_error($$delete from public.homework_parts$$, 'permission denied');
select ss_test.expect_error($$update public.homework set version = 99$$, 'permission denied');
update public.homework set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.homework set deleted_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Anhänge an Hausaufgaben sind erlaubt
insert into public.attachments (id, module_id, target_type, target_id, storage_path, original_filename, mime_type, file_size)
values ('aaaaaaaa-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-000000000005', 'homework', 'aaaaaaaa-0000-4000-8000-000000000001',
        'hausaufgaben/test/blatt.pdf', 'blatt.pdf', 'application/pdf', 1000);
select ss_test.expect_error($$insert into public.attachments (module_id, target_type, target_id, storage_path, original_filename, mime_type, file_size)
  values (null, 'homework', gen_random_uuid(), 'hausaufgaben/test/x.pdf', 'x.pdf', 'application/pdf', 10)$$, 'Bezugsobjekt');
commit;

-- Änderungsverlauf protokolliert Hausaufgaben
select ss_test.assert((select count(*) from public.activity_log where entity_type = 'homework') >= 2, 'Verlauf enthält Hausaufgaben');

-- Bestehende Lernplandaten unverändert (bis auf den einen neuen Anhang)
select ss_test.assert((select count(*) from public.study_entries) = (select entries from ss_before), 'Lerntage unverändert');
select ss_test.assert((select count(*) from public.tasks) = (select tasks from ss_before), 'Aufgaben unverändert');
select ss_test.assert((select count(*) from public.task_completions) = (select completions from ss_before), 'Erledigungen unverändert');
select ss_test.assert((select count(*) from public.attachments) = (select attachments from ss_before) + 1, 'Anhänge nur ergänzt');

\echo 'HAUSAUFGABEN-TESTS BESTANDEN'
