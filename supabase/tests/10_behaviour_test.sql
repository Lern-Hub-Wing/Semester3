-- =====================================================================
-- Verhaltenstests für Schema, Trigger und Rechte.
-- Läuft gegen eine Test-Datenbank (scripts/test-db.sh). Jeder fehl-
-- geschlagene Test bricht mit einer Exception ab.
-- =====================================================================
\set ON_ERROR_STOP on

create schema if not exists ss_test;
grant usage on schema ss_test to anon;

-- Führt SQL aus und erwartet einen Fehler, dessen Text das Muster enthält.
create or replace function ss_test.expect_error(sql text, pattern text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then
      return;
    end if;
    raise exception 'Falscher Fehler für [%]: % (erwartet: %)', sql, sqlerrm, pattern;
  end;
  raise exception 'Kein Fehler für [%] (erwartet: %)', sql, pattern;
end $$;
grant execute on function ss_test.expect_error(text, text) to anon;

create or replace function ss_test.assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'Test fehlgeschlagen: %', msg;
  end if;
end $$;
grant execute on function ss_test.assert(boolean, text) to anon;

-- ---------------------------------------------------------------------
-- Test 1: Seed-Daten und Zeitzone
-- ---------------------------------------------------------------------
begin;
set local role anon;
select ss_test.assert((select count(*) from public.members) = 4, 'vier Personen');
select ss_test.assert((select count(*) from public.modules) = 6, 'sechs Module');
select ss_test.assert((select count(*) from public.exams) = 6, 'sechs Prüfungen');
-- 06.01.2027 14:00 Berlin (MEZ, UTC+1) = 13:00 UTC
select ss_test.assert(
  (select starts_at from public.exams where id = '44444444-4444-4444-8444-000000000001') = timestamptz '2027-01-06 13:00:00+00',
  'Werkstoffkunde beginnt 13:00 UTC');
select ss_test.assert(
  (select ends_at - starts_at from public.exams where id = '44444444-4444-4444-8444-000000000002') = interval '90 minutes',
  'Prüfungsdauer 90 Minuten');
commit;

-- ---------------------------------------------------------------------
-- Test 2: Lerntag + Aufgaben anlegen, Haken setzen (wie PostgREST-Upsert)
-- ---------------------------------------------------------------------
begin;
set local role anon;
insert into public.study_entries (id, module_id, study_date, title, changed_by)
values ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-000000000005', '2026-12-10',
        'Kostenstellenrechnung', '11111111-1111-4111-8111-000000000001');
insert into public.tasks (id, study_entry_id, title, sort_order, changed_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Anbauverfahren verstehen', 1, '11111111-1111-4111-8111-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Stufenleiterverfahren verstehen', 2, '11111111-1111-4111-8111-000000000001');

insert into public.task_completions (task_id, member_id, is_completed, changed_by)
values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', true, '11111111-1111-4111-8111-000000000001')
on conflict (task_id, member_id) do update set
  task_id = excluded.task_id, member_id = excluded.member_id,
  is_completed = excluded.is_completed, changed_by = excluded.changed_by;

select ss_test.assert((select is_completed and completed_at is not null and version = 1
  from public.task_completions where task_id = 'bbbbbbbb-0000-4000-8000-000000000001'
  and member_id = '11111111-1111-4111-8111-000000000001'), 'Haken Person 1 gesetzt');
select ss_test.assert(not exists (select 1 from public.task_completions
  where task_id = 'bbbbbbbb-0000-4000-8000-000000000001' and member_id = '11111111-1111-4111-8111-000000000002'),
  'Person 2 hat keinen Haken');

-- Erneutes Setzen auf true behält completed_at und erhöht die Version.
create temp table t_before as select completed_at from public.task_completions
  where task_id = 'bbbbbbbb-0000-4000-8000-000000000001' and member_id = '11111111-1111-4111-8111-000000000001';
insert into public.task_completions (task_id, member_id, is_completed, changed_by)
values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', true, '11111111-1111-4111-8111-000000000001')
on conflict (task_id, member_id) do update set
  task_id = excluded.task_id, member_id = excluded.member_id,
  is_completed = excluded.is_completed, changed_by = excluded.changed_by;
select ss_test.assert((select c.version = 2 and c.completed_at = b.completed_at
  from public.task_completions c, t_before b
  where c.task_id = 'bbbbbbbb-0000-4000-8000-000000000001' and c.member_id = '11111111-1111-4111-8111-000000000001'),
  'completed_at bleibt erhalten, version steigt');
commit;

-- ---------------------------------------------------------------------
-- Test 3 (D/E): Titel ändern und Datum verschieben behält Haken
-- ---------------------------------------------------------------------
begin;
set local role anon;
update public.tasks set title = 'Anbauverfahren sicher beherrschen' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
update public.study_entries set study_date = '2026-12-12' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select ss_test.assert((select count(*) from public.task_completions
  where task_id = 'bbbbbbbb-0000-4000-8000-000000000001' and is_completed) = 1, 'Haken nach Bearbeitung erhalten');
select ss_test.assert((select version from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 2, 'Task-Version 2');
select ss_test.assert(exists (select 1 from public.activity_log
  where entity_id = 'aaaaaaaa-0000-4000-8000-000000000001' and action = 'moved'), 'Verschieben protokolliert');
commit;

-- ---------------------------------------------------------------------
-- Test 4 (K): Papierkorb – Soft Delete und Wiederherstellung
-- ---------------------------------------------------------------------
begin;
set local role anon;
update public.tasks set deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000001';
update public.tasks set deleted_at = null where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select ss_test.assert((select count(*) from public.task_completions
  where task_id = 'bbbbbbbb-0000-4000-8000-000000000001' and is_completed) = 1, 'Haken nach Wiederherstellung erhalten');
select ss_test.assert((select count(*) from public.activity_log
  where entity_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action in ('archived', 'restored')) = 2,
  'Archivieren und Wiederherstellen protokolliert');
commit;

-- ---------------------------------------------------------------------
-- Test 5: Verbotene Operationen für die öffentliche Rolle
-- ---------------------------------------------------------------------
begin;
set local role anon;
select ss_test.expect_error($$delete from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, 'permission denied');
select ss_test.expect_error($$delete from public.task_completions$$, 'permission denied');
select ss_test.expect_error($$delete from public.members$$, 'permission denied');
select ss_test.expect_error($$update public.tasks set version = 99$$, 'permission denied');
select ss_test.expect_error($$update public.tasks set created_at = now()$$, 'permission denied');
select ss_test.expect_error($$update public.task_completions set completed_at = now()$$, 'permission denied');
select ss_test.expect_error($$insert into public.activity_log (entity_type, entity_id, action) values ('x', 'y', 'z')$$, 'permission denied');
select ss_test.expect_error($$update public.attachments set storage_path = 'x'$$, 'permission denied');
select ss_test.expect_error($$truncate public.tasks$$, 'permission denied');
select ss_test.expect_error($$update public.tasks set id = gen_random_uuid() where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$, 'unveränderlich');
commit;

-- ---------------------------------------------------------------------
-- Test 6: Validierung
-- ---------------------------------------------------------------------
begin;
set local role anon;
select ss_test.expect_error($$insert into public.members (name, color) values ('X', 'red')$$, 'check');
select ss_test.expect_error($$insert into public.members (name, color) values ('   ', '#AABBCC')$$, 'check');
select ss_test.expect_error($$insert into public.tasks (study_entry_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001', repeat('x', 201))$$, 'check');
select ss_test.expect_error($$insert into public.study_entries (module_id, topic_id, study_date, title)
  values ('22222222-2222-4222-8222-000000000001', '33333333-3333-4333-8333-000000000021', '2026-12-01', 'Falsch')$$, 'Thema');
select ss_test.expect_error($$insert into public.exams (module_id, starts_at, ends_at)
  values ('22222222-2222-4222-8222-000000000001', now(), now() - interval '1 hour')$$, 'check');
select ss_test.expect_error($$insert into public.attachments (module_id, target_type, target_id, storage_path, original_filename, mime_type, file_size)
  values (null, 'task', gen_random_uuid(), 'a/b.pdf', 'b.pdf', 'application/pdf', 10)$$, 'Bezugsobjekt');
select ss_test.expect_error($$insert into public.attachments (module_id, target_type, target_id, storage_path, original_filename, mime_type, file_size)
  values (null, 'module', '22222222-2222-4222-8222-000000000001', 'a/b.exe', 'b.exe', 'application/x-msdownload', 10)$$, 'check');
commit;

-- ---------------------------------------------------------------------
-- Test 7 (F): Neue Person + Deaktivieren
-- ---------------------------------------------------------------------
begin;
set local role anon;
insert into public.members (id, name, color, sort_order) values ('11111111-1111-4111-8111-000000000005', 'Person 5', '#F2D4E6', 5);
select ss_test.assert((select count(*) from public.task_completions where is_completed) = 1, 'Haken anderer bleiben bestehen');
update public.members set is_active = false where id <> '11111111-1111-4111-8111-000000000001';
select ss_test.expect_error($$update public.members set is_active = false$$, 'aktiv');
update public.members set is_active = true;
commit;

-- ---------------------------------------------------------------------
-- Test 8: Löschen über die Datenbank kaskadiert nicht
-- ---------------------------------------------------------------------
begin;
select ss_test.expect_error($$delete from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, 'foreign key');
select ss_test.expect_error($$delete from public.members where id = '11111111-1111-4111-8111-000000000001'$$, 'foreign key');
rollback;

-- ---------------------------------------------------------------------
-- Test 9: Storage-Regeln
-- ---------------------------------------------------------------------
begin;
set local role anon;
insert into storage.objects (bucket_id, name) values ('materials', 'mod/123/zettel.pdf');
insert into storage.objects (bucket_id, name) values ('materials', 'mod/123/bild.JPG');
select ss_test.expect_error($$insert into storage.objects (bucket_id, name) values ('materials', 'mod/123/virus.exe')$$, 'row-level security');
select ss_test.expect_error($$insert into storage.objects (bucket_id, name) values ('other', 'x.pdf')$$, 'row-level security');
rollback;

-- Delete ohne Policy löscht 0 Zeilen statt zu scheitern – explizit prüfen:
begin;
insert into storage.objects (bucket_id, name) values ('materials', 'keep/me.pdf');
set local role anon;
delete from storage.objects;
reset role;
select ss_test.assert((select count(*) from storage.objects where name = 'keep/me.pdf') = 1, 'Storage-Datei nicht löschbar');
rollback;

begin;
select ss_test.assert((select file_size_limit from storage.buckets where id = 'materials') = 10485760, 'Upload-Limit 10 MB');
select ss_test.assert((select allowed_mime_types from storage.buckets where id = 'materials')
  = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], 'erlaubte Dateitypen');
commit;

-- ---------------------------------------------------------------------
-- Test 10: Änderungsverlauf enthält das (nicht verifizierte) Profil
-- ---------------------------------------------------------------------
begin;
set local role anon;
select ss_test.assert(exists (select 1 from public.activity_log
  where action = 'completed' and actor_label = 'Person 1'), 'Erledigung mit Profilname protokolliert');
select ss_test.assert(not exists (select 1 from public.activity_log
  where entity_type = 'tasks' and action = 'updated' and summary is null), 'Zusammenfassungen vorhanden');
commit;

-- ---------------------------------------------------------------------
-- Test 11: Realtime-Publikation
-- ---------------------------------------------------------------------
select ss_test.assert((select count(*) from pg_publication_tables where pubname = 'supabase_realtime'
  and tablename in ('members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions', 'attachments', 'app_settings')) = 9,
  'alle Tabellen in supabase_realtime');

\echo 'ALLE DATENBANKTESTS BESTANDEN'
