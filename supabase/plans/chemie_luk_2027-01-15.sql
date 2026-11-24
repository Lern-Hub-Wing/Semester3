-- =====================================================================
-- StudySpace – Lernplan Chemie für Luk (Klausur Fr 15.01.2027, 08:30–11:00)
-- ---------------------------------------------------------------------
-- Nur Luk sieht das Fach (participants), die anderen nicht.
-- Grundlage: Altklausur WS 2019/20 (88 Punkte, 150 Minuten).
--   • Pro Lerntag GENAU EINE Aufgabe; was genau zu tun ist, steht im Lerntag.
--   • Jedes Thema: 1 Theorietag + 1 Übungstag, alles vor Weihnachten.
--   • Jeden Sonntag: Wochenrückblick (Stoff der Woche festigen).
--   • 18.12. Probeklausur, 21./22.12. Puffer, Januar: Wiederholung +
--     Probeklausur 2, 14.01. lockerer Abschluss.
--
-- Voraussetzung: supabase/migrations/009_exam_participants.sql ist ausgeführt.
-- Wiederholbar. Wer die erste Fassung (mehrere Aufgaben pro Tag) schon
-- eingespielt hat, führt diese Datei einfach noch einmal aus: Die zusätzlichen
-- Aufgaben wandern in den Papierkorb, jeder Tag behält eine Aufgabe, die
-- Sonntage kommen dazu.
-- Bricht ab (ohne etwas zu ändern), wenn Migration 009 fehlt, es keine
-- aktive Person „Luk“ gibt oder schon ein anderes Fach „Chemie“ existiert.
-- =====================================================================
do $$
declare
  v_luk uuid;
  v_n int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'modules' and column_name = 'participants') then
    raise exception 'Bitte zuerst supabase/migrations/009_exam_participants.sql ausführen.';
  end if;
  select count(*), min(id::text)::uuid into v_n, v_luk from public.members where lower(btrim(name)) = 'luk' and is_active;
  if v_n <> 1 then
    raise exception 'Es muss genau eine aktive Person „Luk“ geben (gefunden: %).', v_n;
  end if;
  if exists (select 1 from public.modules where lower(btrim(name)) = 'chemie' and id <> 'c4e10000-0000-4000-8000-000000000001' and archived_at is null) then
    raise exception 'Es gibt schon ein anderes Fach „Chemie“ – bitte erst klären, damit nichts doppelt angelegt wird.';
  end if;

  -- Fach (nur Luk)
  insert into public.modules (id, name, color, description, sort_order, participants, changed_by)
  values ('c4e10000-0000-4000-8000-000000000001', 'Chemie', '#F2B8A2', 'Klausur Fr 15.01.2027, 08:30–11:00 Uhr · 7 Themen, je ein Theorie- und ein Übungstag, sonntags Wochenrückblick · nur Luk',
          coalesce((select max(sort_order) from public.modules), 0) + 1, array[v_luk], v_luk)
  on conflict (id) do nothing;
  update public.modules set participants = array[v_luk] where id = 'c4e10000-0000-4000-8000-000000000001' and (participants is null or participants <> array[v_luk]);

  -- Prüfung
  insert into public.exams (id, module_id, starts_at, ends_at, timezone, location, notes, changed_by)
  values ('c4e10000-0000-4000-8002-000000000001', 'c4e10000-0000-4000-8000-000000000001', timestamptz '2027-01-15 08:30:00 Europe/Berlin', timestamptz '2027-01-15 11:00:00 Europe/Berlin', 'Europe/Berlin', null,
          '88 Punkte in 150 Minuten. Größte Blöcke: Stöchiometrie (24), Redox (18), Salze/Nomenklatur (15).', v_luk)
  on conflict (id) do nothing;

  -- Themen
  insert into public.module_topics (id, module_id, title, sort_order, changed_by) values
    ('c4e10000-0000-4000-8001-000000000001', 'c4e10000-0000-4000-8000-000000000001', 'Atombau & Periodensystem', 1, v_luk),
    ('c4e10000-0000-4000-8001-000000000002', 'c4e10000-0000-4000-8000-000000000001', 'Chemische Bindung & Valenzstrichformeln', 2, v_luk),
    ('c4e10000-0000-4000-8001-000000000003', 'c4e10000-0000-4000-8000-000000000001', 'Salze, Ionen & Nomenklatur', 3, v_luk),
    ('c4e10000-0000-4000-8001-000000000004', 'c4e10000-0000-4000-8000-000000000001', 'Stoffmenge & Konzentration', 4, v_luk),
    ('c4e10000-0000-4000-8001-000000000005', 'c4e10000-0000-4000-8000-000000000001', 'Stöchiometrie', 5, v_luk),
    ('c4e10000-0000-4000-8001-000000000006', 'c4e10000-0000-4000-8000-000000000001', 'Oxidationszahlen & Redoxreaktionen', 6, v_luk),
    ('c4e10000-0000-4000-8001-000000000007', 'c4e10000-0000-4000-8000-000000000001', 'Säuren, Basen & pH-Wert', 7, v_luk)
  on conflict (id) do nothing;

  -- Lerntage (vorhandene werden auf den aktuellen Text gebracht)
  insert into public.study_entries (id, module_id, topic_id, study_date, title, description, sort_order, changed_by) values
    ('c4e10000-0000-4000-8003-000000000001', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000001', date '2026-11-24', 'Theorie: Atombau & Periodensystem', 'ca. 1,5 h · Altklausur A1, A2 (6 Punkte)

So gehst du vor:
• Atombau: Protonen, Neutronen, Elektronen und Isotope (Nuklidschreibweise) zusammenfassen
• Elektronenkonfiguration der Elemente 1–20 aufschreiben (Schalen und s/p-Schreibweise)
• PSE-Trends lernen: Atomradius, Elektronegativität, Ionisierungsenergie', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000002', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000001', date '2026-11-25', 'Übung: Atombau & Periodensystem', 'ca. 1,5 h

So gehst du vor:
• Altklausur A1 und A2 ohne Lösung bearbeiten, dann vergleichen
• 10 Nuklide und Ionen: Anzahl Protonen, Neutronen, Elektronen bestimmen
• 5 Aufgaben: Elemente nach Elektronegativität und Atomradius ordnen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000003', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000002', date '2026-11-26', 'Theorie: Chemische Bindung & Valenzstrichformeln', 'ca. 2,5 h · Altklausur A3, A5 (9 Punkte)

So gehst du vor:
• Bindungsarten vergleichen: Ionen-, Atom- und Metallbindung (Tabelle)
• Elektronegativitätsdifferenz → Bindungstyp (unpolar, polar, ionisch) bestimmen
• Valenzstrichformeln Schritt für Schritt: Valenzelektronen zählen, Oktett, Formalladungen
• Molekülgeometrie (VSEPR) und Polarität: H₂O, NH₃, CO₂, CH₄
• Zwischenmolekulare Kräfte (H-Brücken, Dipol, Van-der-Waals) und Siedepunkte erklären', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000004', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000002', date '2026-11-27', 'Übung: Chemische Bindung & Valenzstrichformeln', 'ca. 2 h

So gehst du vor:
• Altklausur A3 und A5 unter Zeitdruck lösen (ca. 15 Min.)
• 15 Valenzstrichformeln zeichnen (z. B. SO₄²⁻, NO₃⁻, CO₃²⁻, HCN, H₂SO₄)
• Geometrie und Polarität von 8 Molekülen bestimmen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000005', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000003', date '2026-11-30', 'Theorie: Salze, Ionen & Nomenklatur', 'ca. 2 h · Altklausur A4, A6, A7 (15 Punkte)

So gehst du vor:
• Ionenladungen aus dem PSE ableiten (Hauptgruppen und wichtige Nebengruppen)
• Mehratomige Ionen lernen: Sulfat, Sulfit, Nitrat, Nitrit, Phosphat, Carbonat, Ammonium, Hydroxid …
• Salzformeln über den Ladungsausgleich aufstellen
• Nomenklatur: Name ↔ Formel, Stock-Schreibweise (z. B. Eisen(III)-oxid)
• Dissoziationsgleichungen von Salzen in Wasser aufstellen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000006', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000003', date '2026-12-01', 'Übung: Salze, Ionen & Nomenklatur', 'ca. 2 h

So gehst du vor:
• Altklausur A4, A6 und A7 lösen (ca. 25 Min.)
• Karteikarten: 20 Ionen mit Formel und Ladung abfragen
• 20 Salze benennen und 20 Formeln aus Namen aufstellen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000007', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000004', date '2026-12-03', 'Theorie: Stoffmenge & Konzentration', 'ca. 1,5 h · Altklausur A9 (6 Punkte)

So gehst du vor:
• Begriffe klären: Stoffmenge, Avogadro-Konstante, molare Masse
• Formeln auf den Lernzettel: n = m/M, N = n·Nₐ, c = n/V, c₁·V₁ = c₂·V₂
• Einheiten sicher umrechnen (mg/g/kg, mL/L, mmol/mol)
• Molare Masse von 10 Verbindungen berechnen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000008', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000004', date '2026-12-04', 'Übung: Stoffmenge & Konzentration', 'ca. 1,5 h

So gehst du vor:
• Altklausur A9 lösen (ca. 10 Min.)
• 10 Aufgaben: Masse ↔ Stoffmenge ↔ Teilchenzahl
• 8 Aufgaben zu Konzentration und Verdünnung (Lösungen ansetzen)', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000009', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000005', date '2026-12-07', 'Theorie: Stöchiometrie', 'ca. 2,5 h · Altklausur A11, A12 (24 Punkte – größter Block!)

So gehst du vor:
• Reaktionsgleichungen ausgleichen (Atombilanz, auch mit Ionen)
• Rechenschema: gegeben → n → Stoffmengenverhältnis → n → gesucht
• Limitierenden Reaktanten und Überschuss bestimmen
• Ausbeute in % und molares Gasvolumen
• 3 Musteraufgaben ausführlich durchrechnen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000010', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000005', date '2026-12-08', 'Übung: Stöchiometrie', 'ca. 3,5 h

So gehst du vor:
• Altklausur A11 und A12 unter Zeitdruck lösen (ca. 40 Min.)
• 10 Reaktionsgleichungen ausgleichen
• 8 Stöchiometrie-Aufgaben mit Massen und Volumen
• 4 Aufgaben zum limitierenden Reaktanten und zur Ausbeute', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000011', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000006', date '2026-12-10', 'Theorie: Oxidationszahlen & Redoxreaktionen', 'ca. 2,5 h · Altklausur A8, A13 (18 Punkte)

So gehst du vor:
• Regeln für Oxidationszahlen lernen und an 15 Verbindungen anwenden
• Oxidation, Reduktion, Oxidations- und Reduktionsmittel erkennen
• Redoxgleichungen über Teilgleichungen aufstellen (Elektronen ausgleichen)
• Ausgleichen in saurer und basischer Lösung (H⁺/OH⁻ und H₂O)
• Redoxreihe der Metalle: Welche Reaktion läuft freiwillig ab?', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000012', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000006', date '2026-12-11', 'Übung: Oxidationszahlen & Redoxreaktionen', 'ca. 3 h

So gehst du vor:
• Altklausur A8 und A13 lösen (ca. 30 Min.)
• 20 Oxidationszahlen bestimmen (auch in MnO₄⁻, Cr₂O₇²⁻, H₂O₂)
• 6 Redoxgleichungen vollständig aufstellen (z. B. Permanganat, Dichromat)', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000013', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000007', date '2026-12-14', 'Theorie: Säuren, Basen & pH-Wert', 'ca. 2 h · Altklausur A10 (10 Punkte)

So gehst du vor:
• Brønsted: Säure, Base, korrespondierende Paare, Ampholyte
• Autoprotolyse des Wassers, pH, pOH und pH + pOH = 14
• pH starker Säuren/Basen und schwacher Säuren (pKs-Näherung) berechnen
• Neutralisation und Titration (Äquivalenzpunkt)', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000014', 'c4e10000-0000-4000-8000-000000000001', 'c4e10000-0000-4000-8001-000000000007', date '2026-12-15', 'Übung: Säuren, Basen & pH-Wert', 'ca. 2 h

So gehst du vor:
• Altklausur A10 lösen (ca. 17 Min.)
• 10 pH-Berechnungen (starke und schwache Säuren und Basen, Verdünnung)
• 5 Neutralisationsaufgaben', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000015', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-12-18', 'Probeklausur 1: komplette Altklausur', 'ca. 3 h · 88 Punkte in 150 Minuten

So gehst du vor:
• Komplette Altklausur am Stück in 150 Min. schreiben (wie echt: 8:30–11:00)
• Selbst korrigieren nach Punkteschema (88 Punkte)
• Die zwei schwächsten Themen für die Puffertage festhalten', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000016', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-12-21', 'Puffer: schwächstes Thema nacharbeiten', 'ca. 2 h

So gehst du vor:
• Theorie des schwächsten Themas aus der Probeklausur wiederholen
• 10 Übungsaufgaben zu diesem Thema
• Liegengebliebene Aufgaben aus dem Plan nachholen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000017', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-12-22', 'Puffer: zweites Schwachthema + Formelsammlung', 'ca. 2 h · danach Weihnachtspause 🎄

So gehst du vor:
• Zweites Schwachthema üben
• Alle Lernzettel zu einer Formelsammlung (max. 2 Seiten) zusammenfassen
• Alle Themen abgeschlossen – frohe Weihnachten! 🎄', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000018', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-04', 'Wiederholung: Atombau, Bindung, Salze', 'ca. 2 h

So gehst du vor:
• Lernzettel der Themen 1–3 durchgehen
• Altklausur A1–A7 erneut ohne Lösung bearbeiten
• Ionenliste und Valenzstrichformeln abfragen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000019', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-06', 'Wiederholung: Stoffmenge & Stöchiometrie', 'ca. 2,5 h

So gehst du vor:
• Alle Formeln aus dem Kopf aufschreiben und prüfen
• Altklausur A9, A11 und A12 erneut lösen
• 5 neue Stöchiometrie-Aufgaben', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000020', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-08', 'Wiederholung: Redox & Säuren/Basen', 'ca. 2,5 h

So gehst du vor:
• Altklausur A8, A10 und A13 erneut lösen
• 4 Redoxgleichungen aufstellen
• 5 pH-Berechnungen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000021', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-11', 'Probeklausur 2 unter Echtbedingungen', 'ca. 3 h

So gehst du vor:
• Gemischte Übungsklausur in 150 Min. schreiben (8:30–11:00)
• Korrigieren und Punkte zählen
• Liste der letzten Lücken schreiben', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000022', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-13', 'Letzte Lücken schließen', 'ca. 2 h

So gehst du vor:
• Lücken aus Probeklausur 2 gezielt üben
• Formelsammlung final durchgehen
• Eigene Liste typischer Fehler lesen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000023', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-14', 'Tag vor der Klausur: locker bleiben', 'ca. 1 h

So gehst du vor:
• Formelsammlung und Ionenliste ein letztes Mal lesen
• Erlaubte Hilfsmittel prüfen und bereitlegen (Taschenrechner, Stifte, Ausweis)
• Früh schlafen – morgen 8:30 Uhr Chemie 💪', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000101', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-11-29', 'Wochenrückblick: Atombau & Bindung', 'ca. 1 h · Stoff der Woche festigen

So gehst du vor:
• Lernzettel der Woche schreiben bzw. ergänzen (Atombau & PSE, Bindung & Valenzstrichformeln)
• Fehler der Woche durchgehen und in die Fehlerliste eintragen
• Je Thema 3 Aufgaben ohne Lösung rechnen
• Offene Aufgaben der Woche nachholen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000102', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-12-06', 'Wochenrückblick: Salze & Stoffmenge', 'ca. 1 h · Stoff der Woche festigen

So gehst du vor:
• Lernzettel der Woche schreiben bzw. ergänzen (Salze, Ionen & Nomenklatur, Stoffmenge & Konzentration)
• Fehler der Woche durchgehen und in die Fehlerliste eintragen
• Je Thema 3 Aufgaben ohne Lösung rechnen
• Offene Aufgaben der Woche nachholen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000103', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-12-13', 'Wochenrückblick: Stöchiometrie & Redox', 'ca. 1 h · Stoff der Woche festigen

So gehst du vor:
• Lernzettel der Woche schreiben bzw. ergänzen (Stöchiometrie, Redox & Oxidationszahlen)
• Fehler der Woche durchgehen und in die Fehlerliste eintragen
• Je Thema 3 Aufgaben ohne Lösung rechnen
• Offene Aufgaben der Woche nachholen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000104', 'c4e10000-0000-4000-8000-000000000001', null, date '2026-12-20', 'Wochenrückblick: Säuren/Basen + Probeklausur', 'ca. 1 h · Stoff der Woche festigen

So gehst du vor:
• Lernzettel der Woche schreiben bzw. ergänzen (Säuren, Basen & pH)
• Fehler der Woche durchgehen und in die Fehlerliste eintragen
• Je Thema 3 Aufgaben ohne Lösung rechnen
• Offene Aufgaben der Woche nachholen', 1, v_luk),
    ('c4e10000-0000-4000-8003-000000000105', 'c4e10000-0000-4000-8000-000000000001', null, date '2027-01-10', 'Wochenrückblick: Wiederholungswoche', 'ca. 1 h · Stoff der Woche festigen

So gehst du vor:
• Lernzettel der Woche schreiben bzw. ergänzen (alle Themen der Wiederholungswoche)
• Fehler der Woche durchgehen und in die Fehlerliste eintragen
• Je Thema 3 Aufgaben ohne Lösung rechnen
• Offene Aufgaben der Woche nachholen', 1, v_luk)
  on conflict (id) do update set title = excluded.title, description = excluded.description
    where (public.study_entries.title, public.study_entries.description) is distinct from (excluded.title, excluded.description);

  -- Genau eine Aufgabe pro Lerntag
  insert into public.tasks (id, study_entry_id, title, sort_order, changed_by) values
    ('c4e10000-0000-4000-8004-000000000101', 'c4e10000-0000-4000-8003-000000000001', 'Atombau & PSE: Theorie durcharbeiten (ca. 1,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000201', 'c4e10000-0000-4000-8003-000000000002', 'Atombau & PSE: Übungsaufgaben + Altklausur (ca. 1,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000301', 'c4e10000-0000-4000-8003-000000000003', 'Bindung & Valenzstrichformeln: Theorie durcharbeiten (ca. 2,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000401', 'c4e10000-0000-4000-8003-000000000004', 'Bindung & Valenzstrichformeln: Übungsaufgaben + Altklausur (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000501', 'c4e10000-0000-4000-8003-000000000005', 'Salze, Ionen & Nomenklatur: Theorie durcharbeiten (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000601', 'c4e10000-0000-4000-8003-000000000006', 'Salze, Ionen & Nomenklatur: Übungsaufgaben + Altklausur (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000701', 'c4e10000-0000-4000-8003-000000000007', 'Stoffmenge & Konzentration: Theorie durcharbeiten (ca. 1,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000801', 'c4e10000-0000-4000-8003-000000000008', 'Stoffmenge & Konzentration: Übungsaufgaben + Altklausur (ca. 1,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000000901', 'c4e10000-0000-4000-8003-000000000009', 'Stöchiometrie: Theorie durcharbeiten (ca. 2,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001001', 'c4e10000-0000-4000-8003-000000000010', 'Stöchiometrie: Übungsaufgaben + Altklausur (ca. 3,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001101', 'c4e10000-0000-4000-8003-000000000011', 'Redox & Oxidationszahlen: Theorie durcharbeiten (ca. 2,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001201', 'c4e10000-0000-4000-8003-000000000012', 'Redox & Oxidationszahlen: Übungsaufgaben + Altklausur (ca. 3 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001301', 'c4e10000-0000-4000-8003-000000000013', 'Säuren, Basen & pH: Theorie durcharbeiten (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001401', 'c4e10000-0000-4000-8003-000000000014', 'Säuren, Basen & pH: Übungsaufgaben + Altklausur (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001501', 'c4e10000-0000-4000-8003-000000000015', 'Probeklausur schreiben und selbst korrigieren (ca. 3 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001601', 'c4e10000-0000-4000-8003-000000000016', 'Schwächstes Thema nacharbeiten (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001701', 'c4e10000-0000-4000-8003-000000000017', 'Zweites Schwachthema + Formelsammlung fertig (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001801', 'c4e10000-0000-4000-8003-000000000018', 'Wiederholen: Atombau, Bindung, Salze (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000001901', 'c4e10000-0000-4000-8003-000000000019', 'Wiederholen: Stoffmenge & Stöchiometrie (ca. 2,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000002001', 'c4e10000-0000-4000-8003-000000000020', 'Wiederholen: Redox & Säuren/Basen (ca. 2,5 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000002101', 'c4e10000-0000-4000-8003-000000000021', 'Probeklausur 2 unter Echtbedingungen (ca. 3 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000002201', 'c4e10000-0000-4000-8003-000000000022', 'Letzte Lücken schließen (ca. 2 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000002301', 'c4e10000-0000-4000-8003-000000000023', 'Formelsammlung lesen, Sachen packen, früh schlafen (ca. 1 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000010101', 'c4e10000-0000-4000-8003-000000000101', 'Stoff der Woche wiederholen (ca. 1 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000010201', 'c4e10000-0000-4000-8003-000000000102', 'Stoff der Woche wiederholen (ca. 1 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000010301', 'c4e10000-0000-4000-8003-000000000103', 'Stoff der Woche wiederholen (ca. 1 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000010401', 'c4e10000-0000-4000-8003-000000000104', 'Stoff der Woche wiederholen (ca. 1 h)', 1, v_luk),
    ('c4e10000-0000-4000-8004-000000010501', 'c4e10000-0000-4000-8003-000000000105', 'Stoff der Woche wiederholen (ca. 1 h)', 1, v_luk)
  on conflict (id) do update set title = excluded.title, deleted_at = null
    where public.tasks.title is distinct from excluded.title or public.tasks.deleted_at is not null;

  -- Erste Fassung: zusätzliche Aufgaben pro Tag in den Papierkorb (wiederherstellbar)
  update public.tasks set deleted_at = now()
  where deleted_at is null and id in (
    'c4e10000-0000-4000-8004-000000000102',
    'c4e10000-0000-4000-8004-000000000103',
    'c4e10000-0000-4000-8004-000000000104',
    'c4e10000-0000-4000-8004-000000000202',
    'c4e10000-0000-4000-8004-000000000203',
    'c4e10000-0000-4000-8004-000000000204',
    'c4e10000-0000-4000-8004-000000000302',
    'c4e10000-0000-4000-8004-000000000303',
    'c4e10000-0000-4000-8004-000000000304',
    'c4e10000-0000-4000-8004-000000000305',
    'c4e10000-0000-4000-8004-000000000402',
    'c4e10000-0000-4000-8004-000000000403',
    'c4e10000-0000-4000-8004-000000000404',
    'c4e10000-0000-4000-8004-000000000502',
    'c4e10000-0000-4000-8004-000000000503',
    'c4e10000-0000-4000-8004-000000000504',
    'c4e10000-0000-4000-8004-000000000505',
    'c4e10000-0000-4000-8004-000000000602',
    'c4e10000-0000-4000-8004-000000000603',
    'c4e10000-0000-4000-8004-000000000604',
    'c4e10000-0000-4000-8004-000000000702',
    'c4e10000-0000-4000-8004-000000000703',
    'c4e10000-0000-4000-8004-000000000704',
    'c4e10000-0000-4000-8004-000000000802',
    'c4e10000-0000-4000-8004-000000000803',
    'c4e10000-0000-4000-8004-000000000804',
    'c4e10000-0000-4000-8004-000000000902',
    'c4e10000-0000-4000-8004-000000000903',
    'c4e10000-0000-4000-8004-000000000904',
    'c4e10000-0000-4000-8004-000000000905',
    'c4e10000-0000-4000-8004-000000001002',
    'c4e10000-0000-4000-8004-000000001003',
    'c4e10000-0000-4000-8004-000000001004',
    'c4e10000-0000-4000-8004-000000001005',
    'c4e10000-0000-4000-8004-000000001102',
    'c4e10000-0000-4000-8004-000000001103',
    'c4e10000-0000-4000-8004-000000001104',
    'c4e10000-0000-4000-8004-000000001105',
    'c4e10000-0000-4000-8004-000000001202',
    'c4e10000-0000-4000-8004-000000001203',
    'c4e10000-0000-4000-8004-000000001204',
    'c4e10000-0000-4000-8004-000000001302',
    'c4e10000-0000-4000-8004-000000001303',
    'c4e10000-0000-4000-8004-000000001304',
    'c4e10000-0000-4000-8004-000000001402',
    'c4e10000-0000-4000-8004-000000001403',
    'c4e10000-0000-4000-8004-000000001404',
    'c4e10000-0000-4000-8004-000000001502',
    'c4e10000-0000-4000-8004-000000001503',
    'c4e10000-0000-4000-8004-000000001602',
    'c4e10000-0000-4000-8004-000000001603',
    'c4e10000-0000-4000-8004-000000001702',
    'c4e10000-0000-4000-8004-000000001703',
    'c4e10000-0000-4000-8004-000000001802',
    'c4e10000-0000-4000-8004-000000001803',
    'c4e10000-0000-4000-8004-000000001902',
    'c4e10000-0000-4000-8004-000000001903',
    'c4e10000-0000-4000-8004-000000002002',
    'c4e10000-0000-4000-8004-000000002003',
    'c4e10000-0000-4000-8004-000000002102',
    'c4e10000-0000-4000-8004-000000002103',
    'c4e10000-0000-4000-8004-000000002202',
    'c4e10000-0000-4000-8004-000000002203',
    'c4e10000-0000-4000-8004-000000002302',
    'c4e10000-0000-4000-8004-000000002303'
  );

  raise notice 'Chemie-Lernplan für Luk: % Lerntage, % Aufgaben.',
    (select count(*) from public.study_entries where module_id = 'c4e10000-0000-4000-8000-000000000001' and deleted_at is null),
    (select count(*) from public.tasks t join public.study_entries e on e.id = t.study_entry_id where e.module_id = 'c4e10000-0000-4000-8000-000000000001' and t.deleted_at is null);
end $$;
