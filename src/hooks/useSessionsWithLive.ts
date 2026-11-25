import { useMemo } from 'react';
import { liveSessions } from '../lib/liveSession';
import { useFocus, type FocusSession } from '../store/focus';
import { useStopwatch } from '../store/stopwatch';
import { getActiveMemberId, useSession } from '../store/session';
import { useNow } from './useNow';

/**
 * Gespeicherte Lernzeiten + die gerade laufende Zeit (Fokus-Timer und
 * Hausaufgaben-Zähler) – so steigt die Lernzeit live mit, nicht erst nach
 * Ende der Phase.
 */
export function useSessionsWithLive(): FocusSession[] {
  const sessions = useFocus((s) => s.sessions);
  const timer = useFocus((s) => s.timer);
  const stopwatch = useStopwatch((s) => s.state);
  const memberId = useSession((s) => s.activeMemberId) ?? getActiveMemberId();
  const running = timer.endsAt !== null || (!!stopwatch && stopwatch.runningSince !== null);
  // Läuft etwas, alle 5 s neu rechnen (sonst nur minütlich)
  const now = useNow(running ? 5000 : 60_000);
  return useMemo(() => {
    const live = liveSessions(memberId, timer, stopwatch, now);
    return live.length ? [...sessions, ...live] : sessions;
  }, [sessions, timer, stopwatch, memberId, now]);
}
