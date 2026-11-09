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
| `focus_sessions` | gespeicherte Fokusphasen (Migration 004; nur lesen/anlegen) |
| `homework`, `homework_parts`, `homework_completions` | Hausaufgaben, Unteraufgaben/Arbeitseinheiten, Erledigt-Status je **(target_id, member_id)** (Migration 005) |
| `push_devices`, `push_log`, `push_state` | Push-Abos, Versandprotokoll/Deduplizierung, Scheduler-Zustand (Migration 004; öffentlich gesperrt) |

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

## Designsprache „Summit“ (StudySpace 4.0)

Ruhig, flach, professionell – ohne Glasränder, Glanzlichter oder wandernde Farbfelder. Umgesetzt als eigene Ebene am **Ende** von `src/styles/index.css` (ungeschichtetes CSS gewinnt gegen `@layer components`); die älteren „Aurora Glass“-Regeln darüber bleiben als Grundlage, werden aber von dieser Ebene überschrieben.

- **Tokens:** `--ss-bg`, `--ss-surface`, `--ss-surface-2`, `--ss-edge`, `--ss-edge-strong`, `--ss-accent`, `--ss-accent-soft`, `--ss-btn`/`--ss-btn-text`, `--ss-brand` – je eine Fassung für Hell (`#f5f4fb`, Akzent `#6a61e4`) und Dunkel (`#121129`, Karten `#1b1a39`, Akzent `#ada7ff`).
- **Liquid Glass bleibt:** Tab-Leiste (Ziehen mit Glaslinse), Regler, Schalter und Segmente kommen unverändert aus Glisse mit ihrem Glas-Look; die Summit-Ebene überschreibt die `--lg-*`-Werte bewusst nicht. An/Aus-Einstellungen sind Apple-Schalter (`ui/Switch.tsx`), keine Aus/An-Segmente.
- **Flächen:** Karten deckend mit 1-px-Kante; Unschärfe nur noch bei schwebenden Elementen (`.mat-float`: Tab-Leiste, Menüs, Mini-Player). „Transparenz: Einfach“ (`.reduce-glass`) nimmt auch diese weg. Der Regler „Durchsichtigkeit“ wurde entfernt, weil er im flachen Design keine Wirkung mehr hätte.
- **Seitenleiste:** flach mit rechter Trennlinie, 92 px (Tablet, Kurzbeschriftungen) bzw. 248 px (Desktop, Wortmarke); aktive Seite als ruhige Fläche (`.side-lens`).
- **Logo:** `components/Logo.tsx` – zwei gestaffelte Gipfel mit Schneekappen, Wortmarke „Study**Space**“. Dieselbe Geometrie erzeugt `scripts/generate-icons.mjs` für App-Icons, Startbildschirme, Maskable-Icon, Badge und Favicon.
- **Berg-Panorama:** `scripts/render-mountains.mjs` rendert die Landschaft einmalig als Bild (Höhenfeld aus Ridged-Multifractal-Rauschen plus Gauß-Massive, Raymarching mit weichen Schatten, Alpenglühen nur an hohen Graten, Nebel, Sternenhimmel; fester Seed). Ausgabe: `public/scenery/mountains{,-1200}.{webp,jpg}` (WebP ≈ 25–55 KB). `components/landscape/Landscape.tsx` bindet sie als `<picture>` mit `srcset` ein. Eingesetzt im Prüfungs-Hero (`.photo-stage` mit Abdunklungsverlauf für lesbaren weißen Text), in der Fokus-Bühne und der Personenauswahl. **Herausragender Gipfel:** Der Renderer schreibt zusätzlich `mountains-peak{,-1200}.webp` (gleiches Bild, Himmel durchsichtig, weiche Kante) und die Gipfellage nach `components/landscape/peak.ts`. `PeakStage` legt Panorama (im beschnittenen Fenster) und freigestellte Spitze (nur oberhalb des Fensterrands, `.peak-pop`) pixelgenau übereinander; die Bildlage wird per `ResizeObserver` aus der Fenstergröße berechnet, sodass auf jedem Gerät genau die Spitze `pop` px (Handy 34, sonst 52) herausragt. Neu rendern: `node scripts/render-mountains.mjs` (braucht das vorinstallierte Chromium zum Kodieren).
- **Dashboard:** `components/dashboard/SummitCards.tsx` – `ExamHero` (Countdown zur nächsten Prüfung, „Fokus starten/fortsetzen“, „Session planen“), `FocusStatsCard` (Fokuszeit heute + Balken der letzten 7 Tage aus `focus_sessions`; ohne Daten 0, nichts geschätzt), `FocusButton`. Handy: kompakter Hero, Fokus-Knopf in voller Breite, Kacheln Hausaufgaben/Heute. Scrollbare Kartenlisten blenden unten weich aus (`.scroll-fade`).
- **Navigation Handy:** Dashboard, Fokus, Aufgaben (Hausaufgaben), Kalender (Lernplan), Mehr.

## Übergänge und Navigation (StudySpace 4.1)

- **Berg-Flug (Profilwahl → Dashboard):** `store/flight.ts` + `components/landscape/MountainFlight.tsx`. Beim Wählen einer Person misst die Profilwahl den Rahmen ihres Panoramas; im Moment des Wechsels übernimmt eine feste Ebene (`z-25`, unter Kopfzeile/Seitenleiste) den Berg. Sie misst in jedem Animationsbild das Countdown-Fenster (`[data-testid=dashboard-hero]`, `data-pop`) neu und interpoliert Rahmen, Rundung, Bildlage (`coverGeometry` → `peakGeometry`, `components/landscape/geometry.ts`), Ausblendmaske und Abdunklung. Bewegt sich das Fenster noch (Einblende-Animation), folgt der Berg einfach. Solange der Flug läuft, ist das echte Fenster unsichtbar; danach blenden Countdown-Text und Gipfel ein (`.peak-stage--arrive`). Nur Richtung Dashboard, nie bei „Bewegung reduzieren“; findet sich kein Fenster, endet der Flug nach 2,5 s.
- **Fokus ohne Zwischenschritt:** Die Fokusansicht ist eine eigene Ebene außerhalb des Seitenwechsels (`App.tsx`). Darunter bleibt die vorige Seite stehen (`returnPath()`), als `inert` gesperrt. Der Code der Fokusansicht wird 1,2 s nach dem Start vorgeladen und danach ohne Suspense gerendert (React hält sonst nachgeladene Inhalte bis zu 300 ms zurück) – sie liegt nach ~60 ms im Bild.
- **Fächer + Prüfungen:** ein Tab. `pages/Modules.tsx` zeigt je Fach den nächsten Termin (`ExamLine`), die Detailseite eine Prüfungskarte mit Bearbeiten/Papierkorb; Dialog und Karte in `components/exams/ExamParts.tsx`. `#/pruefungen` leitet auf `#/faecher` um.
- **Hausaufgaben-Leisten im Lernplan:** `lib/homework.ts` → `homeworkSpanRange()` (frühester Beginn, sonst Erstellungstag, bis einschließlich Abgabe) und `layoutSpans()` (Zuschnitt je Kalenderzeile, Spuren ohne Überlappung; Unit-Tests). Darstellung in `components/homework/HomeworkSpans.tsx`: Monatsansicht als Wochenzeilen mit Leisten unter der Tageszahl, Wochenansicht als Streifen über den Tagen, Handy als Wochenstreifen.
- **Auswahlfelder:** alle `select.field` mit iOS-Doppelpfeil (⌃⌄) in Akzentfarbe, ohne gekacheltes Hintergrundbild (die Summit-Ebene setzt nur noch `background-color`).

## Musik (StudySpace 4.0)

- **Datenbank:** `007_music.sql` → `music_tracks` (Kategorie per `check`, Titel 1–120 Zeichen, `youtube_id` per Regex auf genau 11 Zeichen `[A-Za-z0-9_-]`, `start_seconds`, `sort_order`, Soft Delete). Gleiche Schutzmechanismen wie der Lernplan (RLS, keine `delete`-Policy, Versionierung, Verlauf, Rate Limit 60/min, Realtime). Test: `supabase/tests/50_music_test.sql`.
- **Links:** `lib/youtube.ts` → `parseYouTube()` akzeptiert nur YouTube-Hosts (watch, youtu.be, shorts, embed, live, `t=`/`start=`) und liefert nur `{ id, start }`. Kategorien und Platzanzahl (`MUSIC_CATEGORIES`: Lofi 10, Konzentration 5, Regen/Gewitter/Wind/Natur/Lagerfeuer/Kamin je 3, Eigene frei).
- **Store:** `store/music.ts` (laden, Realtime über `sync.ts`, hinzufügen/umbenennen/entfernen mit Rückgängig). Fehlt die Tabelle (`42P01`/`PGRST205`), ist die Bibliothek ausgeblendet und zeigt einen Hinweis.
- **Player:** `store/player.ts` – ein Player für die ganze App (YouTube-Titel *oder* erzeugter Klang aus `lib/ambience.ts`), Lautstärke pro Gerät. `components/music/MiniPlayer.tsx` lädt die YouTube-IFrame-API erst beim ersten Abspielen, hängt in `App.tsx` und bleibt daher über Seitenwechsel bestehen. YouTube verlangt einen **sichtbaren** Player – deshalb ein kleines, verkleinerbares Fenster statt reinem Hintergrundton. Endlosschleife über das `ENDED`-Ereignis (`seekTo(start)` + `playVideo`). iOS lässt Ton nur direkt nach einer Berührung zu: `player.playTrack()` wird synchron im Klick-Handler aufgerufen.
- **UI:** `components/music/MusicLibrary.tsx` (Kategorien, freie Plätze „Lofi 3“ usw., Dialog mit Vorschau und Prüfung) auf der Seite `/musik` und als Panel im Fokus (Kopfhörer-Symbol); Einstieg auch unter Einstellungen.
- **App Store:** YouTube-Einbettung als Hintergrundmusik ist für eine veröffentlichte App rechtlich heikel; für eine Store-Fassung eigene lizenzierte Audiodateien als zusätzliche Quelle vorsehen.

## Design und Animation („Aurora Glass“, StudySpace 3.0)

> Hinweis: Dieser Abschnitt beschreibt die Grundlage aus 3.0/3.1. Seit 4.0 überschreibt die Ebene „Summit“ (oben) Glasflächen, Aurora-Hintergrund und Berglandschaft; die gerenderte Landschaft ersetzt die Vektor-Bergketten.

Ein Designsystem, zentral in `src/styles/index.css` (CSS-Variablen) und `src/lib/motion.ts` (Federn/Kurven für Motion).

**Tokens:** Farben (Hell/Dunkel als eigenständige Varianten), Rundungen (`--r-*`, Karten 26 px), Abstände (`--gap-page`, `--gap-grid`), Bewegung (`--dur-micro/comp/page/moment`, `--ease-out/emph/spring`; federnde Kurve per CSS `linear()` mit Fallback).

**Aurora-Hintergrund** (`components/layout/Ambient.tsx`): fünf sehr langsam wandernde Farbfelder plus feine Körnung. Die fünfte Fläche trägt die Farbe des aktiven Lernprofils und blendet beim Personenwechsel weich über. Ohne farbigen Untergrund wirkt Glas nur wie eine getönte Karte – deshalb ist der Hintergrund Teil des Materials.

**Berglandschaft (Hero):** bis 3.1 Vektor-Bergketten; seit 4.0 ein gerendertes Panorama – siehe „Designsprache Summit“ oben.

**Glasmaterialien** – ein Aufbau, fünf Stärken (`.glass` + Modifikator):

| Klasse | Einsatz | Eigenschaften |
|---|---|---|
| `.mat-nav` (= `.glass-thin`) | Seitenleiste, Tab-Leiste, Werkzeugleisten | sehr klar, stärkste Unschärfe |
| `.card` / `.glass` | Karten | ruhig, beste Lesbarkeit |
| `.mat-float` (= `.glass-strong`) | Menüs, Dialoge, Meldungen | dichter, großer Schatten |
| `.mat-interactive` | Knöpfe | Lichtfleck + Federn beim Drücken |
| `.mat-hero` | Countdown, gemeinsames Ziel, Statuskarten | Prisma-Kante (konische Lichtkante), alle ~14 s ein langsamer Lichtimpuls |

Ebenen jeder Glasfläche: transparente Füllung (skaliert mit `--lg-k` aus dem Regler „Durchsichtigkeit“) → diagonaler Brechungsverlauf und Glanz oben links → Lichtfleck, der dem Mauszeiger folgt (`lib/spotlight.ts`, ein gedrosselter Listener setzt `--mx/--my`) → Innenkante/Innenleuchten → leuchtende Glaskante (`::before` mit Maske, folgt jeder Rundung). `backdrop-filter: blur() saturate() brightness()`. Ohne Unterstützung, bei „Glaseffekte: Einfach“, schwachen Geräten oder `prefers-reduced-transparency` werden die Flächen deckend.

**Bewegungshierarchie:**

- *Große Momente:* App-Start (Logo entsteht aus vier Bögen, rastet ein, Lichtreflex, gleitet an seinen Platz; Überschrift erscheint Wort für Wort; Profilkarten fallen räumlich auf ihre Plätze), Profilwahl (Karte hebt sich, Farbschimmer breitet sich vom Avatar aus, Avatar fliegt per `layoutId` in den Profilknopf), 100 % (Welle am Fortschrittskreis + Konfetti).
- *Seiten:* Tiefen-Übergang (Desktop leicht räumlich mit Perspektive), gestaffeltes Aufsteigen der Dashboard-Karten.
- *Komponenten:* gleitende Linse in Seitenleiste/Tab-Leiste mit elastischer Dehnung (Elastic Tab Morph), Dialoge mit Feder und unscharfem Hintergrund, Klappziffern im Countdown (Countdown Flip), Säulen/Balken wachsen gestaffelt.
- *Mikro:* Checkbox mit elastischem Haken und Farbimpuls, federnde Schalter (Fluid Toggle), Knöpfe mit Druckfeder.
- *Ruhe:* Aurora-Drift, Lichtimpuls auf Hero-Flächen, Lichtreflex entlang neuer Fortschrittsbögen.

Alles über `transform`/`opacity`; `prefers-reduced-motion` bzw. „Animationen: Reduziert“ schaltet ab (CSS + `MotionConfig`).

**Fortschrittskreise:** SVG mit runden Enden; Leuchtschein als SVG-Filter mit ausdrücklich festgelegter Filterfläche (`filterUnits="userSpaceOnUse"`) – kein CSS-`filter: blur()` auf SVG (rechteckige Artefakte). Wird von den Browsertests strukturell und per Pixelprobe geprüft.

**Haptik:** `src/lib/haptics.ts` (Vibration API nur bei echter Unterstützung, abschaltbar). iOS Safari bietet keine Vibration API – dort nur visuelle Rückmeldung. Bewusst keine Tricks.

**Glisse (StudySpace 3.1):** Interaktive Glasbedienelemente kommen aus [`glisse`](https://github.com/0kzh/glisse) (0.5.0): Tab-Leiste (`components/layout/LiquidTabBar.tsx`), Segmented Controls (`ui/Segmented.tsx`), Schalter (`ui/Switch.tsx`) und Regler (`ui/GlassSlider.tsx`, Regler „Durchsichtigkeit“). Die Tab-Leiste folgt beim Halten dem Finger als Linse, rastet federnd ein und navigiert erst beim Loslassen; `touch-action: pan-y` hält senkrechtes Scrollen frei, und es gibt bewusst keine Wischgesten über dem Seiteninhalt. Glisse liest das Theme aus `html[data-theme]` (gesetzt in `index.html` und `hooks/useAppearance.ts`) und seine Farben aus `--lg-*`; die Brücke am Ende von `styles/index.css` setzt das StudySpace-Violett als Akzent und koppelt die Glasfüllung an `--lg-k` (Regler „Durchsichtigkeit“). Browser: echte Lichtbrechung des Hintergrunds (SVG `feDisplacementMap`) nur in Chromium; Safari/WebKit bricht nur die Inhalte der Linse; sonst Unschärfe als Rückfall. Glisse animiert mit eigener Feder nur während einer Bewegung (kein Dauer-rAF) und beachtet `prefers-reduced-motion`. Karten, Dialoge und die Seitenleiste bleiben beim eigenen Material (kein blindes Ersetzen).

**Geräteklassen:** Smartphone mit schwebender, sehr klarer Tab-Leiste und kompakter Kopfzeile; Tablet mit schmaler Glas-Leiste (Kurzbeschriftungen) und dicht gepacktem 2-Spalten-Raster; Desktop mit Glas-Seitenleiste, Suchpille und 12-Spalten-Raster (max. 1360 px).

## Neue Bereiche

- **Semester-Timeline** (`lib/timeline.ts`, `components/SemesterTimeline.tsx`): Module × Kalenderwochen; Lernphase = erster bis letzter Lerntag, Füllung = echter Gruppenfortschritt, Rauten = Prüfungen, Linie = heute. Im Lernplan (Ansicht „Timeline“) und kompakt im Dashboard.
- **Fokus 2.0** (`pages/Focus.tsx`, `components/focus/FocusSettingsPanel.tsx`, `components/FocusPanel.tsx`): `#/fokus` ist immer die immersive Vollbildansicht ohne App-Rahmen (auch aus der Navigation). Große Zeit, Ring, Phase („Fokus · Runde 2 von 4“, „Kurze Pause“), Steuerleiste unten/oben mit automatischem Ausblenden, Einstellungen im Bild (Rhythmus, Anzeige, Bild, Steuerung), Fullscreen-API wo vorhanden (iPhone-PWA: ohnehin randlos), Wake Lock, Hoch- und Querformat. Das Dashboard zeigt nur eine Startkarte (`FocusLauncher`) ohne eigene Bedienelemente – keine doppelten Funktionen.
- **Pomodoro** (`lib/focus.ts`, `store/focus.ts`): Restzeit immer aus Endzeitpunkt − jetzt (stimmt nach Standby). Vorgaben Kurz 15/5, Klassisch 25/5, Intensiv 50/10, Individuell; lange Pause nach N Runden (Standard 4); eigene Vorlagen. Automatischer Phasenwechsel und Autostart der nächsten Phase einstellbar (Autostart beginnt genau am Ende der vorherigen Phase, aber nie für Phasen, die während einer langen Abwesenheit schon vorbei wären). Autostart beim Öffnen standardmäßig aus. Gespeichert werden nur Fokusphasen (≥ 1 Min.) in `focus_sessions`; Pausen zählen nie. Darstellung (`lib/focusLook.ts`) pro Gerät im `localStorage`, geprüft beim Laden, „Darstellung zurücksetzen“.
- **Hausaufgaben** (`lib/homework.ts`, `store/homework.ts`, `pages/Homework.tsx`, `components/homework/`): eigener Store neben dem Kern-Sync; lädt tolerant (fehlende Tabellen → `available = false`, Bereich ausgeblendet/Hinweis) und übernimmt Realtime-Ereignisse aus demselben Kanal. Bearbeitungszeitraum = heute bzw. frühester Beginn bis **Vortag** der Abgabe. `distributeUnits()` verteilt nur die gewählte Zahl neutraler Arbeitseinheiten (Puffer vor der Abgabe, Prüfungstage meiden, wenig belegte Tage, Priorität) – Vorschau mit bearbeitbaren Daten, nichts wird ohne Bestätigung eingetragen, bestehende Aufgaben werden nie verschoben. `replanUnits()` schlägt bei geänderter Abgabe neue Termine vor; erledigte Einheiten bleiben, IDs bleiben (damit auch die Haken).
- **Analyse** (`pages/Analytics.tsx`): ausschließlich echte Daten – `completed_at` der Haken (pro Tag/Woche), gespeicherte Fokuszeiten, Serie, Fortschritt je Modul im Vergleich zur Gruppe.

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
| 768–1199 px | schmale Glas-Leiste mit Kurzbeschriftungen | 2 Spalten, dicht gepackt |
| ≥ 1200 px | Glas-Seitenleiste mit Beschriftung, Suchpille | 12-Spalten-Raster, max. 1360 px Inhaltsbreite, Monatsraster mit Drag & Drop |

## Push-Benachrichtigungen

```
 Gerät (PWA)                         Supabase                               Push-Dienst
 ┌───────────────────────┐  POST     ┌──────────────────────────┐            ┌───────────────┐
 │ Einführung/Einstellung │────────►│ Edge Function push-api     │            │ Apple / FCM / │
 │ PushManager.subscribe  │ Token +  │  register/update/status/   │──test────►│ Mozilla / WNS │
 │ Service Worker (sw.ts) │ Abo      │  test/unregister           │            └──────┬────────┘
 │   push → Systemmeldung │          │ push_devices (RLS gesperrt)│                   │
 │   Klick → #/route      │◄─────────┼────────────────────────────┼───────────────────┘
 └───────────────────────┘          │ Cron (5 min) → push-scheduler│
                                     │  planNotifications() → push_log (dedupe) → senden
                                     └──────────────────────────┘
```

- **Kein Login:** Jedes Gerät erzeugt einen geheimen Zufallstoken (32 Byte, nur im `localStorage`). Der Server speichert ausschließlich `sha256(token)`. Alle Aktionen wirken nur auf das Gerät mit diesem Token. Die Zuordnung zu einem Lernprofil ist eine Gerätepräferenz, keine verifizierte Identität. Mehrere Geräte pro Person sind möglich; ein Gerät gehört immer genau einem Profil (beim Personenwechsel fragt die App ausdrücklich).
- **Sicherheit:** `push_devices`, `push_log`, `push_state` haben RLS ohne Policies und keine Rechte für `anon`/`authenticated` – Endpoints und Schlüssel sind öffentlich nicht auslesbar. Endpoints nur von bekannten Push-Diensten (keine beliebigen URLs → kein SSRF). Die Testnachricht hat einen festen Text und geht nur ans eigene Gerät; Sperrfrist 30 s, max. 10/Stunde; Rate Limit pro IP; max. 200 Geräte; Insert-Rate-Limit per Trigger. Privater VAPID-Schlüssel und `SCHEDULER_SECRET` nur als Edge-Function-Secrets; der Scheduler prüft das Secret in konstanter Zeit.
- **Verschlüsselung:** RFC 8291 (aes128gcm) und VAPID (RFC 8292, ES256) mit WebCrypto in `supabase/functions/_shared/webpush.ts` – ohne Fremdbibliothek, getestet gegen den offiziellen Testvektor der RFC.
- **Erinnerungslogik:** reine Funktion `planNotifications()` in `_shared/reminders.ts` (vollständig unit-getestet). Uhrzeiten in Europe/Berlin über `Intl` (Zeitumstellung korrekt). Ruhezeit: Morgenteil → Ende der Ruhezeit, Abendteil → 15 Min. vor Beginn; 2-Stunden-Prüfungserinnerung → Ende der Ruhezeit (wenn noch ≥ 30 Min. bleiben) sonst Vorabend, nie doppelt zur „Morgen“-Erinnerung. Prüfungsschlüssel enthalten `starts_at` → Verschiebung erzeugt neue Erinnerungen, alte verfallen. Erinnerungen werden nur innerhalb eines Zeitfensters nach dem geplanten Zeitpunkt verschickt – nie nachträglich. Überfällige Aufgaben: erneut nur bei neuen Fällen oder nach 3 Tagen. Lernplan-Änderungen über einen Cursor im `activity_log`, gesammelt bis 10 Minuten Ruhe, ohne eigene Änderungen. Erfolge über Zustandswechsel in `push_state` (erstes Erfassen löst nichts aus).
- **Idempotenz:** Vor jedem Versand wird `(device_id, dedupe_key)` in `push_log` reserviert (eindeutiger Index). Doppelte oder verspätete Scheduler-Läufe können dieselbe Nachricht nie zweimal senden. Vorübergehende Fehler (5xx/429/Netz) geben die Reservierung frei → nächster Lauf versucht erneut; 404/410 → Abo wird gelöscht; wiederholte Fehler → Gerät deaktiviert.
- **Service Worker** (`src/sw.ts`, `vite-plugin-pwa` mit `injectManifest`): zeigt zu jeder Push-Nachricht eine Systembenachrichtigung (iOS verlangt das), setzt den App-Badge, öffnet beim Antippen `scope + #/route` (nur Hash-Routen erlaubt → nie 404 unter `/Semester3/`) bzw. navigiert eine offene App per `postMessage`.
- **Berechtigung:** wird ausschließlich beim Tippen auf „Benachrichtigungen aktivieren“ angefragt (als erster Aufruf im Klick, ohne vorheriges `await`). iPhone/iPad im Browser → Installationsanleitung statt Anfrage. Nach „Vielleicht später“ oder Ablehnung keine erneute automatische Nachfrage. Abgleich beim Start: erneuertes oder verlorenes Abo wird erkannt.

## Manuelle Abnahme

Diese Punkte lassen sich nur mit einem echten Supabase-Projekt prüfen:

- [ ] **Test C:** Gerät A legt einen Lerntag an → erscheint auf Gerät B ohne Neuladen.
- [ ] Gerät A und B haken gleichzeitig verschiedene Aufgaben ab → beide Haken bleiben.
- [ ] **Test J:** PDF hochladen → nach Neuladen vorhanden → auf zweitem Gerät öffnen.
- [ ] Upload einer `.exe` (umbenannt in `.pdf`) wird abgelehnt.
- [ ] **Test N:** `https://lern-hub-wing.github.io/Semester3/#/lernplan` direkt aufrufen und neu laden.
- [ ] Flugmodus: zuletzt geladener Stand bleibt sichtbar, Hinweis erscheint, Haken werden nicht gespeichert.
- [ ] Safari (iPhone/iPad), Chrome (Android), Firefox und Edge kurz durchklicken; PWA installieren.
- [ ] **Push auf echtem iPhone (iOS ≥ 16.4):** zum Home-Bildschirm hinzufügen → Einführung → aktivieren → Testnachricht bei gesperrtem Gerät → Antippen öffnet die Einstellungen.
- [ ] Push bei geschlossener App: am Vortag einer Lerneinheit Aufgaben offen lassen → 08:00/18:00-Erinnerung erscheint; alles erledigt → keine Erinnerung.
- [ ] Zwei Geräte mit unterschiedlichen Personen → jedes erhält nur seine eigenen Zahlen.
- [ ] Prüfungstermin verschieben → Erinnerungen folgen dem neuen Termin.

Automatisch geprüft werden (siehe README → Tests): Tests A, B, D, E, F, G, H, I, K, L, M sowie Datenbankrechte, Trigger und der Fehler-/Rücksprungfall.
