/**
 * Akzentfarben zum Ausprobieren (Einstellungen → Darstellung → Akzentfarbe).
 * Jede Farbe bringt passend getönte Grautöne für Hell und Dunkel mit
 * (Regeln in styles/index.css unter html[data-accent=…]). Standard bleibt Lila.
 */
export type AccentId = 'lila' | 'bergblau' | 'tanne' | 'gletscher' | 'alpenglut' | 'graphit';

export interface Accent {
  id: AccentId;
  label: string;
  /** Vorschau-Farbe (hell, dunkel) */
  swatch: [string, string];
  /** Farbe der Statusleiste (hell, dunkel) – entspricht --ss-canvas */
  top: [string, string];
}

export const ACCENTS: readonly Accent[] = [
  { id: 'lila', label: 'Lila', swatch: ['#6a61e4', '#ada7ff'], top: ['#DCD8F4', '#14142C'] },
  { id: 'bergblau', label: 'Bergblau', swatch: ['#2f5fd0', '#8fb0ff'], top: ['#F2F5FA', '#0F1524'] },
  { id: 'tanne', label: 'Tannengrün', swatch: ['#1d6e52', '#86d4b2'], top: ['#F2F6F4', '#0E1613'] },
  { id: 'gletscher', label: 'Gletscher', swatch: ['#0e7f90', '#86dbe8'], top: ['#F1F6F7', '#0D1619'] },
  { id: 'alpenglut', label: 'Alpenglühen', swatch: ['#c2532f', '#ffab8c'], top: ['#F8F4F2', '#18110F'] },
  { id: 'graphit', label: 'Graphit', swatch: ['#1d1d1f', '#f5f5f7'], top: ['#F5F5F7', '#101012'] },
];

export const accentOf = (id: string | undefined): Accent => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]!;
