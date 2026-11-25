import { create } from 'zustand';
import { elapsedOf, pauseStopwatch, resumeStopwatch, sanitizeStopwatch, startStopwatch, type StopwatchState } from '../lib/stopwatch';
import { saveFocusSession } from './focus';

const KEY = 'studyspace.hwfocus.v1';

function load(): StopwatchState | null {
  try {
    return sanitizeStopwatch(JSON.parse(localStorage.getItem(KEY) ?? 'null'), Date.now());
  } catch {
    return null;
  }
}
function persist(s: StopwatchState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* nur für diese Sitzung */
  }
}

interface StopwatchStore {
  state: StopwatchState | null;
  set: (s: StopwatchState | null) => void;
}

/** Laufender Hausaufgaben-Zähler (pro Gerät; übersteht Neuladen und Sperren) */
export const useStopwatch = create<StopwatchStore>((set) => ({
  state: typeof window === 'undefined' ? null : load(),
  set: (state) => {
    persist(state);
    set({ state });
  },
}));

export const stopwatchActions = {
  /** Für diese Hausaufgabe starten – läuft schon einer für dieselbe, geht er einfach weiter */
  open(homeworkId: string, moduleId: string | null, memberId: string | null = null) {
    const { state, set } = useStopwatch.getState();
    if (state && state.homeworkId === homeworkId) return;
    // Lief noch ein Zähler für eine andere Hausaufgabe: dessen Zeit erst speichern, nichts geht verloren
    if (state && memberId) void stopwatchActions.finish(memberId);
    set(startStopwatch(homeworkId, moduleId, Date.now()));
  },
  toggle() {
    const { state, set } = useStopwatch.getState();
    if (!state) return;
    set(state.runningSince === null ? resumeStopwatch(state, Date.now()) : pauseStopwatch(state, Date.now()));
  },
  /** Beenden: Lernzeit speichern (ab 1 Minute) und Zähler zurücksetzen. Gibt die Sekunden zurück. */
  async finish(memberId: string | null): Promise<number> {
    const { state, set } = useStopwatch.getState();
    if (!state) return 0;
    const now = Date.now();
    const sec = Math.round(elapsedOf(state, now));
    set(null);
    if (memberId) await saveFocusSession(memberId, state.moduleId, state.startedAt, now, sec);
    return sec;
  },
  /** Verwerfen ohne zu speichern */
  discard() {
    useStopwatch.getState().set(null);
  },
};
