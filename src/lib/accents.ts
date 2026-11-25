import { create } from 'zustand';

/**
 * Designs (Einstellungen → Darstellung → Design; beim ersten Start wählbar).
 * Lila ist der StudySpace-Standard, Graphit die schlichte Schwarz-Weiß-Variante.
 * Graphit tönt auch die Grautöne (Regeln in styles/index.css unter html[data-accent=…]).
 */
export type AccentId = 'lila' | 'graphit';

interface Palette {
  bg: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  btnText: string;
}

export interface Accent {
  id: AccentId;
  label: string;
  hint: string;
  /** Vorschau-Farbe (hell, dunkel) */
  swatch: [string, string];
  /** Farbe der Statusleiste (hell, dunkel) – entspricht --ss-canvas */
  top: [string, string];
  /** Farben der Mini-Vorschau beim ersten Start (hell, dunkel) */
  preview: [Palette, Palette];
}

export const ACCENTS: readonly Accent[] = [
  {
    id: 'lila',
    label: 'Lila',
    hint: 'Der Klassiker',
    swatch: ['#6a61e4', '#ada7ff'],
    top: ['#DCD8F4', '#14142C'],
    preview: [
      { bg: '#f5f4fb', card: '#ffffff', text: '#18163a', muted: '#8f8cab', accent: '#6a61e4', btnText: '#ffffff' },
      { bg: '#121129', card: '#1b1a39', text: '#efeefb', muted: '#75729b', accent: '#b8b1ff', btnText: '#17153a' },
    ],
  },
  {
    id: 'graphit',
    label: 'Graphit',
    hint: 'Schwarz-Weiß',
    swatch: ['#1d1d1f', '#f5f5f7'],
    top: ['#F5F5F7', '#101012'],
    preview: [
      { bg: '#f5f5f7', card: '#ffffff', text: '#1d1d1f', muted: '#8e8e93', accent: '#1d1d1f', btnText: '#ffffff' },
      { bg: '#101012', card: '#1c1c1e', text: '#f5f5f7', muted: '#6e6e73', accent: '#f5f5f7', btnText: '#1d1d1f' },
    ],
  },
];

export const accentOf = (id: string | undefined): Accent => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]!;

/** Wurde das Design auf diesem Gerät schon einmal gewählt? (Auswahl beim ersten Start) */
const CHOSEN_KEY = 'studyspace.design.chosen';
export function designChosen(): boolean {
  try {
    return localStorage.getItem(CHOSEN_KEY) === '1';
  } catch {
    return true;
  }
}
const useChoice = create<{ chosen: boolean }>(() => ({ chosen: typeof window === 'undefined' ? true : designChosen() }));
/** Reaktiv: z. B. startet die Einführung der App erst nach der Auswahl */
export const useDesignChosen = () => useChoice((s) => s.chosen);
export function markDesignChosen(): void {
  useChoice.setState({ chosen: true });
  try {
    localStorage.setItem(CHOSEN_KEY, '1');
  } catch {
    /* ohne Speicher: beim nächsten Start erneut fragen */
  }
}
