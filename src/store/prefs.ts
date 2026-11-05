import { create } from 'zustand';

/** Gerätebezogene Darstellungseinstellungen (lokal gespeichert, weil es keine Konten gibt). */
export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  progressStyle: 'ring' | 'bar';
  motion: 'system' | 'reduced' | 'full';
  glass: 'auto' | 'reduced';
  compact: boolean;
}

const KEY = 'studyspace.prefs.v1';
const DEFAULTS: Prefs = { theme: 'system', progressStyle: 'ring', motion: 'system', glass: 'auto', compact: false };

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
    };
  } catch {
    return DEFAULTS;
  }
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...(typeof window === 'undefined' ? DEFAULTS : load()),
  set: (patch) => {
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
