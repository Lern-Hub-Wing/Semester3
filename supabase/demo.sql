-- =====================================================================
-- StudySpace – OPTIONALE Beispielaufgaben (nur zum Ausprobieren)
-- ---------------------------------------------------------------------
-- Alle Einträge beginnen mit "[Beispiel]" und sind dadurch eindeutig
-- erkennbar. Sie sind KEIN Lehrplan, sondern nur eine Demo.
--
-- Wieder entfernen: Den Block "AUFRÄUMEN" ganz unten im SQL Editor
-- ausführen (oder die Einträge in der App löschen → Papierkorb).
-- =====================================================================

insert into public.study_entries (id, module_id, topic_id, study_date, title, description, sort_order) values
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000005', null,
     (now() at time zone 'Europe/Berlin')::date, '[Beispiel] Kostenstellenrechnung',
     'Beispiel-Lerntag zum Ausprobieren der Haken.', 1),
  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000001', null,
     (now() at time zone 'Europe/Berlin')::date + 1, '[Beispiel] Eisen-Kohlenstoff-Diagramm',
     null, 1)
on conflict (id) do nothing;

insert into public.tasks (id, study_entry_id, title, sort_order) values
  ('66666666-6666-4666-8666-000000000001', '55555555-5555-4555-8555-000000000001', '[Beispiel] Anbauverfahren verstehen', 1),
  ('66666666-6666-4666-8666-000000000002', '55555555-5555-4555-8555-000000000001', '[Beispiel] Stufenleiterverfahren verstehen', 2),
  ('66666666-6666-4666-8666-000000000003', '55555555-5555-4555-8555-000000000001', '[Beispiel] Übungsaufgaben lösen', 3),
  ('66666666-6666-4666-8666-000000000004', '55555555-5555-4555-8555-000000000001', '[Beispiel] Zusammenfassung wiederholen', 4),
  ('66666666-6666-4666-8666-000000000005', '55555555-5555-4555-8555-000000000002', '[Beispiel] Phasen benennen', 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- AUFRÄUMEN (entfernt die Beispiele endgültig – nur im SQL Editor
-- möglich, weil die App selbst nichts hart löscht):
--
-- delete from public.task_completions where task_id in (select id from public.tasks where title like '[Beispiel]%');
-- delete from public.attachments where target_type = 'task' and target_id in (select id from public.tasks where title like '[Beispiel]%');
-- delete from public.tasks where title like '[Beispiel]%';
-- delete from public.attachments where target_type = 'study_entry' and target_id in (select id from public.study_entries where title like '[Beispiel]%');
-- delete from public.study_entries where title like '[Beispiel]%';
-- ---------------------------------------------------------------------
