# StudySpace App (kommerzielle Version) – Einrichtung und Aufbau

Die neue App läuft unter **https://lern-hub-wing.github.io/Semester3/app/**, der Admin-Bereich unter **…/Semester3/app/admin/**.
Die bisherige Seite **…/Semester3/** bleibt unverändert: gleicher Code, gleiche Datenbank, gleiche Adresse.

| | Bisherige Seite (`/Semester3/`) | Neue App (`/Semester3/app/`) |
|---|---|---|
| Datenbank | bisheriges Supabase-Projekt | **eigenes, neues** Supabase-Projekt |
| Anmeldung | keine (Profilwahl) | Konten: E-Mail, Google, Apple |
| Gruppen | eine feste Gruppe | beliebig viele, je max. 8 Personen |
| Dateien | Materialien/Uploads | **keine Uploads** |
| Build | `npm run build` → `dist/` | `npm run build:app` → `dist-app/` → `dist/app/` |

Beide Ausgaben teilen sich den Quellcode (`VITE_EDITION=app` schaltet die App-Teile ein). Der Service Worker der bisherigen
Seite beantwortet `/app/` nie, die App hat ihren eigenen Service Worker und ihr eigenes PWA-Symbol.

> **Hinweis für bestehende Geräte:** Wer die bisherige Seite als PWA installiert hat, sieht beim allerersten Aufruf von `/app/`
> eventuell noch einmal die alte Seite, bis sich deren Service Worker aktualisiert hat (passiert automatisch beim Öffnen). Neu laden hilft.

---

## Einmalige Einrichtung (Schritt für Schritt)

Nichts davon berührt das bisherige Supabase-Projekt. **Führe kein SQL dieser Anleitung im bisherigen Projekt aus.**

### 1. Neues Supabase-Projekt anlegen
1. supabase.com → **New project**. Name z. B. `studyspace-app`. Region: **Central EU (Frankfurt)**. Ein sicheres Datenbank-Passwort wählen und sicher ablegen.
2. Notiere aus **Project Settings → API**: die **Project URL** (`https://<ref>.supabase.co`), den **Publishable Key** (`sb_publishable_…`) und die **Projekt-Referenz** `<ref>`.
   Den Secret/service_role-Key **niemals** ins Frontend, ins Repository oder in GitHub-Variablen kopieren.

### 2. Datenbank anlegen
1. Optional, für das automatische Leeren des Papierkorbs nach 30 Tagen: **Database → Extensions → `pg_cron` aktivieren**.
2. **SQL Editor → New query** → den kompletten Inhalt von [`supabase-app/app_schema.sql`](../supabase-app/app_schema.sql) einfügen → **Run**.
   Die Datei ist wiederholbar: bei späteren Updates einfach erneut ausführen. (Sie wird mit `npm run app:schema` aus
   `supabase/migrations` (ohne Storage) und `supabase-app/migrations` erzeugt.)

### 3. Anmeldung (Authentication) konfigurieren
**Authentication → URL Configuration**
- **Site URL:** `https://lern-hub-wing.github.io/Semester3/app/`
- **Redirect URLs:** `https://lern-hub-wing.github.io/Semester3/app/**` (für lokale Tests zusätzlich `http://localhost:5173/**`)

**Authentication → Sign In / Providers → Email**
- „Enable Email provider“ an, **„Confirm email“ an** (E-Mail-Bestätigung).
- Mindest-Passwortlänge **10**.
- Für echten Betrieb **eigenen SMTP-Server** eintragen (Authentication → Emails → SMTP Settings). Der eingebaute Versand ist stark begrenzt und nur zum Testen gedacht.
- Optional: E-Mail-Vorlagen (Confirm signup, Reset password) auf Deutsch anpassen.

**Authentication → Multi-Factor:** TOTP muss aktiviert sein (Standard). Der Admin-Bereich verlangt es.

### 4. Google-Anmeldung (manuell, Zugangsdaten nicht im Repository)
1. console.cloud.google.com → Projekt wählen/anlegen → **APIs & Services → OAuth consent screen** ausfüllen (App-Name „StudySpace“, Support-E-Mail, Domain `lern-hub-wing.github.io`).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: `https://lern-hub-wing.github.io`
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback`
3. Client-ID und Client-Secret in Supabase unter **Authentication → Providers → Google** eintragen → aktivieren.
4. Sobald aktiv, zeigt die App den Knopf „Mit Google fortfahren“ automatisch (die App fragt die Einstellungen des Projekts ab).

### 5. Apple-Anmeldung (manuell, benötigt Apple-Developer-Mitgliedschaft)
1. developer.apple.com → **Certificates, Identifiers & Profiles**:
   - **App ID** mit „Sign in with Apple“ (für die spätere iOS-App),
   - **Services ID** (z. B. `app.studyspace.web`) → „Sign in with Apple“ konfigurieren: Domain `lern-hub-wing.github.io` und
     `<ref>.supabase.co`, Return URL `https://<ref>.supabase.co/auth/v1/callback`,
   - **Key** mit „Sign in with Apple“ erzeugen und die `.p8`-Datei sicher aufbewahren (Team-ID, Key-ID notieren).
2. In Supabase unter **Authentication → Providers → Apple**: Services ID als Client ID; das Secret nach der Supabase-Anleitung aus `.p8`, Team-ID und Key-ID erzeugen.
   **Achtung:** Dieses Secret läuft spätestens nach 6 Monaten ab und muss dann neu erzeugt werden (Kalendererinnerung setzen).
3. Danach erscheint „Mit Apple fortfahren“ automatisch.

> Google und Apple wurden ohne echte Zugangsdaten **nicht** end-to-end getestet. Getestet sind Oberfläche, Rückleitung
> und die automatische Anzeige der Knöpfe je nach Projekteinstellung.

### 6. GitHub konfigurieren (Repository → Settings → Secrets and variables → Actions)
**Variables**
- `VITE_APP_SUPABASE_URL` = `https://<ref>.supabase.co`
- `VITE_APP_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…`

**Secrets**
- `APP_SUPABASE_PROJECT_REF` = `<ref>` des **neuen** Projekts (der Workflow bricht ab, falls es die Referenz des bisherigen Projekts ist)
- `SUPABASE_ACCESS_TOKEN` existiert bereits (gilt für alle eigenen Projekte)

Ohne diese Variablen zeigt `/app/` nur einen Einrichtungshinweis – die bisherige Seite ist davon nie betroffen.

### 7. Admin-Funktion bereitstellen und Secrets setzen
1. Im **neuen** Projekt unter **Edge Functions → Secrets**:
   - `ADMIN_SETUP_TOKEN` = ein langer Zufallswert, z. B. Ausgabe von `openssl rand -base64 32` (mindestens 24 Zeichen). Nur du kennst ihn.
   - optional `ALLOWED_ORIGINS` = `https://lern-hub-wing.github.io`
2. GitHub → **Actions → „App: Edge Functions bereitstellen“ → Run workflow** (läuft auch automatisch nach dem Zusammenführen).

### 8. Admin-Zugang einrichten (einmalig, kein Standardpasswort)
1. `https://lern-hub-wing.github.io/Semester3/app/admin/` öffnen → **Ersteinrichtung**.
2. Den `ADMIN_SETUP_TOKEN` und ein **selbst gewähltes Passwort** (≥ 14 Zeichen, Groß-/Kleinbuchstaben, Ziffern) eingeben.
   Benutzername ist **Luke**. Danach ist die Ersteinrichtung dauerhaft gesperrt (es kann nur einen ersten Admin geben).
3. Mit „Luke“ + Passwort anmelden → QR-Code mit einer Authenticator-App scannen → Code eingeben. Ohne diese Zwei-Faktor-Bestätigung
   verweigert die Datenbank jede Admin-Funktion.
4. Optional danach `ADMIN_SETUP_TOKEN` wieder löschen.

### 9. Plus zum Testen freischalten
Admin-Bereich → **Benutzer** → Konto öffnen → „Plus kostenlos freischalten“ (Tage, bis Datum oder unbegrenzt). Diese
Freischaltungen werden getrennt gezählt und **nie als Umsatz** gewertet. Mit Plus kann das Konto in der App eine Gruppe erstellen.

---

## Regeln der App

**Tarife:** Free (0 €) · Plus monatlich (4,99 €) · Semesterpass (19,99 € für 6 Monate, keine automatische Verlängerung).
Bis ein Zahlungssystem angebunden ist, gibt es in der App **keinen Kaufknopf**; Plus entsteht nur serverseitig (Tabelle `entitlements`).
Ein im Browser „behaupteter“ Kauf kann nichts freischalten – die Tabelle ist für Konten nicht beschreibbar.

**Gruppen**
- Erstellen nur mit eigenem Plus (max. 3 eigene Gruppen pro Konto). Beitreten per Link (`/app/#/beitreten/CODE`) oder 8-stelligem Code – kostenlos.
- **Max. 8 Mitglieder** inkl. Inhaber, serverseitig mit Zeilensperre (auch bei gleichzeitigen Beitritten getestet).
- Geteilt: Fächer, Lernplan, Prüfungen, Hausaufgaben, Musik, Gruppeneinstellungen.
  Persönlich: eigene Haken/Fortschritt, Fokuszeiten (für die Gruppe sichtbar, aber nur selbst schreibbar), Konto.
- **Verlassen:** Mitglied verliert sofort den Zugriff; bisherige Haken bleiben als Verlauf. Der Inhaber kann nicht austreten, sondern löscht die Gruppe.
- **Entfernen:** nur der Inhaber; wirkt sofort (auch auf laufende Sitzungen, da jede Abfrage geprüft wird).
- **Code erneuern:** alter Link/Code wird ungültig, Mitglieder bleiben.
- **Plus läuft ab:** alles bleibt lesbar; neue Einträge/Änderungen werden abgelehnt, Haken und Fokuszeiten funktionieren weiter;
  niemand kann neu beitreten. Mit erneuertem Plus geht es nahtlos weiter.
- **Konto löschen:** eigene Gruppen ohne weitere Mitglieder werden gelöscht, sonst übernimmt das am längsten dabei gewesene Mitglied.

**Grenzen je Gruppe** (Datenbank-Trigger, verständliche Meldungen in der App)

| Bereich | Maximum |
|---|---:|
| Mitglieder | 8 |
| aktive Hausaufgaben | 50 |
| aktive Lernplaneinträge | 100 |
| Dokumente/Uploads | 0 |

Gegen Anlegen-und-Löschen im Kreis: Tageslimits für Neuanlagen (z. B. 150 Hausaufgaben, 300 Lerntage, 60 Fächer pro Tag),
Rate Limits pro Minute je Gruppe, Wiederherstellen aus dem Papierkorb zählt gegen das Limit, gelöschte Einträge werden nach 30 Tagen endgültig entfernt.

---

## Sicherheit (alles serverseitig in PostgreSQL)

- Jede Inhaltszeile hat `group_id`; ein Trigger setzt sie beim Anlegen auf die **aktive Gruppe** des Kontos. Konten dürfen die Spalte weder setzen noch ändern.
- Row Level Security: lesen/schreiben nur, wenn `group_id = app.active_group()` – und das gilt nur, wenn das Konto wirklich Mitglied ist,
  nicht gesperrt ist und die Sitzung nicht widerrufen wurde.
- Verweise (Aufgabe → Lerntag, Haken → Aufgabe/Person, …) müssen in derselben Gruppe liegen (Trigger).
- Der anonyme Schlüssel hat **keinen** Zugriff auf irgendeine Tabelle. Löschen ist für Konten nicht erlaubt (nur „in den Papierkorb“).
- Admin-Funktionen: nur Konten in `admins` **und** mit Zwei-Faktor-Sitzung (`aal2`); jede Änderung wird in `admin_audit` protokolliert.
  Löschen/Zurücksetzen verlangt die Eingabe der genauen E-Mail-Adresse bzw. des Gruppennamens.
- Sperren beendet alle Sitzungen sofort (Refresh-Tokens gelöscht, laufende Zugriffstokens per Zeitstempel ungültig).
- „Online“ im Admin-Bereich ist **ungefähr** (Lebenszeichen der App höchstens alle 60 s).

Getestet in `supabase-app/tests/10_tenancy_test.sql` (u. a. manipulierte Aufrufe von Gruppe B auf Daten von Gruppe A) und mit
13 gleichzeitigen Beitritten zu einer Gruppe mit einem freien Platz (`scripts/test-db.sh --app`).

---

## Entwicklung und Tests

```bash
npm run test:db:app        # Datenbanktests der App (lokales PostgreSQL)
```
```bash
npm run build:e2e:app && npm run test:e2e:app   # Browsertests App + Admin (nachgebildete API)
```
```bash
npm run app:schema         # supabase-app/app_schema.sql neu erzeugen
```
Lokal starten: `.env.local` mit `VITE_EDITION=app`, `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` des **App-Projekts**, dann `npm run dev`.

## Später: Zahlungen und native Apps
- **Stripe / App Store / Google Play:** Webhook (Edge Function mit service_role) schreibt `payments` und `entitlements`
  (`source` = `stripe`/`app_store`/`play_store`, `external_id` = Abo-/Transaktions-ID) und Ereignisse in `subscription_events`.
  Umsatz, MRR und Kündigungen im Admin-Bereich stammen ausschließlich aus diesen Tabellen.
- **Expo/React Native:** `src/app/api.ts` (Konto/Gruppen/Tarife ohne React/DOM) und die Datenbankregeln sind direkt nutzbar;
  `src/app/authStorage.ts` zeigt die Speicher-Schnittstelle (dort SecureStore). Supabase Auth unterstützt Google/Apple nativ.
- **Tutorial:** Der Haken ist vorbereitet: `src/app/Tutorial.tsx` (`TUTORIAL_ENABLED`, `TutorialSlot`), eingebunden in `AppGate` direkt nach dem Betreten der Gruppe. Derzeit zeigt er nichts.
