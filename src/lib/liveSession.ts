/**
 * Live-Lernzeit: Die laufende (noch nicht gespeicherte) Fokusphase bzw. der
 * laufende Hausaufgaben-Zähler zählt sofort in die Statistik – als vorläufige
 * Sitzung. Wird die Zeit gespeichert, ersetzt die echte Sitzung die vorläufige.
 */
import { elapsedSec, type FocusState } from './focus';
import { elapsedOf, type StopwatchState } from './stopwatch';

export interface LiveSessionLike {
  id: string;
  member_id: string;
  module_id: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  created_at: string;
}

export function liveSessions(memberId: string | null, timer: FocusState, stopwatch: StopwatchState | null, now: number): LiveSessionLike[] {
  if (!memberId) return [];
  const out: LiveSessionLike[] = [];
  const started = timer.endsAt !== null || timer.pausedRemainingSec !== null;
  if (timer.phase === 'focus' && started && !timer.finished) {
    const sec = Math.floor(elapsedSec(timer, now));
    if (sec > 0) out.push(session('live-focus', memberId, timer.moduleId, timer.startedAt ?? now - sec * 1000, now, sec));
  }
  if (stopwatch) {
    const sec = Math.floor(elapsedOf(stopwatch, now));
    if (sec > 0) out.push(session('live-homework', memberId, stopwatch.moduleId, stopwatch.startedAt, now, sec));
  }
  return out;
}

function session(id: string, memberId: string, moduleId: string | null, startMs: number, endMs: number, sec: number): LiveSessionLike {
  const end = new Date(endMs).toISOString();
  // Beginn so legen, dass Dauer und Zeitraum zusammenpassen (Pausen zählen nicht)
  const start = new Date(Math.max(startMs, endMs - sec * 1000)).toISOString();
  return { id, member_id: memberId, module_id: moduleId, started_at: start, ended_at: end, duration_seconds: sec, created_at: end };
}
