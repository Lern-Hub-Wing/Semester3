-- Reparatur-Test, Teil 3: alle Daten noch da, Seite liest und schreibt wieder, keine App-Jobs/Trigger
do $$
declare r record; n bigint;
begin
  for r in select * from public.rescue_counts loop
    execute format('select count(*) from public.%I', r.t) into n;
    if n <> r.n then raise exception 'Daten verändert: % vorher %, nachher %', r.t, r.n, n; end if;
  end loop;
  if (select count(*) from pg_trigger where tgname in ('aa_group_stamp', 'ab_require_plus', 'ad_quota')) > 0 then
    raise exception 'App-Trigger noch vorhanden';
  end if;
end $$;
begin;
set local role anon;
do $$ begin
  if (select count(*) from public.modules) = 0 then raise exception 'anon liest nicht'; end if;
end $$;
insert into public.study_entries (module_id, study_date, title) select id, date '2026-12-01', 'Reparatur-Test' from public.modules limit 1;
update public.app_settings set value = '"Semester 3"' where key = 'app_name';
insert into public.app_settings (key, value) values ('moved_to_app', '{"url":"x"}') on conflict (key) do update set value = excluded.value;
rollback;
drop table public.rescue_counts;
