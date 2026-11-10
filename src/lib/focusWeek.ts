import { addDaysISO, startOfWeekISO, zonedToInstant } from './time';
import type { ISODate } from './types';

/**
 * Fokuszeit je Kalendertag und Kalenderwoche (Montag–Sonntag, Europe/Berlin).
 *
 * Eine Sitzung, die über Mitternacht oder über die Wochengrenze läuft, wird
 * anteilig auf die Tage verteilt – jede gelernte Sekunde zählt genau einmal
 * und an dem Tag, an dem sie stattfand. Gezählt wird nur die gespeicherte
 * Fokuszeit (`duration_seconds`, ohne Pausen); nichts wird geschätzt.
 */

export interface FocusSessionLike {
  id: string;
  member_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

export interface WeekRange {
  /** Montag */
  from: ISODate;
  /** Sonntag */
  to: ISODate;
  days: ISODate[];
}

export function weekRange(today: ISODate): WeekRange {
  const from = startOfWeekISO(today);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(from, i));
  return { from, to: days[6]!, days };
}

/** Beginn eines Kalendertags in Berlin als Zeitpunkt (berücksichtigt die Zeitumstellung) */
const dayStartMs = (day: ISODate) => zonedToInstant(day, '00:00').getTime();

/**
 * Fokus-Sekunden einer Sitzung innerhalb [fromMs, toMs).
 * Die Fokuszeit wird gleichmäßig über die Sitzungsdauer verteilt
 * (Pausen innerhalb einer Sitzung sind nicht einzeln gespeichert).
 */
export function secondsWithin(s: FocusSessionLike, fromMs: number, toMs: number): number {
  const start = Date.parse(s.started_at);
  const end = Date.parse(s.ended_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || s.duration_seconds <= 0) return 0;
  const overlap = Math.min(end, toMs) - Math.max(start, fromMs);
  if (overlap <= 0) return 0;
  return s.duration_seconds * (overlap / (end - start));
}

/** Fokus-Sekunden je Tag für die angegebenen Tage (doppelte Sitzungs-IDs zählen einmal). */
export function focusByDay(sessions: FocusSessionLike[], days: ISODate[], memberId?: string): Map<ISODate, number> {
  const out = new Map<ISODate, number>(days.map((d) => [d, 0]));
  if (days.length === 0) return out;
  const bounds = days.map((d) => [d, dayStartMs(d), dayStartMs(addDaysISO(d, 1))] as const);
  const first = bounds[0]![1];
  const last = bounds[bounds.length - 1]![2];
  const seen = new Set<string>();
  for (const s of sessions) {
    if (memberId && s.member_id !== memberId) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    if (Date.parse(s.ended_at) <= first || Date.parse(s.started_at) >= last) continue;
    for (const [d, a, b] of bounds) {
      const sec = secondsWithin(s, a, b);
      if (sec > 0) out.set(d, out.get(d)! + sec);
    }
  }
  return out;
}

export interface MemberWeek {
  memberId: string;
  /** Sekunden in dieser Woche (gerundet) */
  seconds: number;
  /** Sekunden je Wochentag, Montag zuerst */
  perDay: number[];
}

export interface TeamWeek {
  range: WeekRange;
  members: MemberWeek[];
  /** Summe aller Mitglieder */
  total: number;
}

/** Lernzeit aller angegebenen Personen in der Kalenderwoche von `today`. */
export function teamFocusWeek(sessions: FocusSessionLike[], memberIds: string[], today: ISODate): TeamWeek {
  const range = weekRange(today);
  const members = memberIds.map((memberId) => {
    const perDay = [...focusByDay(sessions, range.days, memberId).values()];
    return { memberId, perDay: perDay.map(Math.round), seconds: Math.round(perDay.reduce((a, b) => a + b, 0)) };
  });
  return { range, members, total: members.reduce((a, m) => a + m.seconds, 0) };
}

/** „8 Std. 25 Min.“, „40 Min.“, „0 Min.“ */
export function formatFocusDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
}
