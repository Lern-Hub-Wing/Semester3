/**
 * Rechtstexte der App (Nutzungsbedingungen, Datenschutz, Widerruf).
 * Das Impressum kommt aus den Angaben, die der Betreiber im Admin-Bereich
 * einträgt (nie erfunden). Ändert sich ein Text inhaltlich, LEGAL_VERSION
 * erhöhen – dann stimmen alle beim nächsten Öffnen der neuen Fassung zu.
 */
export const LEGAL_VERSION = '2026-11-25';
export const LEGAL_DATE = '25. November 2026';

export type LegalDoc = 'agb' | 'datenschutz' | 'widerruf' | 'impressum';

export interface LegalSectionText {
  title: string;
  body: string[];
}

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  agb: 'Nutzungsbedingungen',
  datenschutz: 'Datenschutzerklärung',
  widerruf: 'Widerrufsbelehrung',
  impressum: 'Impressum',
};

export const TERMS: LegalSectionText[] = [
  {
    title: '1. Geltungsbereich',
    body: [
      'Diese Nutzungsbedingungen gelten für die Nutzung der Web-App „StudySpace“ (im Folgenden „App“) durch registrierte Nutzerinnen und Nutzer. Anbieter ist der im Impressum genannte Betreiber.',
    ],
  },
  {
    title: '2. Leistungen',
    body: [
      'Die App bietet Werkzeuge zum Lernen: Lernpläne, Hausaufgaben, Prüfungstermine, einen Fokus-Timer, Statistiken sowie Lerngruppen mit bis zu acht Personen. Ein Teil der Funktionen ist kostenlos, weitere Funktionen sind Teil der Tarife „Solo“ und „Gruppe“.',
      'Der Anbieter bemüht sich um eine hohe Verfügbarkeit, schuldet aber keine ununterbrochene Erreichbarkeit. Wartungen und Weiterentwicklungen können zu kurzen Unterbrechungen führen.',
    ],
  },
  {
    title: '3. Konto',
    body: [
      'Für die Nutzung ist ein Konto mit gültiger E-Mail-Adresse nötig. Zugangsdaten sind geheim zu halten. Ein Konto ist persönlich und nicht übertragbar.',
      'Du kannst dein Konto jederzeit in den Einstellungen löschen. Eigene Lerngruppen ohne weitere Mitglieder werden dabei gelöscht; hat eine Gruppe weitere Mitglieder, übernimmt das am längsten dabei gewesene Mitglied.',
    ],
  },
  {
    title: '4. Tarife, Testphase und Codes',
    body: [
      'Die Testphase dauert 14 Tage und endet automatisch, ohne dass Kosten entstehen. Danach bleiben alle Inhalte sichtbar; Bearbeiten ist mit einem Tarif wieder möglich.',
      'Monatliche Tarife verlängern sich jeweils um einen Monat, bis sie gekündigt werden; Kündigung ist jederzeit zum Ende des laufenden Monats in der App möglich. 6-Monats-Pässe enden automatisch.',
      'Während der Beta-Phase werden Käufe in der App nur simuliert; es werden keine Zahlungen erhoben. Codes (Einladungs- oder Tarif-Codes) gelten nur in ihrem angegebenen Umfang, sind nicht übertragbar und nicht in Geld einlösbar.',
    ],
  },
  {
    title: '5. Lerngruppen',
    body: [
      'Wer eine Lerngruppe erstellt, verwaltet sie: Einladungen, Entfernen von Mitgliedern und Löschen der Gruppe. Inhalte einer Lerngruppe sehen alle Mitglieder – außer Fächer, die nur für bestimmte Personen freigegeben sind („Wer schreibt diese Prüfung?“).',
      'Bitte teile in Lerngruppen nur Inhalte, die du teilen darfst, und gehe respektvoll miteinander um.',
    ],
  },
  {
    title: '6. Pflichten bei der Nutzung',
    body: [
      'Unzulässig sind insbesondere: rechtswidrige, beleidigende oder fremde Rechte verletzende Inhalte, der Versuch, Sicherheitsmechanismen zu umgehen, automatisierte Massenabfragen und das Ausprobieren fremder Codes.',
      'Bei Verstößen kann der Anbieter Inhalte entfernen und Konten vorübergehend oder dauerhaft sperren.',
    ],
  },
  {
    title: '7. KI-Lernplan',
    body: [
      'Der KI-Lernplan ist ein Vorschlag, der automatisch erstellt wird. Er ersetzt keine eigene Prüfung der Inhalte; für Vollständigkeit und Richtigkeit übernimmt der Anbieter keine Gewähr.',
    ],
  },
  {
    title: '8. Haftung',
    body: [
      'Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haftet er nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.',
      'Bitte sichere wichtige Inhalte regelmäßig über „Daten exportieren“.',
    ],
  },
  {
    title: '9. Änderungen',
    body: [
      'Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern, wenn dafür ein sachlicher Grund besteht (z. B. neue Funktionen oder geänderte Rechtslage). Über Änderungen informiert die App beim nächsten Öffnen; ohne Zustimmung zur neuen Fassung kannst du dein Konto löschen.',
    ],
  },
  {
    title: '10. Schlussbestimmungen',
    body: [
      'Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts; zwingende Verbraucherschutzvorschriften deines Wohnsitzstaats bleiben unberührt. Sollte eine Bestimmung unwirksam sein, bleibt der Rest wirksam.',
      'Der Anbieter ist nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
    ],
  },
];

export const PRIVACY: LegalSectionText[] = [
  {
    title: '1. Verantwortlicher',
    body: ['Verantwortlich für die Datenverarbeitung ist der im Impressum genannte Betreiber. Fragen zum Datenschutz kannst du an die dort genannte E-Mail-Adresse richten.'],
  },
  {
    title: '2. Welche Daten wir verarbeiten',
    body: [
      'Kontodaten: E-Mail-Adresse, Anzeigename, Passwort (nur als sicherer Hash beim Anmeldedienst), Zeitpunkt der Anmeldung, bei Anmeldung mit Google oder Apple die von dort übermittelte E-Mail-Adresse und der Name.',
      'Lerninhalte: Fächer, Themen, Prüfungstermine, Lernplan, Aufgaben, Hausaufgaben, Haken, Fokuszeiten, Musik-Links und Einstellungen deiner Lerngruppe.',
      'Nutzung und Technik: ungefähre letzte Aktivität (für die Anzeige „online“ im Admin-Bereich), Tarif und Codes, Zustimmung zu diesen Bedingungen (Fassung und Zeitpunkt), Fehler- und Sicherheitsprotokolle.',
      'Auf deinem Gerät (lokaler Speicher): Anmeldung, zwischengespeicherte Inhalte für schnelles Öffnen, Design- und Fokus-Einstellungen, eigenes Hintergrundbild. Diese Daten verlassen dein Gerät nicht.',
    ],
  },
  {
    title: '3. Zwecke und Rechtsgrundlagen',
    body: [
      'Bereitstellung der App und deines Kontos sowie der Lerngruppen (Art. 6 Abs. 1 lit. b DSGVO – Vertrag).',
      'Sicherheit, Missbrauchsschutz und Fehlerbehebung (Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse an einem sicheren Betrieb).',
      'Mitteilungen auf dein Gerät, Standort für das Wetter im Hintergrund und der KI-Lernplan nur, wenn du sie einschaltest bzw. nutzt (Art. 6 Abs. 1 lit. a DSGVO – Einwilligung, jederzeit widerrufbar).',
      'Aufbewahrung, soweit gesetzlich vorgeschrieben (Art. 6 Abs. 1 lit. c DSGVO).',
    ],
  },
  {
    title: '4. Empfänger und Dienstleister',
    body: [
      'Supabase, Inc. (USA) betreibt Datenbank, Anmeldung und Server-Funktionen als Auftragsverarbeiter. Die Daten liegen in der bei der Einrichtung gewählten Rechenzentrumsregion.',
      'GitHub, Inc. (USA) liefert die App-Dateien aus (GitHub Pages). Dabei wird technisch bedingt deine IP-Adresse verarbeitet.',
      'Anthropic PBC (USA) erstellt den KI-Lernplan. Übermittelt werden nur Fachnamen, Themen, Prüfungsdaten und Lernzeiten – keine Namen oder E-Mail-Adressen.',
      'Für Mitteilungen nutzt dein Browser den Push-Dienst seines Herstellers (z. B. Apple, Google, Mozilla). Für das Wetter wird bei eingeschaltetem Standort die ungefähre Position an Open-Meteo übermittelt.',
      'Bei Übermittlungen in Drittländer stützen wir uns auf Angemessenheitsbeschlüsse (z. B. EU-US Data Privacy Framework) oder EU-Standardvertragsklauseln.',
    ],
  },
  {
    title: '5. Speicherdauer',
    body: [
      'Kontodaten und Inhalte speichern wir, solange dein Konto besteht. Gelöschte Inhalte liegen 30 Tage im Papierkorb und werden danach endgültig entfernt. Nach Löschung des Kontos werden deine Daten gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.',
    ],
  },
  {
    title: '6. Deine Rechte',
    body: [
      'Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen.',
      'Deine Daten kannst du jederzeit unter Einstellungen → Daten exportieren herunterladen und dein Konto selbst löschen.',
      'Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, insbesondere in dem Bundesland, in dem du wohnst.',
    ],
  },
  {
    title: '7. Keine Werbung, kein Tracking',
    body: ['Die App verwendet keine Werbe- oder Analyse-Cookies und kein Tracking durch Dritte. Es findet kein Verkauf von Daten statt.'],
  },
];

export const WITHDRAWAL: LegalSectionText[] = [
  {
    title: 'Widerrufsrecht',
    body: [
      'Verbraucherinnen und Verbraucher haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen einen kostenpflichtigen Tarif zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.',
      'Um dein Widerrufsrecht auszuüben, musst du den Betreiber (Kontakt im Impressum) mittels einer eindeutigen Erklärung (z. B. E-Mail) über deinen Entschluss informieren. Zur Wahrung der Frist reicht es aus, dass du die Mitteilung vor Ablauf der Frist absendest.',
    ],
  },
  {
    title: 'Folgen des Widerrufs',
    body: [
      'Wenn du widerrufst, erstatten wir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag, an dem die Mitteilung über deinen Widerruf bei uns eingegangen ist – mit demselben Zahlungsmittel, das du verwendet hast.',
      'Hast du verlangt, dass die Leistung während der Widerrufsfrist beginnt, zahlst du einen angemessenen Betrag, der dem Anteil der bis zum Widerruf bereits erbrachten Leistung entspricht.',
    ],
  },
  {
    title: 'Hinweis zur Beta-Phase',
    body: ['Solange Käufe in der App nur simuliert werden, entstehen keine Kosten und es wird nichts abgebucht.'],
  },
  {
    title: 'Muster-Widerrufsformular',
    body: [
      'An [Betreiber laut Impressum]: Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: StudySpace-Tarif ______ · Bestellt am ______ · Name ______ · E-Mail-Adresse des Kontos ______ · Datum ______',
    ],
  },
];
