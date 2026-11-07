import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { uuid } from '../lib/uuid';
import { describeError } from '../lib/errors';
import {
  FOCUS_PRESETS, MIN_SESSION_SEC, elapsedSec, initialFocusState, isFinished, nextPhase, pause as pauseState, reset as resetState, start as startState, type FocusState,
} from '../lib/focus';
import { toast } from './toast';

/**
 * Fokus-Timer (pro Gerät) und gespeicherte Fokuszeiten (für alle).
 *
 * – Der Timerzustand liegt im localStorage – er läuft nach Neuladen oder
 *   Sperren des Handys korrekt weiter (Endzeitpunkt statt Herunterzählen).
 * – Abgeschlossene Fokusphasen werden in der Tabelle `focus_sessions`
 *   gespeichert (Migration 004). Fehlt die Tabelle, funktioniert der Timer
 *   trotzdem; nur die Statistik bleibt leer und die App weist darauf hin.
 */

const KEY = 'studyspace.focus.v1';

export interface FocusSession {
  id: string;
  member_id: string;
  module_id: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  created_at: string;
}

interface Settings {
  presetIndex: number;
  /** Nach der Pause automatisch die nächste Fokusphase starten? */
  sound: boolean;
}

interface FocusStore {
  timer: FocusState;
  settings: Settings;
  sessions: FocusSession[];
  /** null = noch nicht geladen; false = Tabelle fehlt (Migration 004 nicht ausgeführt) */
  available: boolean | null;
  loading: boolean;
  setTimer: (t: FocusState) => void;
  setSettings: (p: Partial<Settings>) => void;
}

function loadLocal(): { timer: FocusState; settings: Settings } {
  const fallback = { timer: initialFocusState(25), settings: { presetIndex: 0, sound: true } };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as { timer?: Partial<FocusState>; settings?: Partial<Settings> };
    const t = { ...fallback.timer, ...p.timer } as FocusState;
    if (typeof t.durationSec !== 'number' || t.durationSec <= 0 || t.durationSec > 4 * 3600) return fallback;
    const presetIndex = Number.isInteger(p.settings?.presetIndex) && p.settings!.presetIndex! >= 0 && p.settings!.presetIndex! < FOCUS_PRESETS.length ? p.settings!.presetIndex! : 0;
    return { timer: t, settings: { presetIndex, sound: p.settings?.sound !== false } };
  } catch {
    return fallback;
  }
}

const initial = typeof window === 'undefined' ? { timer: initialFocusState(25), settings: { presetIndex: 0, sound: true } } : loadLocal();

export const useFocus = create<FocusStore>((set, get) => ({
  ...initial,
  sessions: [],
  available: null,
  loading: false,
  setTimer: (timer) => {
    set({ timer });
    persist(timer, get().settings);
  },
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    persist(get().timer, settings);
  },
}));

function persist(timer: FocusState, settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ timer, settings }));
  } catch {
    /* nur für diese Sitzung */
  }
}

export function currentPreset() {
  return FOCUS_PRESETS[useFocus.getState().settings.presetIndex] ?? FOCUS_PRESETS[0];
}

export const focusActions = {
  start() {
    const { timer, setTimer } = useFocus.getState();
    setTimer(startState(timer, Date.now()));
  },
  pause() {
    const { timer, setTimer } = useFocus.getState();
    setTimer(pauseState(timer, Date.now()));
  },
  reset() {
    const { timer, setTimer } = useFocus.getState();
    const p = currentPreset();
    setTimer({ ...resetState(timer, (timer.phase === 'focus' ? p.focus : p.rest) * 60) });
  },
  choosePreset(index: number) {
    const { setSettings, setTimer, timer } = useFocus.getState();
    setSettings({ presetIndex: index });
    const p = FOCUS_PRESETS[index] ?? FOCUS_PRESETS[0];
    setTimer({ ...resetState(timer, p.focus * 60), phase: 'focus' });
  },
  setModule(moduleId: string | null) {
    const { setTimer, timer } = useFocus.getState();
    setTimer({ ...timer, moduleId });
  },
  /** Fokusphase vorzeitig beenden und die bisher gelernte Zeit speichern */
  async finishEarly(memberId: string) {
    const { timer, setTimer } = useFocus.getState();
    const now = Date.now();
    if (timer.phase === 'focus') await recordSession(memberId, timer, now, elapsedSec(timer, now));
    const p = currentPreset();
    setTimer({ ...resetState(timer, p.focus * 60), phase: 'focus' });
  },
};

/**
 * Prüft, ob die laufende Phase abgelaufen ist; speichert eine beendete
 * Fokusphase und wechselt in die nächste Phase. Gibt die beendete Phase zurück.
 */
export async function tickFocus(memberId: string | null, now = Date.now()): Promise<'focus' | 'break' | null> {
  const { timer, setTimer } = useFocus.getState();
  if (!isFinished(timer, now)) return null;
  const done = timer.phase;
  const p = currentPreset();
  setTimer(nextPhase(timer, p.focus, p.rest));
  if (done === 'focus' && memberId) await recordSession(memberId, timer, timer.endsAt ?? now, timer.durationSec);
  return done;
}

async function recordSession(memberId: string, timer: FocusState, endMs: number, seconds: number) {
  if (seconds < MIN_SESSION_SEC || !config.isConfigured) return;
  const startedAt = timer.startedAt ?? endMs - seconds * 1000;
  const row = {
    id: uuid(),
    member_id: memberId,
    module_id: timer.moduleId,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endMs).toISOString(),
    duration_seconds: Math.min(Math.round(seconds), 4 * 3600),
  };
  try {
    const { data, error } = await getSupabase().from('focus_sessions').insert(row).select().single();
    if (error) throw error;
    useFocus.setState((s) => ({ sessions: [...s.sessions, data as FocusSession], available: true }));
    toast.success(`Fokuszeit gespeichert (${Math.round(seconds / 60)} Min.)`);
  } catch (err) {
    if (isMissingTable(err)) {
      useFocus.setState({ available: false });
      return;
    }
    toast.error(`Fokuszeit konnte nicht gespeichert werden: ${describeError(err)}`);
  }
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache/i.test(e?.message ?? '');
}

let loadPromise: Promise<void> | null = null;

/** Lädt die gespeicherten Fokuszeiten (tolerant, falls die Tabelle fehlt). */
export function loadFocusSessions(): Promise<void> {
  if (!config.isConfigured) return Promise.resolve();
  if (loadPromise) return loadPromise;
  useFocus.setState({ loading: true });
  loadPromise = (async () => {
    try {
      const out: FocusSession[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await getSupabase().from('focus_sessions').select('*').order('started_at', { ascending: true }).range(from, from + 999);
        if (error) throw error;
        out.push(...((data ?? []) as FocusSession[]));
        if (!data || data.length < 1000) break;
      }
      useFocus.setState({ sessions: out, available: true });
    } catch (err) {
      useFocus.setState({ available: isMissingTable(err) ? false : useFocus.getState().available });
    } finally {
      useFocus.setState({ loading: false });
      loadPromise = null;
    }
  })();
  return loadPromise;
}
