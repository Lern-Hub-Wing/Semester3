# StudySpace

**Gemeinsam lernen. Gemeinsam Fortschritte machen. Gemeinsam 100 Prozent erreichen.**

StudySpace ist eine gemeinsame Lernplattform für eine kleine Lerngruppe. Alle teilen denselben Lernplan, dieselben Fächer und Materialien – aber jede Person hakt ihre Aufgaben **für sich** ab. Daraus entstehen der persönliche Fortschritt und der gemeinsame Gruppenfortschritt.

- Personenauswahl „Wer lernt heute?“ – **ohne Anmeldung, ohne Passwort**
- Dashboard mit Live-Prüfungscountdown, Fortschrittskreisen/-balken, heutigen und überfälligen Aufgaben
- Gemeinsamer Lernkalender (Tag, Woche, Monat, Liste) mit Drag & Drop
- Fächer mit Themenbereichen, Team-Seite mit gemeinsamem Lernziel, Prüfungsübersicht
- Lernmaterialien (PDF, PNG, JPG, WebP) über Supabase Storage
- Echtzeit-Synchronisierung zwischen allen Geräten, Papierkorb, Änderungsverlauf, JSON-Export/Import
- Semester-Timeline (Lernphasen + Prüfungen je Modul), Fokus-Timer mit gespeicherten Lernzeiten, Analyse aus echten Daten
- **Push-Benachrichtigungen** auf iPhone (als Home-Bildschirm-App), Android und Desktop – Morgenübersicht, offene und überfällige Aufgaben, Prüfungserinnerungen, Lernplan-Änderungen, gemeinsame Erfolge; mit Ruhezeiten und Testnachricht
- Dark/Light Mode, Liquid-Glass-Design „Aurora Glass“ mit Animationen, installierbar als App (PWA)

> **Wichtiger Hinweis zur Sicherheit:** StudySpace hat bewusst **keine Anmeldung**. Jede Person mit dem Link kann alle Inhalte sehen und bearbeiten. Die Auswahl „Wer lernt heute?“ ist **keine Identitätsprüfung** – Einträge wie „von Person 2 geändert“ sind nicht verifiziert. Ohne echte Authentifizierung gibt es **keinen verlässlichen Schutz gegen absichtliche Änderungen durch Dritte**, die den Link kennen. StudySpace ist deshalb **nicht für vertrauliche, personenbezogene oder sensible Dokumente** gedacht. Schutzmaßnahmen: Soft Delete (Papierkorb) statt Löschen, keine Löschrechte in der Datenbank, Rate Limits, Eingabeprüfungen, regelmäßige Exporte.

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

### 12.1 Migration 004 ausführen

SQL Editor → Inhalt von [`supabase/migrations/004_push_focus.sql`](supabase/migrations/004_push_focus.sql) einfügen → **Run**. Es kommen nur neue Tabellen hinzu (`focus_sessions`, `push_devices`, `push_log`, `push_state`); bestehende Lernplandaten werden nicht verändert. Die Push-Tabellen sind für die öffentliche Rolle komplett gesperrt.

> Diese Migration schaltet auch das Speichern der Fokuszeiten (Fokus-Timer, Analyse) frei.

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
3. GitHub: **Actions → „Supabase Edge Functions bereitstellen“ → Run workflow**.
4. Kontrolle in Supabase unter **Edge Functions**: `push-api` und `push-scheduler` erscheinen, beide mit „Verify JWT“ = aus.

Mit installierter [Supabase CLI](https://supabase.com/docs/guides/cli) geht es auch lokal: `supabase functions deploy push-api --project-ref <REF> --no-verify-jwt` und dasselbe für `push-scheduler`.

### 12.5 Zeitsteuerung aktivieren (Supabase Cron)

1. Datei [`supabase/cron.sql`](supabase/cron.sql) öffnen und in den SQL Editor kopieren.
2. Darin `<PROJEKT-REF>` und `<SCHEDULER-SECRET>` ersetzen (nur im SQL Editor – **nicht** im Repository speichern).
3. **Run**. Das Secret landet verschlüsselt im Supabase Vault; der Job `studyspace-push-scheduler` läuft alle 5 Minuten.
4. Nach ein paar Minuten prüfen (steht unten in der Datei): `cron.job_run_details` zeigt `succeeded`, `net._http_response` den Statuscode `200`.

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

## Als App installieren (PWA)

- **iPhone/iPad (Safari):** Teilen-Symbol → **Zum Home-Bildschirm**
- **Android (Chrome):** Menü ⋮ → **App installieren** / **Zum Startbildschirm hinzufügen**
- **Desktop (Chrome/Edge):** Installieren-Symbol rechts in der Adressleiste

Ohne Internet zeigt StudySpace den zuletzt geladenen Stand und weist deutlich darauf hin. Änderungen werden offline **nicht** als gespeichert angezeigt, sondern abgelehnt, bis die Verbindung zurück ist.

## Bedienung in Kürze

| Ich möchte … | So geht's |
|---|---|
| die Person wechseln | Avatar oben rechts → andere Person wählen. Bei jedem Öffnen (und nach mehr als 15 Minuten im Hintergrund) fragt StudySpace automatisch „Wer lernt heute?“ |
| zwischen Seiten wechseln (Handy) | Tab-Leiste unten antippen; weitere Seiten unter „Mehr“ |
| haptisches Feedback ein-/ausschalten | Einstellungen → Erscheinungsbild → „Haptisches Feedback“ (nur auf Geräten mit Vibration, z. B. Android; iOS Safari unterstützt die Vibration API nicht – dort gibt es eine visuelle Rückmeldung) |
| das Glas klarer oder milchiger machen | Einstellungen → Erscheinungsbild → „Durchsichtigkeit“ (Regler mit Live-Vorschau; wirkt sofort auf alle Glasflächen, gespeichert pro Gerät) |
| Benachrichtigungen einrichten | Nach der ersten Personenwahl erscheint eine Einführung; sonst Einstellungen → Benachrichtigungen. iPhone: vorher „Zum Home-Bildschirm“ |
| konzentriert mit Timer lernen | Fokus (Seitenleiste bzw. „Mehr“, oder direkt im Dashboard): Start drücken – der Countdown läuft sichtbar herunter; ⤢ bzw. „Fokus im Vollbild“ öffnet die Vollbildansicht im Querformat. Rhythmus 25/5, 50/10 oder 90/15 Minuten über ⚙; beendete Fokusphasen werden gespeichert und in der Analyse gezählt |
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
| `npm test` | Fortschrittsberechnung, Countdown/Zeitzonen, Synchronisations-Engine, Dateiprüfung, Import-Validierung, Fokus-Timer, Timeline, **Web-Push-Verschlüsselung (inkl. Testvektor aus RFC 8291) und VAPID-Signatur**, **Erinnerungslogik** (Uhrzeiten, Ruhezeiten, Zeitumstellung, Deduplizierung, Prüfungsverschiebung, Profilzuordnung) (Vitest) |
| `npm run test:db` | SQL-Migrationen gegen ein echtes PostgreSQL: Rechte (kein DELETE), Trigger, Soft Delete, Storage-Regeln, gesperrte Push-Tabellen, Deduplizierung, Fokuszeiten. Nutzt `DATABASE_URL` oder startet einen temporären lokalen Cluster |
| `npm run build:e2e && npm run test:e2e` | Browsertests in Chromium gegen eine nachgebildete Supabase-API: Personenauswahl, Lerntag anlegen, Haken pro Person, Titel/Datum ändern, Papierkorb, neue Person, Fehlerfall, Glas-Regler, Lernmodus (Uhrzeit, Ausblenden, Darstellung, hochkant/quer), 320 px/iPhone/iPad/Desktop, Hell/Dunkel. Benötigt Playwright (`npm install --no-save playwright@1.64.1 && npx playwright install chromium`; dieselbe Version wie im CI) |

Zusätzlich prüfen die Browsertests Fokus-Timer, Timeline, Analyse sowie den kompletten Push-Ablauf in der App (Einführung, iPhone-Installationshinweis, „Vielleicht später“, Aktivieren, Einstellungen, Testnachricht mit Sperrfrist, Profilwechsel, Abmelden) gegen eine nachgebildete `push-api`. `node scripts/screens.mjs <ordner>` erstellt Bildschirmfotos aller Seiten (Smartphone, iPad, Desktop; hell/dunkel).

Nicht automatisiert testbar (manuell prüfen, siehe [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md#manuelle-abnahme)): echte Realtime-Verbindung zwischen zwei Geräten, echter Datei-Upload zu Supabase Storage, **echte Zustellung über Apple/Google/Mozilla auf einem echten iPhone**, Safari/Firefox/Edge.

## Projektstruktur

```
├── .github/workflows/deploy.yml   Tests + GitHub-Pages-Deployment
├── .github/workflows/supabase-functions.yml  Edge Functions bereitstellen (manuell)
├── docs/ARCHITEKTUR.md            Technische Architektur und Entscheidungen
├── public/                        Icons, Startbildschirme, Favicon, einrichtung/vapid.html
├── scripts/                       Icon-Generator, Datenbank- und Browsertests
├── supabase/
│   ├── migrations/                001 Schema · 002 Sicherheit · 003 Storage · 004 Push + Fokus
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
| iPhone bietet keine Benachrichtigungen an | StudySpace muss vom Home-Bildschirm gestartet werden, iOS ≥ 16.4 (12.7) |
| Test angenommen, aber keine Nachricht | Mitteilungen für StudySpace in den iPhone-Einstellungen prüfen, Fokus/Nicht stören aus; Gerät kurz sperren |
| Keine automatischen Erinnerungen | `cron.sql` ausgeführt? `cron.job_run_details` prüfen; Projekt pausiert? |
| Fokuszeiten werden nicht gespeichert | Migration 004 ausführen (12.1) |
