/**
 * Fokus-Timer – reine Rechenlogik (ohne React), damit sie testbar ist.
 *
 * Die Restzeit wird immer aus dem gespeicherten Endzeitpunkt und der
 * aktuellen Uhrzeit berechnet – kein Herunterzählen. Dadurch stimmt der
 * Timer auch nach dem Sperren des Handys oder einem Tabwechsel.
 */

export type FocusPhase = 'focus' | 'break';

export interface FocusState {
  phase: FocusPhase;
  /** Länge der aktuellen Phase in Sekunden */
  durationSec: number;
  /** Endzeitpunkt (ms) während der Timer läuft, sonst null */
  endsAt: number | null;
  /** Restzeit (s) im pausierten Zustand */
  pausedRemainingSec: number | null;
  /** Startzeitpunkt der laufenden Fokusphase (ms) – für die Lernzeit-Statistik */
  startedAt: number | null;
  /** Bereits gelaufene Sekunden der aktuellen Phase vor der letzten Pause */
  elapsedBeforePauseSec: number;
  /** Optional: Modul, für das gelernt wird */
  moduleId: string | null;
}

export const FOCUS_PRESETS = [
  { label: '25 / 5', focus: 25, rest: 5 },
  { label: '50 / 10', focus: 50, rest: 10 },
  { label: '90 / 15', focus: 90, rest: 15 },
] as const;

export const MIN_SESSION_SEC = 60;

export function initialFocusState(focusMin = 25): FocusState {
  return { phase: 'focus', durationSec: focusMin * 60, endsAt: null, pausedRemainingSec: null, startedAt: null, elapsedBeforePauseSec: 0, moduleId: null };
}

export function isRunning(s: FocusState): boolean {
  return s.endsAt !== null;
}

/** Verbleibende Sekunden (nie negativ). */
export function remainingSec(s: FocusState, now: number): number {
  if (s.endsAt !== null) return Math.max(0, Math.ceil((s.endsAt - now) / 1000));
  if (s.pausedRemainingSec !== null) return s.pausedRemainingSec;
  return s.durationSec;
}

/** Anteil der abgelaufenen Zeit 0…1 */
export function progressOf(s: FocusState, now: number): number {
  if (s.durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingSec(s, now) / s.durationSec));
}

export function start(s: FocusState, now: number): FocusState {
  if (s.endsAt !== null) return s;
  const rest = s.pausedRemainingSec ?? s.durationSec;
  return { ...s, endsAt: now + rest * 1000, pausedRemainingSec: null, startedAt: s.startedAt ?? now };
}

export function pause(s: FocusState, now: number): FocusState {
  if (s.endsAt === null) return s;
  const rest = remainingSec(s, now);
  return { ...s, endsAt: null, pausedRemainingSec: rest, elapsedBeforePauseSec: s.durationSec - rest };
}

export function reset(s: FocusState, durationSec = s.durationSec): FocusState {
  return { ...s, durationSec, endsAt: null, pausedRemainingSec: null, startedAt: null, elapsedBeforePauseSec: 0 };
}

/** Gelernte Sekunden der laufenden/pausierten Fokusphase. */
export function elapsedSec(s: FocusState, now: number): number {
  return Math.max(0, s.durationSec - remainingSec(s, now));
}

export function isFinished(s: FocusState, now: number): boolean {
  return s.endsAt !== null && now >= s.endsAt;
}

/** Wechselt nach Ablauf in die nächste Phase (Fokus → Pause → Fokus), nicht laufend. */
export function nextPhase(s: FocusState, focusMin: number, breakMin: number): FocusState {
  const phase: FocusPhase = s.phase === 'focus' ? 'break' : 'focus';
  return { ...reset(s, (phase === 'focus' ? focusMin : breakMin) * 60), phase };
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Lernzeit kompakt: „45 Min.“ bzw. „5,4 Std.“ */
export function formatStudyTime(totalSec: number): string {
  if (totalSec < 3600) return `${Math.round(totalSec / 60)} Min.`;
  return `${(totalSec / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;
}
