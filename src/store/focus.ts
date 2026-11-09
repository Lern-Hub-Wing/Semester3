import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { uuid } from '../lib/uuid';
import { describeError } from '../lib/errors';
import {
  FOCUS_PRESETS, MIN_SESSION_SEC, elapsedSec, initialFocusState, isFinished, markFinished, nextPhase, pause as pauseState, phaseDuration, reset as resetState,
  restartSession, sanitizeRhythm, start as startState, type FocusState, type PresetId, type Rhythm,
} from '../lib/focus';
import { DEFAULT_FOCUS_LOOK, loadFocusLook, saveFocusLook, sanitizeFocusLook, type FocusLook } from '../lib/focusLook';
import { toast } from './toast';

/**
 * Fokus-Timer (pro Gerät) und gespeicherte Fokuszeiten (für alle).
 *
 * – Der Timerzustand liegt im localStorage – er läuft nach Neuladen oder
 *   Sperren des Handys korrekt weiter (Endzeitpunkt statt Herunterzählen).
 * – Abgeschlossene Fokusphasen werden in der Tabelle `focus_sessions`
 *   gespeichert (Migration 004). Pausen zählen nie als Lernzeit. Fehlt die
 *   Tabelle, funktioniert der Timer trotzdem; nur die Statistik bleibt leer.
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

export interface SavedPreset {
  id: string;
  name: string;
  rhythm: Rhythm;
}

export interface FocusSettings {
  /** Gewählter Rhythmus: Vorgabe, „custom“ oder gespeicherte Vorlage („saved:<id>“) */
  preset: PresetId | `saved:${string}`;
  /** Werte für „Individuell“ */
  custom: Rhythm;
  saved: SavedPreset[];
  sound: boolean;
  /** Lautstärke 0–100 */
  volume: number;
  /** Lokale Mitteilung beim Phasenwechsel (wenn erlaubt) */
  notify: boolean;
  /** Nach Ablauf automatisch in die nächste Phase wechseln */
  autoAdvance: boolean;
  /** Nächste Phase sofort automatisch starten */
  autoStart: boolean;
  /** Timer beim Öffnen der Fokusansicht automatisch starten */
  autoStartOnOpen: boolean;
  /** Beim Öffnen direkt ins Vollbild (wo der Browser es erlaubt, z. B. Laptop) */
  fullscreenOnOpen: boolean;
  /** Hintergrundklang im Fokus */
  music: 'lofi' | 'rain' | 'noise';
  /** Lautstärke der Musik 0–100 */
  musicVolume: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  preset: 'klassisch',
  custom: { focus: 30, short: 5, long: 20, rounds: 4 },
  saved: [],
  sound: true,
  volume: 60,
  notify: false,
  autoAdvance: true,
  autoStart: false,
  autoStartOnOpen: false,
  fullscreenOnOpen: true,
  music: 'lofi',
  musicVolume: 50,
};

interface FocusStore {
  timer: FocusState;
  settings: FocusSettings;
  look: FocusLook;
  sessions: FocusSession[];
  /** null = noch nicht geladen; false = Tabelle fehlt (Migration 004 nicht ausgeführt) */
  available: boolean | null;
  loading: boolean;
  setTimer: (t: FocusState) => void;
  setSettings: (p: Partial<FocusSettings>) => void;
  setLook: (p: Partial<FocusLook>) => void;
  resetLook: () => void;
}

export function sanitizeSettings(input: unknown): FocusSettings {
  const d = DEFAULT_FOCUS_SETTINGS;
  const o = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof FocusSettings, unknown>> & { presetIndex?: unknown };
  const saved = Array.isArray(o.saved)
    ? (o.saved as unknown[])
        .filter((x): x is SavedPreset => !!x && typeof x === 'object' && typeof (x as SavedPreset).id === 'string' && typeof (x as SavedPreset).name === 'string')
        .slice(0, 12)
        .map((x) => ({ id: x.id.slice(0, 40), name: x.name.slice(0, 40), rhythm: sanitizeRhythm(x.rhythm) }))
    : [];
  let preset: FocusSettings['preset'] = d.preset;
  if (typeof o.preset === 'string') {
    if (['kurz', 'klassisch', 'intensiv', 'custom'].includes(o.preset)) preset = o.preset as PresetId;
    else if (o.preset.startsWith('saved:') && saved.some((p) => `saved:${p.id}` === o.preset)) preset = o.preset as `saved:${string}`;
  } else if (typeof o.presetIndex === 'number') {
    // Alte Version: 25/5, 50/10, 90/15
    preset = o.presetIndex === 1 ? 'intensiv' : 'klassisch';
  }
  const bool = (v: unknown, f: boolean) => (typeof v === 'boolean' ? v : f);
  return {
    preset,
    custom: sanitizeRhythm(o.custom, d.custom),
    saved,
    sound: bool(o.sound, d.sound),
    volume: typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(100, Math.max(0, Math.round(o.volume))) : d.volume,
    notify: bool(o.notify, d.notify),
    autoAdvance: bool(o.autoAdvance, d.autoAdvance),
    autoStart: bool(o.autoStart, d.autoStart),
    autoStartOnOpen: bool(o.autoStartOnOpen, d.autoStartOnOpen),
    fullscreenOnOpen: bool(o.fullscreenOnOpen, d.fullscreenOnOpen),
    music: o.music === 'rain' || o.music === 'noise' ? o.music : 'lofi',
    musicVolume: typeof o.musicVolume === 'number' && Number.isFinite(o.musicVolume) ? Math.min(100, Math.max(0, Math.round(o.musicVolume))) : d.musicVolume,
  };
}

/** Aktueller Rhythmus aus den Einstellungen */
export function rhythmOf(s: FocusSettings): Rhythm {
  if (s.preset === 'custom') return s.custom;
  if (s.preset.startsWith('saved:')) return s.saved.find((p) => `saved:${p.id}` === s.preset)?.rhythm ?? FOCUS_PRESETS[1]!.rhythm;
  return FOCUS_PRESETS.find((p) => p.id === s.preset)?.rhythm ?? FOCUS_PRESETS[1]!.rhythm;
}

function loadLocal(): { timer: FocusState; settings: FocusSettings } {
  const settings = DEFAULT_FOCUS_SETTINGS;
  const fallback = { timer: initialFocusState(rhythmOf(settings).focus), settings };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as { timer?: Partial<FocusState>; settings?: unknown };
    const st = sanitizeSettings(p.settings);
    const t = { ...initialFocusState(rhythmOf(st).focus), ...p.timer } as FocusState;
    const valid =
      typeof t.durationSec === 'number' && t.durationSec > 0 && t.durationSec <= 4 * 3600 && (t.phase === 'focus' || t.phase === 'break') && Number.isInteger(t.round) && t.round >= 1;
    return { timer: valid ? { ...t, long: !!t.long, finished: !!t.finished } : initialFocusState(rhythmOf(st).focus), settings: st };
  } catch {
    return fallback;
  }
}

const initial =
  typeof window === 'undefined'
    ? { timer: initialFocusState(25), settings: DEFAULT_FOCUS_SETTINGS, look: DEFAULT_FOCUS_LOOK }
    : { ...loadLocal(), look: loadFocusLook() };

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
    const settings = sanitizeSettings({ ...get().settings, ...p });
    set({ settings });
    persist(get().timer, settings);
  },
  setLook: (p) => {
    const look = sanitizeFocusLook({ ...get().look, ...p });
    set({ look });
    saveFocusLook(look);
  },
  resetLook: () => {
    set({ look: DEFAULT_FOCUS_LOOK });
    saveFocusLook(DEFAULT_FOCUS_LOOK);
  },
}));

function persist(timer: FocusState, settings: FocusSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ timer, settings }));
  } catch {
    /* nur für diese Sitzung */
  }
}

export function currentRhythm(): Rhythm {
  return rhythmOf(useFocus.getState().settings);
}

/** Passt eine noch nicht gestartete Phase an einen geänderten Rhythmus an. */
function applyRhythmToIdle() {
  const { timer, setTimer } = useFocus.getState();
  if (timer.endsAt !== null || timer.pausedRemainingSec !== null) return;
  const r = currentRhythm();
  setTimer({ ...resetState(timer, phaseDuration(timer.phase, timer.long, r)), round: Math.min(timer.round, r.rounds) });
}

export const focusActions = {
  start() {
    const { timer, setTimer } = useFocus.getState();
    if (timer.finished) return focusActions.advance(true);
    setTimer(startState(timer, Date.now()));
  },
  pause() {
    const { timer, setTimer } = useFocus.getState();
    setTimer(pauseState(timer, Date.now()));
  },
  /** Aktuelle Phase neu beginnen (Runde bleibt) */
  reset() {
    const { timer, setTimer } = useFocus.getState();
    setTimer(resetState(timer, phaseDuration(timer.phase, timer.long, currentRhythm())));
  },
  /** Nach einer beendeten Phase (ohne Auto-Wechsel) bzw. zum Überspringen: nächste Phase */
  advance(startNow = useFocus.getState().settings.autoStart) {
    const { timer, setTimer } = useFocus.getState();
    const next = nextPhase(timer, currentRhythm());
    setTimer(startNow ? startState(next, Date.now()) : next);
  },
  /** Pause überspringen → nächste Fokusrunde startet sofort */
  skipBreak() {
    const { timer } = useFocus.getState();
    if (timer.phase !== 'break') return;
    focusActions.advance(true);
  },
  choosePreset(preset: FocusSettings['preset']) {
    useFocus.getState().setSettings({ preset });
    const { timer, setTimer } = useFocus.getState();
    if (timer.endsAt === null && timer.pausedRemainingSec === null) setTimer(restartSession(timer, currentRhythm()));
  },
  setCustom(p: Partial<Rhythm>) {
    const { settings, setSettings } = useFocus.getState();
    setSettings({ custom: sanitizeRhythm({ ...settings.custom, ...p }), preset: 'custom' });
    applyRhythmToIdle();
  },
  savePreset(name: string) {
    const { settings, setSettings } = useFocus.getState();
    const id = uuid().slice(0, 8);
    const clean = name.trim().slice(0, 40) || `Vorlage ${settings.saved.length + 1}`;
    setSettings({ saved: [...settings.saved, { id, name: clean, rhythm: rhythmOf(settings) }].slice(-12), preset: `saved:${id}` });
  },
  deletePreset(id: string) {
    const { settings, setSettings } = useFocus.getState();
    const preset = settings.preset === `saved:${id}` ? 'custom' : settings.preset;
    const custom = settings.preset === `saved:${id}` ? rhythmOf(settings) : settings.custom;
    setSettings({ saved: settings.saved.filter((p) => p.id !== id), preset, custom });
  },
  setModule(moduleId: string | null) {
    const { setTimer, timer } = useFocus.getState();
    setTimer({ ...timer, moduleId });
  },
  /** Session beenden: bisher gelernte Fokuszeit speichern, zurück auf Runde 1 */
  async endSession(memberId: string | null) {
    const { timer, setTimer } = useFocus.getState();
    const now = Date.now();
    if (timer.phase === 'focus' && !timer.finished && memberId) await recordSession(memberId, timer, now, elapsedSec(timer, now));
    setTimer(restartSession(timer, currentRhythm()));
  },
};

/**
 * Prüft, ob die laufende Phase abgelaufen ist; speichert eine beendete
 * Fokusphase und wechselt (je nach Einstellung) in die nächste Phase.
 * Gibt die beendete Phase zurück.
 */
export async function tickFocus(memberId: string | null, now = Date.now()): Promise<{ phase: 'focus' | 'break'; long: boolean } | null> {
  const { timer, setTimer, settings } = useFocus.getState();
  if (!isFinished(timer, now)) return null;
  const done = { phase: timer.phase, long: timer.long };
  if (settings.autoAdvance) {
    const next = nextPhase(timer, rhythmOf(settings));
    // Bei Autostart beginnt die nächste Phase genau am Ende der vorherigen –
    // aber nur, wenn sie nicht schon längst vorbei wäre (App lange geschlossen):
    // so entsteht nie Lernzeit, die niemand gesehen hat.
    const at = timer.endsAt ?? now;
    const stale = now - at > next.durationSec * 1000;
    setTimer(settings.autoStart && !stale ? startState(next, at) : next);
  } else {
    setTimer(markFinished(timer));
  }
  if (done.phase === 'focus' && memberId) await recordSession(memberId, timer, timer.endsAt ?? now, timer.durationSec);
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
