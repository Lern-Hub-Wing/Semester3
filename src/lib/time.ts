import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import type { ISODate } from './types';

/** Zeitzone der Lerngruppe. Alle "heute"-Berechnungen beziehen sich darauf. */
export const TZ = 'Europe/Berlin';
export const LOCALE = 'de-DE';

const isoFormatterCache = new Map<string, Intl.DateTimeFormat>();
function isoFormatter(tz: string) {
  let f = isoFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    isoFormatterCache.set(tz, f);
  }
  return f;
}

/** Heutiges Datum (YYYY-MM-DD) in der angegebenen Zeitzone. */
export function todayISO(now: Date = new Date(), tz: string = TZ): ISODate {
  return isoFormatter(tz).format(now);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = isoToUTCDate(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Kalenderdatum als Date um 00:00 UTC – nur für reine Datumsrechnung. */
export function isoToUTCDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcDateToISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = isoToUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateToISO(d);
}

export function addMonthsISO(iso: ISODate, months: number): ISODate {
  const d = isoToUTCDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return utcDateToISO(d);
}

/** Differenz in ganzen Kalendertagen (b - a). */
export function diffDaysISO(a: ISODate, b: ISODate): number {
  return Math.round((isoToUTCDate(b).getTime() - isoToUTCDate(a).getTime()) / 86_400_000);
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function weekdayIndex(iso: ISODate): number {
  return (isoToUTCDate(iso).getUTCDay() + 6) % 7;
}

export function startOfWeekISO(iso: ISODate): ISODate {
  return addDaysISO(iso, -weekdayIndex(iso));
}

export function weekDays(iso: ISODate): ISODate[] {
  const start = startOfWeekISO(iso);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

export function startOfMonthISO(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

/** 6 Wochen à 7 Tage, beginnend am Montag vor/an dem Monatsersten. */
export function monthGrid(iso: ISODate): ISODate[] {
  const start = startOfWeekISO(startOfMonthISO(iso));
  return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** ISO-Kalenderwoche */
export function isoWeekNumber(iso: ISODate): number {
  const d = isoToUTCDate(iso);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const dateFormatCache = new Map<string, Intl.DateTimeFormat>();
function cachedFormat(key: string, opts: Intl.DateTimeFormatOptions) {
  let f = dateFormatCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, opts);
    dateFormatCache.set(key, f);
  }
  return f;
}

/** Formatiert ein Kalenderdatum (ohne Zeitzonenverschiebung). */
export function formatISODate(iso: ISODate, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  const key = `d|${JSON.stringify(opts)}`;
  return cachedFormat(key, { ...opts, timeZone: 'UTC' }).format(isoToUTCDate(iso));
}

/** Formatiert einen Zeitpunkt in der gewünschten Zeitzone. */
export function formatInstant(instant: string | Date, opts: Intl.DateTimeFormatOptions, tz: string = TZ): string {
  const key = `i|${tz}|${JSON.stringify(opts)}`;
  return cachedFormat(key, { ...opts, timeZone: tz }).format(typeof instant === 'string' ? new Date(instant) : instant);
}

/** "14:00" */
export function formatTime(instant: string | Date, tz: string = TZ): string {
  return formatInstant(instant, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz);
}

/** Ortszeit (Datum + Uhrzeit) → eindeutiger Zeitpunkt (berücksichtigt Sommer-/Winterzeit). */
export function zonedToInstant(dateISO: ISODate, timeHHmm: string, tz: string = TZ): Date {
  return fromZonedTime(`${dateISO}T${timeHHmm}:00`, tz);
}

/** Zeitpunkt → Ortszeit-Bestandteile für Formulare. */
export function instantToZoned(instant: string | Date, tz: string = TZ): { date: ISODate; time: string } {
  return {
    date: formatInTimeZone(instant, tz, 'yyyy-MM-dd'),
    time: formatInTimeZone(instant, tz, 'HH:mm'),
  };
}

/** Begrüßung passend zur Tageszeit in Berlin. */
export function greetingFor(now: Date = new Date()): string {
  const hour = Number(formatInstant(now, { hour: '2-digit', hourCycle: 'h23' }));
  if (hour < 5) return 'Gute Nacht';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/** "heute", "morgen", "gestern", "in 3 Tagen", "vor 2 Tagen" */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const diff = diffDaysISO(today, iso);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff > 1) return `In ${diff} Tagen`;
  return `Vor ${-diff} Tagen`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h} Std. ${m} Min.`;
  if (h) return `${h} Std.`;
  return `${m} Min.`;
}
