-- =====================================================================
-- StudySpace App – Umzug von der bisherigen Seite, Codes, Rechtliches,
-- „Wer schreibt diese Prüfung?“
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen. Wiederholbar.
--
--  1. Wer schreibt? Fächer mit Teilnehmenden (modules.participants, aus
--     der gemeinsamen Migration 009) sind in der App ECHT geschützt: Wer
--     nicht eingetragen ist, kann Fach, Prüfungen, Lernplan, Aufgaben,
--     Haken, Hausaufgaben, Fokuszeiten und Verlauf dazu nicht lesen
--     (Row Level Security, serverseitig).
--  2. Codes: Admin erstellt Tarif-Codes (Solo/Gruppe, Laufzeit, Anzahl),
--     Nutzer lösen Codes ein – ein Feld für Einladungen UND Tarif-Codes.
--  3. Rechtliches: Zustimmung mit Fassung und Zeitpunkt; Impressum-Angaben
--     trägt der Admin ein (werden nie erfunden).
--  4. Umzug: Admin übernimmt die Sicherung der bisherigen Seite in eine
--     neue Lerngruppe (alle Daten, Rohdatei wird zusätzlich gespeichert).
--     Wer beitritt, wählt „Wer bist du?“ und bekommt seine alten Haken
--     und Lernzeiten.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Wer schreibt diese Prüfung? (echter Schutz in der App)
-- ---------------------------------------------------------------------
alter table public.modules add column if not exists participants uuid[];

-- Darf das angemeldete Konto dieses Fach sehen? (leer = alle in der Gruppe)
create or replace function app.module_visible(mid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select m.participants is null or cardinality(m.participants) = 0 or app.my_member_id() = any(m.participants)
    from public.modules m where m.id = mid
  ), true)
$$;
create or replace function app.entry_visible(eid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select app.module_visible(e.module_id) from public.study_entries e where e.id = eid), true)
$$;
create or replace function app.task_visible(tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select app.entry_visible(t.study_entry_id) from public.tasks t where t.id = tid), true)
$$;
create or replace function app.homework_visible(hid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select app.module_visible(h.module_id) from public.homework h where h.id = hid), true)
$$;
-- Verlauf: Einträge zu Inhalten, die man nicht sehen darf, ausblenden
create or replace function app.activity_visible(p_type text, p_id text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  begin
    v_id := split_part(p_id, ':', 1)::uuid;
  exception when others then
    return true;
  end;
  return case p_type
    when 'modules' then app.module_visible(v_id)
    when 'exams' then coalesce((select app.module_visible(x.module_id) from public.exams x where x.id = v_id), true)
    when 'module_topics' then coalesce((select app.module_visible(x.module_id) from public.module_topics x where x.id = v_id), true)
    when 'study_entries' then app.entry_visible(v_id)
    when 'tasks' then app.task_visible(v_id)
    when 'task_completions' then app.task_visible(v_id)
    when 'homework' then app.homework_visible(v_id)
    when 'homework_parts' then coalesce((select app.homework_visible(x.homework_id) from public.homework_parts x where x.id = v_id), true)
    when 'homework_completions' then coalesce(
      (select app.homework_visible(x.homework_id) from public.homework_parts x where x.id = v_id),
      app.homework_visible(v_id))
    else true
  end;
end $$;
revoke all on function app.module_visible(uuid), app.entry_visible(uuid), app.task_visible(uuid), app.homework_visible(uuid), app.activity_visible(text, text) from public, anon;
grant execute on function app.module_visible(uuid), app.entry_visible(uuid), app.task_visible(uuid), app.homework_visible(uuid), app.activity_visible(text, text) to authenticated, service_role;

-- Zusätzliche (einschränkende) Lese-Regeln – gelten zusätzlich zu „nur die aktive Gruppe“
drop policy if exists app_writers on public.modules;
create policy app_writers on public.modules as restrictive for select to authenticated
  using (participants is null or cardinality(participants) = 0 or app.my_member_id() = any(participants));
drop policy if exists app_writers on public.exams;
create policy app_writers on public.exams as restrictive for select to authenticated using (app.module_visible(module_id));
drop policy if exists app_writers on public.module_topics;
create policy app_writers on public.module_topics as restrictive for select to authenticated using (app.module_visible(module_id));
drop policy if exists app_writers on public.study_entries;
create policy app_writers on public.study_entries as restrictive for select to authenticated using (app.module_visible(module_id));
drop policy if exists app_writers on public.tasks;
create policy app_writers on public.tasks as restrictive for select to authenticated using (app.entry_visible(study_entry_id));
drop policy if exists app_writers on public.task_completions;
create policy app_writers on public.task_completions as restrictive for select to authenticated using (app.task_visible(task_id));
drop policy if exists app_writers on public.homework;
create policy app_writers on public.homework as restrictive for select to authenticated using (app.module_visible(module_id));
drop policy if exists app_writers on public.homework_parts;
create policy app_writers on public.homework_parts as restrictive for select to authenticated using (app.homework_visible(homework_id));
drop policy if exists app_writers on public.homework_completions;
create policy app_writers on public.homework_completions as restrictive for select to authenticated using (app.homework_visible(homework_id));
drop policy if exists app_writers on public.focus_sessions;
create policy app_writers on public.focus_sessions as restrictive for select to authenticated using (module_id is null or app.module_visible(module_id));
drop policy if exists app_writers on public.activity_log;
create policy app_writers on public.activity_log as restrictive for select to authenticated using (app.activity_visible(entity_type, entity_id));

-- ---------------------------------------------------------------------
-- 2. Betriebsschalter: Import-Modus überspringt Kontingente und Rate Limits
--    (nur innerhalb der Admin-Funktion admin_import_site, transaktionslokal)
-- ---------------------------------------------------------------------
create or replace function app.importing() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.importing', true), '') = 'on'
$$;

create or replace function public.ss_rate_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  max_per_minute integer := tg_argv[0]::integer;
  ts_column text := coalesce(tg_argv[1], 'created_at');
  recent integer;
begin
  if app.importing() then return new; end if;
  if to_jsonb(new) ? 'group_id' then
    execute format('select count(*) from public.%I where group_id = $1 and %I > now() - interval ''1 minute''', tg_table_name, ts_column)
      into recent using new.group_id;
  else
    execute format('select count(*) from public.%I where %I > now() - interval ''1 minute''', tg_table_name, ts_column)
      into recent;
  end if;
  if recent >= max_per_minute then
    raise exception 'Zu viele neue Einträge in kurzer Zeit. Bitte kurz warten.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  return new;
end $$;

create or replace function app.enforce_quota() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  max_active integer := tg_argv[0]::integer;   -- 0 = keine Grenze
  max_per_day integer := tg_argv[1]::integer;
  label text := tg_argv[2];
  active_count integer;
  becomes_active boolean := (tg_op = 'INSERT' and (to_jsonb(new) ->> 'deleted_at') is null)
    or (tg_op = 'UPDATE' and (to_jsonb(old) ->> 'deleted_at') is not null and (to_jsonb(new) ->> 'deleted_at') is null);
begin
  if app.importing() then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.group_usage (group_id, day, table_name, inserts)
    values (new.group_id, (now() at time zone 'Europe/Berlin')::date, tg_table_name, 1)
    on conflict (group_id, day, table_name) do update set inserts = public.group_usage.inserts + 1
    returning inserts into active_count;
    if active_count > max_per_day then
      raise exception 'Tageslimit für neue % erreicht (% pro Tag). Morgen geht es weiter.', label, max_per_day
        using errcode = 'P0001', hint = 'quota_daily';
    end if;
  end if;
  if becomes_active and max_active > 0 then
    perform 1 from public.groups where id = new.group_id for update;
    execute format('select count(*) from public.%I where group_id = $1 and deleted_at is null and id <> $2', tg_table_name)
      into active_count using new.group_id, new.id;
    if active_count >= max_active then
      raise exception 'Grenze erreicht: höchstens % aktive % pro Gruppe. Erledigte oder alte Einträge löschen, um Platz zu schaffen.', max_active, label
        using errcode = 'P0001', hint = 'quota_active';
    end if;
  end if;
  return new;
end $$;

create or replace function public.ss_member_rules() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if app.importing() then return new; end if;
  if tg_op = 'INSERT' and (select count(*) from public.members where group_id = new.group_id and is_active) >= 8 then
    raise exception 'Eine Gruppe hat höchstens 8 Mitglieder' using errcode = 'P0001', hint = 'member_limit';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Rechtliches: Zustimmung und Impressum
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists terms_version text check (terms_version is null or char_length(terms_version) <= 20);
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.app_accept_terms(p_version text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if p_version !~ '^[0-9A-Za-z.-]{1,20}$' then raise exception 'Ungültige Fassung'; end if;
  update public.profiles set terms_version = p_version, terms_accepted_at = now(), updated_at = now() where id = auth.uid();
end $$;

-- Impressum (öffentlich, auch ohne Anmeldung – gesetzlich vorgeschrieben)
create or replace function public.app_legal_info() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('imprint', (select value from public.app_config where key = 'legal_imprint'))
$$;

revoke all on function public.app_accept_terms(text), public.app_legal_info() from public;
grant execute on function public.app_accept_terms(text) to authenticated;
grant execute on function public.app_legal_info() to anon, authenticated;

-- Betriebsschalter + Impressum (nur Admin)
create or replace function public.admin_set_config(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  perform app.require_admin();
  if p_key not in ('beta_purchases', 'ai_plans_per_day', 'legal_imprint') then raise exception 'Unbekannte Einstellung'; end if;
  if p_key = 'legal_imprint' then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'Impressum: Angaben fehlen'; end if;
    for k in select jsonb_object_keys(p_value) loop
      if k not in ('name', 'street', 'city', 'country', 'email', 'phone', 'responsible', 'vat_id') then raise exception 'Impressum: unbekanntes Feld %', k; end if;
      if jsonb_typeof(p_value -> k) <> 'string' or char_length(p_value ->> k) > 200 then raise exception 'Impressum: % ist zu lang', k; end if;
    end loop;
    if coalesce(btrim(p_value ->> 'name'), '') = '' or coalesce(btrim(p_value ->> 'street'), '') = '' or coalesce(btrim(p_value ->> 'city'), '') = '' or coalesce(btrim(p_value ->> 'email'), '') = '' then
      raise exception 'Impressum: Name, Straße, Ort und E-Mail sind Pflicht';
    end if;
  elsif p_key = 'ai_plans_per_day' and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 0 and 100) then
    raise exception 'KI-Pläne pro Tag: 0 bis 100';
  end if;
  insert into public.app_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform app.audit('config.set', 'config', p_key, jsonb_build_object('value', p_value));
end $$;
revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Codes: Tarif-Codes (Admin) + ein Einlösefeld für alles
-- ---------------------------------------------------------------------
alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check check (source in ('admin', 'trial', 'beta', 'code', 'stripe', 'app_store', 'play_store'));

create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  plan        text not null check (plan in ('solo_grant', 'plus_grant')),
  days        integer check (days is null or days between 1 and 3660),
  max_uses    integer not null default 1 check (max_uses between 1 and 1000),
  uses        integer not null default 0 check (uses >= 0),
  expires_at  timestamptz,
  note        text check (note is null or char_length(note) <= 200),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create table if not exists public.promo_redemptions (
  code_id        uuid not null references public.promo_codes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  redeemed_at    timestamptz not null default now(),
  primary key (code_id, user_id)
);
create table if not exists public.code_attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ok      boolean not null default false,
  at      timestamptz not null default now()
);
create index if not exists code_attempts_user_idx on public.code_attempts(user_id, at);
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.code_attempts enable row level security;
revoke all on public.promo_codes, public.promo_redemptions, public.code_attempts from anon, authenticated;
grant all on public.promo_codes, public.promo_redemptions, public.code_attempts to service_role;

create or replace function app.new_promo_code() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if i = 4 then v_code := v_code || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.promo_codes pc where pc.code = v_code)
          and not exists (select 1 from public.groups g where g.invite_code = replace(v_code, '-', ''));
  end loop;
  return v_code;
end $$;

-- Ein Feld für alles: Einladungscode (8 Zeichen) oder Tarif-Code (XXXX-XXXX)
create or replace function public.app_redeem_code(p_code text, p_display_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  c text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  pc public.promo_codes;
  gid uuid;
  eid uuid;
  ends timestamptz;
begin
  if uid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  -- Gegen Durchprobieren: höchstens 10 Fehlversuche in 15 Minuten
  if (select count(*) from public.code_attempts where user_id = uid and not ok and at > now() - interval '15 minutes') >= 10 then
    raise exception 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  -- Fehlversuche werden nicht als Fehler (Rollback) gemeldet, sondern als Antwort – nur so bleiben sie gezählt
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

  -- b) Tarif-Code
  select * into pc from public.promo_codes where code = left(c, 4) || '-' || right(c, 4) for update;
  if pc.id is null or pc.revoked_at is not null or (pc.expires_at is not null and pc.expires_at <= now()) or pc.uses >= pc.max_uses then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('kind', 'invalid', 'message', 'Code ungültig, abgelaufen oder schon aufgebraucht.');
  end if;
  if exists (select 1 from public.promo_redemptions where code_id = pc.id and user_id = uid) then
    return jsonb_build_object('kind', 'invalid', 'message', 'Diesen Code hast du schon eingelöst.');
  end if;
  ends := case when pc.days is null then null else now() + make_interval(days => pc.days) end;
  insert into public.entitlements (user_id, plan, source, ends_at, note, price_cents)
  values (uid, pc.plan, 'code', ends, 'Code ' || pc.code, 0) returning id into eid;
  insert into public.promo_redemptions (code_id, user_id, entitlement_id) values (pc.id, uid, eid);
  update public.promo_codes set uses = uses + 1 where id = pc.id;
  insert into public.code_attempts (user_id, ok) values (uid, true);
  return jsonb_build_object('kind', 'plan', 'plan', pc.plan, 'ends_at', ends);
end $$;
revoke all on function public.app_redeem_code(text, text) from public, anon;
grant execute on function public.app_redeem_code(text, text) to authenticated;

create or replace function public.admin_create_codes(p_plan text, p_days integer, p_max_uses integer default 1, p_count integer default 1, p_expires_at timestamptz default null, p_note text default null)
returns setof public.promo_codes
language plpgsql security definer set search_path = public, pg_temp as $$
declare i int;
begin
  perform app.require_admin();
  if p_plan not in ('solo_grant', 'plus_grant') then raise exception 'Tarif muss solo_grant oder plus_grant sein'; end if;
  if p_count not between 1 and 50 then raise exception 'Anzahl zwischen 1 und 50'; end if;
  if p_days is not null and p_days not between 1 and 3660 then raise exception 'Laufzeit zwischen 1 und 3660 Tagen'; end if;
  if p_max_uses not between 1 and 1000 then raise exception 'Einlösungen zwischen 1 und 1000'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Ablaufdatum muss in der Zukunft liegen'; end if;
  for i in 1..p_count loop
    return query insert into public.promo_codes (code, plan, days, max_uses, expires_at, note, created_by)
      values (app.new_promo_code(), p_plan, p_days, p_max_uses, p_expires_at, left(nullif(btrim(p_note), ''), 200), auth.uid()) returning *;
  end loop;
  perform app.audit('codes.create', 'promo', p_plan, jsonb_build_object('count', p_count, 'days', p_days, 'max_uses', p_max_uses, 'note', p_note));
end $$;

create or replace function public.admin_codes(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'plan', c.plan, 'days', c.days, 'max_uses', c.max_uses, 'uses', c.uses,
      'expires_at', c.expires_at, 'note', c.note, 'created_at', c.created_at, 'revoked_at', c.revoked_at,
      'redeemed_by', (select coalesce(jsonb_agg(u.email order by r.redeemed_at), '[]'::jsonb) from public.promo_redemptions r join auth.users u on u.id = r.user_id where r.code_id = c.id)
    ) order by c.created_at desc)
    from (select * from public.promo_codes order by created_at desc limit greatest(1, least(p_limit, 1000))) c
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_revoke_code(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  update public.promo_codes set revoked_at = now() where id = p_id and revoked_at is null;
  perform app.audit('codes.revoke', 'promo', p_id::text, null);
end $$;
revoke all on function public.admin_create_codes(text, integer, integer, integer, timestamptz, text), public.admin_codes(integer), public.admin_revoke_code(uuid) from public, anon;
grant execute on function public.admin_create_codes(text, integer, integer, integer, timestamptz, text), public.admin_codes(integer), public.admin_revoke_code(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Umzug von der bisherigen Seite
-- ---------------------------------------------------------------------
-- Rohdatei jeder Übernahme (zusätzliche Sicherheitskopie in der App-Datenbank)
create table if not exists public.site_imports (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.groups(id) on delete set null,
  imported_by uuid references auth.users(id) on delete set null,
  sha256      text not null,
  counts      jsonb not null,
  raw         jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.site_imports enable row level security;
revoke all on public.site_imports from anon, authenticated;
grant all on public.site_imports to service_role;

-- Spalten, die übernommen werden (serverseitige Felder wie version/updated_at setzt die Datenbank)
create or replace function app.import_columns(p_table text) returns text[]
language sql immutable as $$
  select case p_table
    when 'members' then array['id', 'name', 'color', 'sort_order', 'is_active']
    when 'modules' then array['id', 'name', 'color', 'description', 'sort_order', 'archived_at', 'participants']
    when 'module_topics' then array['id', 'module_id', 'title', 'description', 'sort_order', 'archived_at']
    when 'exams' then array['id', 'module_id', 'starts_at', 'ends_at', 'timezone', 'location', 'notes', 'deleted_at']
    when 'study_entries' then array['id', 'module_id', 'topic_id', 'study_date', 'title', 'description', 'sort_order', 'deleted_at']
    when 'tasks' then array['id', 'study_entry_id', 'title', 'description', 'sort_order', 'deleted_at']
    when 'task_completions' then array['task_id', 'member_id', 'is_completed', 'completed_at']
    when 'homework' then array['id', 'module_id', 'title', 'description', 'due_date', 'earliest_start', 'priority', 'effort_minutes', 'unit_count', 'deleted_at']
    when 'homework_parts' then array['id', 'homework_id', 'kind', 'title', 'planned_date', 'sort_order', 'deleted_at']
    when 'homework_completions' then array['target_id', 'homework_id', 'member_id', 'is_completed', 'completed_at']
    when 'focus_sessions' then array['id', 'member_id', 'module_id', 'started_at', 'ended_at', 'duration_seconds']
    when 'music_tracks' then array['id', 'category', 'title', 'youtube_id', 'start_seconds', 'sort_order', 'deleted_at']
    when 'app_settings' then array['key', 'value']
  end
$$;

create or replace function app.import_rows(p_table text, p_rows jsonb, p_group uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cols text;
  n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then return 0; end if;
  select string_agg(quote_ident(c), ', ') into cols from unnest(app.import_columns(p_table)) c;
  if cols is null then raise exception 'Unbekannte Tabelle %', p_table; end if;
  execute format('insert into public.%I (%s, group_id) select %s, $2 from jsonb_populate_recordset(null::public.%I, $1)', p_table, cols, cols, p_table)
    using p_rows, p_group;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.import_rows(text, jsonb, uuid), app.import_columns(text) from public, anon, authenticated;

/**
 * Übernimmt die Umzugsdatei der bisherigen Seite in eine NEUE Lerngruppe.
 *   p_data          Inhalt der Datei „studyspace-umzug-….json“
 *   p_owner_email   App-Konto, dem die Gruppe gehört (muss registriert sein)
 *   p_owner_member  welche Person der Seite das ist (ID aus der Datei)
 *   p_group_name    Name der Lerngruppe
 * Alles oder nichts (eine Transaktion). Die Gruppe erhält den Gruppenpass
 * ohne Ablauf (Freischaltung, kein Umsatz). Die Datei wird zusätzlich als
 * Sicherheitskopie gespeichert. Dieselbe Datei lässt sich nicht zweimal
 * übernehmen.
 */
create or replace function public.admin_import_site(p_data jsonb, p_owner_email text, p_owner_member uuid, p_group_name text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  owner uuid;
  gid uuid;
  t text;
  n integer;
  counts jsonb := '{}'::jsonb;
  tables jsonb := p_data -> 'tables';
  order_list text[] := array['members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions',
    'homework', 'homework_parts', 'homework_completions', 'focus_sessions', 'music_tracks', 'app_settings'];
  sha text := encode(sha256(convert_to(p_data::text, 'UTF8')), 'hex');
  skipped integer := coalesce(jsonb_array_length(case when jsonb_typeof(tables -> 'attachments') = 'array' then tables -> 'attachments' end), 0);
begin
  perform app.require_admin();
  if coalesce(p_data ->> 'format', '') not in ('studyspace-umzug', 'studyspace-export') or jsonb_typeof(tables) is distinct from 'object'
     or jsonb_typeof(tables -> 'members') is distinct from 'array' then
    raise exception 'Das ist keine Umzugsdatei der StudySpace-Seite.';
  end if;
  if pg_column_size(p_data) > 20 * 1024 * 1024 then raise exception 'Datei zu groß'; end if;
  if exists (select 1 from public.site_imports where sha256 = sha) then
    raise exception 'Diese Datei wurde bereits übernommen.' using hint = 'already_imported';
  end if;
  if exists (select 1 from public.members m join jsonb_to_recordset(tables -> 'members') as x(id uuid) on x.id = m.id) then
    raise exception 'Diese Personen wurden bereits übernommen (gleiche IDs).' using hint = 'already_imported';
  end if;
  select id into owner from auth.users where lower(email) = lower(btrim(p_owner_email));
  if owner is null then raise exception 'Kein App-Konto mit dieser E-Mail. Bitte zuerst in der App registrieren.'; end if;
  if not exists (select 1 from jsonb_to_recordset(tables -> 'members') as x(id uuid) where x.id = p_owner_member) then
    raise exception 'Die gewählte Person steht nicht in der Datei.';
  end if;
  if coalesce(btrim(p_group_name), '') = '' then raise exception 'Bitte einen Gruppennamen angeben.'; end if;

  perform set_config('app.importing', 'on', true);
  insert into public.groups (name, owner_id, invite_code, kind) values (left(btrim(p_group_name), 60), owner, app.new_invite_code(), 'team') returning id into gid;
  -- Gruppenpass ohne Ablauf (Freischaltung durch den Admin, kein Umsatz)
  insert into public.entitlements (group_id, plan, source, ends_at, granted_by, note)
  values (gid, 'plus_grant', 'admin', null, auth.uid(), 'Umzug von der bisherigen Seite');

  foreach t in array order_list loop
    n := app.import_rows(t, case
      -- Seiten-Einstellungen (z. B. „umgezogen“) gibt es in der App nicht
      when t = 'app_settings' then (select jsonb_agg(x) from jsonb_array_elements(case when jsonb_typeof(tables -> t) = 'array' then tables -> t else '[]'::jsonb end) x
                                    where x ->> 'key' in ('app_name', 'group_goal_title', 'motivation_enabled'))
      when jsonb_typeof(tables -> t) = 'array' then tables -> t
    end, gid);
    counts := counts || jsonb_build_object(t, n);
  end loop;

  -- Inhaber mit seiner bisherigen Person verbinden
  update public.members set user_id = owner, is_active = true where id = p_owner_member and group_id = gid;
  insert into public.group_members (group_id, user_id, member_id, role) values (gid, owner, p_owner_member, 'owner');
  update public.profiles set active_group_id = gid, updated_at = now() where id = owner;
  insert into public.app_settings (group_id, key, value) values
    (gid, 'app_name', to_jsonb(left(btrim(p_group_name), 60))), (gid, 'group_goal_title', '"Unser gemeinsames Lernziel"'::jsonb), (gid, 'motivation_enabled', 'true'::jsonb)
  on conflict do nothing;

  -- Verlauf: statt hunderter „angelegt“-Einträge ein Hinweis (verhindert auch Mitteilungen zu alten Hausaufgaben)
  delete from public.activity_log where group_id = gid;
  insert into public.activity_log (group_id, actor_member_id, actor_label, entity_type, entity_id, action, summary)
  values (gid, p_owner_member, (select name from public.members where id = p_owner_member), 'app_settings', 'app_name', 'updated', 'Lerngruppe von der bisherigen Seite übernommen');

  insert into public.site_imports (group_id, imported_by, sha256, counts, raw) values (gid, auth.uid(), sha, counts || jsonb_build_object('attachments_skipped', skipped), p_data);
  perform app.audit('site.import', 'group', gid::text, counts || jsonb_build_object('owner', p_owner_email, 'attachments_skipped', skipped));
  return jsonb_build_object('group_id', gid, 'invite_code', (select invite_code from public.groups where id = gid), 'counts', counts, 'attachments_skipped', skipped);
end $$;
revoke all on function public.admin_import_site(jsonb, text, uuid, text) from public, anon;
grant execute on function public.admin_import_site(jsonb, text, uuid, text) to authenticated;

-- „Wer bist du?“ nach dem Beitritt: noch nicht verbundene Personen der Gruppe
create or replace function public.app_claimable_members() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'color', m.color) order by m.sort_order), '[]'::jsonb)
  from public.members m
  where m.group_id = app.active_group() and m.user_id is null and m.is_active and app.account_ok()
$$;

-- Bisherige Person übernehmen: Haken, Hausaufgaben-Haken und Lernzeiten bleiben erhalten
create or replace function public.app_claim_member(p_member uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  gid uuid := app.active_group();
  cur uuid := app.my_member_id();
  target public.members;
begin
  if uid is null or gid is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select * into target from public.members where id = p_member and group_id = gid for update;
  if target.id is null or target.user_id is not null then
    raise exception 'Diese Person ist schon mit einem Konto verbunden.' using errcode = 'P0001', hint = 'already_claimed';
  end if;
  perform set_config('app.importing', 'on', true);
  -- Was das neue Profil seit dem Beitritt schon abgehakt hat, wandert mit (ohne Doppelte)
  if cur is not null and cur <> p_member then
    update public.task_completions c set member_id = p_member where c.member_id = cur
      and not exists (select 1 from public.task_completions x where x.task_id = c.task_id and x.member_id = p_member);
    update public.homework_completions c set member_id = p_member where c.member_id = cur
      and not exists (select 1 from public.homework_completions x where x.target_id = c.target_id and x.member_id = p_member);
    update public.focus_sessions set member_id = p_member where member_id = cur;
    delete from public.task_completions where member_id = cur;
    delete from public.homework_completions where member_id = cur;
  end if;
  update public.group_members set member_id = p_member where group_id = gid and user_id = uid;
  update public.members set user_id = uid, is_active = true where id = p_member;
  if cur is not null and cur <> p_member then
    update public.activity_log set actor_member_id = p_member where actor_member_id = cur;
    delete from public.members where id = cur;
  end if;
end $$;
revoke all on function public.app_claimable_members(), public.app_claim_member(uuid) from public, anon;
grant execute on function public.app_claimable_members(), public.app_claim_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. app_me: zusätzlich Zustimmung zu den Nutzungsbedingungen
-- ---------------------------------------------------------------------
create or replace function public.app_me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  best public.entitlements;
  trial public.entitlements;
begin
  if uid is null then return null; end if;
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
    'terms_version', (select terms_version from public.profiles where id = uid),
    'claimable', (select count(*) from public.members m where m.group_id = app.active_group() and m.user_id is null and m.is_active),
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
