-- =====================================================================
-- Verhaltenstests für Migration 004 (Push-Abonnements, Fokuszeiten).
-- Läuft nach 10_behaviour_test.sql (nutzt ss_test.* und die Seed-Daten).
-- =====================================================================
\set ON_ERROR_STOP on

grant usage on schema ss_test to service_role;
grant execute on all functions in schema ss_test to service_role;

-- ---------------------------------------------------------------------
-- Push-Tabellen sind für die öffentliche Rolle komplett gesperrt
-- ---------------------------------------------------------------------
begin;
set local role anon;
select ss_test.expect_error('select * from public.push_devices', 'permission denied');
select ss_test.expect_error('select * from public.push_log', 'permission denied');
select ss_test.expect_error('select * from public.push_state', 'permission denied');
select ss_test.expect_error($$insert into public.push_devices (token_hash, endpoint, p256dh, auth)
  values (repeat('a', 64), 'https://web.push.apple.com/x', repeat('B', 87), repeat('c', 22))$$, 'permission denied');
select ss_test.expect_error('delete from public.push_devices', 'permission denied');
select ss_test.expect_error('select public.ss_push_cleanup()', 'permission denied');
commit;

-- ---------------------------------------------------------------------
-- Server (service_role): Geräte anlegen, Deduplizierung, Prüfregeln
-- ---------------------------------------------------------------------
begin;
set local role service_role;
insert into public.push_devices (id, token_hash, member_id, endpoint, p256dh, auth, prefs)
values ('dddddddd-0000-4000-8000-000000000001', repeat('a', 64), '11111111-1111-4111-8111-000000000001',
        'https://web.push.apple.com/QGuQyavXut', repeat('B', 87), repeat('c', 22), '{"morning": true}');
select ss_test.expect_error($$insert into public.push_devices (token_hash, endpoint, p256dh, auth)
  values (repeat('b', 64), 'http://evil.example.com', repeat('B', 87), repeat('c', 22))$$, 'push_devices_endpoint_check');
select ss_test.expect_error($$insert into public.push_devices (token_hash, endpoint, p256dh, auth)
  values ('kein-hash', 'https://fcm.googleapis.com/x', repeat('B', 87), repeat('c', 22))$$, 'push_devices_token_hash_check');
select ss_test.expect_error($$insert into public.push_devices (token_hash, endpoint, p256dh, auth)
  values (repeat('e', 64), 'https://web.push.apple.com/QGuQyavXut', repeat('B', 87), repeat('c', 22))$$, 'duplicate key');

insert into public.push_log (device_id, kind, dedupe_key, title, body, status)
values ('dddddddd-0000-4000-8000-000000000001', 'morning', 'morning:2026-12-10', 'Dein Lernplan für heute', 'Test', 'pending');
-- Zweiter Scheduler-Lauf: derselbe Schlüssel lässt sich nicht erneut reservieren
select ss_test.expect_error($$insert into public.push_log (device_id, kind, dedupe_key, title, body, status)
  values ('dddddddd-0000-4000-8000-000000000001', 'morning', 'morning:2026-12-10', 'x', 'y', 'pending')$$, 'duplicate key');
-- updated_at wird gepflegt, Person bleibt nach Deaktivierung erhalten
update public.push_devices set enabled = false where id = 'dddddddd-0000-4000-8000-000000000001';
select ss_test.assert((select updated_at >= created_at from public.push_devices where id = 'dddddddd-0000-4000-8000-000000000001'), 'updated_at gepflegt');
select public.ss_push_cleanup();
select ss_test.assert((select count(*) from public.push_log) = 1, 'aktuelle Protokolle bleiben beim Aufräumen erhalten');
-- Entfernen eines Geräts entfernt nur dessen Protokoll, keine Lerndaten
delete from public.push_devices where id = 'dddddddd-0000-4000-8000-000000000001';
select ss_test.assert((select count(*) from public.push_log) = 0, 'Protokoll mit Gerät entfernt');
select ss_test.assert((select count(*) from public.members) >= 4, 'Personen unverändert');
commit;

-- ---------------------------------------------------------------------
-- Fokuszeiten: öffentlich lesen + anlegen, aber nicht ändern/löschen
-- ---------------------------------------------------------------------
begin;
set local role anon;
insert into public.focus_sessions (id, member_id, module_id, started_at, ended_at, duration_seconds)
values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000005',
        now() - interval '30 minutes', now() - interval '5 minutes', 1500);
select ss_test.assert((select count(*) from public.focus_sessions) = 1, 'Fokuszeit gespeichert und lesbar');
select ss_test.expect_error($$update public.focus_sessions set duration_seconds = 9000$$, 'permission denied');
select ss_test.expect_error($$delete from public.focus_sessions$$, 'permission denied');
select ss_test.expect_error($$insert into public.focus_sessions (id, member_id, started_at, ended_at, duration_seconds)
  values ('ffffffff-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000001', now() - interval '1 minute', now(), 30)$$, 'focus_sessions_duration_seconds_check');
select ss_test.expect_error($$insert into public.focus_sessions (id, member_id, started_at, ended_at, duration_seconds)
  values ('ffffffff-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000001', now() - interval '10 minutes', now(), 3600)$$, 'focus_sessions_plausible');
select ss_test.expect_error($$insert into public.focus_sessions (id, member_id, started_at, ended_at, duration_seconds)
  values ('ffffffff-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000001', now() + interval '1 hour', now() + interval '2 hours', 3600)$$, 'focus_sessions_not_future');
select ss_test.expect_error($$insert into public.focus_sessions (id, member_id, started_at, ended_at, duration_seconds, created_at)
  values ('ffffffff-0000-4000-8000-000000000005', '11111111-1111-4111-8111-000000000001', now() - interval '2 hours', now() - interval '1 hour', 3600, now())$$, 'permission denied');
commit;

\echo 'PUSH- UND FOKUS-TESTS BESTANDEN'
