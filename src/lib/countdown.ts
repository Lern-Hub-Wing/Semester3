import type { Exam } from './types';

export type CountdownState =
  | { kind: 'none' }
  | { kind: 'finished'; last: Exam }
  | { kind: 'upcoming'; exam: Exam; msUntilStart: number }
  | { kind: 'running'; exam: Exam; msUntilEnd: number; msTotal: number };

export function activeExams(exams: Iterable<Exam>): Exam[] {
  return [...exams].filter((e) => !e.deleted_at).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/**
 * Bestimmt den Countdown-Zustand ausschließlich aus "jetzt" und den
 * gespeicherten Zeitpunkten. Es wird nie ein Zähler heruntergezählt –
 * deshalb ist der Wert auch nach Standby/Hintergrund sofort korrekt.
 */
export function getCountdownState(exams: Iterable<Exam>, nowMs: number): CountdownState {
  const list = activeExams(exams);
  if (list.length === 0) return { kind: 'none' };

  const running = list.find((e) => Date.parse(e.starts_at) <= nowMs && nowMs < Date.parse(e.ends_at));
  if (running) {
    const end = Date.parse(running.ends_at);
    return { kind: 'running', exam: running, msUntilEnd: end - nowMs, msTotal: end - Date.parse(running.starts_at) };
  }
  const next = list.find((e) => Date.parse(e.starts_at) > nowMs);
  if (next) return { kind: 'upcoming', exam: next, msUntilStart: Date.parse(next.starts_at) - nowMs };
  return { kind: 'finished', last: list[list.length - 1] };
}

/** Alle Prüfungen, die noch nicht beendet sind (inkl. laufender). */
export function upcomingExams(exams: Iterable<Exam>, nowMs: number): Exam[] {
  return activeExams(exams).filter((e) => Date.parse(e.ends_at) > nowMs);
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Zerlegt eine Dauer; die Sekunden werden abgerundet, damit 0 genau beim Start erreicht wird. */
export function splitDuration(ms: number): DurationParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

/** Verbleibende Kalendertage bis zur Prüfung (für Karten, nicht sekundengenau). */
export function daysUntil(startsAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(startsAt) - nowMs) / 86_400_000));
}
