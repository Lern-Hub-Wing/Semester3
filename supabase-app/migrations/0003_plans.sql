-- =====================================================================
-- StudySpace App – Tarife: Testphase, Solo, Gruppe, Beta-Käufe
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen. Wiederholbar.
--
--   Free/Test   0 €     14 Tage voller Solo-Zugriff, danach nur lesen
--   Solo        2,49 €/Monat  ·  11,99 € für 6 Monate
--   Gruppe      4,99 €/Monat  ·  24,99 € für 6 Monate (bis 8 Personen,
--               nur eine Person bezahlt; enthält alle Solo-Funktionen)
--
-- Beta: Käufe werden nur SIMULIERT (Quelle „beta“). Sie schalten frei,
-- erscheinen im Admin-Bereich getrennt und zählen nie als Umsatz.
-- Der Admin kann Beta-Käufe jederzeit abschalten (app_config).
-- Echte Zahlungen (Stripe/App Stores) schreiben später nur Server-Webhooks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema-Erweiterungen
-- ---------------------------------------------------------------------
alter table public.groups add column if not exists kind text not null default 'team';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'groups_kind_check') then
    alter table public.groups add constraint groups_kind_check check (kind in ('team', 'solo'));
  end if;
end $$;
-- Ein persönlicher Lernbereich pro Konto
create unique index if not exists groups_one_solo_per_owner on public.groups(owner_id) where kind = 'solo';

alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements add constraint entitlements_plan_check check (plan in (
  'trial', 'solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'solo_grant',
  -- frühere Bezeichnungen (bleiben gültig, zählen als Gruppe)
  'plus_monthly', 'semester_pass', 'plus_grant'
));
alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check check (source in ('admin', 'trial', 'beta', 'stripe', 'app_store', 'play_store'));
alter table public.entitlements add column if not exists auto_renew boolean not null default false;
alter table public.entitlements add column if not exists price_cents integer check (price_cents is null or price_cents >= 0);
-- Testphase nur einmal pro Konto
create unique index if not exists entitlements_one_trial on public.entitlements(user_id) where plan = 'trial';

alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments add constraint payments_plan_check check (plan in ('solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'plus_monthly', 'semester_pass'));

alter table public.subscription_events add column if not exists plan text;
alter table public.subscription_events add column if not exists amount_cents integer;
alter table public.subscription_events drop constraint if exists subscription_events_kind_check;
alter table public.subscription_events add constraint subscription_events_kind_check check (kind in ('started', 'renewed', 'canceled', 'expired', 'refunded', 'trial_started'));

alter table public.profiles add column if not exists tutorial_done_at timestamptz;

-- Schalter für den Betrieb (nur Server/Admin)
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_config (key, value) values ('beta_purchases', 'true'::jsonb) on conflict (key) do nothing;
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;

-- ---------------------------------------------------------------------
-- 2. Tarif-Logik
-- ---------------------------------------------------------------------
create or replace function app.plan_level(p text) returns text
language sql immutable as $$
  select case
    when p in ('group_monthly', 'group_semester', 'plus_monthly', 'semester_pass', 'plus_grant') then 'group'
    when p in ('solo_monthly', 'solo_semester', 'solo_grant', 'trial') then 'solo'
  end
$$;

create or replace function app.plan_price_cents(p text) returns integer
language sql immutable as $$
  select case p
    when 'solo_monthly' then 249 when 'solo_semester' then 1199
    when 'group_monthly' then 499 when 'group_semester' then 2499
    when 'plus_monthly' then 499 when 'semester_pass' then 1999
    else 0 end
$$;

create or replace function app.plan_months(p text) returns integer
language sql immutable as $$
  select case when p in ('solo_semester', 'group_semester', 'semester_pass') then 6 else 1 end
$$;

-- 'group' > 'solo' > null
create or replace function app.user_level(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when bool_or(app.plan_level(e.plan) = 'group') then 'group'
    when bool_or(app.plan_level(e.plan) = 'solo') then 'solo'
  end
  from public.entitlements e where e.user_id = uid and app.entitlement_active(e)
$$;

-- „Plus“ im bisherigen Sinn = darf Lerngruppen erstellen (Gruppenpass)
create or replace function app.user_has_plus(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.user_level(uid) = 'group', false)
$$;

-- Darf in dieser Gruppe bearbeitet werden?
--   Lerngruppe: Gruppenpass des Inhabers (oder Freischaltung der Gruppe)
--   Eigener Lernbereich: Testphase, Solo oder Gruppe des Inhabers
create or replace function app.group_has_plus(gid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.entitlements e where e.group_id = gid and app.entitlement_active(e))
      or exists (
        select 1 from public.groups g
        where g.id = gid and g.owner_id is not null
          and case when g.kind = 'solo' then app.user_level(g.owner_id) is not null else app.user_level(g.owner_id) = 'group' end
      )
$$;

-- Ablauf des Zugangs (null = unbegrenzt, -infinity = keiner)
create or replace function app.group_plus_until(gid uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  with g as (select * from public.groups where id = gid),
  e as (
    select x.* from public.entitlements x, g
    where app.entitlement_active(x)
      and (x.group_id = gid or (x.user_id = g.owner_id and (g.kind = 'solo' or app.plan_level(x.plan) = 'group')))
  )
  select case when bool_or(ends_at is null) then null when count(*) = 0 then '-infinity'::timestamptz else max(ends_at) end from e
$$;

-- Verständliche Meldung, wenn nur gelesen werden darf
create or replace function app.require_plus() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g public.groups;
begin
  if app.group_has_plus(new.group_id) then return new; end if;
  select * into g from public.groups where id = new.group_id;
  if g.kind = 'solo' and exists (select 1 from public.entitlements e where e.user_id = g.owner_id and e.plan = 'trial') then
    raise exception 'Deine 14-tägige Testphase ist beendet. Deine Inhalte bleiben sichtbar – mit StudySpace Solo kannst du wieder bearbeiten.'
      using errcode = 'P0001', hint = 'plus_required';
  elsif g.kind = 'solo' then
    raise exception 'Dein Solo-Zugang ist abgelaufen. Deine Inhalte bleiben sichtbar – zum Bearbeiten Solo verlängern.'
      using errcode = 'P0001', hint = 'plus_required';
  end if;
  raise exception 'Der Gruppenpass dieser Lerngruppe ist abgelaufen. Inhalte bleiben sichtbar, Änderungen sind erst nach einer Verlängerung wieder möglich.'
    using errcode = 'P0001', hint = 'plus_required';
end $$;

-- Persönlichen Lernbereich anlegen (oder vorhandenen liefern) und aktivieren
create or replace function app.ensure_solo_space(uid uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid;
begin
  select id into gid from public.groups where owner_id = uid and kind = 'solo';
  if gid is null then
    insert into public.groups (name, owner_id, invite_code, kind) values ('Mein Lernbereich', uid, app.new_invite_code(), 'solo') returning id into gid;
    perform app.attach_member(gid, uid, 'owner', null);
    insert into public.app_settings (group_id, key, value) values
      (gid, 'app_name', '"StudySpace"'::jsonb), (gid, 'group_goal_title', '"Mein Lernziel"'::jsonb), (gid, 'motivation_enabled', 'true'::jsonb)
    on conflict do nothing;
  end if;
  update public.profiles set active_group_id = gid, updated_at = now() where id = uid;
  return gid;
end $$;

-- ---------------------------------------------------------------------
-- 3. Funktionen für die App
-- ---------------------------------------------------------------------
create or replace function public.app_me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  best public.entitlements;
  trial public.entitlements;
begin
  if uid is null then return null; end if;
  -- bester aktiver Tarif: Gruppe vor Solo, bezahlt/Beta vor Freischaltung vor Testphase
  select * into best from public.entitlements e
  where e.user_id = uid and app.entitlement_active(e)
  order by app.plan_level(e.plan) = 'group' desc, e.plan = 'trial', e.source = 'admin', e.ends_at desc nulls first
  limit 1;
  select * into trial from public.entitlements e where e.user_id = uid and e.plan = 'trial';
  return jsonb_build_object(
    'user_id', uid,
    'status', (select status from public.profiles where id = uid),
    'session_ok', app.account_ok(),
    'display_name', (select display_name from public.profiles where id = uid),
    'active_group_id', app.active_group(),
    'member_id', app.my_member_id(),
    'level', app.user_level(uid),
    'has_plus', app.user_has_plus(uid),
    'plan', best.plan,
    'plan_source', best.source,
    'plan_id', best.id,
    'plan_until', best.ends_at,
    'plus_until', best.ends_at,
    'auto_renew', coalesce(best.auto_renew, false),
    'trial_used', trial.id is not null,
    'trial_ends_at', trial.ends_at,
    'beta_purchases', coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false),
    'tutorial_done', (select tutorial_done_at is not null from public.profiles where id = uid),
    'is_admin', exists (select 1 from public.admins where user_id = uid),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'kind', g.kind, 'role', gm.role, 'is_owner', g.owner_id = uid,
        'has_plus', app.group_has_plus(g.id), 'plus_until', app.group_plus_until(g.id),
        'members', (select count(*) from public.group_members x where x.group_id = g.id and x.left_at is null),
        'invite_code', case when gm.role = 'owner' and g.kind = 'team' then g.invite_code end
      ) order by g.kind = 'solo' desc, gm.joined_at)
      from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.user_id = uid and gm.left_at is null), '[]'::jsonb)
  );
end $$;

-- „Alleine lernen“: 14 Tage kostenlos, einmal pro Konto, ohne Zahlungsdaten
create or replace function public.app_start_trial() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not exists (select 1 from public.entitlements where user_id = uid and plan = 'trial') then
    insert into public.entitlements (user_id, plan, source, ends_at, price_cents) values (uid, 'trial', 'trial', now() + interval '14 days', 0);
    insert into public.subscription_events (provider, kind, user_id, plan, amount_cents) values ('trial', 'trial_started', uid, 'trial', 0);
  end if;
  -- Auch nach Ablauf: Lernbereich öffnen (dann nur lesbar)
  return app.ensure_solo_space(uid);
end $$;

-- Eigenen Lernbereich öffnen (falls vorhanden oder durch Tarif berechtigt)
create or replace function public.app_open_solo() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not exists (select 1 from public.groups where owner_id = uid and kind = 'solo') and app.user_level(uid) is null then
    raise exception 'Für einen eigenen Lernbereich die Testphase starten oder Solo wählen.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  return app.ensure_solo_space(uid);
end $$;

-- Beta: Kauf SIMULIEREN (keine Zahlung). Monatlich = 1 Monat (verlängert sich
-- in der Beta automatisch, bis gekündigt), Semester = 6 Monate ohne Verlängerung.
create or replace function public.app_beta_purchase(p_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  cur public.entitlements;
  new_end timestamptz;
  v_id uuid;
  v_group uuid;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false) is not true then
    raise exception 'Käufe sind gerade nicht möglich.' using errcode = 'P0001', hint = 'beta_closed';
  end if;
  if p_plan not in ('solo_monthly', 'solo_semester', 'group_monthly', 'group_semester') then
    raise exception 'Unbekannter Tarif' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subscription_events where user_id = uid and provider = 'beta' and occurred_at > now() - interval '1 day') >= 10 then
    raise exception 'Zu viele Käufe heute. Bitte morgen erneut versuchen.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  -- gleicher Tarif schon aktiv → verlängern statt doppelt anlegen
  select * into cur from public.entitlements e
  where e.user_id = uid and e.plan = p_plan and e.source = 'beta' and app.entitlement_active(e)
  order by e.ends_at desc limit 1 for update;
  if cur.id is not null then
    new_end := cur.ends_at + make_interval(months => app.plan_months(p_plan));
    update public.entitlements set ends_at = new_end, auto_renew = (app.plan_months(p_plan) = 1) where id = cur.id;
    v_id := cur.id;
  else
    new_end := now() + make_interval(months => app.plan_months(p_plan));
    insert into public.entitlements (user_id, plan, source, ends_at, auto_renew, price_cents, note)
    values (uid, p_plan, 'beta', new_end, app.plan_months(p_plan) = 1, app.plan_price_cents(p_plan), 'Beta – simulierter Kauf')
    returning id into v_id;
  end if;
  insert into public.subscription_events (provider, external_id, kind, user_id, plan, amount_cents)
  values ('beta', v_id::text, case when cur.id is null then 'started' else 'renewed' end, uid, p_plan, app.plan_price_cents(p_plan));
  -- Solo (und Gruppe) enthalten den eigenen Lernbereich; Solo öffnet ihn direkt
  if app.plan_level(p_plan) = 'solo' then
    v_group := app.ensure_solo_space(uid);
  end if;
  return jsonb_build_object('entitlement_id', v_id, 'ends_at', new_end, 'group_id', v_group);
end $$;

-- Beta: monatlichen Tarif kündigen (läuft bis zum Ende des Zeitraums)
create or replace function public.app_beta_cancel(p_entitlement uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.entitlements set auto_renew = false
  where id = p_entitlement and user_id = auth.uid() and source = 'beta' and auto_renew;
  if not found then raise exception 'Kein laufendes Monatsabo gefunden.' using errcode = 'P0001'; end if;
  insert into public.subscription_events (provider, external_id, kind, user_id, plan)
  select 'beta', id::text, 'canceled', user_id, plan from public.entitlements where id = p_entitlement;
end $$;

-- Beta: Monatsabos automatisch verlängern (täglich per pg_cron, falls vorhanden)
create or replace function app.beta_renew() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select * from public.entitlements
    where source = 'beta' and auto_renew and revoked_at is null and ends_at between now() - interval '3 days' and now() + interval '1 day'
  loop
    update public.entitlements set ends_at = greatest(ends_at, now()) + interval '1 month' where id = r.id;
    insert into public.subscription_events (provider, external_id, kind, user_id, plan, amount_cents)
    values ('beta', r.id::text, 'renewed', r.user_id, r.plan, app.plan_price_cents(r.plan));
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'studyspace-app-beta-renew';
    perform cron.schedule('studyspace-app-beta-renew', '23 4 * * *', 'select app.beta_renew()');
  end if;
end $$;

create or replace function public.app_tutorial_done() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.profiles set tutorial_done_at = coalesce(tutorial_done_at, now()) where id = auth.uid()
$$;

-- Gruppen erstellen: nur mit Gruppenpass; höchstens 3 eigene Lerngruppen
create or replace function public.app_create_group(p_name text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not app.user_has_plus(uid) then
    raise exception 'Zum Erstellen einer Lerngruppe wird ein Gruppenpass benötigt.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  if (select count(*) from public.groups where owner_id = uid and kind = 'team') >= 3 then
    raise exception 'Höchstens 3 eigene Lerngruppen pro Konto.' using errcode = 'P0001', hint = 'group_limit';
  end if;
  insert into public.groups (name, owner_id, invite_code, kind) values (left(btrim(p_name), 60), uid, app.new_invite_code(), 'team') returning id into gid;
  perform app.attach_member(gid, uid, 'owner', p_display_name);
  insert into public.app_settings (group_id, key, value) values
    (gid, 'app_name', to_jsonb(left(btrim(p_name), 60))), (gid, 'group_goal_title', '"Unser gemeinsames Lernziel"'::jsonb), (gid, 'motivation_enabled', 'true'::jsonb)
  on conflict do nothing;
  return gid;
end $$;

-- Beitreten: nur Lerngruppen (der eigene Lernbereich hat keine Einladung)
create or replace function public.app_join_group(p_code text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  active_members integer;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  -- Zeile sperren: gleichzeitige Beitritte werden nacheinander geprüft
  select * into g from public.groups where invite_code = upper(btrim(p_code)) and kind = 'team' for update;
  if g.id is null then raise exception 'Einladungscode ungültig.' using errcode = 'P0001', hint = 'invalid_code'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = uid and left_at is null) then
    update public.profiles set active_group_id = g.id where id = uid;
    return g.id;
  end if;
  if not app.group_has_plus(g.id) then
    raise exception 'Diese Lerngruppe hat derzeit keinen aktiven Gruppenpass.' using errcode = 'P0001', hint = 'plus_required';
  end if;
  select count(*) into active_members from public.group_members where group_id = g.id and left_at is null;
  if active_members >= 8 then
    raise exception 'Diese Lerngruppe ist voll (höchstens 8 Mitglieder).' using errcode = 'P0001', hint = 'member_limit';
  end if;
  perform app.attach_member(g.id, uid, 'member', p_display_name);
  return g.id;
end $$;

create or replace function public.app_invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', g.name, 'members', (select count(*) from public.group_members x where x.group_id = g.id and x.left_at is null), 'has_plus', app.group_has_plus(g.id))
  from public.groups g where g.invite_code = upper(btrim(p_code)) and g.kind = 'team' and auth.uid() is not null
$$;

create or replace function public.app_regenerate_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare code text := app.new_invite_code();
begin
  if not app.account_ok() or not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid() and kind = 'team') then
    raise exception 'Nur der Inhaber einer Lerngruppe kann den Einladungscode erneuern' using errcode = '42501';
  end if;
  update public.groups set invite_code = code, updated_at = now() where id = p_group;
  return code;
end $$;

revoke all on function public.app_start_trial(), public.app_open_solo(), public.app_beta_purchase(text), public.app_beta_cancel(uuid), public.app_tutorial_done() from public, anon;
grant execute on function public.app_start_trial(), public.app_open_solo(), public.app_beta_purchase(text), public.app_beta_cancel(uuid), public.app_tutorial_done() to authenticated;
revoke all on function app.ensure_solo_space(uuid), app.beta_renew() from public, anon, authenticated;
grant execute on function app.plan_level(text), app.plan_price_cents(text), app.plan_months(text), app.user_level(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Admin
-- ---------------------------------------------------------------------
create or replace function app.user_plan(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select e.plan from public.entitlements e
      where e.user_id = uid and app.entitlement_active(e)
      order by app.plan_level(e.plan) = 'group' desc, e.plan = 'trial', e.source = 'admin', e.ends_at desc nulls first limit 1),
    case
      when exists (select 1 from public.group_members gm join public.groups g on g.id = gm.group_id
                   where gm.user_id = uid and gm.left_at is null and g.kind = 'team' and app.group_has_plus(g.id)) then 'plus_member'
      when exists (select 1 from public.entitlements e where e.user_id = uid and e.plan = 'trial') then 'trial_expired'
      else 'free' end)
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  res jsonb;
begin
  perform app.require_admin();
  with u as (
    select au.id, au.created_at, p.status, p.last_seen_at, app.user_plan(au.id) as plan
    from auth.users au join public.profiles p on p.id = au.id
    where not exists (select 1 from public.admins a where a.user_id = au.id)
  ),
  act as (select e.* from public.entitlements e where app.entitlement_active(e)),
  paid as (select * from act where source in ('stripe', 'app_store', 'play_store')),
  beta as (select * from act where source = 'beta'),
  plans as (select unnest(array['solo_monthly', 'solo_semester', 'group_monthly', 'group_semester']) as p)
  select jsonb_build_object(
    'users_total', (select count(*) from u),
    'users_active_7d', (select count(*) from u where last_seen_at > now() - interval '7 days'),
    'users_online_approx', (select count(*) from u where last_seen_at > now() - interval '5 minutes'),
    'users_new_7d', (select count(*) from u where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from u where created_at > now() - interval '30 days'),
    'users_blocked', (select count(*) from u where status = 'blocked'),
    'users_free', (select count(*) from u where plan in ('free', 'trial_expired')),
    'users_plus_member', (select count(*) from u where plan = 'plus_member'),
    'groups_total', (select count(*) from public.groups where kind = 'team'),
    'groups_plus', (select count(*) from public.groups g where g.kind = 'team' and app.group_has_plus(g.id)),
    'solo_spaces', (select count(*) from public.groups where kind = 'solo'),
    'group_members_total', (select count(*) from public.group_members gm join public.groups g on g.id = gm.group_id where g.kind = 'team' and gm.left_at is null),
    'trials_active', (select count(*) from act where plan = 'trial'),
    'trials_expired', (select count(*) from public.entitlements e where e.plan = 'trial' and not app.entitlement_active(e)),
    'trials_converted', (select count(distinct t.user_id) from public.entitlements t join public.entitlements x on x.user_id = t.user_id
                          where t.plan = 'trial' and x.source in ('beta', 'stripe', 'app_store', 'play_store')),
    'paid_by_plan', (select jsonb_object_agg(p, (select count(*) from paid where plan = p)) from plans),
    'beta_by_plan', (select jsonb_object_agg(p, (select count(*) from beta where plan = p)) from plans),
    'subscriptions_paid_active', (select count(*) from paid where plan in ('solo_monthly', 'group_monthly', 'plus_monthly')),
    'semester_passes_active', (select count(*) from paid where plan in ('solo_semester', 'group_semester', 'semester_pass')),
    'grants_active', (select count(*) from act where source = 'admin'),
    'expired_30d', (select count(*) from public.entitlements e where e.revoked_at is null and e.plan <> 'trial' and e.ends_at between now() - interval '30 days' and now()),
    'cancellations_30d', (select count(*) from public.subscription_events s where s.kind = 'canceled' and s.provider <> 'beta' and s.occurred_at > now() - interval '30 days'),
    'revenue_cents_total', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments),
    'revenue_cents_30d', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments where occurred_at > now() - interval '30 days'),
    -- MRR (brutto): Monatsabos voll, Semesterpässe auf 6 Monate verteilt – nur echte Zahlungsquellen
    'mrr_cents', (select coalesce(sum(case when app.plan_months(plan) = 1 then app.plan_price_cents(plan) else app.plan_price_cents(plan) / 6.0 end), 0)::int from paid),
    'payments_connected', exists (select 1 from public.payments),
    -- Beta: simuliert, NIE Umsatz
    'beta_purchases_enabled', coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false),
    'beta_active', (select count(*) from beta),
    'beta_mrr_cents', (select coalesce(sum(case when app.plan_months(plan) = 1 then app.plan_price_cents(plan) else app.plan_price_cents(plan) / 6.0 end), 0)::int from beta),
    'beta_simulated_cents', (select coalesce(sum(amount_cents), 0) from public.subscription_events where provider = 'beta' and kind in ('started', 'renewed')),
    'beta_cancellations', (select count(*) from public.subscription_events where provider = 'beta' and kind = 'canceled'),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', (select count(*) from u where u.created_at::date = d::date)) order by d)
      from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d), '[]'::jsonb),
    'db_time', now()
  ) into res;
  return res;
end $$;

-- Freischaltung mit Tarifart (Solo oder Gruppe); kostenlos, kein Umsatz
drop function if exists public.admin_grant_plus(text, uuid, integer, timestamptz, text);
create or replace function public.admin_grant_plus(p_target_type text, p_target uuid, p_days integer default null, p_until timestamptz default null, p_note text default null, p_plan text default 'plus_grant')
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_end timestamptz := case when p_days is not null then now() + make_interval(days => p_days) else p_until end;
begin
  perform app.require_admin();
  if p_target_type not in ('user', 'group') then raise exception 'Ziel muss user oder group sein'; end if;
  if p_plan not in ('plus_grant', 'solo_grant') then raise exception 'Tarif muss plus_grant (Gruppe) oder solo_grant sein'; end if;
  if p_target_type = 'group' and p_plan <> 'plus_grant' then raise exception 'Gruppen erhalten immer den Gruppenpass'; end if;
  if p_days is not null and p_days not between 1 and 3660 then raise exception 'Tage zwischen 1 und 3660'; end if;
  if v_end is not null and v_end <= now() then raise exception 'Das Enddatum muss in der Zukunft liegen'; end if;
  if p_target_type = 'user' and not exists (select 1 from auth.users where id = p_target) then raise exception 'Konto nicht gefunden'; end if;
  if p_target_type = 'group' and not exists (select 1 from public.groups where id = p_target) then raise exception 'Gruppe nicht gefunden'; end if;
  insert into public.entitlements (user_id, group_id, plan, source, ends_at, granted_by, note)
  values (case when p_target_type = 'user' then p_target end, case when p_target_type = 'group' then p_target end,
          p_plan, 'admin', v_end, auth.uid(), left(p_note, 200))
  returning id into v_id;
  perform app.audit('plus.grant', p_target_type, p_target::text, jsonb_build_object('entitlement', v_id, 'plan', p_plan, 'ends_at', v_end, 'note', p_note));
  return v_id;
end $$;

-- Betriebsschalter (z. B. Beta-Käufe an/aus)
create or replace function public.admin_set_config(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_key not in ('beta_purchases') then raise exception 'Unbekannte Einstellung'; end if;
  insert into public.app_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform app.audit('config.set', 'config', p_key, jsonb_build_object('value', p_value));
end $$;

revoke all on function public.admin_grant_plus(text, uuid, integer, timestamptz, text, text), public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_grant_plus(text, uuid, integer, timestamptz, text, text), public.admin_set_config(text, jsonb) to authenticated;
