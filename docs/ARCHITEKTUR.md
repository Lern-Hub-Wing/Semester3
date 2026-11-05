# StudySpace – Technische Architektur

## Überblick

```
 Browser (React-PWA auf GitHub Pages)                  Supabase
 ┌──────────────────────────────────────┐        ┌──────────────────────────┐
 │ pages/ · components/                 │        │ PostgreSQL               │
 │        │ liest                       │  REST  │  · Tabellen + Trigger    │
 │        ▼                             │◄──────►│  · RLS (nur SELECT/      │
 │ store/data.ts  (Zustand, Maps je     │        │    INSERT/UPDATE)        │
 │                 Tabelle)             │  WS    │  · activity_log          │
 │ store/engine.ts (Versionen, optimis- │◄───────│ Realtime (postgres_      │
 │                 tische Writes)       │        │    changes)              │
 │ store/sync.ts  (Laden, Realtime,     │        │ Storage (Bucket          │
 │                 Resync, Cache)       │◄──────►│    "materials")          │
 │ store/actions.ts (alle Schreib-      │        └──────────────────────────┘
 │                 operationen)         │
 └──────────────────────────────────────┘
```

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Motion, Lucide, Zustand, date-fns-tz.
- **Hosting:** GitHub Pages (nur statische Dateien). Routing über Hash-URLs (`/#/lernplan`), damit Direktaufrufe und Neuladen ohne Serverkonfiguration funktionieren. `VITE_BASE_PATH` wird im Workflow automatisch aus `actions/configure-pages` gesetzt.
- **Daten:** Supabase PostgreSQL ist die einzige Wahrheit. Speichern im Lernplan erzeugt keine Git-Commits.

## Datenmodell

Siehe `supabase/migrations/001_schema.sql`. Kernpunkte:

| Tabelle | Zweck |
|---|---|
| `members` | Lernprofile (Name, Farbe, aktiv) |
| `modules` | Prüfungsmodule (Fachfarbe, archiviert) |
| `module_topics` | Themenbereiche je Modul |
| `exams` | Prüfungen als `timestamptz` + Zeitzone |
| `study_entries` | Lerntage (nur Datum) |
| `tasks` | Aufgaben eines Lerntags |
| `task_completions` | Haken je **(task_id, member_id)** |
| `attachments` | Datei-Metadaten (Datei selbst im Storage) |
| `app_settings` | gemeinsame Einstellungen |
| `activity_log` | Änderungsverlauf (nur durch Trigger) |

Hierarchie: **Modul → Themenbereich → Lerntag → Aufgaben**.

**Stabile IDs:** Alle Zeilen haben UUIDs, die der Client beim Anlegen erzeugt (dadurch sofort referenzierbar). Ein Trigger verhindert, dass IDs später geändert werden. Titel, Datum, Thema oder Farben ändern daher nie die Zuordnung der Haken. Eine neue Aufgabe hat für alle Personen schlicht noch keinen Eintrag in `task_completions` = offen.

**Kein Datenverlust:** Fremdschlüssel sind `ON DELETE RESTRICT`. Die öffentliche Rolle hat **kein DELETE-Recht**. „Löschen“ setzt `deleted_at` (Aufgaben, Lerntage, Dateien, Prüfungen) bzw. `archived_at` (Module, Themen). Wiederherstellen setzt den Wert zurück – Haken sind nie betroffen.

## Fortschrittsberechnung (`src/lib/progress.ts`)

- **Aktive Aufgaben:** nicht gelöscht, Lerntag nicht gelöscht, Modul nicht archiviert.
- **Persönlich:** erledigte ÷ aktive Aufgaben × 100.
- **Gruppe:** Summe aller Erledigungen aktiver Personen ÷ (Aufgaben × aktive Personen) × 100.
- Es wird **abgerundet**; 100 % erscheint nur, wenn wirklich alles erledigt ist.
- Ohne Aufgaben ist der Wert `null` → Leerzustand statt falscher 100 %.
- Dieselbe Funktion wird für Lernplan, Modul, Thema, Tag, Person und Gruppe genutzt.

## Synchronisierung und Konflikte (`src/store/engine.ts`, `sync.ts`)

1. **Versionen:** Jede Zeile hat eine `version`, die ein Trigger bei jedem UPDATE erhöht.
2. **Eingehende Daten** (Realtime, Neuladen, Serverantwort) werden nur übernommen, wenn `version ≥ bekannte Version`. Doppelte oder verspätete alte Ereignisse ändern nichts.
3. **Schreiben:** Die Änderung wird sofort angezeigt (optimistisch). Schreibvorgänge auf dieselbe Zeile laufen nacheinander. Während ein Write läuft, werden Serverstände im Hintergrund gemerkt; danach zeigt die UI den neuesten **bestätigten** Stand. Schlägt ein Write fehl, springt die Anzeige automatisch auf den gespeicherten Zustand zurück und eine Fehlermeldung erscheint.
4. **Konfliktstrategie:**
   - *Haken:* Jede Person hat ihre eigene Zeile `(task, member)` → Änderungen verschiedener Personen kollidieren nie. Für dieselbe Zeile gilt „letzter Klick gewinnt“.
   - *Formulare* (Lerntag, Modul, Prüfung, Namen): **optimistisches Sperren**. Das UPDATE enthält `version = <Stand beim Öffnen>`. Hat jemand anderes inzwischen gespeichert, wird nichts überschrieben; der neueste Stand wird geladen und die Person informiert.
   - *Schnellaktionen* (Verschieben, Sortieren, Papierkorb): last-write-wins, da idempotent bzw. unkritisch.
5. **Wiederverbindung:** Nach Realtime-Unterbrechung, `online`-Ereignis oder Rückkehr aus dem Hintergrund (> 15 s) wird komplett neu geladen und per Versionsregel abgeglichen.
6. **Offline:** Der zuletzt bestätigte Stand wird in `localStorage` gecacht und beim Start sofort angezeigt. Offline werden Schreibvorgänge abgelehnt (nie als gespeichert dargestellt). Unbestätigte Werte werden nie gecacht.

Supabase liefert maximal 1000 Zeilen pro Anfrage; `fetchTable` lädt seitenweise.

## Sicherheit (`002_security.sql`, `003_storage.sql`)

- Im Frontend nur der **Publishable Key**. Die App verweigert den Start, wenn ein Secret-/service_role-Key konfiguriert wurde.
- RLS auf allen Tabellen; Policies erlauben SELECT/INSERT/UPDATE für `anon`, **kein DELETE**, kein TRUNCATE.
- Rechte auf **Spaltenebene**: `version`, `created_at`, `updated_at`, `completed_at` sind nicht beschreibbar; bei Anhängen ist nur `deleted_at` änderbar.
- Check-Constraints begrenzen Textlängen, Farbformat (`#RRGGBB`), Datumsbereiche, Prüfungsdauer, MIME-Typen.
- Rate Limits per Trigger (neue Zeilen pro Minute), max. 30 Personen, mindestens eine aktive Person.
- `activity_log` wird nur von `SECURITY DEFINER`-Triggern geschrieben und ist öffentlich nur lesbar. Der protokollierte Name ist das gewählte Lernprofil – **nicht verifiziert**.
- Storage: Bucket-Limit 10 MB und MIME-Whitelist (serverseitig), Insert-Policy prüft Bucket und Dateiendung, keine Update-/Delete-Policy. Der Client prüft zusätzlich Endung, MIME-Typ, Größe und Magic Bytes.
- Pfade: `<modul-id>/<uuid>/<bereinigter-name>` → keine Kollisionen, kein Path Traversal.
- React escaped alle Ausgaben; es wird kein `dangerouslySetInnerHTML` verwendet.

**Grenzen:** Ohne Authentifizierung kann jede Person mit dem Link alles ändern. Die Maßnahmen begrenzen Schäden (Papierkorb, kein Löschen, Verlauf, Export), verhindern absichtlichen Missbrauch aber nicht.

## Zeit und Countdown (`src/lib/time.ts`, `countdown.ts`)

- Prüfungen werden als eindeutige Zeitpunkte (`timestamptz`) gespeichert; Eingabe/Anzeige in `Europe/Berlin` inkl. Sommer-/Winterzeit (date-fns-tz).
- Der Countdown berechnet bei jedem Tick `Prüfungsbeginn − jetzt` neu (kein Herunterzählen) und ist daher nach Standby sofort korrekt. Der Tick ist auf volle Sekunden ausgerichtet und wird bei `visibilitychange` sofort nachgeholt.
- Zustände: bevorstehend → „Prüfung läuft“ (Restdauer) → automatisch nächste Prüfung → Abschlussansicht.
- „Heute“ und „überfällig“ beziehen sich auf das Kalenderdatum in Berlin.

## Design und Animation

- Farb-Tokens als CSS-Variablen (`src/styles/index.css`) für Hell/Dunkel; Theme `System/Hell/Dunkel` pro Gerät.
- Liquid Glass: **ein** Material in `src/styles/index.css` für alle Glasflächen – `.glass` (normal), `.glass-thin` (Seitenleiste, Tab-Leiste), `.glass-strong` (Menüs, Dialoge, Meldungen; gut lesbar), `.glass-tint` (dezenter Pastellschimmer), `.lens` (gläserne Hervorhebung des aktiven Elements). Hintergrundunschärfe per `backdrop-filter`/`-webkit-backdrop-filter`, Lichtkante und Spiegelung als Innenschatten bzw. `::before`, Werte als CSS-Variablen für Hell/Dunkel. Ohne `backdrop-filter`-Unterstützung automatisch deckend.
- Durchsichtigkeit: Einstellung „Durchsichtigkeit des Glases“ (0–100, Standard 50) setzt die CSS-Variable `--lg-k` (`src/lib/glass.ts`, 100 → 0,25 · 50 → 1 · 0 → 4). Deckkraft der Glasfüllung und Stärke der Unschärfe werden damit in allen Glasklassen skaliert – ein Regler für die ganze App, sofort sichtbar.
- Fortschrittskreise: Der Leuchtschein ist ein SVG-`<filter>` mit ausdrücklich festgelegter Filterfläche (`filterUnits="userSpaceOnUse"`). Kein CSS-`filter: blur()` auf SVG-Elementen – dessen automatisch berechnete, rechteckige Fläche wird mit Grafikkarten-Beschleunigung hart abgeschnitten (eckiges Leuchten).
- `body` nutzt `overflow-x: clip` statt `hidden`, damit die Kopfzeile mit Logo (`position: sticky`) auch in iOS Safari stehen bleibt. Der untere Abstand des Inhalts wird aus `--tabbar-height` + Safe Area berechnet (`.pb-tabbar`).
- Haptik: `src/lib/haptics.ts` (Vibration API nur bei echter Unterstützung, sehr kurze Impulse, Sperre gegen Wiederholung, abschaltbar). iOS Safari unterstützt die API nicht – dort gibt es nur die visuelle Rückmeldung (Drück-Animation).
- `.sheen` (sehr langsamer Schimmer), langsam wandernde Hintergrundflächen (`.ambient`) – alles über `transform`/`opacity`.
- Automatische Vereinfachung: `prefers-reduced-transparency`, schwache Geräte (`hardwareConcurrency`/`deviceMemory`) oder Einstellung „Glaseffekte: Einfach“.
- `prefers-reduced-motion` bzw. Einstellung „Animationen: Reduziert“ schaltet Animationen ab (CSS + `MotionConfig`).
- Personenwechsel: Die gewählte Karte vergrößert sich mit Farbschimmer, die anderen treten zurück; der Avatar trägt eine gemeinsame `layoutId` (Shared-Element-Konzept), danach blendet das Dashboard weich ein.
- Konfetti (canvas-confetti, nachgeladen, `pointer-events: none`) nur beim **Übergang** auf 100 % während der Nutzung – nicht beim Laden.

## Lernmodus

- Route `#/lernmodus` (`src/pages/StudyMode.tsx`, nachgeladen), ohne App-Rahmen. Start über `startStudyMode()` (`src/lib/studyModeStart.ts`), das direkt aus dem Klick heraus das Vollbild anfordert.
- Uhr: Bei jedem Tick (`useNow(1000)`) wird die Zeit aus `new Date()` neu berechnet (`clockParts`) – kein Hochzählen, also keine Abweichung. Ziffern stehen in Boxen der Breite `1ch`, damit nichts springt; breite Schriften werden automatisch auf die freie Breite verkleinert.
- Hochkant auf Touch-Geräten (`pointer: coarse` + `orientation: portrait`): Hinweis „Bitte quer hinlegen“.
- Bedienelemente blenden sich nach 3,5 s ohne Eingabe aus (`data-controls`, Mauszeiger ebenfalls); Mausbewegung, Taste oder Antippen blendet sie ein, Antippen der freien Fläche wieder aus. Escape beendet.
- Vollbild über die Fullscreen API (`src/lib/fullscreen.ts`), auf Android zusätzlich Querformat-Sperre. iPhone-Safari bietet kein Vollbild für Webseiten – dort Hinweis auf „Zum Home-Bildschirm“ (als installierte App ohne Browserleisten). Bildschirm bleibt per Wake Lock API an, wo unterstützt.
- Darstellung (`src/lib/studyMode.ts`): Einstellungen und ein eigenes Hintergrundbild (verkleinert auf max. 1920 px, JPEG) liegen nur im `localStorage` des Geräts. Schriften (Inter, Nunito, Space Grotesk, JetBrains Mono, Playfair Display, Orbitron) werden erst bei Auswahl nachgeladen; die lateinischen Schnitte sind für die Offline-Nutzung im Service-Worker-Cache.
- Einbrennschutz: optional verschiebt sich die Uhr jede Minute um wenige Pixel.

## Responsives Layout

| Breite | Navigation | Layout |
|---|---|---|
| < 768 px | schwebende Glas-Tableiste unten (Home · Lernplan · Fächer · Team · Mehr), Safe Areas | einspaltig, kompakter Countdown, Wochenansicht als Tageskarten, Bottom Sheets |
| 768–1199 px | kompakte Seitenleiste mit Icons | 1–2 Spalten |
| ≥ 1200 px | Seitenleiste mit Beschriftung | 12-Spalten-Raster, max. 1320 px Inhaltsbreite, Monatsraster mit Drag & Drop |

## Push-Benachrichtigungen

Bewusst **nicht** umgesetzt: Zuverlässige Web-Push-Benachrichtigungen bräuchten einen Server (VAPID, Zeitsteuerung) und funktionieren auf iOS nur für installierte PWAs. Stattdessen zeigt das Dashboard offene und überfällige Aufgaben deutlich an. Es gibt keine Benachrichtigungs-Einstellung ohne Funktion.

## Manuelle Abnahme

Diese Punkte lassen sich nur mit einem echten Supabase-Projekt prüfen:

- [ ] **Test C:** Gerät A legt einen Lerntag an → erscheint auf Gerät B ohne Neuladen.
- [ ] Gerät A und B haken gleichzeitig verschiedene Aufgaben ab → beide Haken bleiben.
- [ ] **Test J:** PDF hochladen → nach Neuladen vorhanden → auf zweitem Gerät öffnen.
- [ ] Upload einer `.exe` (umbenannt in `.pdf`) wird abgelehnt.
- [ ] **Test N:** `https://lern-hub-wing.github.io/Semester3/#/lernplan` direkt aufrufen und neu laden.
- [ ] Flugmodus: zuletzt geladener Stand bleibt sichtbar, Hinweis erscheint, Haken werden nicht gespeichert.
- [ ] Safari (iPhone/iPad), Chrome (Android), Firefox und Edge kurz durchklicken; PWA installieren.

Automatisch geprüft werden (siehe README → Tests): Tests A, B, D, E, F, G, H, I, K, L, M sowie Datenbankrechte, Trigger und der Fehler-/Rücksprungfall.
