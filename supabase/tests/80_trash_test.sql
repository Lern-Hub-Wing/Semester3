-- =====================================================================
-- Migration 011: Papierkorb leert sich nach 7 Tagen (mit Schonfrist)
-- =====================================================================
\set ON_ERROR_STOP on

begin;
-- Testdaten: ein alter (10 Tage) und ein frischer (2 Tage) gelöschter Lerntag, je mit Aufgabe + Haken
insert into public.study_entries (id, module_id, study_date, title, deleted_at) values
  ('a7a50000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-000000000001', '2026-11-01', 'Alt gelöscht', now() - interval '10 days'),
  ('a7a50000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-000000000001', '2026-11-02', 'Frisch gelöscht', now() - interval '2 days'),
  ('a7a50000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-000000000001', '2026-11-03', 'Aktiv', null);
insert into public.tasks (id, study_entry_id, title, sort_order, deleted_at) values
  ('a7a50000-0000-4000-8001-000000000001', 'a7a50000-0000-4000-8000-000000000001', 'Aufgabe alt', 1, null),
  ('a7a50000-0000-4000-8001-000000000002', 'a7a50000-0000-4000-8000-000000000002', 'Aufgabe frisch', 1, null),
  ('a7a50000-0000-4000-8001-000000000003', 'a7a50000-0000-4000-8000-000000000003', 'Einzeln alt gelöscht', 1, now() - interval '9 days'),
  ('a7a50000-0000-4000-8001-000000000004', 'a7a50000-0000-4000-8000-000000000003', 'Bleibt', 2, null);
insert into public.task_completions (task_id, member_id, is_completed) values
  ('a7a50000-0000-4000-8001-000000000001', '11111111-1111-4111-8111-000000000001', true),
  ('a7a50000-0000-4000-8001-000000000003', '11111111-1111-4111-8111-000000000001', true);
insert into public.homework (id, module_id, title, due_date, deleted_at) values
  ('a7a50000-0000-4000-8002-000000000001', '22222222-2222-4222-8222-000000000001', 'HA alt', '2026-11-10', now() - interval '8 days');
insert into public.homework_parts (id, homework_id, kind, title, sort_order) values
  ('a7a50000-0000-4000-8003-000000000001', 'a7a50000-0000-4000-8002-000000000001', 'subtask', 'Teil', 1);
insert into public.homework_completions (target_id, homework_id, member_id, is_completed) values
  ('a7a50000-0000-4000-8002-000000000001', 'a7a50000-0000-4000-8002-000000000001', '11111111-1111-4111-8111-000000000001', true);
update public.modules set archived_at = now() - interval '60 days' where id = '22222222-2222-4222-8222-000000000006';

-- 1) Schonfrist: Regel gerade eingeführt → nichts wird gelöscht (auch Altes nicht)
update public.ss_trash_policy set since = now();
set local role anon;
select ss_test.assert(public.ss_purge_trash() = 0, 'Schonfrist: direkt nach Einführung wird nichts gelöscht');
reset role;
select ss_test.assert(exists (select 1 from public.study_entries where id = 'a7a50000-0000-4000-8000-000000000001'), 'Schonfrist: alter Lerntag noch da');

-- 2) Nach Ablauf der Schonfrist: nur was älter als 7 Tage ist, verschwindet endgültig
update public.ss_trash_policy set since = now() - interval '8 days';
set local role anon;
select ss_test.assert(public.ss_purge_trash() > 0, 'Papierkorb wird geleert (auch ohne Anmeldung anstoßbar)');
reset role;
select ss_test.assert(not exists (select 1 from public.study_entries where id = 'a7a50000-0000-4000-8000-000000000001'), 'alter Lerntag endgültig gelöscht');
select ss_test.assert(not exists (select 1 from public.tasks where id = 'a7a50000-0000-4000-8001-000000000001'), 'Aufgaben des alten Lerntags mit gelöscht');
select ss_test.assert(not exists (select 1 from public.tasks where id = 'a7a50000-0000-4000-8001-000000000003'), 'einzeln gelöschte alte Aufgabe gelöscht');
select ss_test.assert(not exists (select 1 from public.task_completions where task_id in ('a7a50000-0000-4000-8001-000000000001', 'a7a50000-0000-4000-8001-000000000003')), 'Haken der gelöschten Aufgaben mit entfernt');
select ss_test.assert(not exists (select 1 from public.homework where id = 'a7a50000-0000-4000-8002-000000000001'), 'alte Hausaufgabe samt Teilen gelöscht');
select ss_test.assert(exists (select 1 from public.study_entries where id = 'a7a50000-0000-4000-8000-000000000002'), 'frisch gelöschter Lerntag bleibt (noch wiederherstellbar)');
select ss_test.assert(exists (select 1 from public.tasks where id = 'a7a50000-0000-4000-8001-000000000004'), 'aktive Aufgabe bleibt');
select ss_test.assert(exists (select 1 from public.modules where id = '22222222-2222-4222-8222-000000000006'), 'archivierte Fächer werden nie automatisch gelöscht');
-- Direktes Löschen bleibt für die Seite gesperrt
set local role anon;
select ss_test.expect_error('delete from public.study_entries where id = ''a7a50000-0000-4000-8000-000000000002''', 'permission denied');
reset role;
rollback;
