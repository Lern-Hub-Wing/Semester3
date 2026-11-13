-- =====================================================================
-- StudySpace App – Push-Mitteilungen (z. B. „neue Hausaufgabe“)
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen. Wiederholbar.
-- Die Tabellen push_devices / push_log / push_state stammen aus 004 und
-- sind für angemeldete Nutzer vollständig gesperrt (RLS ohne Policies).
-- Zugriff hat ausschließlich die Edge Function „app-push“ (Service Role):
-- Sie prüft das Anmelde-Token und ordnet jedes Gerät einem KONTO zu.
-- Ein Gerät folgt damit dem Konto in alle seine Lerngruppen.
-- =====================================================================
alter table public.push_devices add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists push_devices_user_idx on public.push_devices(user_id) where enabled;

-- Ein Konto hat höchstens 10 Geräte mit Mitteilungen
create or replace function app.push_device_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_id is not null and (
    select count(*) from public.push_devices d where d.user_id = new.user_id and d.id <> new.id
  ) >= 10 then
    raise exception 'Höchstens 10 Geräte mit Mitteilungen je Konto' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists app_push_device_limit on public.push_devices;
create trigger app_push_device_limit before insert or update of user_id on public.push_devices
  for each row execute function app.push_device_limit();

-- Gesperrt bleiben: keine Rechte für anon/authenticated (nochmals festgehalten)
revoke all on table public.push_devices, public.push_log, public.push_state from anon, authenticated;

-- Die Funktion „app-push“ (Service Role) liest nur, was sie für den Versand braucht
grant select on public.activity_log, public.homework, public.modules, public.members,
  public.groups, public.group_members, public.profiles to service_role;
grant all on table public.push_devices, public.push_log, public.push_state to service_role;
