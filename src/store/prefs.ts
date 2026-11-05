import { create } from 'zustand';
import { setHapticsEnabled } from '../lib/haptics';
import { GLASS_CLARITY_DEFAULT, clampClarity } from '../lib/glass';

/** Gerätebezogene Darstellungseinstellungen (lokal gespeichert, weil es keine Konten gibt). */
export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  progressStyle: 'ring' | 'bar';
  motion: 'system' | 'reduced' | 'full';
  glass: 'auto' | 'reduced';
  compact: boolean;
  /** Kurze Vibration bei wichtigen Interaktionen (nur wo unterstützt) */
  haptics: boolean;
  /** Durchsichtigkeit der Glasflächen, 0 (milchig) … 100 (klar) */
  glassClarity: number;
}

const KEY = 'studyspace.prefs.v1';
const DEFAULTS: Prefs = { theme: 'system', progressStyle: 'ring', motion: 'system', glass: 'auto', compact: false, haptics: true, glassClarity: GLASS_CLARITY_DEFAULT };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      theme: ['system', 'light', 'dark'].includes(parsed.theme as string) ? parsed.theme! : DEFAULTS.theme,
      progressStyle: parsed.progressStyle === 'bar' ? 'bar' : 'ring',
      motion: ['system', 'reduced', 'full'].includes(parsed.motion as string) ? parsed.motion! : DEFAULTS.motion,
      glass: parsed.glass === 'reduced' ? 'reduced' : 'auto',
      compact: parsed.compact === true,
      haptics: parsed.haptics !== false,
      glassClarity: clampClarity(parsed.glassClarity),
    };
  } catch {
    return DEFAULTS;
  }
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

const initial = typeof window === 'undefined' ? DEFAULTS : load();
setHapticsEnabled(initial.haptics);

export const usePrefs = create<PrefsState>((set, get) => ({
  ...initial,
  set: (patch) => {
    if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics);
    set(patch);
    const { set: _omit, ...rest } = { ...get(), ...patch };
    void _omit;
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* Speicher nicht verfügbar – Einstellung gilt nur für diese Sitzung */
    }
  },
}));
