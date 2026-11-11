-- =====================================================================
-- Sicherheitstests der neuen App: Gruppen-Trennung, Rechte, Tarife,
-- Kontingente, Sperren und Admin-Schutz. Jeder Fehlschlag bricht ab.
-- =====================================================================
\set ON_ERROR_STOP on

create schema if not exists ss_test;
grant usage on schema ss_test to anon, authenticated;

create or replace function ss_test.expect_error(sql text, pattern text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' or sqlstate = pattern then return; end if;
    raise exception 'Falscher Fehler für [%]: % (erwartet: %)', sql, sqlerrm, pattern;
  end;
  raise exception 'Kein Fehler für [%] (erwartet: %)', sql, pattern;
end $$;
create or replace function ss_test.assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'Test fehlgeschlagen: %', msg; end if;
end $$;
-- Simuliert ein Supabase-JWT (sub, aal, Anmeldezeit)
create or replace function ss_test.login(uid uuid, aal text default 'aal1', auth_age interval default interval '0') returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', aal,
    'iat', extract(epoch from now() - auth_age)::bigint,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now() - auth_age)::bigint))
  )::text, true)
$$;
grant execute on all functions in schema ss_test to anon, authenticated;

-- Testkonten (wie von Supabase Auth angelegt → Profil per Trigger)
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-00000000000a', 'anna@example.com', '{"full_name":"Anna"}'),
  ('b0000000-0000-4000-8000-00000000000b', 'ben@example.com', '{"name":"Ben"}'),
  ('c0000000-0000-4000-8000-00000000000c', 'cara@example.com', '{}'),
  ('ad000000-0000-4000-8000-0000000000ad', 'luke@admin.studyspace.invalid', '{}');
insert into auth.users (id, email)
  select ('e0000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'm' || i || '@example.com' from generate_series(1, 7) i;
select ss_test.assert((select count(*) from public.profiles) = 11, 'Profil je Konto automatisch angelegt');
select ss_test.assert((select display_name from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a') = 'Anna', 'Name aus Google/Apple-Metadaten');
-- Plus für Anna und Ben (als wären sie bezahlt); Cara ist kostenlos
insert into public.entitlements (user_id, plan, source, ends_at, external_id) values
  ('a0000000-0000-4000-8000-00000000000a', 'plus_monthly', 'stripe', now() + interval '30 days', 'sub_test_a'),
  ('b0000000-0000-4000-8000-00000000000b', 'semester_pass', 'stripe', now() + interval '180 days', 'pass_test_b');
insert into public.admins (user_id, username) values ('ad000000-0000-4000-8000-0000000000ad', 'Luke');

-- ---------------------------------------------------------------------
-- 1. Nicht angemeldet: kein Zugriff auf irgendetwas
-- ---------------------------------------------------------------------
begin;
set local role anon;
select ss_test.expect_error($$select * from public.modules$$, 'permission denied');
select ss_test.expect_error($$select * from public.profiles$$, 'permission denied');
select ss_test.expect_error($$select public.app_me()$$, 'permission denied');
select ss_test.expect_error($$select public.admin_stats()$$, 'permission denied');
commit;

-- ---------------------------------------------------------------------
-- 2. Gruppen anlegen: nur mit Plus; legt Profil + Einstellungen automatisch an
-- ---------------------------------------------------------------------
begin;
select ss_test.login('c0000000-0000-4000-8000-00000000000c');
set local role authenticated;
select ss_test.expect_error($$select public.app_create_group('Cara Gruppe')$$, 'Plus');
-- Ein im Browser behaupteter Kauf schaltet nichts frei
select ss_test.expect_error($$insert into public.entitlements (user_id, plan, source) values ('c0000000-0000-4000-8000-00000000000c', 'plus_monthly', 'stripe')$$, 'permission denied');
select ss_test.expect_error($$update public.profiles set status = 'active', sessions_valid_after = null where id = auth.uid()$$, 'permission denied');
commit;

begin;
select ss_test.login('a0000000-0000-4000-8000-00000000000a');
set local role authenticated;
create temp table ga on commit drop as select public.app_create_group('Gruppe A', 'Anna') as id;
select ss_test.assert((public.app_me() ->> 'active_group_id')::uuid = (select id from ga), 'neue Gruppe ist aktiv');
select ss_test.assert((select count(*) from public.members) = 1, 'Lernprofil für Inhaberin angelegt');
select ss_test.assert((select count(*) from public.app_settings) = 3, 'Einstellungen der Gruppe angelegt');
-- Inhalte anlegen (ohne group_id – wird automatisch gesetzt)
insert into public.modules (id, name, color) values ('aa000000-0000-4000-8000-000000000001', 'Mathe A', '#AFC5F5');
insert into public.study_entries (id, module_id, study_date, title) values ('aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', '2026-12-01', 'Integrale');
insert into public.tasks (id, study_entry_id, title) values ('aa000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000002', 'Aufgabe 1');
insert into public.exams (id, module_id, starts_at, ends_at) values ('aa000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001', '2027-01-10 09:00+01', '2027-01-10 11:00+01');
select ss_test.assert((select group_id from public.modules where id = 'aa000000-0000-4000-8000-000000000001') = (select id from ga), 'group_id automatisch gestempelt');
-- Einstellungen per Upsert (wie supabase-js mit onConflict group_id,key)
insert into public.app_settings (key, value) values ('app_name', '"Team Anna"') on conflict (group_id, key) do update set value = excluded.value;
select ss_test.assert((select value #>> '{}' from public.app_settings where key = 'app_name') = 'Team Anna', 'Einstellung je Gruppe gespeichert');
-- Gruppe eines Eintrags kann nicht verändert werden
select ss_test.expect_error($$update public.modules set group_id = gen_random_uuid() where id = 'aa000000-0000-4000-8000-000000000001'$$, 'permission denied');
commit;

begin;
select ss_test.login('b0000000-0000-4000-8000-00000000000b');
set local role authenticated;
select public.app_create_group('Gruppe B', 'Ben');
insert into public.modules (id, name, color) values ('bb000000-0000-4000-8000-000000000001', 'Physik B', '#C9B8F5');
commit;

-- ---------------------------------------------------------------------
-- 3. Gruppe B kann Gruppe A weder lesen noch ändern noch löschen
-- ---------------------------------------------------------------------
begin;
select ss_test.login('b0000000-0000-4000-8000-00000000000b');
set local role authenticated;
select ss_test.assert((select count(*) from public.modules) = 1, 'B sieht nur eigene Fächer');
select ss_test.assert((select count(*) from public.study_entries) = 0, 'B sieht keine Lerntage von A');
select ss_test.assert((select count(*) from public.exams) = 0, 'B sieht keine Prüfungen von A');
select ss_test.assert((select count(*) from public.members) = 1, 'B sieht nur eigene Mitglieder');
select ss_test.assert((select count(*) from public.activity_log) >= 1 and not exists (select 1 from public.activity_log where summary = 'Mathe A'), 'Verlauf getrennt');
select ss_test.assert((select count(*) from public.groups) = 1, 'B sieht nur eigene Gruppe');
select ss_test.assert((select count(*) from public.profiles) = 1, 'nur eigenes Profil lesbar');
-- Manipulierte Aufrufe
update public.modules set name = 'gehackt' where id = 'aa000000-0000-4000-8000-000000000001';
select ss_test.expect_error($$insert into public.study_entries (module_id, study_date, title) values ('aa000000-0000-4000-8000-000000000001', '2026-12-02', 'fremd')$$, 'anderen Gruppe');
select ss_test.expect_error($$insert into public.tasks (study_entry_id, title) values ('aa000000-0000-4000-8000-000000000002', 'fremd')$$, 'anderen Gruppe');
select ss_test.expect_error($$insert into public.task_completions (task_id, member_id, is_completed) values ('aa000000-0000-4000-8000-000000000003', (select id from public.members limit 1), true)$$, 'anderen Gruppe');
-- Upsert auf eine fremde ID darf die fremde Zeile nicht überschreiben
select ss_test.expect_error($$insert into public.modules (id, name, color) values ('aa000000-0000-4000-8000-000000000001', 'gehackt', '#AFC5F5') on conflict (id) do update set name = excluded.name$$, 'row-level security');
select ss_test.expect_error($$delete from public.modules$$, 'permission denied');
commit;
-- B darf mit der ID von Gruppe A nicht wechseln/umbenennen/löschen
do $$
declare gid uuid := (select id from public.groups where name = 'Gruppe A');
begin
  perform ss_test.login('b0000000-0000-4000-8000-00000000000b');
  set local role authenticated;
  perform ss_test.expect_error(format('select public.app_switch_group(%L)', gid), 'Kein Mitglied');
  -- group_id von Gruppe A ausdrücklich mitgeschickt → abgelehnt
  perform ss_test.expect_error(format('insert into public.modules (name, color, group_id) values (%L, %L, %L)', 'x', '#AFC5F5', gid), 'permission denied');
  perform ss_test.expect_error(format('insert into public.focus_sessions (member_id, started_at, ended_at, duration_seconds, group_id) values (%L, now() - interval ''1 hour'', now(), 3600, %L)',
    (select member_id from public.group_members where user_id = 'a0000000-0000-4000-8000-00000000000a'), gid), 'permission denied');
  perform ss_test.expect_error(format('select public.app_rename_group(%L, %L)', gid, 'x'), 'Inhaber');
  perform ss_test.expect_error(format('select public.app_delete_group(%L, %L)', gid, 'Gruppe A'), 'Inhaber');
  perform ss_test.expect_error(format('select public.app_regenerate_invite(%L)', gid), 'Inhaber');
  perform ss_test.expect_error(format('select public.app_remove_member(%L, %L)', gid, 'a0000000-0000-4000-8000-00000000000a'), 'Inhaber');
  reset role;
end $$;
select ss_test.assert((select name from public.modules where id = 'aa000000-0000-4000-8000-000000000001') = 'Mathe A', 'Fach von A unverändert');

-- ---------------------------------------------------------------------
-- 4. Kostenlos beitreten per Code; Haken nur für sich selbst
-- ---------------------------------------------------------------------
do $$
declare code text := (select invite_code from public.groups where name = 'Gruppe A');
begin
  perform ss_test.login('c0000000-0000-4000-8000-00000000000c');
  set local role authenticated;
  perform ss_test.expect_error('select public.app_join_group(''ZZZZZZZZ'')', 'ungültig');
  perform ss_test.assert((public.app_invite_info(code) ->> 'name') = 'Gruppe A', 'Einladungsvorschau');
  perform public.app_join_group(lower(code), 'Cara');
  perform ss_test.assert((select count(*) from public.members) = 2, 'Cara sieht Gruppe A');
  perform ss_test.assert((select count(*) from public.study_entries) = 1, 'gemeinsamer Lernplan');
  insert into public.task_completions (task_id, member_id, is_completed) values ('aa000000-0000-4000-8000-000000000003', app.my_member_id(), true);
  perform ss_test.expect_error(format(
    'insert into public.task_completions (task_id, member_id, is_completed) values (%L, %L, true)',
    'aa000000-0000-4000-8000-000000000003', (select member_id from public.group_members where user_id = 'a0000000-0000-4000-8000-00000000000a')), 'row-level security');
  update public.members set name = 'gehackt' where user_id = 'a0000000-0000-4000-8000-00000000000a';
  perform ss_test.assert((select name from public.members where user_id = 'a0000000-0000-4000-8000-00000000000a') = 'Anna', 'fremdes Profil nicht änderbar');
  perform ss_test.expect_error('update public.members set is_active = false where user_id = auth.uid()', 'permission denied');
  perform ss_test.assert((public.app_me() -> 'groups' -> 0 ->> 'invite_code') is null, 'Mitglied sieht Code nicht über app_me');
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- 5. Höchstens 8 Mitglieder (inkl. Inhaberin)
-- ---------------------------------------------------------------------
do $$
declare
  code text := (select invite_code from public.groups where name = 'Gruppe A');
  i int;
begin
  for i in 1..6 loop
    perform ss_test.login(('e0000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid);
    set local role authenticated;
    perform public.app_join_group(code);
    reset role;
  end loop;
  perform ss_test.login('e0000000-0000-4000-8000-000000000007');
  set local role authenticated;
  perform ss_test.expect_error(format('select public.app_join_group(%L)', code), 'höchstens 8');
  reset role;
  perform ss_test.assert((select count(*) from public.group_members g join public.groups x on x.id = g.group_id where x.name = 'Gruppe A' and left_at is null) = 8, 'genau 8 Mitglieder');
end $$;

-- Austritt macht einen Platz frei; Inhaber kann nicht austreten
do $$
declare gid uuid := (select id from public.groups where name = 'Gruppe A');
begin
  perform ss_test.login('e0000000-0000-4000-8000-000000000006');
  set local role authenticated;
  perform public.app_leave_group(gid);
  perform ss_test.assert((select count(*) from public.modules) = 0, 'nach Austritt keine Daten mehr sichtbar');
  reset role;
  perform ss_test.login('a0000000-0000-4000-8000-00000000000a');
  set local role authenticated;
  perform ss_test.expect_error(format('select public.app_leave_group(%L)', gid), 'Inhaber');
  perform public.app_remove_member(gid, 'e0000000-0000-4000-8000-000000000005');
  reset role;
  perform ss_test.login('e0000000-0000-4000-8000-000000000005');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.study_entries) = 0, 'entferntes Mitglied sieht nichts mehr');
  perform ss_test.assert(public.app_me() ->> 'active_group_id' is null, 'keine aktive Gruppe nach Entfernen');
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- 6. Kontingente: 50 Hausaufgaben, 100 Lernplaneinträge
-- ---------------------------------------------------------------------
do $$
declare i int;
begin
  perform ss_test.login('b0000000-0000-4000-8000-00000000000b');
  set local role authenticated;
  for i in 1..50 loop
    insert into public.homework (module_id, title, due_date) values ('bb000000-0000-4000-8000-000000000001', 'HA ' || i, '2026-12-20');
  end loop;
  perform ss_test.expect_error($q$insert into public.homework (module_id, title, due_date) values ('bb000000-0000-4000-8000-000000000001', 'HA 51', '2026-12-20')$q$, 'höchstens 50');
  update public.homework set deleted_at = now() where title = 'HA 1';
  insert into public.homework (module_id, title, due_date) values ('bb000000-0000-4000-8000-000000000001', 'HA 51', '2026-12-20');
  perform ss_test.expect_error($q$update public.homework set deleted_at = null where title = 'HA 1'$q$, 'höchstens 50');
  for i in 1..100 loop
    insert into public.study_entries (module_id, study_date, title) values ('bb000000-0000-4000-8000-000000000001', '2026-12-01'::date + (i % 60), 'Tag ' || i);
  end loop;
  perform ss_test.expect_error($q$insert into public.study_entries (module_id, study_date, title) values ('bb000000-0000-4000-8000-000000000001', '2026-12-01', 'zu viel')$q$, 'höchstens 100');
  reset role;
  -- Gruppe A ist davon unberührt
  perform ss_test.login('a0000000-0000-4000-8000-00000000000a');
  set local role authenticated;
  insert into public.homework (module_id, title, due_date) values ('aa000000-0000-4000-8000-000000000001', 'HA A', '2026-12-20');
  reset role;
end $$;
-- Dateien gibt es in der App nicht
begin;
select ss_test.login('a0000000-0000-4000-8000-00000000000a');
set local role authenticated;
select ss_test.expect_error($$select * from public.attachments$$, 'permission denied');
commit;

-- ---------------------------------------------------------------------
-- 7. Plus abgelaufen: Inhalte nur noch lesen, Haken/Fokus weiter möglich
-- ---------------------------------------------------------------------
update public.entitlements set ends_at = now() - interval '1 minute', starts_at = now() - interval '31 days' where external_id = 'sub_test_a';
do $$
declare code text := (select invite_code from public.groups where name = 'Gruppe A');
begin
  perform ss_test.login('a0000000-0000-4000-8000-00000000000a');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.study_entries) = 1, 'Lesen weiter möglich');
  perform ss_test.expect_error($q$insert into public.modules (name, color) values ('Neu', '#AFC5F5')$q$, 'abgelaufen');
  perform ss_test.expect_error($q$update public.study_entries set title = 'x'$q$, 'abgelaufen');
  insert into public.task_completions (task_id, member_id, is_completed) values ('aa000000-0000-4000-8000-000000000003', app.my_member_id(), true);
  perform ss_test.assert((public.app_me() -> 'groups' -> 0 ->> 'has_plus')::boolean = false, 'app_me meldet kein Plus');
  reset role;
  perform ss_test.login('e0000000-0000-4000-8000-000000000007');
  set local role authenticated;
  perform ss_test.expect_error(format('select public.app_join_group(%L)', code), 'keinen aktiven Plus');
  reset role;
end $$;

-- ---------------------------------------------------------------------
-- 8. Gesperrte Konten und widerrufene Sitzungen sehen nichts mehr
-- ---------------------------------------------------------------------
update public.profiles set sessions_valid_after = now() - interval '1 minute' where id = 'b0000000-0000-4000-8000-00000000000b';
do $$
begin
  perform ss_test.login('b0000000-0000-4000-8000-00000000000b', 'aal1', interval '2 hours');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.modules) = 0, 'alte Sitzung abgelehnt');
  perform ss_test.expect_error($q$insert into public.modules (name, color) values ('x', '#AFC5F5')$q$, 'Keine aktive');
  reset role;
  perform ss_test.login('b0000000-0000-4000-8000-00000000000b');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.modules) = 1, 'neue Anmeldung funktioniert');
  reset role;
end $$;
update public.profiles set status = 'blocked' where id = 'c0000000-0000-4000-8000-00000000000c';
do $$
begin
  perform ss_test.login('c0000000-0000-4000-8000-00000000000c');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.study_entries) = 0, 'gesperrt: keine Daten');
  perform ss_test.assert((public.app_me() ->> 'status') = 'blocked', 'app_me meldet Sperre');
  reset role;
end $$;
update public.profiles set status = 'active' where id = 'c0000000-0000-4000-8000-00000000000c';

-- ---------------------------------------------------------------------
-- 9. Admin: nur mit Admin-Rolle UND Zwei-Faktor
-- ---------------------------------------------------------------------
do $$
declare
  gid uuid := (select id from public.groups where name = 'Gruppe A');
  e uuid;
  s jsonb;
begin
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal1');
  set local role authenticated;
  perform ss_test.expect_error('select public.admin_stats()', 'Zwei-Faktor');
  perform ss_test.assert((public.admin_whoami() ->> 'is_admin')::boolean and not (public.admin_whoami() ->> 'ok')::boolean, 'whoami ohne 2FA');
  reset role;
  perform ss_test.login('b0000000-0000-4000-8000-00000000000b', 'aal2');
  set local role authenticated;
  perform ss_test.expect_error('select public.admin_stats()', 'Administratoren');
  perform ss_test.expect_error('select * from public.admin_audit', 'permission denied');
  perform ss_test.expect_error('select * from public.payments', 'permission denied');
  reset role;

  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  -- Gruppe A wieder freischalten (kostenlos, kein Umsatz)
  e := public.admin_grant_plus('group', gid, 14, null, 'Test');
  s := public.admin_stats();
  perform ss_test.assert((s ->> 'users_total')::int = 10, 'Admins zählen nicht als Nutzer');
  perform ss_test.assert((s ->> 'revenue_cents_total')::int = 0, 'kein erfundener Umsatz');
  perform ss_test.assert((s ->> 'mrr_cents')::int = 0, 'MRR ohne laufende bezahlte Monatsabos = 0');
  perform ss_test.assert((s ->> 'semester_passes_active')::int = 1, 'Semesterpass gezählt');
  perform ss_test.assert((s ->> 'grants_active')::int = 1, 'Freischaltung getrennt gezählt');
  perform ss_test.assert((s ->> 'payments_connected')::boolean = false, 'keine Zahlungen verbunden');
  perform ss_test.assert((select count(*) from public.admin_users('', 50, 0)) = 11, 'Benutzerliste');
  perform ss_test.assert((select plan from public.admin_users('cara', 50, 0)) = 'plus_member', 'Plan eines Mitglieds');
  perform ss_test.assert((select count(*) from public.admin_groups('', 50, 0)) = 2, 'Gruppenliste');
  perform public.admin_extend_plus(e, 7);
  perform ss_test.assert((public.admin_group_detail(gid) ->> 'plus_until')::timestamptz > now() + interval '20 days', 'verlängert');
  -- Plus für Cara (Benutzer) unbegrenzt → darf Gruppe erstellen
  perform public.admin_grant_plus('user', 'c0000000-0000-4000-8000-00000000000c', null, null, 'Tester');
  perform ss_test.expect_error(format('select public.admin_delete_group(%L, %L)', gid, 'falsch'), 'genauen');
  perform ss_test.expect_error(format('select public.admin_delete_user(%L, %L)', 'c0000000-0000-4000-8000-00000000000c', 'falsch@example.com'), 'genaue');
  perform public.admin_set_user_status('e0000000-0000-4000-8000-000000000007', 'blocked');
  perform ss_test.assert((public.admin_user_detail('e0000000-0000-4000-8000-000000000007') ->> 'sessions_valid_after') is not null, 'Sperre beendet Sitzungen');
  perform ss_test.assert((select count(*) from public.admin_audit_log(100)) = 4, 'Audit-Log: 4 Änderungen, abgelehnte nicht');
  reset role;
end $$;
select ss_test.assert((select count(*) from auth.sessions) = 0, 'Sitzungen gelöscht');

do $$
begin
  perform ss_test.login('a0000000-0000-4000-8000-00000000000a');
  set local role authenticated;
  insert into public.modules (name, color) values ('Wieder Plus', '#AFC5F5');
  reset role;
  perform ss_test.login('c0000000-0000-4000-8000-00000000000c');
  set local role authenticated;
  perform public.app_create_group('Cara Gruppe', 'Cara');
  perform ss_test.assert((select count(*) from public.modules) = 0, 'neue Gruppe ist leer');
  perform ss_test.assert(jsonb_array_length(public.app_me() -> 'groups') = 2, 'Cara in zwei Gruppen');
  reset role;
end $$;

-- Konto löschen: Gruppe ohne weitere Mitglieder verschwindet, Lernprofil anonymisiert
do $$
begin
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  perform public.admin_delete_user('c0000000-0000-4000-8000-00000000000c', 'CARA@example.com');
  perform ss_test.expect_error(format('select public.admin_delete_user(%L, %L)', 'ad000000-0000-4000-8000-0000000000ad', 'luke@admin.studyspace.invalid'), 'Admin');
  reset role;
end $$;
select ss_test.assert(not exists (select 1 from auth.users where email = 'cara@example.com'), 'Konto gelöscht');
select ss_test.assert(not exists (select 1 from public.groups where name = 'Cara Gruppe'), 'leere eigene Gruppe gelöscht');
select ss_test.assert(exists (select 1 from public.members where name = 'Ehemaliges Mitglied'), 'Lernprofil in Gruppe A anonymisiert');

-- Inhaber löscht Gruppe B vollständig
do $$
declare gid uuid := (select id from public.groups where name = 'Gruppe B');
begin
  perform ss_test.login('b0000000-0000-4000-8000-00000000000b');
  set local role authenticated;
  perform ss_test.expect_error(format('select public.app_delete_group(%L, %L)', gid, 'Gruppe X'), 'Gruppennamen');
  perform public.app_delete_group(gid, 'Gruppe B');
  reset role;
end $$;
select ss_test.assert(not exists (select 1 from public.homework h where h.title = 'HA 2'), 'Daten von B gelöscht');
select ss_test.assert(exists (select 1 from public.modules where name = 'Mathe A'), 'Daten von A erhalten');

-- Eigenes Konto löschen (nur mit E-Mail-Bestätigung)
do $$
begin
  perform ss_test.login('e0000000-0000-4000-8000-000000000004');
  set local role authenticated;
  perform ss_test.expect_error('select public.app_delete_my_account(''falsch'')', 'E-Mail');
  perform public.app_delete_my_account('m4@example.com');
  reset role;
end $$;
select ss_test.assert(not exists (select 1 from auth.users where email = 'm4@example.com'), 'eigenes Konto gelöscht');

select app.purge_trash();
