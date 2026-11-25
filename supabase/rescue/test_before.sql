-- Reparatur-Test, Teil 1: Bestand merken (vor dem versehentlichen App-Schema)
create table if not exists public.rescue_counts as
select 'members' t, count(*) n from public.members union all
select 'modules', count(*) from public.modules union all
select 'exams', count(*) from public.exams union all
select 'study_entries', count(*) from public.study_entries union all
select 'tasks', count(*) from public.tasks union all
select 'task_completions', count(*) from public.task_completions union all
select 'homework', count(*) from public.homework;
