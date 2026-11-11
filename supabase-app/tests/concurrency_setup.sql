-- Vorbereitung für den Parallel-Test: Gruppe mit 7 von 8 Plätzen
\set ON_ERROR_STOP on
insert into auth.users (id, email) select ('f0000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'p' || i || '@example.com' from generate_series(1, 20) i;
insert into public.entitlements (user_id, plan, source, ends_at) values ('f0000000-0000-4000-8000-000000000001', 'plus_grant', 'admin', null);
do $$
declare code text; i int;
begin
  perform ss_test.login('f0000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform public.app_create_group('Parallel');
  reset role;
  code := (select invite_code from public.groups where name = 'Parallel');
  for i in 2..7 loop
    perform ss_test.login(('f0000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid);
    set local role authenticated;
    perform public.app_join_group(code);
    reset role;
  end loop;
end $$;
