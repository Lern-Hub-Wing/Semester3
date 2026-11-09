-- =====================================================================
-- Migration 006: Die Server-Rolle (Edge Functions) darf alles lesen, was
-- push-api und push-scheduler brauchen – aber nichts ändern.
-- =====================================================================
\set ON_ERROR_STOP on

begin;
set local role service_role;
select ss_test.assert((select count(*) from public.members where is_active) >= 1, 'Server liest Lernprofile');
select count(*) from public.modules;
select count(*) from public.exams;
select count(*) from public.study_entries;
select count(*) from public.tasks;
select count(*) from public.task_completions;
select count(*) from public.activity_log;
select count(*) from public.homework_parts;
select ss_test.expect_error($$update public.members set name = 'x'$$, 'permission denied');
select ss_test.expect_error($$delete from public.tasks$$, 'permission denied');
commit;

\echo 'SERVER-LESERECHTE BESTANDEN'
