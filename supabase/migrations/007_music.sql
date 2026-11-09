-- =====================================================================
-- StudySpace – Migration 007: Musik-Bibliothek (YouTube-Links)
-- ---------------------------------------------------------------------
-- Gemeinsame Liste von YouTube-Links für den Fokus (Lofi, Regen,
-- Gewitter, Wind, Natur, Lagerfeuer, Kamin, Konzentration, Eigene).
-- Wer einen Link einträgt, macht ihn für die ganze Gruppe verfügbar.
--
-- Gespeichert wird nur die 11-stellige YouTube-Video-ID (kein beliebiger
-- Link) – abgespielt wird über den offiziellen YouTube-Player.
-- Kann gefahrlos mehrfach ausgeführt werden; bestehende Daten bleiben
-- unverändert. Ohne diese Migration funktioniert die App wie bisher,
-- nur die Musik-Bibliothek ist ausgeblendet.
-- =====================================================================

create table if not exists public.music_tracks (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('lofi', 'regen', 'gewitter', 'wind', 'natur', 'lagerfeuer', 'kamin', 'konzentration', 'eigene')),
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  youtube_id    text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  start_seconds integer check (start_seconds is null or start_seconds between 0 and 86400),
  sort_order    integer not null default 0 check (sort_order between -100000 and 100000),
  deleted_at    timestamptz,
  changed_by    uuid references public.members(id) on delete set null,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists music_tracks_category_idx on public.music_tracks(category, sort_order);

do $$
begin
  execute 'drop trigger if exists ss_touch on public.music_tracks';
  execute 'create trigger ss_touch before insert or update on public.music_tracks for each row execute function public.ss_touch(''id'')';
  execute 'drop trigger if exists ss_log on public.music_tracks';
  execute 'create trigger ss_log after insert or update on public.music_tracks for each row execute function public.ss_log_change()';
  execute 'drop trigger if exists ss_rate_limit on public.music_tracks';
  execute 'create trigger ss_rate_limit before insert on public.music_tracks for each row execute function public.ss_rate_limit(''60'', ''created_at'')';
end;
$$;

revoke all on table public.music_tracks from anon, authenticated;
grant select on public.music_tracks to anon, authenticated;
grant insert (id, category, title, youtube_id, start_seconds, sort_order, deleted_at, changed_by) on public.music_tracks to anon, authenticated;
grant update (id, category, title, youtube_id, start_seconds, sort_order, deleted_at, changed_by) on public.music_tracks to anon, authenticated;

alter table public.music_tracks enable row level security;
drop policy if exists ss_public_select on public.music_tracks;
drop policy if exists ss_public_insert on public.music_tracks;
drop policy if exists ss_public_update on public.music_tracks;
create policy ss_public_select on public.music_tracks for select to anon, authenticated using (true);
create policy ss_public_insert on public.music_tracks for insert to anon, authenticated with check (true);
create policy ss_public_update on public.music_tracks for update to anon, authenticated using (true) with check (true);
-- Bewusst KEINE Delete-Policy (Papierkorb über deleted_at).

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_tracks'
  ) then
    alter publication supabase_realtime add table public.music_tracks;
  end if;
end;
$$;
