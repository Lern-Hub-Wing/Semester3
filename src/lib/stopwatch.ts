/**
 * Hausaufgaben-Zähler: zählt die Lernzeit einfach hoch (Stoppuhr).
 * Wie beim Fokus-Timer wird nie „mitgezählt“, sondern immer aus Zeitpunkten
 * gerechnet – stimmt also auch nach Sperren des Handys oder Neuladen.
 */
export interface StopwatchState {
  homeworkId: string;
  moduleId: string | null;
  /** Erster Start (ms) – Beginn der Lernzeit */
  startedAt: number;
  /** Läuft seit (ms), null = pausiert */
  runningSince: number | null;
  /** Bereits gezählte Sekunden vor der letzten Pause */
  elapsedBeforeSec: number;
}

/** Obergrenze einer Sitzung (wie bei Fokuszeiten): 4 Stunden */
export const STOPWATCH_MAX_SEC = 4 * 3600;

export function startStopwatch(homeworkId: string, moduleId: string | null, now: number): StopwatchState {
  return { homeworkId, moduleId, startedAt: now, runningSince: now, elapsedBeforeSec: 0 };
}

export function elapsedOf(s: StopwatchState, now: number): number {
  const running = s.runningSince === null ? 0 : Math.max(0, (now - s.runningSince) / 1000);
  return Math.min(STOPWATCH_MAX_SEC, s.elapsedBeforeSec + running);
}

export function pauseStopwatch(s: StopwatchState, now: number): StopwatchState {
  if (s.runningSince === null) return s;
  return { ...s, runningSince: null, elapsedBeforeSec: elapsedOf(s, now) };
}

export function resumeStopwatch(s: StopwatchState, now: number): StopwatchState {
  if (s.runningSince !== null) return s;
  return { ...s, runningSince: now };
}

/** HH:MM:SS bzw. MM:SS unter einer Stunde */
export function formatElapsed(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function sanitizeStopwatch(input: unknown, now: number): StopwatchState | null {
  const o = (input && typeof input === 'object' ? input : null) as Partial<StopwatchState> | null;
  if (!o || typeof o.homeworkId !== 'string' || typeof o.startedAt !== 'number' || o.startedAt > now + 60_000) return null;
  const elapsedBeforeSec = typeof o.elapsedBeforeSec === 'number' && o.elapsedBeforeSec >= 0 ? Math.min(STOPWATCH_MAX_SEC, o.elapsedBeforeSec) : 0;
  const runningSince = typeof o.runningSince === 'number' && o.runningSince <= now + 60_000 ? o.runningSince : null;
  return { homeworkId: o.homeworkId, moduleId: typeof o.moduleId === 'string' ? o.moduleId : null, startedAt: o.startedAt, runningSince, elapsedBeforeSec };
}
