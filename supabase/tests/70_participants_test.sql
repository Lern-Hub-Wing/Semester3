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
-- erste Fassung nachstellen: mehrere Aufgaben am ersten Tag, alter Titel
insert into public.tasks (id, study_entry_id, title, sort_order) values
  ('c4e10000-0000-4000-8004-000000000102', 'c4e10000-0000-4000-8003-000000000001', 'Alte Zusatzaufgabe', 2);
update public.tasks set title = 'Alter Titel' where id = 'c4e10000-0000-4000-8004-000000000101';
\ir ../plans/chemie_luk_2027-01-15.sql
select ss_test.assert((select participants from public.modules where id = 'c4e10000-0000-4000-8000-000000000001') = array['11111111-1111-4111-8111-000000000001']::uuid[], 'Chemie nur für Luk');
select ss_test.assert((select count(*) from public.modules where name = 'Chemie') = 1, 'Chemie genau einmal');
select ss_test.assert((select starts_at = '2027-01-15 07:30:00+00' and ends_at = '2027-01-15 10:00:00+00' from public.exams where id = 'c4e10000-0000-4000-8002-000000000001'), 'Klausur 15.01.2027 08:30–11:00 Uhr (Berlin)');
select ss_test.assert((select count(*) from public.module_topics where module_id = 'c4e10000-0000-4000-8000-000000000001') = 7, '7 Themen');
select ss_test.assert((select count(*) from public.study_entries where module_id = 'c4e10000-0000-4000-8000-000000000001' and deleted_at is null) = 28, '28 Lerntage (inkl. 5 Sonntage)');
-- genau EINE Aufgabe pro Lerntag
select ss_test.assert((select bool_and(n = 1) from (select count(t.id) filter (where t.deleted_at is null) n from public.study_entries e left join public.tasks t on t.study_entry_id = e.id where e.module_id = 'c4e10000-0000-4000-8000-000000000001' group by e.id) x), 'genau eine Aufgabe pro Tag');
select ss_test.assert((select deleted_at is not null from public.tasks where id = 'c4e10000-0000-4000-8004-000000000102'), 'Zusatzaufgaben der ersten Fassung im Papierkorb');
select ss_test.assert((select title like 'Atombau & PSE: Theorie%' from public.tasks where id = 'c4e10000-0000-4000-8004-000000000101'), 'Aufgabe auf neuen Titel gebracht');
-- Sonntage: Wochenrückblick
select ss_test.assert((select count(*) from public.study_entries where module_id = 'c4e10000-0000-4000-8000-000000000001' and extract(isodow from study_date) = 7) = 5, '5 Sonntage mit Wochenrückblick');
-- jedes Thema: genau ein Theorie- und ein Übungstag, alle vor Weihnachten
select ss_test.assert((select bool_and(n = 2 and last < date '2026-12-24') from (select count(*) n, max(study_date) last from public.study_entries where topic_id is not null and module_id = 'c4e10000-0000-4000-8000-000000000001' group by topic_id) x), 'Themen vor Weihnachten, je 2 Tage');
rollback;

-- Migration 010: Umzug in die App (Umleitung per gemeinsamer Einstellung)
begin;
set local role anon;
insert into public.app_settings (key, value) values ('moved_to_app', '{"url": "https://example.com/app/", "at": "2026-11-25T10:00:00Z"}')
on conflict (key) do update set value = excluded.value;
select ss_test.assert((select value ->> 'url' from public.app_settings where key = 'moved_to_app') = 'https://example.com/app/', 'Umleitung gespeichert');
rollback;
