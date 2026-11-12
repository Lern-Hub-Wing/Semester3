-- =====================================================================
-- Tarife: Testphase (14 Tage, danach nur lesen), Solo, Gruppe, Beta-Käufe
-- =====================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('51000000-0000-4000-8000-000000000001', 'solo@example.com'),
  ('51000000-0000-4000-8000-000000000002', 'gruppe@example.com'),
  ('51000000-0000-4000-8000-000000000003', 'gast@example.com');

-- 1. Testphase: Lernbereich entsteht, Bearbeiten erlaubt, nur einmal
do $$
declare gid uuid; me jsonb;
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000001');
  set local role authenticated;
  gid := public.app_start_trial();
  me := public.app_me();
  perform ss_test.assert(me ->> 'level' = 'solo' and me ->> 'plan' = 'trial', 'Testphase aktiv');
  perform ss_test.assert((me ->> 'trial_ends_at')::timestamptz between now() + interval '13 days' and now() + interval '15 days', '14 Tage');
  perform ss_test.assert((me -> 'groups' -> 0 ->> 'kind') = 'solo' and (me -> 'groups' -> 0 ->> 'invite_code') is null, 'Lernbereich ohne Einladung');
  perform ss_test.assert((me ->> 'active_group_id')::uuid = gid, 'Lernbereich aktiv');
  insert into public.modules (name, color) values ('Solo-Fach', '#AFC5F5');
  -- Zweiter Start: keine zweite Testphase, gleicher Lernbereich
  perform ss_test.assert(public.app_start_trial() = gid, 'gleicher Lernbereich');
  perform ss_test.assert((select count(*) from public.entitlements where plan = 'trial') = 1, 'Testphase nur einmal');
  -- Solo darf keine Lerngruppe erstellen
  perform ss_test.expect_error('select public.app_create_group(''X'')', 'Gruppenpass');
  reset role;
end $$;

-- Lernbereich ist nicht per Code beitretbar
do $$
declare code text := (select invite_code from public.groups where owner_id = '51000000-0000-4000-8000-000000000001' and kind = 'solo');
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000003');
  set local role authenticated;
  perform ss_test.expect_error(format('select public.app_join_group(%L)', code), 'ungültig');
  perform ss_test.assert(public.app_invite_info(code) is null, 'keine Vorschau für Lernbereich');
  reset role;
end $$;

-- 2. Nach 14 Tagen: nur lesen (mit freundlicher Meldung)
update public.entitlements set starts_at = now() - interval '15 days', ends_at = now() - interval '1 day'
  where user_id = '51000000-0000-4000-8000-000000000001' and plan = 'trial';
do $$
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.modules) = 1, 'Inhalte bleiben sichtbar');
  perform ss_test.expect_error($q$insert into public.modules (name, color) values ('Neu', '#AFC5F5')$q$, 'Testphase ist beendet');
  perform ss_test.expect_error($q$update public.modules set name = 'x'$q$, 'Testphase ist beendet');
  perform ss_test.assert(public.app_me() ->> 'level' is null and (public.app_me() ->> 'trial_used')::boolean, 'Testphase genutzt');
  -- Kein zweiter Testzeitraum
  perform public.app_start_trial();
  perform ss_test.assert(public.app_me() ->> 'level' is null, 'kein neuer Testzeitraum');
  reset role;
end $$;

-- 3. Beta-Kauf Solo → wieder bearbeitbar; zweiter Kauf verlängert
do $$
declare r jsonb; e1 timestamptz;
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.expect_error('select public.app_beta_purchase(''gold'')', 'Unbekannter Tarif');
  r := public.app_beta_purchase('solo_monthly');
  perform ss_test.assert(r ->> 'group_id' is not null, 'Lernbereich geöffnet');
  insert into public.modules (name, color) values ('Wieder frei', '#AFC5F5');
  perform ss_test.assert(public.app_me() ->> 'plan' = 'solo_monthly' and (public.app_me() ->> 'auto_renew')::boolean, 'Solo monatlich, verlängert sich');
  e1 := (public.app_me() ->> 'plan_until')::timestamptz;
  perform public.app_beta_purchase('solo_monthly');
  perform ss_test.assert((public.app_me() ->> 'plan_until')::timestamptz > e1 + interval '27 days', 'verlängert statt doppelt');
  perform ss_test.assert((select count(*) from public.entitlements where source = 'beta') = 1, 'ein Eintrag');
  perform public.app_beta_cancel((public.app_me() ->> 'plan_id')::uuid);
  perform ss_test.assert(not (public.app_me() ->> 'auto_renew')::boolean, 'gekündigt, läuft bis Ende');
  -- Direkt eintragen geht weiterhin nicht
  perform ss_test.expect_error($q$insert into public.entitlements (user_id, plan, source) values (auth.uid(), 'group_semester', 'beta')$q$, 'permission denied');
  reset role;
end $$;

-- 4. Beta-Kauf Gruppe → Lerngruppe erstellen; Gast tritt kostenlos bei
do $$
declare gid uuid; code text;
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000002');
  set local role authenticated;
  perform ss_test.expect_error('select public.app_create_group(''Team'')', 'Gruppenpass');
  perform public.app_beta_purchase('group_semester');
  perform ss_test.assert(public.app_me() ->> 'level' = 'group', 'Gruppenpass aktiv');
  perform ss_test.assert((public.app_me() ->> 'plan_until')::timestamptz > now() + interval '5 months', '6 Monate');
  perform ss_test.assert(not (public.app_me() ->> 'auto_renew')::boolean, 'Semesterpass ohne Verlängerung');
  gid := public.app_create_group('Team Beta', 'Gina');
  insert into public.modules (name, color) values ('Team-Fach', '#AFC5F5');
  -- Gruppenpass enthält auch den eigenen Lernbereich
  perform public.app_open_solo();
  insert into public.modules (name, color) values ('Eigenes Fach', '#AFC5F5');
  reset role;
  code := (select invite_code from public.groups where id = gid);
  perform ss_test.login('51000000-0000-4000-8000-000000000003');
  set local role authenticated;
  perform public.app_join_group(code);
  perform ss_test.assert((select count(*) from public.modules) = 1, 'Gast sieht Team-Fach');
  perform ss_test.assert(public.app_me() ->> 'level' is null, 'Gast zahlt nichts');
  -- Gast ohne Testphase hat keinen eigenen Lernbereich
  perform ss_test.expect_error('select public.app_open_solo()', 'Testphase');
  reset role;
end $$;

-- 5. Beta-Käufe abschaltbar; Tageslimit
update public.app_config set value = 'false' where key = 'beta_purchases';
do $$
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000003');
  set local role authenticated;
  perform ss_test.assert(not (public.app_me() ->> 'beta_purchases')::boolean, 'Schalter sichtbar');
  perform ss_test.expect_error('select public.app_beta_purchase(''solo_monthly'')', 'nicht möglich');
  reset role;
end $$;
update public.app_config set value = 'true' where key = 'beta_purchases';
do $$
declare i int;
begin
  perform ss_test.login('51000000-0000-4000-8000-000000000003');
  set local role authenticated;
  for i in 1..10 loop perform public.app_beta_purchase('solo_semester'); end loop;
  perform ss_test.expect_error('select public.app_beta_purchase(''solo_semester'')', 'Zu viele');
  reset role;
end $$;

-- 6. Admin: Beta getrennt vom Umsatz, Testphasen gezählt, Solo-Freischaltung
do $$
declare s jsonb;
begin
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  s := public.admin_stats();
  perform ss_test.assert((s ->> 'revenue_cents_total')::int = 0 and (s ->> 'mrr_cents')::int = 333, 'Beta verändert Umsatz und MRR nicht (333 = bezahlter Pass aus Test 10)');
  perform ss_test.assert((s ->> 'beta_simulated_cents')::int = 249 * 2 + 2499 + 1199 * 10, 'simulierter Beta-Betrag');
  perform ss_test.assert((s ->> 'trials_expired')::int = 1 and (s ->> 'trials_converted')::int = 1, 'Testphase abgelaufen und umgewandelt');
  perform ss_test.assert((s -> 'beta_by_plan' ->> 'group_semester')::int = 1, 'Beta je Tarif');
  perform ss_test.assert((s ->> 'beta_cancellations')::int = 1, 'Beta-Kündigung gezählt');
  perform public.admin_grant_plus('user', '51000000-0000-4000-8000-000000000003', 30, null, 'Solo-Test', 'solo_grant');
  perform ss_test.expect_error(format('select public.admin_grant_plus(%L, %L, 30, null, null, %L)', 'group', (select id from public.groups where name = 'Team Beta'), 'solo_grant'), 'Gruppenpass');
  perform public.admin_set_config('beta_purchases', 'false'::jsonb);
  perform ss_test.assert(not (public.admin_stats() ->> 'beta_purchases_enabled')::boolean, 'Admin schaltet Beta ab');
  perform public.admin_set_config('beta_purchases', 'true'::jsonb);
  reset role;
  perform ss_test.login('51000000-0000-4000-8000-000000000003');
  set local role authenticated;
  perform ss_test.expect_error('select public.app_create_group(''Nope'')', 'Gruppenpass');
  perform ss_test.assert(public.app_open_solo() is not null, 'Solo-Freischaltung öffnet Lernbereich');
  perform public.app_tutorial_done();
  perform ss_test.assert((public.app_me() ->> 'tutorial_done')::boolean, 'Einführung gespeichert');
  reset role;
end $$;
select ss_test.assert(not exists (select 1 from public.app_config c where c.key = 'beta_purchases' and c.value <> 'true'::jsonb), 'Schalter zurückgesetzt');
