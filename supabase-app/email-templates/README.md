# E-Mail-Vorlagen für Supabase Auth

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
