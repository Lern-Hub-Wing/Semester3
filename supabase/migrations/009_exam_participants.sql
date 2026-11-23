-- =====================================================================
-- StudySpace – Wer schreibt welche Prüfung? (bisherige Seite)
-- ---------------------------------------------------------------------
-- Ein Fach kann auf einzelne Personen beschränkt werden: Nur sie sehen
-- dann das Fach, seine Prüfungen, Lerntage, Aufgaben und Hausaufgaben
-- und bekommen Erinnerungen dazu. Leer/NULL = alle (wie bisher).
--
-- Hinweis: Die Seite hat keine Anmeldung – das ist eine Anzeige-Einstellung,
-- kein Zugriffsschutz. Wer das Profil einer anderen Person wählt, sieht,
-- was diese Person sieht.
--
-- Einmal im Supabase SQL Editor ausführen. Wiederholbar, ändert keine Daten.
-- =====================================================================
alter table public.modules add column if not exists participants uuid[];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_participants_size') then
    alter table public.modules add constraint modules_participants_size check (participants is null or cardinality(participants) <= 30);
  end if;
end $$;

-- Schreibrecht nur für diese Spalte ergänzen (die übrigen bleiben wie in 002)
grant insert (participants) on public.modules to anon, authenticated;
grant update (participants) on public.modules to anon, authenticated;
