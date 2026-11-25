-- =====================================================================
-- StudySpace – Umzug in die App (bisherige Seite)
-- ---------------------------------------------------------------------
-- Erlaubt die gemeinsame Einstellung „moved_to_app“: Ist sie gesetzt,
-- leitet die Seite alle auf die App um („Wir sind umgezogen“). Die Daten
-- der Seite bleiben vollständig erhalten; die Umleitung lässt sich in den
-- Einstellungen (Umzug in die App) jederzeit wieder ausschalten.
--
-- Einmal im Supabase SQL Editor ausführen. Wiederholbar, ändert keine Daten.
-- =====================================================================
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('app_name', 'group_goal_title', 'motivation_enabled', 'moved_to_app'));
