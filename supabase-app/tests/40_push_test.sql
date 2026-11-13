-- Push: Geräte gehören Konten, Tabellen sind für Nutzer gesperrt
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('d0000000-0000-4000-8000-000000000001', 'push@example.com');
do $$
declare i int;
begin
  for i in 1..10 loop
    insert into public.push_devices (token_hash, user_id, endpoint, p256dh, auth)
    values (repeat(to_hex(i % 16), 64), 'd0000000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/x' || i, repeat('A', 87), repeat('B', 22));
  end loop;
  perform ss_test.expect_error(
    'insert into public.push_devices (token_hash, user_id, endpoint, p256dh, auth) values (repeat(''f'', 63) || ''e'', ''d0000000-0000-4000-8000-000000000001'', ''https://fcm.googleapis.com/y'', repeat(''A'', 87), repeat(''B'', 22))',
    'Höchstens 10');

  perform ss_test.login('d0000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.expect_error('select * from public.push_devices', 'permission denied');
  perform ss_test.expect_error('select * from public.push_log', 'permission denied');
  reset role;

  delete from auth.users where id = 'd0000000-0000-4000-8000-000000000001';
  perform ss_test.assert((select count(*) from public.push_devices where endpoint like 'https://fcm.googleapis.com/x%') = 0, 'Konto gelöscht → Geräte weg');
end $$;
