/**
 * Benachrichtigungseinstellungen eines Geräts – eine Quelle für Frontend
 * und Edge Functions (ohne Abhängigkeiten).
 */

export interface PushPrefs {
  morning: boolean;
  /** Uhrzeit der Morgenübersicht (HH:MM, Europe/Berlin) */
  morningTime: string;
  evening: boolean;
  eveningTime: string;
  overdue: boolean;
  overdueTime: string;
  exams: boolean;
  planChanges: boolean;
  groupSuccess: boolean;
  personalSuccess: boolean;
  /** Neue Hausaufgaben anderer Personen – sofort */
  homework: boolean;
  quietStart: string;
  quietEnd: string;
  /** Zahl offener Aufgaben am App-Symbol (wo unterstützt) */
  badge: boolean;
}

export const DEFAULT_PREFS: PushPrefs = {
  morning: true,
  morningTime: '08:00',
  evening: true,
  eveningTime: '18:00',
  overdue: true,
  overdueTime: '09:00',
  exams: true,
  planChanges: true,
  groupSuccess: true,
  personalSuccess: false,
  homework: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  badge: true,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BOOL_KEYS = ['morning', 'evening', 'overdue', 'exams', 'planChanges', 'groupSuccess', 'personalSuccess', 'homework', 'badge'] as const;
const TIME_KEYS = ['morningTime', 'eveningTime', 'overdueTime', 'quietStart', 'quietEnd'] as const;

/** Übernimmt nur bekannte, gültige Felder; alles andere wird verworfen. */
export function normalizePrefs(input: unknown): PushPrefs {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const out: PushPrefs = { ...DEFAULT_PREFS };
  for (const k of BOOL_KEYS) if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  for (const k of TIME_KEYS) if (typeof src[k] === 'string' && TIME_RE.test(src[k] as string)) out[k] = src[k] as string;
  return out;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Liegt die Minute des Tages in der Ruhezeit? (Ruhezeit darf über Mitternacht gehen) */
export function inQuietHours(minuteOfDay: number, prefs: Pick<PushPrefs, 'quietStart' | 'quietEnd'>): boolean {
  const qs = timeToMinutes(prefs.quietStart);
  const qe = timeToMinutes(prefs.quietEnd);
  if (qs === qe) return false;
  return qs < qe ? minuteOfDay >= qs && minuteOfDay < qe : minuteOfDay >= qs || minuteOfDay < qe;
}
