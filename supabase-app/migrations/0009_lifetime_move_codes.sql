-- =====================================================================
-- StudySpace App – Lifetime, persönliche Umzugs-Codes, Admin aus der App
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen (steckt in app_schema.sql). Wiederholbar.
--
-- 1. Lifetime-Tarife (Einmalkauf, ohne Ablauf): Solo 29,99 € · Gruppe 59,99 €
-- 2. Persönliche Umzugs-Codes: Ein Code gehört zu GENAU EINER Person einer
--    übernommenen Lerngruppe. Beim Einlösen tritt man der Gruppe bei,
--    übernimmt die Person mit allen Haken, Hausaufgaben-Haken und Lernzeiten
--    und erhält den freigeschalteten Zugang (Standard: Lifetime, Gruppe).
-- 3. Admin-Rechte an ein normales App-Konto geben/entziehen (Admin-Panel
--    direkt aus den Einstellungen; Zwei-Faktor bleibt Pflicht).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lifetime-Tarife
-- ---------------------------------------------------------------------
alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements add constraint entitlements_plan_check check (plan in (
  'trial', 'solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'solo_grant',
  'solo_lifetime', 'group_lifetime',
  'plus_monthly', 'semester_pass', 'plus_grant'
));
alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments add constraint payments_plan_check check (plan in (
  'solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'solo_lifetime', 'group_lifetime', 'plus_monthly', 'semester_pass'));

create or replace function app.plan_level(p text) returns text
language sql immutable as $$
  select case
    when p in ('group_monthly', 'group_semester', 'group_lifetime', 'plus_monthly', 'semester_pass', 'plus_grant') then 'group'
    when p in ('solo_monthly', 'solo_semester', 'solo_lifetime', 'solo_grant', 'trial') then 'solo'
  end
$$;

create or replace function app.plan_price_cents(p text) returns integer
language sql immutable as $$
  select case p
    when 'solo_monthly' then 249 when 'solo_semester' then 1199 when 'solo_lifetime' then 2999
    when 'group_monthly' then 499 when 'group_semester' then 2499 when 'group_lifetime' then 5999
    when 'plus_monthly' then 499 when 'semester_pass' then 1999
    else 0 end
$$;

-- Lifetime: 0 Monate = ohne Ablauf
create or replace function app.plan_months(p text) returns integer
language sql immutable as $$
  select case when p in ('solo_lifetime', 'group_lifetime') then 0
              when p in ('solo_semester', 'group_semester', 'semester_pass') then 6 else 1 end
$$;

create or replace function public.app_beta_purchase(p_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  cur public.entitlements;
  new_end timestamptz;
  v_id uuid;
  v_group uuid;
  lifetime boolean := p_plan in ('solo_lifetime', 'group_lifetime');
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if coalesce((select (value)::text = 'true' from public.app_config where key = 'beta_purchases'), false) is not true then
    raise exception 'Käufe sind gerade nicht möglich.' using errcode = 'P0001', hint = 'beta_closed';
  end if;
  if p_plan not in ('solo_monthly', 'solo_semester', 'group_monthly', 'group_semester', 'solo_lifetime', 'group_lifetime') then
    raise exception 'Unbekannter Tarif' using errcode = 'P0001';
  end if;
  if (select count(*) from public.subscription_events where user_id = uid and provider = 'beta' and occurred_at > now() - interval '1 day') >= 10 then
    raise exception 'Zu viele Käufe heute. Bitte morgen erneut versuchen.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  if lifetime then
    -- Wer schon dauerhaft freigeschaltet ist (gleiche oder höhere Stufe), kauft nicht doppelt
    if exists (select 1 from public.entitlements e where e.user_id = uid and e.ends_at is null and app.entitlement_active(e)
               and (app.plan_level(e.plan) = 'group' or app.plan_level(e.plan) = app.plan_level(p_plan)) and e.plan <> 'trial') then
      raise exception 'Du hast bereits dauerhaften Zugang.' using errcode = 'P0001', hint = 'already_lifetime';
    end if;
    insert into public.entitlements (user_id, plan, source, ends_at, auto_renew, price_cents, note)
    values (uid, p_plan, 'beta', null, false, app.plan_price_cents(p_plan), 'Beta – simulierter Einmalkauf')
    returning id into v_id;
    new_end := null;
  else
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
  end if;
  insert into public.subscription_events (provider, external_id, kind, user_id, plan, amount_cents)
  values ('beta', v_id::text, case when cur.id is null then 'started' else 'renewed' end, uid, p_plan, app.plan_price_cents(p_plan));
  if app.plan_level(p_plan) = 'solo' then
    v_group := app.ensure_solo_space(uid);
  end if;
  return jsonb_build_object('entitlement_id', v_id, 'ends_at', new_end, 'group_id', v_group, 'lifetime', lifetime);
end $$;
revoke all on function public.app_beta_purchase(text) from public, anon;
grant execute on function public.app_beta_purchase(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Persönliche Umzugs-Codes
-- ---------------------------------------------------------------------
alter table public.promo_codes add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.promo_codes add column if not exists member_id uuid references public.members(id) on delete cascade;
alter table public.promo_codes add column if not exists welcome text check (welcome is null or char_length(welcome) <= 500);
alter table public.promo_codes drop constraint if exists promo_codes_member_needs_group;
alter table public.promo_codes add constraint promo_codes_member_needs_group check (member_id is null or (group_id is not null and max_uses = 1));
create unique index if not exists promo_codes_one_open_per_member on public.promo_codes(member_id) where member_id is not null and revoked_at is null and uses = 0;

-- Personen einer Lerngruppe für den Umzug: wer ist schon verbunden, wer hat einen offenen Code?
create or replace function public.admin_move_people(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'invite_code', g.invite_code) from public.groups g where g.id = p_group),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'color', m.color,
        'email', (select u.email from auth.users u where u.id = m.user_id),
        'tasks_done', (select count(*) from public.task_completions c where c.member_id = m.id and c.is_completed),
        'focus_minutes', (select coalesce(sum(f.duration_seconds), 0) / 60 from public.focus_sessions f where f.member_id = m.id),
        'code', (select jsonb_build_object('id', pc.id, 'code', pc.code, 'plan', pc.plan, 'days', pc.days, 'created_at', pc.created_at)
                 from public.promo_codes pc where pc.member_id = m.id and pc.revoked_at is null and pc.uses = 0 limit 1)
      ) order by m.sort_order, m.name)
      from public.members m where m.group_id = p_group and m.is_active
    ), '[]'::jsonb));
end $$;

-- Übernommene Lerngruppen (für die Auswahl im Admin-Bereich)
create or replace function public.admin_move_groups() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'imported_at', si.created_at,
      'open', (select count(*) from public.members m where m.group_id = g.id and m.is_active and m.user_id is null)) order by si.created_at desc)
    from public.site_imports si join public.groups g on g.id = si.group_id
  ), '[]'::jsonb);
end $$;

-- Je Person einen Code (ersetzt einen offenen Code derselben Person)
create or replace function public.admin_create_move_codes(p_group uuid, p_members uuid[], p_plan text default 'plus_grant', p_days integer default null, p_welcome text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mid uuid;
  out jsonb := '[]'::jsonb;
  row public.promo_codes;
begin
  perform app.require_admin();
  if p_plan not in ('plus_grant', 'solo_grant') then raise exception 'Tarif muss plus_grant oder solo_grant sein'; end if;
  if p_days is not null and p_days not between 1 and 3660 then raise exception 'Laufzeit zwischen 1 und 3660 Tagen'; end if;
  if coalesce(array_length(p_members, 1), 0) = 0 then raise exception 'Bitte mindestens eine Person wählen.'; end if;
  foreach mid in array p_members loop
    if not exists (select 1 from public.members m where m.id = mid and m.group_id = p_group and m.is_active and m.user_id is null) then
      raise exception 'Eine gewählte Person ist schon mit einem Konto verbunden oder gehört nicht zur Gruppe.';
    end if;
    update public.promo_codes set revoked_at = now() where member_id = mid and revoked_at is null and uses = 0;
    insert into public.promo_codes (code, plan, days, max_uses, note, created_by, group_id, member_id, welcome)
    values (app.new_promo_code(), p_plan, p_days, 1, 'Umzug: ' || (select name from public.members where id = mid), auth.uid(), p_group, mid,
            left(nullif(btrim(p_welcome), ''), 500))
    returning * into row;
    out := out || jsonb_build_object('member_id', mid, 'name', (select name from public.members where id = mid), 'code', row.code, 'id', row.id);
  end loop;
  perform app.audit('codes.move', 'group', p_group::text, jsonb_build_object('count', array_length(p_members, 1), 'plan', p_plan, 'days', p_days));
  return out;
end $$;

-- Einlösen: Einladungscode, Umzugs-Code oder Tarif-Code
create or replace function public.app_redeem_code(p_code text, p_display_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  c text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  pc public.promo_codes;
  gid uuid;
  eid uuid;
  ends timestamptz;
  target public.members;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if (select count(*) from public.code_attempts where user_id = uid and not ok and at > now() - interval '15 minutes') >= 10 then
    raise exception 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  if char_length(c) <> 8 then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('kind', 'invalid', 'message', 'Code ungültig. Codes haben 8 Zeichen, z. B. ABCD-2345.');
  end if;

  -- a) Einladung zu einer Lerngruppe
  if exists (select 1 from public.groups where invite_code = c and kind = 'team') then
    gid := public.app_join_group(c, p_display_name);
    insert into public.code_attempts (user_id, ok) values (uid, true);
    return jsonb_build_object('kind', 'group', 'group_id', gid, 'name', (select name from public.groups where id = gid),
      'claimable', (select count(*) from public.members m where m.group_id = gid and m.user_id is null and m.is_active));
  end if;

  select * into pc from public.promo_codes where code = left(c, 4) || '-' || right(c, 4) for update;
  if pc.id is null or pc.revoked_at is not null or (pc.expires_at is not null and pc.expires_at <= now()) or pc.uses >= pc.max_uses then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('kind', 'invalid', 'message', 'Code ungültig, abgelaufen oder schon aufgebraucht.');
  end if;
  if exists (select 1 from public.promo_redemptions where code_id = pc.id and user_id = uid) then
    return jsonb_build_object('kind', 'invalid', 'message', 'Diesen Code hast du schon eingelöst.');
  end if;

  -- b) Persönlicher Umzugs-Code: Gruppe beitreten, eigene Person mit Fortschritt übernehmen
  if pc.member_id is not null then
    select * into target from public.members where id = pc.member_id and group_id = pc.group_id for update;
    if target.id is null or target.user_id is not null then
      insert into public.code_attempts (user_id) values (uid);
      return jsonb_build_object('kind', 'invalid', 'message', 'Diese Person ist schon mit einem Konto verbunden.');
    end if;
    if not exists (select 1 from public.group_members gm where gm.group_id = pc.group_id and gm.user_id = uid and gm.left_at is null)
       and (select count(*) from public.group_members gm where gm.group_id = pc.group_id and gm.left_at is null) >= 8 then
      return jsonb_build_object('kind', 'invalid', 'message', 'Diese Lerngruppe ist voll (höchstens 8 Mitglieder).');
    end if;
    perform app.attach_member(pc.group_id, uid, 'member', coalesce(nullif(btrim(p_display_name), ''), target.name));
    perform public.app_claim_member(pc.member_id);
    gid := pc.group_id;
  end if;

  -- Zugang freischalten (ohne Laufzeit = dauerhaft)
  ends := case when pc.days is null then null else now() + make_interval(days => pc.days) end;
  insert into public.entitlements (user_id, plan, source, ends_at, note, price_cents)
  values (uid, pc.plan, 'code', ends, 'Code ' || pc.code, 0) returning id into eid;
  insert into public.promo_redemptions (code_id, user_id, entitlement_id) values (pc.id, uid, eid);
  update public.promo_codes set uses = uses + 1 where id = pc.id;
  insert into public.code_attempts (user_id, ok) values (uid, true);
  if pc.member_id is not null then
    return jsonb_build_object('kind', 'move', 'plan', pc.plan, 'ends_at', ends, 'group_id', gid,
      'group_name', (select name from public.groups where id = gid), 'member_name', target.name, 'welcome', pc.welcome,
      'tasks_done', (select count(*) from public.task_completions tc where tc.member_id = pc.member_id and tc.is_completed));
  end if;
  return jsonb_build_object('kind', 'plan', 'plan', pc.plan, 'ends_at', ends);
end $$;
revoke all on function public.app_redeem_code(text, text) from public, anon;
grant execute on function public.app_redeem_code(text, text) to authenticated;

-- Codeliste im Admin: zusätzlich Person/Gruppe der Umzugs-Codes
create or replace function public.admin_codes(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'plan', c.plan, 'days', c.days, 'max_uses', c.max_uses, 'uses', c.uses,
      'expires_at', c.expires_at, 'note', c.note, 'created_at', c.created_at, 'revoked_at', c.revoked_at,
      'member_name', (select m.name from public.members m where m.id = c.member_id),
      'redeemed_by', (select coalesce(jsonb_agg(u.email order by r.redeemed_at), '[]'::jsonb) from public.promo_redemptions r join auth.users u on u.id = r.user_id where r.code_id = c.id)
    ) order by c.created_at desc)
    from (select * from public.promo_codes order by created_at desc limit greatest(1, least(p_limit, 1000))) c
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_move_people(uuid), public.admin_move_groups(), public.admin_create_move_codes(uuid, uuid[], text, integer, text), public.admin_codes(integer) from public, anon;
grant execute on function public.admin_move_people(uuid), public.admin_move_groups(), public.admin_create_move_codes(uuid, uuid[], text, integer, text), public.admin_codes(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Admin-Rechte für ein normales App-Konto
-- ---------------------------------------------------------------------
create or replace function public.admin_grant_admin(p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target uuid;
  base text;
begin
  perform app.require_admin();
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  if target is null then raise exception 'Kein App-Konto mit dieser E-Mail.'; end if;
  if exists (select 1 from public.admins where user_id = target) then return; end if;
  base := left(regexp_replace(lower(split_part(btrim(p_email), '@', 1)), '[^a-z0-9._-]', '', 'g'), 30);
  insert into public.admins (user_id, username)
  values (target, case when exists (select 1 from public.admins where username = base) then base || '-' || left(target::text, 4) else coalesce(nullif(base, ''), 'admin-' || left(target::text, 4)) end);
  perform app.audit('admin.grant', 'user', target::text, jsonb_build_object('email', lower(btrim(p_email))));
end $$;

create or replace function public.admin_revoke_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_user = auth.uid() then raise exception 'Die eigenen Admin-Rechte kannst du nicht entziehen.'; end if;
  if (select count(*) from public.admins) <= 1 then raise exception 'Mindestens ein Admin muss bleiben.'; end if;
  delete from public.admins where user_id = p_user;
  perform app.audit('admin.revoke', 'user', p_user::text, null);
end $$;
revoke all on function public.admin_grant_admin(text), public.admin_revoke_admin(uuid) from public, anon;
grant execute on function public.admin_grant_admin(text), public.admin_revoke_admin(uuid) to authenticated;
