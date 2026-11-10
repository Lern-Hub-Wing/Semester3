-- =====================================================================
-- StudySpace 4.2 – Fokuszeiten live an alle Geräte (optional)
-- ---------------------------------------------------------------------
-- Nimmt die Tabelle focus_sessions in die Realtime-Veröffentlichung auf.
-- Damit erscheint eine gespeicherte Fokus-Session sofort in der
-- „Lernzeit diese Woche“ der anderen Gruppenmitglieder.
--
-- Es werden KEINE Daten verändert oder gelöscht und keine Rechte erweitert
-- (focus_sessions ist ohnehin für alle lesbar, siehe 004). Das Skript kann
-- gefahrlos mehrfach ausgeführt werden. Ohne diese Datei lädt die App die
-- Lernzeiten einfach jede Minute und beim Zurückkehren in die App nach.
-- =====================================================================
do $$
begin
  if to_regclass('public.focus_sessions') is null then
    raise notice 'focus_sessions fehlt – zuerst 004_push_focus.sql ausführen';
    return;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_sessions'
  ) then
    alter publication supabase_realtime add table public.focus_sessions;
  end if;
end;
$$;
