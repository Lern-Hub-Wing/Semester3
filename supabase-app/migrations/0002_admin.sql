-- =====================================================================
-- StudySpace App – Admin-Bereich (Funktionen für /app/admin/)
-- ---------------------------------------------------------------------
-- NUR im eigenen Supabase-Projekt der neuen App ausführen.
-- Jede Funktion prüft serverseitig: Konto steht in public.admins UND die
-- Sitzung ist mit Zwei-Faktor bestätigt (aal2). Jede Änderung landet im
-- Audit-Log. Kostenlose Freischaltungen (source = 'admin') werden nie als
-- Umsatz gezählt. Wiederholbar ausführbar.
-- =====================================================================

create or replace function app.require_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Administratoren (mit Zwei-Faktor-Anmeldung)' using errcode = '42501', hint = 'admin_required';
  end if;
  return auth.uid();
end $$;

create or replace function app.audit(p_action text, p_type text, p_id text, p_details jsonb default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.admin_audit (admin_id, action, target_type, target_id, details) values (auth.uid(), p_action, p_type, p_id, p_details)
$$;

-- Tarif eines Kontos für die Anzeige
create or replace function app.user_plan(uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when bool_or(e.plan = 'semester_pass') then 'semester_pass'
      when bool_or(e.plan = 'plus_monthly') then 'plus_monthly'
      else 'plus_grant' end
    from public.entitlements e where e.user_id = uid and app.entitlement_active(e)
    having count(*) > 0
  ), case when exists (
      select 1 from public.group_members gm where gm.user_id = uid and gm.left_at is null and app.group_has_plus(gm.group_id)
    ) then 'plus_member' else 'free' end)
$$;

-- Sitzungen eines Kontos serverseitig beenden
create or replace function app.revoke_sessions(uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Zugriffstokens: RLS lehnt alle vor diesem Zeitpunkt angemeldeten Sitzungen ab
  update public.profiles set sessions_valid_after = now(), updated_at = now() where id = uid;
  -- Aktualisierungstokens: Sitzungen in Supabase Auth löschen
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using uid;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using uid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Übersicht
-- ---------------------------------------------------------------------
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
  ), paid as (
    select e.* from public.entitlements e where e.source <> 'admin'
  )
  select jsonb_build_object(
    'users_total', (select count(*) from u),
    'users_active_7d', (select count(*) from u where last_seen_at > now() - interval '7 days'),
    'users_online_approx', (select count(*) from u where last_seen_at > now() - interval '5 minutes'),
    'users_new_7d', (select count(*) from u where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from u where created_at > now() - interval '30 days'),
    'users_blocked', (select count(*) from u where status = 'blocked'),
    'users_free', (select count(*) from u where plan = 'free'),
    'users_plus_member', (select count(*) from u where plan = 'plus_member'),
    'groups_total', (select count(*) from public.groups),
    'groups_plus', (select count(*) from public.groups g where app.group_has_plus(g.id)),
    'trials_active', 0,
    'subscriptions_paid_active', (select count(*) from paid e where e.plan = 'plus_monthly' and app.entitlement_active(e)),
    'semester_passes_active', (select count(*) from paid e where e.plan = 'semester_pass' and app.entitlement_active(e)),
    'grants_active', (select count(*) from public.entitlements e where e.source = 'admin' and app.entitlement_active(e)),
    'expired_30d', (select count(*) from public.entitlements e where e.revoked_at is null and e.ends_at between now() - interval '30 days' and now()),
    'cancellations_30d', (select count(*) from public.subscription_events s where s.kind = 'canceled' and s.occurred_at > now() - interval '30 days'),
    'revenue_cents_total', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments),
    'revenue_cents_30d', (select coalesce(sum(case when status = 'paid' then amount_cents when status = 'refunded' then -amount_cents else 0 end), 0) from public.payments where occurred_at > now() - interval '30 days'),
    -- MRR nur aus bezahlten, laufenden Monatsabos (Preis 4,99 €); Freischaltungen zählen nicht
    'mrr_cents', (select count(*) * 499 from paid e where e.plan = 'plus_monthly' and app.entitlement_active(e)),
    'payments_connected', exists (select 1 from public.payments),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', (select count(*) from u where u.created_at::date = d::date)) order by d)
      from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d), '[]'::jsonb),
    'db_time', now()
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------
create or replace function public.admin_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, email text, display_name text, status text, plan text, created_at timestamptz,
  last_sign_in_at timestamptz, last_seen_at timestamptz, online boolean, groups jsonb, is_admin boolean, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query
  with f as (
    select au.id, au.email::text, p.display_name, p.status, au.created_at, au.last_sign_in_at, p.last_seen_at
    from auth.users au join public.profiles p on p.id = au.id
    where coalesce(p_search, '') = ''
       or au.email ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
       or au.id::text = p_search
  )
  select f.id, f.email, f.display_name, f.status, app.user_plan(f.id), f.created_at, f.last_sign_in_at, f.last_seen_at,
    coalesce(f.last_seen_at > now() - interval '5 minutes', false),
    coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', gm.role))
      from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = f.id and gm.left_at is null), '[]'::jsonb),
    exists (select 1 from public.admins a where a.user_id = f.id),
    count(*) over ()
  from f order by f.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return (
    select jsonb_build_object(
      'id', au.id, 'email', au.email, 'display_name', p.display_name, 'status', p.status,
      'plan', app.user_plan(au.id), 'created_at', au.created_at, 'last_sign_in_at', au.last_sign_in_at,
      'last_seen_at', p.last_seen_at, 'email_confirmed', au.email_confirmed_at is not null,
      'providers', coalesce(au.raw_app_meta_data -> 'providers', '[]'::jsonb),
      'sessions_valid_after', p.sessions_valid_after,
      'is_admin', exists (select 1 from public.admins a where a.user_id = au.id),
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', gm.role, 'joined_at', gm.joined_at))
        from public.group_members gm join public.groups g on g.id = gm.group_id where gm.user_id = au.id and gm.left_at is null), '[]'::jsonb),
      'entitlements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('active', app.entitlement_active(e)) order by e.created_at desc)
        from public.entitlements e where e.user_id = au.id), '[]'::jsonb)
    )
    from auth.users au join public.profiles p on p.id = au.id where au.id = p_user
  );
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_status not in ('active', 'blocked') then raise exception 'Ungültiger Status'; end if;
  if p_user = auth.uid() then raise exception 'Das eigene Admin-Konto kann nicht gesperrt werden'; end if;
  update public.profiles set status = p_status, updated_at = now() where id = p_user;
  if not found then raise exception 'Konto nicht gefunden'; end if;
  if p_status = 'blocked' then
    perform app.revoke_sessions(p_user);
  end if;
  perform app.audit(case when p_status = 'blocked' then 'user.block' else 'user.unblock' end, 'user', p_user::text);
end $$;

create or replace function public.admin_revoke_sessions(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  perform app.revoke_sessions(p_user);
  perform app.audit('user.revoke_sessions', 'user', p_user::text);
end $$;

-- interne Hilfe: Konto aus allen Gruppen lösen; eigene Gruppen an das
-- dienstälteste Mitglied übergeben oder (ohne weitere Mitglieder) löschen
create or replace function app.detach_user(uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g record;
  heir uuid;
begin
  for g in select id from public.groups where owner_id = uid loop
    select gm.user_id into heir from public.group_members gm
      where gm.group_id = g.id and gm.user_id <> uid and gm.left_at is null order by gm.joined_at limit 1;
    if heir is null then
      perform app.purge_group(g.id);
    else
      update public.groups set owner_id = heir, updated_at = now() where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = heir;
    end if;
  end loop;
  update public.members set is_active = false, name = 'Ehemaliges Mitglied', user_id = null where user_id = uid;
  update public.group_members set left_at = now() where user_id = uid and left_at is null;
  update public.profiles set active_group_id = null where id = uid;
end $$;

-- Testkonto zurücksetzen: aus Gruppen lösen, Freischaltungen widerrufen, Sitzungen beenden
create or replace function public.admin_reset_user(p_user uuid, p_confirm_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if (select lower(email) from auth.users where id = p_user) is distinct from lower(btrim(p_confirm_email)) then
    raise exception 'Zur Bestätigung die genaue E-Mail-Adresse eingeben' using hint = 'confirm';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Admin-Konten können nicht zurückgesetzt werden'; end if;
  perform app.detach_user(p_user);
  update public.entitlements set revoked_at = now() where user_id = p_user and revoked_at is null and source = 'admin';
  delete from public.group_members where user_id = p_user;
  perform app.revoke_sessions(p_user);
  perform app.audit('user.reset', 'user', p_user::text);
end $$;

-- Konto endgültig löschen (Supabase Auth + Profil). Bezahlte Belege bleiben anonym erhalten.
create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text;
begin
  perform app.require_admin();
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'Konto nicht gefunden'; end if;
  if lower(v_email) <> lower(btrim(p_confirm_email)) then
    raise exception 'Zur Bestätigung die genaue E-Mail-Adresse eingeben' using hint = 'confirm';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'Admin-Konten können nicht gelöscht werden'; end if;
  perform app.detach_user(p_user);
  perform app.revoke_sessions(p_user);
  delete from auth.users where id = p_user;
  perform app.audit('user.delete', 'user', p_user::text, jsonb_build_object('email_domain', split_part(v_email, '@', 2)));
end $$;

-- ---------------------------------------------------------------------
-- Gruppen
-- ---------------------------------------------------------------------
create or replace function public.admin_groups(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, name text, owner_id uuid, owner_email text, members bigint, has_plus boolean, plus_until timestamptz,
  homework bigint, study_entries bigint, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query
  select g.id, g.name, g.owner_id, au.email::text,
    (select count(*) from public.group_members gm where gm.group_id = g.id and gm.left_at is null),
    app.group_has_plus(g.id),
    nullif(app.group_plus_until(g.id), '-infinity'::timestamptz),
    (select count(*) from public.homework h where h.group_id = g.id and h.deleted_at is null),
    (select count(*) from public.study_entries s where s.group_id = g.id and s.deleted_at is null),
    g.created_at, count(*) over ()
  from public.groups g left join auth.users au on au.id = g.owner_id
  where coalesce(p_search, '') = '' or g.name ilike '%' || p_search || '%' or au.email ilike '%' || p_search || '%' or g.id::text = p_search
  order by g.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_group_detail(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return (
    select jsonb_build_object(
      'id', g.id, 'name', g.name, 'owner_id', g.owner_id, 'created_at', g.created_at,
      'has_plus', app.group_has_plus(g.id), 'plus_until', nullif(app.group_plus_until(g.id), '-infinity'::timestamptz),
      'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', gm.user_id, 'email', au.email, 'name', m.name, 'role', gm.role, 'joined_at', gm.joined_at) order by gm.joined_at)
        from public.group_members gm join public.members m on m.id = gm.member_id left join auth.users au on au.id = gm.user_id
        where gm.group_id = g.id and gm.left_at is null), '[]'::jsonb),
      'usage', jsonb_build_object(
        'homework', (select count(*) from public.homework h where h.group_id = g.id and h.deleted_at is null),
        'study_entries', (select count(*) from public.study_entries s where s.group_id = g.id and s.deleted_at is null),
        'exams', (select count(*) from public.exams x where x.group_id = g.id and x.deleted_at is null),
        'modules', (select count(*) from public.modules x where x.group_id = g.id and x.archived_at is null)
      ),
      'entitlements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('active', app.entitlement_active(e)) order by e.created_at desc)
        from public.entitlements e where e.group_id = g.id), '[]'::jsonb)
    ) from public.groups g where g.id = p_group
  );
end $$;

create or replace function public.admin_delete_group(p_group uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  perform app.require_admin();
  select name into v_name from public.groups where id = p_group;
  if v_name is null then raise exception 'Gruppe nicht gefunden'; end if;
  if v_name <> btrim(p_confirm_name) then raise exception 'Zur Bestätigung den genauen Gruppennamen eingeben' using hint = 'confirm'; end if;
  perform app.purge_group(p_group);
  perform app.audit('group.delete', 'group', p_group::text, jsonb_build_object('name', v_name));
end $$;

create or replace function public.admin_remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if exists (select 1 from public.groups where id = p_group and owner_id = p_user) then
    raise exception 'Der Inhaber kann nicht entfernt werden – Gruppe löschen oder Inhaber zuerst wechseln';
  end if;
  update public.group_members set left_at = now() where group_id = p_group and user_id = p_user and left_at is null;
  update public.members set is_active = false where group_id = p_group and user_id = p_user;
  update public.profiles set active_group_id = null where id = p_user and active_group_id = p_group;
  perform app.audit('group.remove_member', 'group', p_group::text, jsonb_build_object('user_id', p_user));
end $$;

-- ---------------------------------------------------------------------
-- Plus-Freischaltungen (kostenlos, kein Umsatz)
-- ---------------------------------------------------------------------
-- p_days > 0 → für N Tage; p_until → bis Datum; beides leer → unbegrenzt
create or replace function public.admin_grant_plus(p_target_type text, p_target uuid, p_days integer default null, p_until timestamptz default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_end timestamptz := case when p_days is not null then now() + make_interval(days => p_days) else p_until end;
begin
  perform app.require_admin();
  if p_target_type not in ('user', 'group') then raise exception 'Ziel muss user oder group sein'; end if;
  if p_days is not null and p_days not between 1 and 3660 then raise exception 'Tage zwischen 1 und 3660'; end if;
  if v_end is not null and v_end <= now() then raise exception 'Das Enddatum muss in der Zukunft liegen'; end if;
  if p_target_type = 'user' and not exists (select 1 from auth.users where id = p_target) then raise exception 'Konto nicht gefunden'; end if;
  if p_target_type = 'group' and not exists (select 1 from public.groups where id = p_target) then raise exception 'Gruppe nicht gefunden'; end if;
  insert into public.entitlements (user_id, group_id, plan, source, ends_at, granted_by, note)
  values (case when p_target_type = 'user' then p_target end, case when p_target_type = 'group' then p_target end,
          'plus_grant', 'admin', v_end, auth.uid(), left(p_note, 200))
  returning id into v_id;
  perform app.audit('plus.grant', p_target_type, p_target::text, jsonb_build_object('entitlement', v_id, 'ends_at', v_end, 'note', p_note));
  return v_id;
end $$;

create or replace function public.admin_extend_plus(p_entitlement uuid, p_days integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_days not between 1 and 3660 then raise exception 'Tage zwischen 1 und 3660'; end if;
  update public.entitlements
    set ends_at = greatest(coalesce(ends_at, now()), now()) + make_interval(days => p_days), revoked_at = null
    where id = p_entitlement and source = 'admin' and ends_at is not null;
  if not found then raise exception 'Nur befristete Admin-Freischaltungen können verlängert werden'; end if;
  perform app.audit('plus.extend', 'entitlement', p_entitlement::text, jsonb_build_object('days', p_days));
end $$;

create or replace function public.admin_revoke_plus(p_entitlement uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  -- Bezahlte Zugänge werden über den Zahlungsanbieter gekündigt/erstattet, nicht hier
  update public.entitlements set revoked_at = now() where id = p_entitlement and source = 'admin' and revoked_at is null;
  if not found then raise exception 'Nur aktive Admin-Freischaltungen können hier widerrufen werden'; end if;
  perform app.audit('plus.revoke', 'entitlement', p_entitlement::text);
end $$;

create or replace function public.admin_audit_log(p_limit integer default 100) returns setof public.admin_audit
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query select * from public.admin_audit order by occurred_at desc limit least(greatest(p_limit, 1), 500);
end $$;

-- Für die Admin-Oberfläche: bin ich Admin, und ist 2FA schon bestätigt?
create or replace function public.admin_whoami() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'is_admin', exists (select 1 from public.admins a where a.user_id = auth.uid()),
    'username', (select username from public.admins a where a.user_id = auth.uid()),
    'aal', auth.jwt() ->> 'aal',
    'ok', app.is_admin()
  )
$$;

revoke all on function app.require_admin(), app.audit(text, text, text, jsonb), app.revoke_sessions(uuid), app.detach_user(uuid) from public, anon, authenticated;
grant execute on function app.user_plan(uuid) to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'admin_stats()', 'admin_users(text, integer, integer)', 'admin_user_detail(uuid)', 'admin_set_user_status(uuid, text)',
    'admin_revoke_sessions(uuid)', 'admin_reset_user(uuid, text)', 'admin_delete_user(uuid, text)',
    'admin_groups(text, integer, integer)', 'admin_group_detail(uuid)', 'admin_delete_group(uuid, text)',
    'admin_remove_member(uuid, uuid)', 'admin_grant_plus(text, uuid, integer, timestamptz, text)',
    'admin_extend_plus(uuid, integer)', 'admin_revoke_plus(uuid)', 'admin_audit_log(integer)', 'admin_whoami()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Eigenes Konto löschen (Recht auf Löschung) – Bestätigung mit E-Mail
-- ---------------------------------------------------------------------
create or replace function public.app_delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  v_email text;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Admin-Konten können hier nicht gelöscht werden'; end if;
  select email into v_email from auth.users where id = uid;
  if lower(coalesce(v_email, '')) <> lower(btrim(p_confirm)) then
    raise exception 'Zur Bestätigung die E-Mail-Adresse deines Kontos eingeben.' using errcode = 'P0001', hint = 'confirm';
  end if;
  perform app.detach_user(uid);
  perform app.revoke_sessions(uid);
  delete from auth.users where id = uid;
end $$;
revoke all on function public.app_delete_my_account(text) from public, anon;
grant execute on function public.app_delete_my_account(text) to authenticated;
