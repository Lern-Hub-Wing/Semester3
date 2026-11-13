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
> **E-Mails:** Vorlagen mit Logo und deutschem Text liegen in [`supabase-app/email-templates/`](../supabase-app/email-templates/README.md)
> (Authentication → Emails → Templates). Supabase erlaubt das Bearbeiten nur mit **eigenem SMTP-Server** – kostenlos z. B. über Brevo
> oder Gmail, kein Pro nötig; die Anleitung steht dort. Die Links der Vorlagen funktionieren auch auf einem anderen Gerät.

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
- `APP_SUPABASE_ACCESS_TOKEN` = Zugriffstoken aus dem Supabase-Konto, dem das **neue** Projekt gehört
  (supabase.com → Account → Access Tokens → Generate new token). Nur nötig, wenn das neue Projekt in einem anderen
  Konto bzw. einer anderen Organisation liegt als das bisherige; sonst wird der vorhandene `SUPABASE_ACCESS_TOKEN` genutzt.
  Fehlermeldung ohne passende Rechte: `403 … does not have the necessary privileges`.

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

### 9. Zugang zum Testen freischalten
Admin-Bereich → **Benutzer** → Konto öffnen → „Kostenlos freischalten“ → **Gruppe** oder **Solo** (Tage, bis Datum oder unbegrenzt).
Diese Freischaltungen werden getrennt gezählt und **nie als Umsatz** gewertet. Alternativ in der App einen Kauf simulieren (Beta).

### 10. Gewinn-Simulator
Admin-Bereich → **Finanzen**: Startbestand je Tarif (oder „Aktuelle Zahlen übernehmen“), Hochskalieren, Wachstum, Kündigungen,
Anteil Gruppe/Semesterpass, Zahlungswege (Stripe/App Store/Google Play), Gebühren, USt, Fixkosten und Steuer-Schätzung.
Ergebnis: Diagramm Brutto/Netto/Gewinn je Monat, Rechnung „von Brutto zu Gewinn“, Gewinnschwelle, Monatstabelle und CSV.
Die Annahmen werden nur im Browser gespeichert.

### 11. Hilfe & Feedback, Datenexport
- Nutzer erreichen **Hilfe & Feedback** über „Mehr“, das Profilmenü und die Einstellungen (häufige Fragen, Einführung, Feedback-Formular).
  Nachrichten erscheinen im Admin-Bereich unter **Feedback** (mit E-Mail nur, wenn die Person einer Antwort zugestimmt hat; höchstens 10 pro Tag und Konto).
- **Einstellungen → Daten exportieren** lädt alle Inhalte der aktiven Lerngruppe bzw. des Lernbereichs plus Kontoangaben als JSON herunter.

### 12. Mitteilungen „neue Hausaufgabe“ (Push, auch bei geschlossener App)
Sobald jemand eine Hausaufgabe einträgt, bekommen **alle anderen** der Lerngruppe auf ihren eingeschalteten Geräten sofort:
> **Luk hat eine Hausaufgabe hinzugefügt** – „Übungsblatt 3“ in Controlling – bis zum Do., 17. Dez.

Nie an die Person selbst, nicht in der Ruhezeit (kommt danach), jede Hausaufgabe nur einmal je Gerät. Geräte gehören dem **Konto**
(gelten für alle seine Gruppen) und werden beim Abmelden beendet. iPhone/iPad: nur als Web-App vom Home-Bildschirm (ab iOS 16.4).

Einmalige Einrichtung (alles im **App**-Projekt, nichts im bisherigen):
1. **VAPID-Schlüssel:** Am einfachsten **dasselbe Schlüsselpaar wie bei der bisherigen Seite** verwenden. Im App-Projekt unter
   **Edge Functions → Secrets** anlegen: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (gleiche Werte wie im bisherigen Projekt).
   Den privaten Schlüssel nie in GitHub, Chat oder Code einfügen. Ein neues Paar erzeugt `/Semester3/einrichtung/vapid.html`;
   dann zusätzlich die GitHub-Variable `VITE_APP_VAPID_PUBLIC_KEY` = öffentlicher Schlüssel setzen
   (ohne diese Variable nutzt die App automatisch `VITE_VAPID_PUBLIC_KEY`).
2. Ebenfalls dort: `APP_PUSH_SECRET` = langer Zufallswert (z. B. `openssl rand -base64 32`, mindestens 24 Zeichen).
3. `supabase-app/app_schema.sql` **erneut** im SQL Editor des App-Projekts ausführen (fügt Migration 0005 hinzu).
4. Funktion **app-push** bereitstellen: GitHub → Actions → „App: Edge Functions bereitstellen“ → Run workflow
   (läuft nach dem Zusammenführen automatisch, wenn `APP_SUPABASE_ACCESS_TOKEN` gesetzt ist).
   Ohne Token: Supabase → Edge Functions → **Deploy a new function** → Name `app-push` → Inhalt von
   `supabase-app/functions/app-push/index.ts` vollständig einfügen → **Verify JWT aus** (die Funktion prüft die Anmeldung selbst).
5. `supabase-app/push_setup.sql` öffnen, `<APP-PROJEKT-REF>` und `<APP-PUSH-SECRET>` (gleicher Wert wie Schritt 2) ersetzen und im
   SQL Editor des App-Projekts ausführen. Danach löst jede neue Hausaufgabe sofort den Versand aus; zusätzlich prüft ein Cron-Job alle 5 Minuten.
6. Testen: App → Einstellungen → **Benachrichtigungen** → einschalten → „Testbenachrichtigung senden“. Steht dort
   „Automatischer Versand aktiv“, läuft auch Schritt 5.

### Navigation der App (Handy)
Tab-Leiste: Home · Kalender · Aufgaben · **Team** (alleine lernen: **Statistik**) · Mehr. Fokus startet groß im Dashboard und steht oben unter „Mehr“.
„Mehr“ enthält nur noch: Fokus, Lernmodus · Fächer & Prüfungen, Statistiken, Musik · Lerngruppe, Tarif & Abo, Einstellungen · Hilfe & Feedback, Papierkorb.
Mitglieder sind echte Konten: Name und Farbe ändert jede Person nur für sich; der Inhaber lädt ein und kann Mitglieder entfernen.
Mitteilungen werden nicht beworben: Wer sie möchte, schaltet sie unter **Einstellungen → Benachrichtigungen** ein (Abschnitt 12).

### Updates einspielen
Bei neuen Versionen einfach `supabase-app/app_schema.sql` erneut im SQL Editor des **App**-Projekts ausführen – das Skript ist
wiederholbar und lässt vorhandene Daten stehen.

---

## Regeln der App

**Tarife** (Preise inkl. USt, identisch mit `app.plan_price_cents()` in der Datenbank)

| Zugang | Preis | Inhalt |
|---|---|---|
| Free / Testversion | 0 € | 14 Tage voller Solo-Zugriff ohne Zahlungsdaten, danach **Nur-Lesen**; Beitritt zu bezahlten Gruppen bleibt kostenlos |
| StudySpace Solo | 2,49 €/Monat · 11,99 € für 6 Monate | persönlicher Lernplan, Hausaufgaben, Prüfungen, Fokus, Statistik, Erinnerungen |
| StudySpace Gruppe | 4,99 €/Monat · 24,99 € für 6 Monate | alles aus Solo + gemeinsamer Lernplan, Gruppenfortschritt, Ziele, bis zu 8 Lernende; nur eine Person bezahlt |

Monatstarife verlängern sich, bis gekündigt wird; die 6-Monats-Pässe enden automatisch.

**Erster Start:** Nach der Registrierung fragt die App „Wie möchtest du lernen?“ – *Einer Lerngruppe beitreten* (Code/Link, kostenlos),
*Alleine lernen* (14 Tage gratis, legt den persönlichen Lernbereich an) oder *Eigene Lerngruppe erstellen* (Gruppenpass wählen).
Danach startet einmalig die **Einführung** (Lichtkegel auf den echten Bedienelementen, „Überspringen“ oben links,
erneut unter *Einstellungen → Tarif & Abo → Einführung*).

**Nach der Testphase:** nichts wird gesperrt oder gelöscht. Alles bleibt sichtbar, ein ruhiger, für den Tag ausblendbarer
Hinweis bietet Solo an. Nur neue Einträge und Änderungen lehnt die Datenbank mit einer freundlichen Meldung ab;
Haken setzen und Fokuszeiten gehen weiter.

**Beta-Käufe:** Solange kein Zahlungssystem angebunden ist, können Nutzer einen Kauf **simulieren**. Der Server legt den Zugang an
(Quelle `beta`), der Admin-Bereich zeigt Beta-Käufe getrennt (Anzahl je Tarif, simulierter Betrag, simulierter MRR) – sie zählen
**nie** als Umsatz. Admin → Übersicht → „Kauf simulieren in der App“ schaltet das ab. Monatliche Beta-Abos verlängern sich mit
`pg_cron` täglich automatisch, bis sie in der App gekündigt werden.

**Gruppen**
- Erstellen nur mit Gruppenpass (max. 3 eigene Lerngruppen pro Konto). Der persönliche Lernbereich ist eine eigene „Gruppe“ nur für dich (ohne Einladung). Beitreten per Link (`/app/#/beitreten/CODE`) oder 8-stelligem Code – kostenlos.
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
```bash
npm run app:functions      # supabase-app/functions/app-push/index.ts aus supabase-app/functions-src/ erzeugen
```
Lokal starten: `.env.local` mit `VITE_EDITION=app`, `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` des **App-Projekts**, dann `npm run dev`.

## Später: Zahlungen und native Apps
- **Stripe / App Store / Google Play:** Webhook (Edge Function mit service_role) schreibt `payments` und `entitlements`
  (`source` = `stripe`/`app_store`/`play_store`, `external_id` = Abo-/Transaktions-ID) und Ereignisse in `subscription_events`.
  Umsatz, MRR und Kündigungen im Admin-Bereich stammen ausschließlich aus diesen Tabellen.
- **Expo/React Native:** `src/app/api.ts` (Konto/Gruppen/Tarife ohne React/DOM) und die Datenbankregeln sind direkt nutzbar;
  `src/app/authStorage.ts` zeigt die Speicher-Schnittstelle (dort SecureStore). Supabase Auth unterstützt Google/Apple nativ.
- **Tutorial:** Der Haken ist vorbereitet: `src/app/Tutorial.tsx` (`TUTORIAL_ENABLED`, `TutorialSlot`), eingebunden in `AppGate` direkt nach dem Betreten der Gruppe. Derzeit zeigt er nichts.
