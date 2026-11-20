-- =====================================================================
-- StudySpace App – KI-Lernplan
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen. Wiederholbar.
-- Die Edge Function „app-ai-plan“ fragt hier (Service Role), ob ein Konto
-- gerade einen KI-Plan erstellen darf, und protokolliert jede Erstellung
-- (Tokenverbrauch für die Kostenkontrolle im Admin-Bereich).
-- Regeln: aktives Konto, aktive Lerngruppe mit Zugang (Testphase, Solo
-- oder Gruppe), höchstens N Pläne pro Tag und Konto (app_config
-- „ai_plans_per_day“, Standard 5; 0 schaltet die Funktion ab).
-- =====================================================================
create table if not exists public.ai_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete set null,
  model         text not null check (char_length(model) <= 60),
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  ok            boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage(user_id, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;

insert into public.app_config (key, value) values ('ai_plans_per_day', '5'::jsonb) on conflict (key) do nothing;

-- Darf dieses Konto jetzt einen KI-Plan erstellen? (nur für die Edge Function)
create or replace function public.app_ai_plan_check(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_group uuid;
  v_limit integer := coalesce((select (value #>> '{}')::integer from public.app_config where key = 'ai_plans_per_day'), 5);
  v_used integer;
begin
  select p.active_group_id into v_group from public.profiles p
  where p.id = p_user and p.status = 'active'
    and exists (select 1 from public.group_members gm where gm.group_id = p.active_group_id and gm.user_id = p.id and gm.left_at is null);
  if v_group is null then return jsonb_build_object('allowed', false, 'reason', 'no_group'); end if;
  if not app.group_has_plus(v_group) then return jsonb_build_object('allowed', false, 'reason', 'no_plan', 'group_id', v_group); end if;
  if v_limit <= 0 then return jsonb_build_object('allowed', false, 'reason', 'disabled', 'group_id', v_group); end if;
  select count(*) into v_used from public.ai_usage where user_id = p_user and ok and created_at > now() - interval '1 day';
  if v_used >= v_limit then return jsonb_build_object('allowed', false, 'reason', 'limit', 'limit', v_limit, 'group_id', v_group); end if;
  return jsonb_build_object('allowed', true, 'group_id', v_group, 'left', v_limit - v_used, 'limit', v_limit);
end $$;
revoke all on function public.app_ai_plan_check(uuid) from public, anon, authenticated;
grant execute on function public.app_ai_plan_check(uuid) to service_role;

-- Admin: Verbrauch der letzten 30 Tage (nur mit Zwei-Faktor, wie alle Admin-Funktionen)
create or replace function public.admin_ai_usage() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_admin() then raise exception 'Nur für Administratoren' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'plans', count(*) filter (where ok),
      'failed', count(*) filter (where not ok),
      'users', count(distinct user_id),
      'input_tokens', coalesce(sum(input_tokens), 0),
      'output_tokens', coalesce(sum(output_tokens), 0)
    ) from public.ai_usage where created_at > now() - interval '30 days'
  );
end $$;
revoke all on function public.admin_ai_usage() from public, anon;
grant execute on function public.admin_ai_usage() to authenticated;
