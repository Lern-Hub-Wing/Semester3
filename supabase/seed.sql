-- =====================================================================
-- StudySpace – Seed-Daten (Startdaten)
-- ---------------------------------------------------------------------
-- Legt an:
--   * 4 Beispielpersonen (Namen und Farben sind in der App änderbar)
--   * 6 Prüfungsmodule mit Fachfarben
--   * 6 Prüfungstermine (Januar 2027, Zeitzone Europe/Berlin)
--   * Strukturierende Themenbereiche für die Kombi-Module
-- Es werden KEINE Lernaufgaben angelegt – der Lernplan startet leer.
--
-- Das Skript kann mehrfach ausgeführt werden: vorhandene Zeilen werden
-- nicht überschrieben (on conflict do nothing).
-- =====================================================================

-- Personen ------------------------------------------------------------
insert into public.members (id, name, color, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Person 1', '#AFC5F5', 1),
  ('11111111-1111-4111-8111-000000000002', 'Person 2', '#CBB8F5', 2),
  ('11111111-1111-4111-8111-000000000003', 'Person 3', '#AADCCB', 3),
  ('11111111-1111-4111-8111-000000000004', 'Person 4', '#F5C6A5', 4)
on conflict (id) do nothing;

-- Prüfungsmodule --------------------------------------------------------
insert into public.modules (id, name, color, description, sort_order) values
  ('22222222-2222-4222-8222-000000000001', 'Werkstoffkunde', '#F4B9B6', null, 1),
  ('22222222-2222-4222-8222-000000000002', 'Operations Research und Beschaffung und Produktion', '#E8CB9D',
     'Gemeinsame Modulklausur. Operations Research sowie Beschaffung und Produktion werden als getrennte Themenbereiche geplant.', 2),
  ('22222222-2222-4222-8222-000000000003', 'Thermodynamik und Strömungslehre', '#A6DED7',
     'Gemeinsame Modulklausur. Thermodynamik und Strömungslehre werden als getrennte Themenbereiche geplant.', 3),
  ('22222222-2222-4222-8222-000000000004', 'Angewandte Mathematik', '#C9B7F2', null, 4),
  ('22222222-2222-4222-8222-000000000005', 'Controlling', '#B4D3F2', null, 5),
  ('22222222-2222-4222-8222-000000000006', 'Konstruktion', '#C3D7AD', null, 6)
on conflict (id) do nothing;

-- Themenbereiche der Kombi-Module --------------------------------------
insert into public.module_topics (id, module_id, title, sort_order) values
  ('33333333-3333-4333-8333-000000000021', '22222222-2222-4222-8222-000000000002', 'Operations Research', 1),
  ('33333333-3333-4333-8333-000000000022', '22222222-2222-4222-8222-000000000002', 'Beschaffung und Produktion', 2),
  ('33333333-3333-4333-8333-000000000031', '22222222-2222-4222-8222-000000000003', 'Thermodynamik', 1),
  ('33333333-3333-4333-8333-000000000032', '22222222-2222-4222-8222-000000000003', 'Strömungslehre', 2),
  ('33333333-3333-4333-8333-000000000061', '22222222-2222-4222-8222-000000000006', 'Technisches Zeichnen', 1)
on conflict (id) do nothing;

-- Prüfungstermine (Ortszeit Europe/Berlin -> eindeutiger Zeitpunkt) ----
insert into public.exams (id, module_id, starts_at, ends_at, timezone) values
  ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000001',
     timestamp '2027-01-06 14:00' at time zone 'Europe/Berlin',
     timestamp '2027-01-06 15:30' at time zone 'Europe/Berlin', 'Europe/Berlin'),
  ('44444444-4444-4444-8444-000000000002', '22222222-2222-4222-8222-000000000002',
     timestamp '2027-01-08 08:30' at time zone 'Europe/Berlin',
     timestamp '2027-01-08 10:00' at time zone 'Europe/Berlin', 'Europe/Berlin'),
  ('44444444-4444-4444-8444-000000000003', '22222222-2222-4222-8222-000000000003',
     timestamp '2027-01-11 14:00' at time zone 'Europe/Berlin',
     timestamp '2027-01-11 15:30' at time zone 'Europe/Berlin', 'Europe/Berlin'),
  ('44444444-4444-4444-8444-000000000004', '22222222-2222-4222-8222-000000000004',
     timestamp '2027-01-14 14:00' at time zone 'Europe/Berlin',
     timestamp '2027-01-14 15:30' at time zone 'Europe/Berlin', 'Europe/Berlin'),
  ('44444444-4444-4444-8444-000000000005', '22222222-2222-4222-8222-000000000005',
     timestamp '2027-01-18 14:00' at time zone 'Europe/Berlin',
     timestamp '2027-01-18 15:30' at time zone 'Europe/Berlin', 'Europe/Berlin'),
  ('44444444-4444-4444-8444-000000000006', '22222222-2222-4222-8222-000000000006',
     timestamp '2027-01-20 11:00' at time zone 'Europe/Berlin',
     timestamp '2027-01-20 12:30' at time zone 'Europe/Berlin', 'Europe/Berlin')
on conflict (id) do nothing;

-- Gemeinsame Einstellungen ----------------------------------------------
insert into public.app_settings (key, value) values
  ('app_name', '"StudySpace"'::jsonb),
  ('group_goal_title', '"Unser gemeinsames Lernziel"'::jsonb)
on conflict (key) do nothing;

-- Der Änderungsverlauf soll nicht mit den Startdaten beginnen.
delete from public.activity_log where actor_member_id is null and action = 'created'
  and entity_type in ('members', 'modules', 'module_topics', 'exams', 'app_settings');
