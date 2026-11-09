/**
 * Fokus-Timer mit Pomodoro-Rhythmus – reine Rechenlogik (ohne React).
 *
 * Die Restzeit wird immer aus dem gespeicherten Endzeitpunkt und der
 * aktuellen Uhrzeit berechnet – kein Herunterzählen. Dadurch stimmt der
 * Timer auch nach dem Sperren des Handys oder einem Tabwechsel.
 *
 * Ablauf: Fokus (Runde 1) → kurze Pause → Fokus (Runde 2) → … → nach der
 * letzten Runde eine lange Pause → wieder Runde 1.
 */

export type FocusPhase = 'focus' | 'break';

export interface FocusState {
  phase: FocusPhase;
  /** Nur bei phase = 'break': lange Pause nach der letzten Runde */
  long: boolean;
  /** Aktuelle Runde (1 … rounds) */
  round: number;
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
  /** Phase ist abgelaufen und wartet auf „Weiter“ (ohne automatischen Phasenwechsel) */
  finished: boolean;
  /** Optional: Modul, für das gelernt wird */
  moduleId: string | null;
}

/** Ein Pomodoro-Rhythmus (Minuten) */
export interface Rhythm {
  focus: number;
  short: number;
  long: number;
  /** Fokusrunden bis zur langen Pause */
  rounds: number;
}

export type PresetId = 'kurz' | 'klassisch' | 'intensiv' | 'custom';

export const FOCUS_PRESETS: { id: Exclude<PresetId, 'custom'>; label: string; rhythm: Rhythm }[] = [
  { id: 'kurz', label: 'Kurz', rhythm: { focus: 15, short: 5, long: 15, rounds: 4 } },
  { id: 'klassisch', label: 'Klassisch', rhythm: { focus: 25, short: 5, long: 15, rounds: 4 } },
  { id: 'intensiv', label: 'Intensiv', rhythm: { focus: 50, short: 10, long: 30, rounds: 4 } },
];

export const RHYTHM_LIMITS = {
  focus: [1, 180],
  short: [1, 60],
  long: [1, 90],
  rounds: [1, 12],
} as const satisfies Record<keyof Rhythm, readonly [number, number]>;

export const MIN_SESSION_SEC = 60;

export function sanitizeRhythm(input: unknown, fallback: Rhythm = FOCUS_PRESETS[1]!.rhythm): Rhythm {
  const o = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof Rhythm, unknown>>;
  const pick = (k: keyof Rhythm) => {
    const v = o[k];
    const [min, max] = RHYTHM_LIMITS[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback[k];
  };
  return { focus: pick('focus'), short: pick('short'), long: pick('long'), rounds: pick('rounds') };
}

export function initialFocusState(focusMin = 25): FocusState {
  return {
    phase: 'focus',
    long: false,
    round: 1,
    durationSec: focusMin * 60,
    endsAt: null,
    pausedRemainingSec: null,
    startedAt: null,
    elapsedBeforePauseSec: 0,
    finished: false,
    moduleId: null,
  };
}

export function isRunning(s: FocusState): boolean {
  return s.endsAt !== null;
}

/** Hat die aktuelle Phase begonnen (läuft oder pausiert)? */
export function isStarted(s: FocusState): boolean {
  return s.endsAt !== null || s.pausedRemainingSec !== null || s.finished;
}

/** Verbleibende Sekunden (nie negativ). */
export function remainingSec(s: FocusState, now: number): number {
  if (s.finished) return 0;
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
  if (s.endsAt !== null || s.finished) return s;
  const rest = s.pausedRemainingSec ?? s.durationSec;
  return { ...s, endsAt: now + rest * 1000, pausedRemainingSec: null, startedAt: s.startedAt ?? now };
}

export function pause(s: FocusState, now: number): FocusState {
  if (s.endsAt === null) return s;
  const rest = remainingSec(s, now);
  return { ...s, endsAt: null, pausedRemainingSec: rest, elapsedBeforePauseSec: s.durationSec - rest };
}

/** Setzt die aktuelle Phase auf Anfang (Runde bleibt). */
export function reset(s: FocusState, durationSec = s.durationSec): FocusState {
  return { ...s, durationSec, endsAt: null, pausedRemainingSec: null, startedAt: null, elapsedBeforePauseSec: 0, finished: false };
}

/** Gelernte Sekunden der laufenden/pausierten Phase (Pausen zählen nicht). */
export function elapsedSec(s: FocusState, now: number): number {
  return Math.max(0, s.durationSec - remainingSec(s, now));
}

export function isFinished(s: FocusState, now: number): boolean {
  return s.endsAt !== null && now >= s.endsAt;
}

/** Dauer einer Phase laut Rhythmus (Sekunden) */
export function phaseDuration(phase: FocusPhase, long: boolean, r: Rhythm): number {
  return (phase === 'focus' ? r.focus : long ? r.long : r.short) * 60;
}

/**
 * Nächste Phase nach dem Ende der aktuellen (nicht laufend):
 * Fokus → kurze Pause (bzw. lange Pause nach der letzten Runde) → Fokus der nächsten Runde.
 */
export function nextPhase(s: FocusState, r: Rhythm): FocusState {
  if (s.phase === 'focus') {
    const long = s.round >= r.rounds;
    return { ...reset(s, phaseDuration('break', long, r)), phase: 'break', long };
  }
  const round = s.long ? 1 : Math.min(s.round + 1, r.rounds);
  return { ...reset(s, phaseDuration('focus', false, r)), phase: 'focus', long: false, round };
}

/** Markiert die abgelaufene Phase als beendet (wartet auf „Weiter“). */
export function markFinished(s: FocusState): FocusState {
  return { ...s, endsAt: null, pausedRemainingSec: 0, finished: true };
}

/** Komplette Session zurück auf Runde 1 (Rhythmus bleibt). */
export function restartSession(s: FocusState, r: Rhythm): FocusState {
  return { ...reset(s, phaseDuration('focus', false, r)), phase: 'focus', long: false, round: 1 };
}

/** Überschrift der Phase, z. B. „Fokus · Runde 2 von 4“ oder „Kurze Pause“. */
export function phaseTitle(s: Pick<FocusState, 'phase' | 'long' | 'round'>, r: Pick<Rhythm, 'rounds'>): string {
  if (s.phase === 'break') return s.long ? 'Lange Pause' : 'Kurze Pause';
  return r.rounds > 1 ? `Fokus · Runde ${Math.min(s.round, r.rounds)} von ${r.rounds}` : 'Fokus';
}

export function formatClock(totalSec: number, withSeconds = true): string {
  const s = Math.max(0, Math.round(totalSec));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (!withSeconds) {
    // Ohne Sekunden: auf volle Minuten aufrunden (00:30 Rest → „1“ Minute)
    const mins = Math.ceil(s / 60);
    const h = Math.floor(mins / 60);
    return h > 0 ? `${h}:${pad(mins % 60)}` : String(mins);
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Lernzeit kompakt: „45 Min.“ bzw. „5,4 Std.“ */
export function formatStudyTime(totalSec: number): string {
  if (totalSec < 3600) return `${Math.round(totalSec / 60)} Min.`;
  return `${(totalSec / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;
}
