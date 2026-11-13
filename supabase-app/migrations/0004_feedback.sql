-- =====================================================================
-- StudySpace App – Hilfe & Feedback
-- ---------------------------------------------------------------------
-- NUR im eigenen App-Projekt ausführen. Wiederholbar.
-- Nutzer senden Feedback (Fehler, Idee, Frage) aus der App; nur Admins
-- (mit Zwei-Faktor) lesen es. Höchstens 10 Nachrichten pro Tag und Konto.
-- =====================================================================
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  group_id    uuid references public.groups(id) on delete set null,
  category    text not null check (category in ('bug', 'idea', 'question', 'other')),
  message     text not null check (char_length(btrim(message)) between 3 and 4000),
  page        text check (page is null or char_length(page) <= 200),
  client      text check (client is null or char_length(client) <= 300),
  contact_ok  boolean not null default false,
  status      text not null default 'new' check (status in ('new', 'done')),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback(created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant all on public.feedback to service_role;

create or replace function public.app_send_feedback(p_category text, p_message text, p_page text default null, p_client text default null, p_contact_ok boolean default false)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not app.account_ok() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if (select count(*) from public.feedback where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Danke! Für heute hast du schon viel Feedback geschickt – morgen geht es weiter.' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  insert into public.feedback (user_id, group_id, category, message, page, client, contact_ok)
  values (auth.uid(), app.active_group(), p_category, btrim(p_message), left(p_page, 200), left(p_client, 300), coalesce(p_contact_ok, false));
end $$;

create or replace function public.admin_feedback(p_limit integer default 200)
returns table (id bigint, created_at timestamptz, category text, message text, page text, client text, contact_ok boolean, status text, email text, group_name text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return query
  select f.id, f.created_at, f.category, f.message, f.page, f.client, f.contact_ok, f.status,
         case when f.contact_ok then au.email::text end, g.name
  from public.feedback f
  left join auth.users au on au.id = f.user_id
  left join public.groups g on g.id = f.group_id
  order by f.status = 'done', f.created_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

create or replace function public.admin_feedback_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_status not in ('new', 'done') then raise exception 'Ungültiger Status'; end if;
  update public.feedback set status = p_status where id = p_id;
end $$;

revoke all on function public.app_send_feedback(text, text, text, text, boolean), public.admin_feedback(integer), public.admin_feedback_status(bigint, text) from public, anon;
grant execute on function public.app_send_feedback(text, text, text, text, boolean), public.admin_feedback(integer), public.admin_feedback_status(bigint, text) to authenticated;
