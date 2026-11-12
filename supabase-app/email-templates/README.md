# E-Mail-Vorlagen für Supabase Auth

> **Wichtig:** Supabase lässt die Vorlagen nur bearbeiten, wenn ein **eigener SMTP-Server** eingetragen ist.
> Dafür braucht es **kein Pro**: ein kostenloser Anbieter genügt (siehe unten, Schritt 0). Ohne eigenen SMTP
> verschickt Supabase seine Standard-E-Mail (englisch, ohne Logo, nur wenige pro Stunde) – die App funktioniert
> trotzdem; wird der Link auf einem anderen Gerät geöffnet, zeigt sie „E-Mail bestätigt – bitte anmelden“.

## Schritt 0 – kostenlosen SMTP-Server einrichten (einmalig)

**Variante A: Brevo (empfohlen, kostenlos bis 300 E-Mails/Tag, keine eigene Domain nötig)**
1. Auf brevo.com kostenlos registrieren.
2. *Senders, Domains & Dedicated IPs → Senders → Add a sender*: Name `StudySpace`, eine E-Mail-Adresse, die dir gehört
   (am besten eine eigene, z. B. eine neue Gmail-Adresse nur für StudySpace) → Bestätigungslink in dieser E-Mail anklicken.
3. *SMTP & API → SMTP*: „Generate a new SMTP key“. Notiere **SMTP server** (`smtp-relay.brevo.com`), **Port** (`587`),
   **Login** und den **SMTP-Key** (wird nur einmal angezeigt).
4. In Supabase (Projekt **App**) → *Authentication → Emails → SMTP Settings* → „Enable custom SMTP“:
   - Sender email: die bestätigte Adresse aus Schritt 2 · Sender name: `StudySpace`
   - Host: `smtp-relay.brevo.com` · Port: `587` · Username: der Brevo-**Login** · Password: der **SMTP-Key** → Save
5. Optional: *Authentication → Rate Limits* → „Rate limit for sending emails“ z. B. auf 100 pro Stunde erhöhen.

**Variante B: Gmail mit App-Passwort (kostenlos, ca. 500 E-Mails/Tag)**
1. Am besten eine eigene Gmail-Adresse nur für StudySpace anlegen (sonst ist deine private Adresse der Absender).
2. Im Google-Konto die Bestätigung in zwei Schritten einschalten, dann unter *myaccount.google.com/apppasswords*
   ein App-Passwort „StudySpace“ erzeugen (16 Zeichen).
3. Supabase → *SMTP Settings*: Host `smtp.gmail.com`, Port `465`, Username = die Gmail-Adresse,
   Password = das App-Passwort, Sender email = die Gmail-Adresse, Sender name `StudySpace` → Save.

Danach sind unter *Authentication → Emails → Templates* die Felder editierbar.

## Schritt 1 – Vorlagen einfügen

In Supabase (Projekt **App**) unter **Authentication → Emails → Templates** einfügen.
Jeweils **Subject** übernehmen und den kompletten HTML-Inhalt der Datei in **Message body** kopieren → Save.

| Vorlage in Supabase | Datei | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Bestätige deine E-Mail-Adresse für StudySpace` |
| Reset Password | `reset-password.html` | `Neues Passwort für StudySpace` |
| Change Email Address | `change-email.html` | `Bestätige deine neue E-Mail-Adresse` |
| Magic Link | `magic-link.html` | `Dein Anmeldelink für StudySpace` |

Die Links nutzen `token_hash` statt eines Codes: Sie funktionieren dadurch auch auf einem anderen Gerät
oder in einer anderen App (z. B. E-Mail auf dem Handy öffnen, registriert am Laptop).
Voraussetzung: **Site URL** = `https://lern-hub-wing.github.io/Semester3/app/` (Authentication → URL Configuration).

Absendername: Mit eigenem SMTP-Server (Authentication → Emails → SMTP Settings) lässt sich „StudySpace“
als Absender und eine eigene Adresse festlegen; der eingebaute Versand ist nur für Tests gedacht.
