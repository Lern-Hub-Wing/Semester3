/**
 * Zeitrechnung in Europe/Berlin ohne Bibliothek (Intl) – inklusive
 * Sommer-/Winterzeit. Wird von der Erinnerungslogik verwendet.
 */
export const TZ = 'Europe/Berlin';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface LocalParts {
  /** YYYY-MM-DD */
  date: string;
  /** Minute des Tages 0…1439 */
  minutes: number;
  /** HH:MM */
  time: string;
}

export function berlinParts(d: Date): LocalParts {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + minute,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/** Ortszeit (Datum + HH:MM in Berlin) → eindeutiger Zeitpunkt */
export function berlinInstant(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  // Zweimal korrigieren: Abstand zwischen gewünschter und tatsächlich angezeigter Ortszeit
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = berlinParts(new Date(guess));
    const [py, pm, pd] = p.date.split('-').map(Number);
    const shown = Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60);
    guess += wanted - shown;
  }
  return new Date(guess);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' });
const shortDateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** „heute“, „morgen“, „Montag“ (innerhalb einer Woche) oder „12. Dez.“ */
export function dayLabel(date: string, today: string): string {
  const diff = diffDays(today, date);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  if (diff > 1 && diff < 7) return weekdayFmt.format(new Date(`${date}T12:00:00Z`));
  return shortDateFmt.format(new Date(`${date}T12:00:00Z`));
}

export function formatDateShort(date: string): string {
  return longDateFmt.format(new Date(`${date}T12:00:00Z`));
}
