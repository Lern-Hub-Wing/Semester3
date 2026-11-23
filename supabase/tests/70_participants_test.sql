-- =====================================================================
-- Migration 009: Wer schreibt die Prüfung? (modules.participants)
-- =====================================================================
\set ON_ERROR_STOP on

begin;
set local role anon;
insert into public.modules (id, name, color, sort_order, participants, changed_by)
values ('cccccccc-0000-4000-8000-000000000009', 'Chemie', '#2FA58B', 99, array['11111111-1111-4111-8111-000000000001']::uuid[], '11111111-1111-4111-8111-000000000001');
select ss_test.assert((select participants from public.modules where id = 'cccccccc-0000-4000-8000-000000000009') = array['11111111-1111-4111-8111-000000000001']::uuid[], 'Teilnehmende gespeichert');
update public.modules set participants = null where id = 'cccccccc-0000-4000-8000-000000000009';
select ss_test.assert((select participants is null from public.modules where id = 'cccccccc-0000-4000-8000-000000000009'), 'wieder für alle');
rollback;

-- Lernplan Chemie für Luk: läuft durch, ist wiederholbar und nur für Luk
begin;
update public.members set name = 'Luk' where id = '11111111-1111-4111-8111-000000000001';
\ir ../plans/chemie_luk_2027-01-15.sql
\ir ../plans/chemie_luk_2027-01-15.sql
select ss_test.assert((select participants from public.modules where id = 'c4e10000-0000-4000-8000-000000000001') = array['11111111-1111-4111-8111-000000000001']::uuid[], 'Chemie nur für Luk');
select ss_test.assert((select count(*) from public.modules where name = 'Chemie') = 1, 'Chemie genau einmal');
select ss_test.assert((select starts_at = '2027-01-15 07:30:00+00' and ends_at = '2027-01-15 10:00:00+00' from public.exams where id = 'c4e10000-0000-4000-8002-000000000001'), 'Klausur 15.01.2027 08:30–11:00 Uhr (Berlin)');
select ss_test.assert((select count(*) from public.module_topics where module_id = 'c4e10000-0000-4000-8000-000000000001') = 7, '7 Themen');
select ss_test.assert((select count(*) from public.study_entries where module_id = 'c4e10000-0000-4000-8000-000000000001') = 23, '23 Lerntage');
select ss_test.assert((select count(*) from public.tasks t join public.study_entries e on e.id = t.study_entry_id where e.module_id = 'c4e10000-0000-4000-8000-000000000001') = 88, '88 Aufgaben');
-- jedes Thema: genau ein Theorie- und ein Übungstag, alle vor Weihnachten
select ss_test.assert((select bool_and(n = 2 and last < date '2026-12-24') from (select count(*) n, max(study_date) last from public.study_entries where topic_id is not null and module_id = 'c4e10000-0000-4000-8000-000000000001' group by topic_id) x), 'Themen vor Weihnachten, je 2 Tage');
rollback;
