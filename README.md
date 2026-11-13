# StudySpace

**Gemeinsam lernen. Gemeinsam Fortschritte machen. Gemeinsam 100 Prozent erreichen.**

StudySpace ist eine gemeinsame Lernplattform für eine kleine Lerngruppe. Alle teilen denselben Lernplan, dieselben Fächer und Materialien – aber jede Person hakt ihre Aufgaben **für sich** ab. Daraus entstehen der persönliche Fortschritt und der gemeinsame Gruppenfortschritt.

- Personenauswahl „Wer lernt heute?“ – **ohne Anmeldung, ohne Passwort**
- Dashboard mit Live-Prüfungscountdown, Fortschrittskreisen/-balken, heutigen und überfälligen Aufgaben
- Gemeinsamer Lernkalender (Tag, Woche, Monat, Liste) mit Drag & Drop
- **Fächer mit Prüfungen in einem Tab:** jedes Fach zeigt seinen Prüfungstermin mit Countdown; Termine werden direkt am Fach eingetragen und bearbeitet. Dazu Themenbereiche und eine Team-Seite mit gemeinsamem Lernziel
- Lernmaterialien (PDF, PNG, JPG, WebP) über Supabase Storage
- Echtzeit-Synchronisierung zwischen allen Geräten, Papierkorb, Änderungsverlauf, JSON-Export/Import
- Semester-Timeline (Lernphasen + Prüfungen je Modul), Analyse aus echten Daten
- **Fokus 2.0:** immersive Vollbildansicht mit Pomodoro-Runden (Kurz, Klassisch, Intensiv, Individuell, eigene Vorlagen), lange Pause nach N Runden, frei gestaltbarer Anzeige und Hintergrund; nur echte Fokuszeit zählt als Lernzeit
- **Hausaufgaben** mit Abgabedatum, Unteraufgaben, Priorität, Anhängen, Erledigt-Status je Person und optionaler Verteilung von Arbeitseinheiten bis zum Vortag der Abgabe (Migration 005); im Lernplan als farbige Zeitraum-Leiste bis zur „Abgabe“
- **Push-Benachrichtigungen** auf iPhone (als Home-Bildschirm-App), Android und Desktop – Morgenübersicht, offene und überfällige Aufgaben, neue Hausaufgaben, Prüfungserinnerungen, Lernplan-Änderungen, gemeinsame Erfolge; mit Ruhezeiten und Testnachricht
- **Fokus-Statistik:** Lernzeit heute und Verlauf der letzten 7 Tage direkt im Dashboard (nur echte, gespeicherte Fokuszeit)
- **Lernzeit der Gruppe:** Team-Seite zeigt die Fokuszeit jeder Person in der aktuellen Kalenderwoche (Mo–So, Europe/Berlin) und die Gruppensumme; Sitzungen über Mitternacht oder die Wochengrenze werden anteilig gezählt
- **Hausaufgaben zählen zum Fortschritt:** jede Hausaufgabe ist ein Posten wie eine Lernplan-Aufgabe; Arbeitseinheiten/Unteraufgaben zählen anteilig, nie doppelt – überall dieselbe Berechnung (Dashboard, Team, Fächer, Statistik, Timeline)
- **Musik-Bibliothek:** gemeinsame YouTube-Links in Kategorien (10 Lofi-Plätze, Regen, Gewitter, starker Wind, Natur, Lagerfeuer, Kamin, Konzentration, Eigene) – einmal eingetragen, für alle sichtbar; abspielbar im Fokus und auf der Seite „Musik“, in Endlosschleife (Migration 007). Dazu Lofi, Regen und Rauschen ohne Internet, live im Browser erzeugt
- Dark/Light Mode, ruhige Designsprache „Summit“ (StudySpace 4.0) mit gerendertem Berg-Panorama und neuem Logo, Bedienelemente von [Glisse](https://glisse.kelvinzhang.com) (Tab-Leiste mit Ziehen, Schalter, Regler, Segmente), installierbar als App (PWA)

> **Wichtiger Hinweis zur Sicherheit:** StudySpace hat bewusst **keine Anmeldung**. Jede Person mit dem Link kann alle Inhalte sehen und bearbeiten. Die Auswahl „Wer lernt heute?“ ist **keine Identitätsprüfung** – Einträge wie „von Person 2 geändert“ sind nicht verifiziert. Ohne echte Authentifizierung gibt es **keinen verlässlichen Schutz gegen absichtliche Änderungen durch Dritte**, die den Link kennen. StudySpace ist deshalb **nicht für vertrauliche, personenbezogene oder sensible Dokumente** gedacht. Schutzmaßnahmen: Soft Delete (Papierkorb) statt Löschen, keine Löschrechte in der Datenbank, Rate Limits, Eingabeprüfungen, regelmäßige Exporte.

> **Neue App mit Konten (`/app/`):** Die kommerzielle StudySpace-App mit Anmeldung (E-Mail, Google, Apple), beliebig vielen Lerngruppen,
> Free/Plus und Admin-Bereich liegt unter `https://lern-hub-wing.github.io/Semester3/app/` – mit **eigenem** Supabase-Projekt und ohne Uploads.
> Diese Seite hier bleibt unverändert. Einrichtung und Regeln: [docs/APP.md](docs/APP.md).

---

## Inhalt

1. [GitHub-Repository](#1-github-repository)
2. [Projekt lokal starten (optional)](#2-projekt-lokal-starten-optional)
3. [Supabase-Projekt erstellen](#3-supabase-projekt-erstellen)
4. [SQL-Migrationen ausführen](#4-sql-migrationen-ausführen)
5. [Seed-Daten einspielen](#5-seed-daten-einspielen)
6. [Storage prüfen](#6-storage-prüfen)
7. [Publishable Key eintragen](#7-publishable-key-eintragen)
8. [Realtime prüfen](#8-realtime-prüfen)
9. [GitHub Pages einrichten](#9-github-pages-einrichten)
10. [Deployment auslösen](#10-deployment-auslösen)
11. [Produktive Webseite öffnen](#11-produktive-webseite-öffnen)
12. [Push-Benachrichtigungen einrichten](#12-push-benachrichtigungen-einrichten)
13. [Hausaufgaben einrichten (StudySpace 3.1)](#13-hausaufgaben-einrichten-studyspace-31)
14. [Musik-Bibliothek einrichten (StudySpace 4.0)](#14-musik-bibliothek-einrichten-studyspace-40)
- [Als App installieren](#als-app-installieren-pwa) · [Tests](#tests) · [Projektstruktur](#projektstruktur) · [Häufige Probleme](#häufige-probleme)

Technische Details: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)

---

## 1. GitHub-Repository

Der Code liegt bereits im Repository **`Lern-Hub-Wing/Semester3`**. Falls du ein eigenes Repository möchtest:

1. Auf <https://github.com/new> ein Repository anlegen (öffentlich, damit GitHub Pages kostenlos ist).
2. Alle Dateien dieses Projekts hochladen bzw. pushen.

Die Webseite wird später unter `https://<besitzer>.github.io/<repository>/` erreichbar sein – für dieses Repository also **<https://lern-hub-wing.github.io/Semester3/>**. Ein Repository mit dem Namen `<besitzer>.github.io` wird stattdessen direkt unter `https://<besitzer>.github.io/` veröffentlicht; beides funktioniert automatisch.

## 2. Projekt lokal starten (optional)

Nur nötig, wenn du am Code arbeiten willst. Voraussetzung: [Node.js 22](https://nodejs.org/).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Trage in `.env.local` die Werte aus Schritt 7 ein und starte dann:

```bash
npm run dev
```

Die App läuft unter <http://localhost:5173>.

## 3. Supabase-Projekt erstellen

1. Auf <https://supabase.com> kostenlos registrieren und **New project** wählen.
2. Name z. B. `studyspace`, ein sicheres Datenbank-Passwort vergeben (wird für StudySpace nicht gebraucht – trotzdem gut aufheben), Region **Frankfurt (eu-central-1)** wählen.
3. Warten, bis das Projekt bereit ist (ca. 2 Minuten).

> Der kostenlose Plan reicht für eine kleine Lerngruppe aus. Hinweis: Kostenlose Projekte werden nach längerer Inaktivität (derzeit 7 Tage ohne Zugriffe) pausiert und lassen sich im Dashboard mit einem Klick wieder starten.

## 4. SQL-Migrationen ausführen

Im Supabase-Dashboard links **SQL Editor** öffnen → **New query**. Dann **nacheinander** den Inhalt dieser Dateien hineinkopieren und jeweils auf **Run** klicken:

| Reihenfolge | Datei | Was passiert |
|---|---|---|
| 1 | [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql) | Tabellen, Prüfregeln, Trigger (Versionierung, Änderungsverlauf, Rate Limits) |
| 2 | [`supabase/migrations/002_security.sql`](supabase/migrations/002_security.sql) | Row Level Security, eingeschränkte Rechte, Realtime-Freigabe |
| 3 | [`supabase/migrations/003_storage.sql`](supabase/migrations/003_storage.sql) | Storage-Bucket `materials` mit 10-MB-Limit und erlaubten Dateitypen |
| 4 | [`supabase/migrations/004_push_focus.sql`](supabase/migrations/004_push_focus.sql) | Fokuszeiten und Push-Benachrichtigungen (siehe Schritt 12) |
| 5 | [`supabase/migrations/005_homework.sql`](supabase/migrations/005_homework.sql) | Hausaufgaben (siehe Schritt 13) |
| 6 | [`supabase/migrations/006_server_read_access.sql`](supabase/migrations/006_server_read_access.sql) | Leserechte für die Push-Funktionen (siehe Schritt 12.1) |
| 7 | [`supabase/migrations/007_music.sql`](supabase/migrations/007_music.sql) | Gemeinsame Musik-Bibliothek (siehe Schritt 14) |
| 8 | [`supabase/migrations/008_focus_realtime.sql`](supabase/migrations/008_focus_realtime.sql) | optional: Lernzeiten der anderen erscheinen sofort statt nach spätestens einer Minute (ändert keine Daten) |

Falls Supabase warnt, dass die Abfrage „destruktive Operationen“ enthält: Das betrifft nur `drop trigger/policy if exists` (Neuanlage). Mit **Run this query** bestätigen. Alle Skripte können gefahrlos mehrfach ausgeführt werden.

## 5. Seed-Daten einspielen

Ebenfalls im SQL Editor den Inhalt von [`supabase/seed.sql`](supabase/seed.sql) ausführen. Angelegt werden:

- 4 Beispielpersonen („Person 1“ bis „Person 4“) mit Pastellfarben – Namen und Farben änderst du später direkt in der App
- 6 Prüfungsmodule mit Fachfarben und Themenbereichen (z. B. *Operations Research* und *Beschaffung und Produktion* im gemeinsamen Modul)
- 6 Prüfungstermine im Januar 2027 (Zeitzone Europe/Berlin)

Der Lernplan selbst startet **leer**. Wer erst ausprobieren möchte, kann optional [`supabase/demo.sql`](supabase/demo.sql) ausführen – diese Einträge beginnen alle mit „[Beispiel]“ und lassen sich mit dem Aufräum-Block am Ende der Datei wieder entfernen.

## 6. Storage prüfen

Die Migration 003 hat den Bucket bereits angelegt. Zur Kontrolle: links **Storage** öffnen – dort sollte der Bucket **`materials`** (Public) erscheinen. Unter *Edit bucket* siehst du:

- **File size limit:** 10 MB
- **Allowed MIME types:** `application/pdf, image/png, image/jpeg, image/webp`

Größenlimit ändern? In `003_storage.sql` den Wert `10485760` (Byte) anpassen und erneut ausführen **und** die GitHub-Variable `VITE_MAX_UPLOAD_MB` (Schritt 9) auf denselben Wert in MB setzen. Wichtig: Der kostenlose Supabase-Plan erlaubt maximal 50 MB pro Datei.

## 7. Publishable Key eintragen

Im Supabase-Dashboard: **Project Settings → API Keys** (bzw. **Connect**):

- **Project URL** – z. B. `https://abcd1234.supabase.co` (unter *Project Settings → Data API*)
- **Publishable key** – beginnt mit `sb_publishable_…`

> 🔒 **Niemals** den **Secret key** (`sb_secret_…`) oder den alten **service_role**-Key verwenden. Diese Schlüssel umgehen alle Sicherheitsregeln und dürfen nie auf GitHub oder in die Webseite gelangen. StudySpace erkennt solche Schlüssel und verweigert den Start. Ältere Projekte ohne Publishable Key können den **anon**-Key verwenden.

Die Werte trägst du in Schritt 9 bei GitHub ein (und für lokale Entwicklung in `.env.local`).

## 8. Realtime prüfen

Migration 002 fügt alle Tabellen zur Realtime-Publikation hinzu. Kontrolle: **Database → Publications → `supabase_realtime`** – dort sollten `members`, `modules`, `module_topics`, `exams`, `study_entries`, `tasks`, `task_completions`, `attachments` und `app_settings` aktiviert sein. Falls nicht: die Schalter dort einschalten oder Migration 002 erneut ausführen.

## 9. GitHub Pages einrichten

Im GitHub-Repository:

1. **Settings → Pages → Build and deployment → Source:** **GitHub Actions** auswählen.
2. **Settings → Secrets and variables → Actions → Reiter „Variables“ → New repository variable** und anlegen:

   | Name | Wert |
   |---|---|
   | `VITE_SUPABASE_URL` | deine Project URL aus Schritt 7 |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | dein Publishable Key aus Schritt 7 |
   | `VITE_MAX_UPLOAD_MB` | optional, z. B. `10` |
   | `VITE_VAPID_PUBLIC_KEY` | optional, für Push-Benachrichtigungen (Schritt 12) |

   Der Publishable Key ist absichtlich öffentlich (er steckt ohnehin im Code der Webseite). Du kannst ihn alternativ als *Secret* gleichen Namens anlegen – der Workflow akzeptiert beides.
3. Unter **Settings → Environments → github-pages** sicherstellen, dass der Branch `main` deployen darf (Standard).

## 10. Deployment auslösen

Das Deployment startet automatisch bei jedem Push auf `main` (z. B. nach dem Zusammenführen eines Pull Requests). Manuell: **Actions → „Test & Deploy“ → Run workflow**.

Der Workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) führt zuerst alle Tests aus (Typprüfung, Unit-Tests, Datenbanktests, Browsertests) und veröffentlicht erst danach. Wichtig: Änderungen am Lernplan in der App lösen **keinen** Commit und kein Deployment aus – sie werden direkt in Supabase gespeichert.

## 11. Produktive Webseite öffnen

Nach erfolgreichem Workflow ist StudySpace erreichbar unter **<https://lern-hub-wing.github.io/Semester3/>** (der genaue Link steht auch im Workflow-Lauf unter *deploy*).

Erster Test: Person auswählen → **Neuer Lerntag** → Aufgabe abhaken → auf einem zweiten Gerät öffnen: Die Änderung erscheint ohne Neuladen.

Zeigt die Seite „StudySpace einrichten“, fehlen die Variablen aus Schritt 9 – Variablen setzen und den Workflow erneut starten.


## 12. Push-Benachrichtigungen einrichten

Ohne diesen Schritt funktioniert StudySpace ganz normal – nur die Benachrichtigungen bleiben aus (die App zeigt dann „Server noch nicht eingerichtet“). Einmalig ca. 20 Minuten.

**So funktioniert es:** Die App meldet ein Gerät bei der Edge Function `push-api` an. Alle 5 Minuten ruft Supabase Cron die Edge Function `push-scheduler` auf; sie prüft Aufgaben, Prüfungen, Ruhezeiten und schickt fällige Erinnerungen über den Push-Dienst von Apple/Google/Mozilla direkt aufs Gerät – auch wenn StudySpace geschlossen ist.

### 12.1 Migrationen 004 und 006 ausführen

SQL Editor → Inhalt von [`supabase/migrations/004_push_focus.sql`](supabase/migrations/004_push_focus.sql) einfügen → **Run**. Es kommen nur neue Tabellen hinzu (`focus_sessions`, `push_devices`, `push_log`, `push_state`); bestehende Lernplandaten werden nicht verändert. Die Push-Tabellen sind für die öffentliche Rolle komplett gesperrt.

Danach genauso [`supabase/migrations/006_server_read_access.sql`](supabase/migrations/006_server_read_access.sql) ausführen. Sie erlaubt den Push-Funktionen, Lernprofile, Lernplan und Prüfungen zu **lesen** (nur lesen, keine Datenänderung). Neuere Supabase-Projekte vergeben diese Rechte nicht mehr automatisch – ohne 006 meldet die App beim Aktivieren „Unbekanntes Lernprofil“ bzw. „Der Server darf die Lernprofile nicht lesen“, und es werden keine Erinnerungen verschickt.

### 12.2 Schlüssel erzeugen

Öffne **<https://lern-hub-wing.github.io/Semester3/einrichtung/vapid.html>** (nach dem nächsten Deployment) und tippe auf **Schlüssel erzeugen**. Die Werte entstehen nur in deinem Browser. Alternativ lokal: `node scripts/generate-vapid-keys.mjs`.

Du erhältst drei Werte: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SCHEDULER_SECRET`.

> 🔒 `VAPID_PRIVATE_KEY` und `SCHEDULER_SECRET` sind geheim: nie auf GitHub, in die App oder in einen Chat kopieren. Nur der **Public Key** darf öffentlich sein.

### 12.3 Secrets in Supabase hinterlegen

Supabase Dashboard → **Edge Functions → Secrets** (bzw. *Project Settings → Edge Functions*) → **Add new secret**:

| Name | Wert |
|---|---|
| `VAPID_PUBLIC_KEY` | Public Key aus 12.2 |
| `VAPID_PRIVATE_KEY` | Private Key aus 12.2 |
| `VAPID_SUBJECT` | Kontakt, z. B. `mailto:eure-lerngruppe@example.org` |
| `SCHEDULER_SECRET` | Secret aus 12.2 |
| `ALLOWED_ORIGINS` | optional: `https://lern-hub-wing.github.io` (schränkt Aufrufe auf eure Seite ein) |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase den Funktionen automatisch bereit – nichts eintragen.

### 12.4 Edge Functions bereitstellen (ohne lokale Installation)

1. Supabase: oben rechts auf dein Profil → **Account → Access Tokens → Generate new token** (Name z. B. `github-studyspace`).
2. GitHub: **Settings → Secrets and variables → Actions → Reiter „Secrets“ → New repository secret**:
   - `SUPABASE_ACCESS_TOKEN` = der Token aus Schritt 1
   - `SUPABASE_PROJECT_REF` = die Projekt-Referenz (der Teil `abcd1234` aus `https://abcd1234.supabase.co`)
3. GitHub: **Actions → „Supabase Edge Functions bereitstellen“ → Run workflow** (einmalig). Danach läuft der Workflow **automatisch**, sobald Änderungen an den Edge Functions auf `main` landen (z. B. nach dem Zusammenführen eines Pull Requests).
4. Kontrolle in Supabase unter **Edge Functions**: `push-api` und `push-scheduler` erscheinen, beide mit „Verify JWT“ = aus.

Mit installierter [Supabase CLI](https://supabase.com/docs/guides/cli) geht es auch lokal: `supabase functions deploy push-api --project-ref <REF> --no-verify-jwt` und dasselbe für `push-scheduler`.

### 12.5 Zeitsteuerung aktivieren (Supabase Cron)

1. Datei [`supabase/cron.sql`](supabase/cron.sql) öffnen und in den SQL Editor kopieren.
2. Darin `<PROJEKT-REF>` und `<SCHEDULER-SECRET>` ersetzen (nur im SQL Editor – **nicht** im Repository speichern).
3. **Run**. Das Secret landet verschlüsselt im Supabase Vault; der Job `studyspace-push-scheduler` läuft alle 5 Minuten.
4. Nach ein paar Minuten prüfen (steht unten in der Datei): `cron.job_run_details` zeigt `succeeded`, `net._http_response` den Statuscode `200`.
5. Einfacher: In der App unter Einstellungen → Benachrichtigungen steht „Automatische Erinnerungen aktiv · zuletzt geprüft …“. Liegt eine eingestellte Uhrzeit in der Ruhezeit (Standard 21:00–08:00), zeigt die App direkt darunter, wann die Nachricht stattdessen kommt (abends 15 Minuten vor Beginn der Ruhezeit, morgens zu ihrem Ende). Fehlt die Zeitsteuerung, steht dort ein Hinweis – dann kommen nur Testnachrichten, aber keine geplanten Erinnerungen.

Hinweis: „Offene Aufgaben“ wird nur verschickt, wenn für heute wirklich noch Aufgaben offen sind, und höchstens einmal am Tag; „Morgendliche Lernübersicht“ nur, wenn heute etwas geplant ist.

### 12.6 Public Key in GitHub eintragen und veröffentlichen

GitHub: **Settings → Secrets and variables → Actions → Reiter „Variables“** → `VITE_VAPID_PUBLIC_KEY` = Public Key aus 12.2. Danach **Actions → „Test & Deploy“ → Run workflow** (oder den Pull Request zusammenführen).

### 12.7 Auf dem iPhone testen

1. iOS/iPadOS **16.4 oder neuer**. StudySpace in **Safari** öffnen → **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**.
2. StudySpace über das **neue Symbol** öffnen (nicht in Safari!) und deinen Namen wählen.
3. In der Einführung **Benachrichtigungen aktivieren** → iOS-Dialog **Erlauben**.
4. **Einstellungen → Benachrichtigungen → Testbenachrichtigung senden**. Für den Test die App am besten kurz in den Hintergrund legen oder das iPhone sperren – die Nachricht „StudySpace funktioniert! 🎉“ erscheint auf dem Sperrbildschirm. Antippen öffnet die Einstellungen in StudySpace.
5. Kommt nichts an: *Einstellungen → Mitteilungen → StudySpace* prüfen; Fokus/Nicht stören deaktivieren; in StudySpace den Fehlertext unter dem Testknopf lesen.

Android (Chrome/Edge) und Desktop (Chrome, Edge, Firefox, Safari auf macOS) funktionieren direkt im Browser – auf Android empfiehlt sich trotzdem „App installieren“.

### Was StudySpace verschickt (Standard)

| Erinnerung | Wann | Bedingung |
|---|---|---|
| Morgendliche Lernübersicht | 08:00 | Heute sind Aufgaben geplant und noch offen (eine Sammelnachricht) |
| Offene Aufgaben | 18:00 | Heute ist noch etwas offen |
| Überfällige Aufgaben | 09:00 | Aufgaben vergangener Tage offen; dieselben Aufgaben höchstens alle 3 Tage erneut; fällt mit der Morgenübersicht zusammen → zusammengefasst |
| Prüfung | 7, 3 und 1 Tag vorher (17:00) und 2 Std. vor Beginn | Termin aus der Datenbank; nach einer Verschiebung neu berechnet; nie nach Beginn |
| Neue Hausaufgabe | sofort (außerhalb der Ruhezeit, danach nachgeholt) | Jemand anderes trägt eine Hausaufgabe ein: „Luk hat eine Hausaufgabe hinzugefügt – „Blatt 3“ in Controlling – bis zum Do., 17. Dez.“ |
| Lernplan aktualisiert | gesammelt nach 10 Min. Ruhe | Neue Aufgaben/Lerntage/Prüfungstermine von anderen Profilen |
| Gemeinsam geschafft! 🎉 | sofort (außerhalb der Ruhezeit) | Gruppe erreicht 100 % eines Moduls – genau einmal pro Übergang |
| Persönlicher Erfolg | sofort | Standard **aus**; ganzes Modul erledigt |

Ruhezeit standardmäßig 21:00–08:00 (Europe/Berlin, inkl. Zeitumstellung): Erinnerungen werden verschoben; bei frühen Prüfungen kommt die 2-Stunden-Erinnerung zum Ende der Ruhezeit bzw. am Vorabend. Jede Person stellt Kategorien, Uhrzeiten und Ruhezeit pro Gerät ein. Push-Dienste garantieren keine minutengenaue Zustellung.

### Grenzen und Kosten (kostenloser Supabase-Plan)

- **Pausierte Projekte verschicken nichts.** Kostenlose Projekte werden nach längerer Inaktivität pausiert (derzeit 7 Tage ohne Zugriffe). Solange ihr StudySpace regelmäßig nutzt, passiert das nicht; ob die Cron-Läufe allein als Aktivität zählen, ist nicht garantiert.
- Der Scheduler läuft ca. 8.640-mal im Monat – weit unter dem Freikontingent für Edge-Function-Aufrufe. pg_cron, pg_net und Vault sind im kostenlosen Plan enthalten.
- Versandprotokolle werden nach 60 Tagen automatisch gelöscht.
- Ohne Anmeldung ist die Zuordnung „Gerät → Person“ nur eine **Gerätepräferenz**. Fremde Abos können über die öffentliche API weder gelesen noch geändert werden (geheimer Gerätetoken, nur dessen Hash wird gespeichert), und niemand kann beliebige Texte an andere Geräte senden.

---

## 13. Hausaufgaben einrichten (StudySpace 3.1)

Für ein bestehendes Projekt ist **nur eine einzige Datei** nötig:

1. Supabase-Dashboard → **SQL Editor** → **New query**
2. Inhalt von [`supabase/migrations/005_homework.sql`](supabase/migrations/005_homework.sql) einfügen → **Run** (die Warnung zu `drop trigger/policy if exists` mit **Run this query** bestätigen)
3. StudySpace neu laden – der Bereich **Hausaufgaben** ist sofort aktiv (Seitenleiste, Tab „Aufgaben“ auf dem Handy, „+ Hausaufgabe“ im Dashboard).

Was die Migration macht:

- Neue Tabellen `homework`, `homework_parts` (Unteraufgaben und Arbeitseinheiten) und `homework_completions` (Erledigt-Status je Person) mit denselben Regeln wie der übrige Lernplan: Row Level Security, keine Löschrechte (Papierkorb), Versionierung, Änderungsverlauf, Rate Limits, Realtime.
- Die Prüfregel der Tabelle `attachments` wird um den Typ `homework` **erweitert**, damit Hausaufgaben Anhänge haben können. Vorhandene Zeilen werden dabei weder verändert noch gelöscht.
- Bestehende Lernplandaten bleiben unverändert; das Skript kann gefahrlos mehrfach ausgeführt werden.
- Wichtig: Werden die älteren Migrationen später erneut ausgeführt, danach auch `005_homework.sql` noch einmal ausführen (001 setzt die Anhang-Prüfung sonst auf den alten Stand zurück).

Solange die Datei nicht ausgeführt ist, bleibt der Bereich ausgeblendet bzw. zeigt einen Hinweis – alles andere funktioniert unverändert. Ein neues Deployment ist nicht nötig.

So plant StudySpace: Der Bearbeitungszeitraum reicht von heute (bzw. dem frühesten Beginn) bis zum **Tag vor der Abgabe** – der Abgabetag selbst ist kein Arbeitstag. Auf Wunsch verteilt StudySpace die gewünschte Zahl an Arbeitseinheiten auf möglichst freie Tage (berücksichtigt geplante Aufgaben, andere Hausaufgaben, Prüfungstage, Priorität und einen Puffer vor der Abgabe). Die Termine erscheinen vorher als bearbeitbare Vorschau; bestehende Aufgaben werden nie verschoben, und es werden keine fachlichen Unteraufgaben erfunden. Wird die Abgabe geändert, schlägt StudySpace neue Termine vor und übernimmt sie erst nach Bestätigung; Erledigungen bleiben erhalten.

---

## 14. Musik-Bibliothek einrichten (StudySpace 4.0)

Auch hier ist **nur eine Datei** nötig:

1. Supabase-Dashboard → **SQL Editor** → **New query**
2. Inhalt von [`supabase/migrations/007_music.sql`](supabase/migrations/007_music.sql) einfügen → **Run** (Warnung zu `drop … if exists` mit **Run this query** bestätigen)
3. StudySpace neu laden → **Musik** (Seitenleiste, auf dem Handy unter „Mehr“, oder Einstellungen → Musik-Bibliothek)

Was die Migration macht:

- Neue Tabelle `music_tracks` (Kategorie, Name, YouTube-Video-ID, Startzeit, Reihenfolge) mit denselben Regeln wie der Rest: Row Level Security, **keine Löschrechte** (Entfernen = Papierkorb-Prinzip), Versionierung, Änderungsverlauf, Rate Limit, Realtime.
- Gespeichert wird **nur die 11-stellige Video-ID** und die Startzeit – kein beliebiger Link. StudySpace akzeptiert nur Links von youtube.com, youtu.be und music.youtube.com.
- Bestehende Daten bleiben unverändert; das Skript kann gefahrlos mehrfach ausgeführt werden.

Solange die Datei nicht ausgeführt ist, zeigt die Bibliothek einen Hinweis; die erzeugten Klänge (Lofi, Regen, Rauschen) funktionieren trotzdem. Ein neues Deployment ist nicht nötig.

So funktioniert's: Unter **Musik** eine Kategorie wählen → freien Platz (z. B. „Lofi 3“) antippen → YouTube-Link einfügen → Name anpassen → **Speichern**. Der Titel erscheint sofort bei allen. Abgespielt wird über eine kleine Steuerleiste (Titel, Pause, Stopp), die beim Seitenwechsel weiterläuft; das Video selbst ist versteckt und lässt sich über das Augen-Symbol einblenden. Am Ende beginnt der Titel automatisch von vorn (∞). Hinweis: Die YouTube-Richtlinien sehen einen sichtbaren Player vor – für eine öffentliche App-Store-Version eigene Audiodateien verwenden.

> **Hinweis für eine spätere App-Store-Veröffentlichung:** Eingebettete YouTube-Videos als Hintergrundmusik sind für private Lerngruppen in Ordnung, in einer veröffentlichten App aber rechtlich und nach den YouTube-Nutzungsbedingungen heikel (z. B. kein Abspielen bei gesperrtem Bildschirm). Für eine Store-Version eigene, lizenzierte Audiodateien verwenden – die Bibliothek ist so gebaut, dass später eine weitere Quelle ergänzt werden kann.

---

## Als App installieren (PWA)

- **iPhone/iPad (Safari):** Teilen-Symbol → **Zum Home-Bildschirm**
- **Android (Chrome):** Menü ⋮ → **App installieren** / **Zum Startbildschirm hinzufügen**
- **Desktop (Chrome/Edge):** Installieren-Symbol rechts in der Adressleiste

Ohne Internet zeigt StudySpace den zuletzt geladenen Stand und weist deutlich darauf hin. Änderungen werden offline **nicht** als gespeichert angezeigt, sondern abgelehnt, bis die Verbindung zurück ist.

## Bedienung in Kürze

| Ich möchte … | So geht's |
|---|---|
| die Person wechseln | Avatar oben rechts → andere Person wählen. Bei jedem Öffnen (und nach mehr als 15 Minuten im Hintergrund) fragt StudySpace automatisch „Wer lernt heute?“ |
| zwischen Seiten wechseln (Handy) | Tab-Leiste unten antippen – oder Finger auf der Leiste halten und ziehen: die Glaslinse folgt, beim Loslassen wird gewechselt. Weitere Seiten unter „Mehr“ |
| haptisches Feedback ein-/ausschalten | Einstellungen → Erscheinungsbild → „Haptisches Feedback“ (nur auf Geräten mit Vibration, z. B. Android; iOS Safari unterstützt die Vibration API nicht – dort gibt es eine visuelle Rückmeldung) |
| Leisten ohne Unschärfe (ältere Geräte) | Einstellungen → Erscheinungsbild → „Transparenz: Einfach“ (der frühere Regler „Durchsichtigkeit“ entfällt mit dem flachen 4.0-Design) |
| Klänge ein-/ausschalten | Einstellungen → Erscheinungsbild → „Klänge“ (leise Töne beim Antippen, Auswählen, Abhaken; auf dem iPhone gilt der Stummschalter) |
| Musik beim Lernen | Im Fokus auf das Kopfhörer-Symbol tippen: Bibliothek öffnet sich, Titel antippen. „Ohne Internet“: Lofi, Regen oder Rauschen, live im Browser erzeugt. Lautstärke auf der Seite „Musik“ |
| eigene Musik hinzufügen | „Musik“ → Kategorie → freien Platz antippen (oder „Neu“) → YouTube-Link einfügen → Speichern. Für alle sichtbar; über ⋯ umbenennen oder entfernen (Schritt 14) |
| Benachrichtigungen einrichten | Nach der ersten Personenwahl erscheint eine Einführung; sonst Einstellungen → Benachrichtigungen. iPhone: vorher „Zum Home-Bildschirm“ |
| konzentriert mit Timer lernen | „Fokus“ in der Navigation oder die Fokus-Karte im Dashboard öffnet direkt die Vollbildansicht. Start drücken (Standard: kein Autostart). Unten: Ton, Phase neu starten, Start/Pause, Pause überspringen bzw. Session beenden, Einstellungen. Rhythmus: Kurz 15/5, Klassisch 25/5, Intensiv 50/10 oder Individuell; lange Pause nach N Runden (Standard 4); eigene Vorlagen speichern. Unter „Anzeige“/„Bild“/„Steuerung“: Schrift, Größe, Stärke, Sekunden, Farbe, Leuchten, Position, Animation, Ring, Prozent, Fortschrittslinie, Hintergrund (Berge, Polarlicht, Verlauf, Farbe, eigenes Bild, Weichzeichnen, Abdunkeln, Bewegung), Steuerleiste oben/unten, automatisches Ausblenden, Lautstärke, Mitteilung beim Phasenwechsel, automatischer Phasenwechsel und Autostart. Nur echte Fokuszeit (ohne Pausen) wird gespeichert und in der Analyse gezählt |
| Prüfungstermin eintragen | „Fächer“ → oben „Prüfung“ oder im Fach „Prüfungstermin eintragen“ bzw. „Termin“. Bearbeiten: auf den Termin am Fach tippen (den früheren Tab „Prüfungen“ gibt es nicht mehr, alte Links führen zu den Fächern) |
| eine Hausaufgabe eintragen | „Hausaufgaben“ → „Neue Hausaufgabe“ (oder „+ Hausaufgabe“ im Dashboard). Pflicht: Titel, Modul, Abgabe. Optional unter „Weitere Angaben“: Beschreibung, Unteraufgaben, Aufwand, frühester Beginn, Priorität, Anhänge (nach dem ersten Speichern). „Arbeitseinheiten einplanen“ zeigt Vorschläge mit Kalender – Daten lassen sich vor dem Speichern ändern |
| sehen, wann ich an einer Hausaufgabe arbeiten kann | Lernplan → Monat oder Woche: jede Hausaufgabe erscheint als farbige Leiste vom Beginn (frühester Beginn, sonst Tag des Eintragens) bis zum Abgabetag mit Fähnchen „Abgabe“. Antippen öffnet die Hausaufgabe |
| die Semester-Übersicht sehen | Lernplan → Ansicht „Timeline“ (oder Dashboard → Semester-Timeline) |
| den Lernmodus starten | Dashboard ganz unten → „Lernmodus starten“ (oder Seitenleiste bzw. „Mehr“ → „Lernmodus“). Handy quer halten: Die Uhr läuft sekundengenau im Vollbild, alle Bedienelemente blenden sich nach 3,5 s aus. Antippen blendet sie wieder ein. Unter ⚙ „Darstellung anpassen“: Ziffern (HH:MM oder HH:MM:SS), 24/12 Stunden, Schriftart, Stärke, Größe, Farbe, Leuchten, Hintergrund (Polarlicht, Farbverlauf, Farbe oder eigenes Bild), Datum und nächste Prüfung. **iPhone:** Safari erlaubt Webseiten kein Vollbild – dafür StudySpace über „Teilen → Zum Home-Bildschirm“ hinzufügen und von dort öffnen |
| einen Lerntag planen | Kalender-Plus-Symbol oben oder „Neuer Lerntag“ im Lernplan |
| einen Lerntag verschieben | Desktop: im Monat/Woche per Drag & Drop · Smartphone: Lerntag bearbeiten → Datum |
| eine einzelne Aufgabe verschieben | ⋮ an der Aufgabe → „Verschieben …“ |
| Namen/Farben ändern | Team → Person antippen, oder Einstellungen → Personen |
| etwas wiederherstellen | Papierkorb (Seitenleiste bzw. „Mehr“) |
| suchen | ⌘K / Strg+K oder Lupe |
| sichern | Einstellungen → Daten & Sicherheit → Datenexport |

Der JSON-Export enthält alle Lernplandaten und Haken, **aber keine Dateien selbst** – nur deren Metadaten und Speicherorte im Storage. Dateien bei Bedarf in Supabase unter *Storage* separat herunterladen.

## Sicherung und Zurücksetzen

Die erste veröffentlichte Version ist als Branch **`backup/v1.0.0`** gesichert. Zurück zu diesem Stand: auf GitHub einen Pull Request von `backup/v1.0.0` nach `main` öffnen bzw. die späteren Merge-Commits mit **Revert** rückgängig machen – nach dem Merge veröffentlicht der Workflow automatisch wieder diese Version. Die Datenbank ist davon nicht betroffen.

## Tests

| Befehl | Prüft |
|---|---|
| `npm test` | Hausaufgaben-Planung (Zeitraum bis zum Vortag, Verteilung, Neuplanung), Pomodoro-Ablauf, Fortschrittsberechnung, Countdown/Zeitzonen, Synchronisations-Engine, Dateiprüfung, Import-Validierung, Fokus-Timer, Timeline, **Web-Push-Verschlüsselung (inkl. Testvektor aus RFC 8291) und VAPID-Signatur**, **Erinnerungslogik** (Uhrzeiten, Ruhezeiten, Zeitumstellung, Deduplizierung, Prüfungsverschiebung, Profilzuordnung) (Vitest) |
| `npm run test:db` | SQL-Migrationen gegen ein echtes PostgreSQL: Rechte (kein DELETE), Trigger, Soft Delete, Storage-Regeln, gesperrte Push-Tabellen, Deduplizierung, Fokuszeiten, Hausaufgaben (Prüfregeln, Erledigungen bleiben bei Terminänderung, Anhänge, bestehende Daten unverändert). Nutzt `DATABASE_URL` oder startet einen temporären lokalen Cluster |
| `npm run build:e2e && npm run test:e2e` | Browsertests in Chromium gegen eine nachgebildete Supabase-API: Personenauswahl, Lerntag anlegen, Haken pro Person, Titel/Datum ändern, Papierkorb, neue Person, Fehlerfall, Glas-Regler, Lernmodus (Uhrzeit, Ausblenden, Darstellung, hochkant/quer), 320 px/iPhone/iPad/Desktop, Hell/Dunkel. Benötigt Playwright (`npm install --no-save playwright@1.64.1 && npx playwright install chromium`; dieselbe Version wie im CI) |

Zusätzlich prüfen die Browsertests die Glisse-Tab-Leiste (Antippen, Ziehen mit Navigation erst beim Loslassen, keine Wischnavigation über dem Inhalt), Fokus 2.0 (Runden, Pause überspringen, Ausblenden der Steuerung, Einstellungen, Hoch-/Querformat), Hausaufgaben (Anlegen mit Vorschau, kein Arbeitstag am Abgabetag, Erledigung je Person, Neuplanung nach Bestätigung, App ohne Migration 005), Timeline, Analyse sowie den kompletten Push-Ablauf in der App (Einführung, iPhone-Installationshinweis, „Vielleicht später“, Aktivieren, Einstellungen, Testnachricht mit Sperrfrist, Profilwechsel, Abmelden) gegen eine nachgebildete `push-api`. `node scripts/screens.mjs <ordner>` erstellt Bildschirmfotos aller Seiten (Smartphone, iPad, Desktop; hell/dunkel).

Nicht automatisiert testbar (manuell prüfen, siehe [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md#manuelle-abnahme)): echte Realtime-Verbindung zwischen zwei Geräten, echter Datei-Upload zu Supabase Storage, **echte Zustellung über Apple/Google/Mozilla auf einem echten iPhone**, Safari/Firefox/Edge.

## Projektstruktur

```
├── .github/workflows/deploy.yml   Tests + GitHub-Pages-Deployment
├── .github/workflows/supabase-functions.yml  Edge Functions bereitstellen (manuell)
├── docs/ARCHITEKTUR.md            Technische Architektur und Entscheidungen
├── public/                        Icons, Startbildschirme, Favicon, einrichtung/vapid.html
├── scripts/                       Icon-Generator, Datenbank- und Browsertests
├── supabase/
│   ├── migrations/                001 Schema · 002 Sicherheit · 003 Storage · 004 Push + Fokus · 005 Hausaufgaben · 006 Leserechte Push · 007 Musik
│   ├── functions/                 Edge Functions push-api, push-scheduler (+ _shared: Web Push, Erinnerungslogik)
│   ├── cron.sql                   Zeitsteuerung (Supabase Cron, alle 5 Minuten)
│   ├── seed.sql                   Startdaten (Personen, Module, Prüfungen)
│   ├── demo.sql                   optionale, klar markierte Beispielaufgaben
│   └── tests/                     SQL-Verhaltenstests
└── src/
    ├── lib/                       Typen, Fortschritt, Countdown, Zeit, Dateien, Export
    ├── sw.ts                      Service Worker (Offline-Cache, Push, Klick-Navigation)
    ├── store/                     Zustand, Sync-Engine, Realtime, Schreiboperationen, Push, Fokus
    ├── components/                UI-Bausteine, Layout, Countdown, Aufgaben, Dialoge
    ├── pages/                     Personenauswahl, Dashboard, Lernplan, Fächer, Team, …
    └── test/                      Unit-Tests
```

## Häufige Probleme

| Problem | Lösung |
|---|---|
| Seite zeigt „StudySpace einrichten“ | Repository-Variablen fehlen (Schritt 9) → setzen → Workflow erneut starten |
| „Keine Verbindung zur Datenbank“ | URL/Key prüfen; Supabase-Projekt pausiert? Im Dashboard „Restore project“ |
| „Diese Aktion ist nicht erlaubt“ | Migration 002 nicht (vollständig) ausgeführt |
| Änderungen erscheinen nicht live auf anderen Geräten | Schritt 8 prüfen; Statusanzeige oben antippen lädt neu |
| Upload abgelehnt | Nur PDF/PNG/JPG/WebP bis zum Limit; Migration 003 ausgeführt? |
| Leere Seite nach Deployment | Settings → Pages → Source muss „GitHub Actions“ sein |
| Neue Version erscheint nicht | Die App aktualisiert sich automatisch beim nächsten Öffnen; sonst einmal neu laden |
| „Server noch nicht eingerichtet“ (Benachrichtigungen) | Variable `VITE_VAPID_PUBLIC_KEY` fehlt (12.6) → setzen und neu veröffentlichen |
| „…auf dem Server noch nicht bereitgestellt“ | Edge Functions fehlen (12.4) |
| „Push ist auf dem Server noch nicht eingerichtet“ | Secrets `VAPID_*` in Supabase fehlen oder sind falsch (12.3) |
| „Unbekanntes Lernprofil“ / „Der Server darf die Lernprofile nicht lesen“ (Benachrichtigungen) | `006_server_read_access.sql` ausführen (12.1), dann erneut aktivieren |
| „Hausaufgaben sind noch nicht eingerichtet“ | `005_homework.sql` ausführen (Schritt 13) |
| Musik: „Bibliothek ist noch nicht eingerichtet“ | `007_music.sql` ausführen (Schritt 14) |
| Musik: Player bleibt schwarz | Internet/YouTube nicht erreichbar oder Video erlaubt keine Einbettung – anderen Link wählen; „Ohne Internet“-Klänge gehen immer |
| iPhone bietet keine Benachrichtigungen an | StudySpace muss vom Home-Bildschirm gestartet werden, iOS ≥ 16.4 (12.7) |
| Test angenommen, aber keine Nachricht | Mitteilungen für StudySpace in den iPhone-Einstellungen prüfen, Fokus/Nicht stören aus; Gerät kurz sperren |
| Keine automatischen Erinnerungen | `cron.sql` ausgeführt? `cron.job_run_details` prüfen; Projekt pausiert? |
| Fokuszeiten werden nicht gespeichert | Migration 004 ausführen (12.1) |
