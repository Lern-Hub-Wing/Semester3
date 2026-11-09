/**
 * Fokus 2.0 – Darstellung, Hintergrund und Steuerung der Vollbildansicht.
 * Pro Gerät gespeichert (localStorage). Alle Werte werden beim Laden geprüft;
 * ungültige Werte fallen auf den Standard zurück.
 */
import { CLOCK_FONTS, type ClockFont } from './studyMode';
import { isHexColor } from './colors';

export type FocusBackground = 'mountains' | 'aurora' | 'gradient' | 'solid' | 'image';
export type TextPosition = 'center' | 'top' | 'bottom';
export type AnimSpeed = 'off' | 'slow' | 'normal' | 'fast';

export interface FocusLook {
  // Anzeige
  font: ClockFont;
  /** Größe in Prozent (40–100) */
  size: number;
  weight: number;
  /** Ziffern: Minuten und Sekunden oder nur Minuten */
  showSeconds: boolean;
  color: string;
  glow: boolean;
  /** Stärke des Leuchtens 0–100 */
  glowStrength: number;
  position: TextPosition;
  anim: AnimSpeed;
  ring: boolean;
  ringWidth: number;
  /** Ringfarbe: leer = Phasenfarbe */
  ringColor: string;
  bar: boolean;
  percent: boolean;
  // Hintergrund
  background: FocusBackground;
  bgColor: string;
  gradient: [string, string, string];
  /** Unschärfe 0–24 px */
  blur: number;
  /** Abdunkeln 0–85 % */
  dim: number;
  /** Dezente Bewegung (Nebel, Aurora) */
  motion: boolean;
  // Steuerung
  barPosition: 'bottom' | 'top';
  autoHide: boolean;
  /** Sekunden bis zum Ausblenden */
  hideDelay: number;
}

export const FOCUS_COLORS = ['#F2F5FA', '#FFFFFF', '#C6B6FF', '#AFC5F5', '#AADCCB', '#F5C6A5', '#F4B9B6', '#E8CB9D'];
export const RING_COLORS = ['', '#A9A6FF', '#8FDCC0', '#AFC5F5', '#F5C6A5', '#F4B9B6', '#FFFFFF'];

export const DEFAULT_FOCUS_LOOK: FocusLook = {
  font: 'inter',
  size: 85,
  weight: 600,
  showSeconds: true,
  color: '#F2F5FA',
  glow: true,
  glowStrength: 40,
  position: 'center',
  anim: 'normal',
  ring: true,
  ringWidth: 10,
  ringColor: '',
  bar: true,
  percent: true,
  background: 'mountains',
  bgColor: '#0B0C1C',
  gradient: ['#0C1018', '#1B2440', '#3A2B5C'],
  blur: 0,
  dim: 25,
  motion: true,
  barPosition: 'bottom',
  autoHide: true,
  hideDelay: 4,
};

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const col = (v: unknown, fallback: string) => (typeof v === 'string' && isHexColor(v) ? v.toUpperCase() : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function sanitizeFocusLook(input: unknown): FocusLook {
  const d = DEFAULT_FOCUS_LOOK;
  const o = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof FocusLook, unknown>>;
  const font = oneOf(o.font, CLOCK_FONTS.map((f) => f.id), d.font);
  const def = CLOCK_FONTS.find((f) => f.id === font)!;
  const g = Array.isArray(o.gradient) ? o.gradient : [];
  return {
    font,
    size: num(o.size, 40, 100, d.size),
    weight: num(o.weight, def.min, def.max, def.defaultWeight),
    showSeconds: bool(o.showSeconds, d.showSeconds),
    color: col(o.color, d.color),
    glow: bool(o.glow, d.glow),
    glowStrength: num(o.glowStrength, 0, 100, d.glowStrength),
    position: oneOf(o.position, ['center', 'top', 'bottom'] as const, d.position),
    anim: oneOf(o.anim, ['off', 'slow', 'normal', 'fast'] as const, d.anim),
    ring: bool(o.ring, d.ring),
    ringWidth: num(o.ringWidth, 2, 24, d.ringWidth),
    ringColor: o.ringColor === '' ? '' : col(o.ringColor, d.ringColor),
    bar: bool(o.bar, d.bar),
    percent: bool(o.percent, d.percent),
    background: oneOf(o.background, ['mountains', 'aurora', 'gradient', 'solid', 'image'] as const, d.background),
    bgColor: col(o.bgColor, d.bgColor),
    gradient: [col(g[0], d.gradient[0]), col(g[1], d.gradient[1]), col(g[2], d.gradient[2])],
    blur: num(o.blur, 0, 24, d.blur),
    dim: num(o.dim, 0, 85, d.dim),
    motion: bool(o.motion, d.motion),
    barPosition: oneOf(o.barPosition, ['bottom', 'top'] as const, d.barPosition),
    autoHide: bool(o.autoHide, d.autoHide),
    hideDelay: num(o.hideDelay, 2, 30, d.hideDelay),
  };
}

/** Dauer der Ziffern-Animation in Sekunden (0 = aus) */
export function digitDuration(speed: AnimSpeed): number {
  return { off: 0, slow: 0.6, normal: 0.38, fast: 0.2 }[speed];
}

const KEY = 'studyspace.focuslook.v1';
const IMAGE_KEY = 'studyspace.focuslook.image.v1';

export function loadFocusLook(): FocusLook {
  try {
    return sanitizeFocusLook(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return DEFAULT_FOCUS_LOOK;
  }
}

export function saveFocusLook(l: FocusLook) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* gilt dann nur für diese Sitzung */
  }
}

export function loadFocusImage(): string | null {
  try {
    const v = localStorage.getItem(IMAGE_KEY);
    return v && v.startsWith('data:image/') ? v : null;
  } catch {
    return null;
  }
}

/** Gibt false zurück, wenn der lokale Speicher nicht reicht. */
export function saveFocusImage(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(IMAGE_KEY, dataUrl);
    else localStorage.removeItem(IMAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
