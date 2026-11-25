/**
 * Ein gemeinsames Uhr-Design für alle Vollbild-Uhren:
 * Fokus (Pomodoro), Lernmodus (Uhrzeit) und Hausaufgaben-Zähler.
 *
 * Quelle ist das Fokus-Design (`FocusLook`, pro Gerät gespeichert). Der
 * Lernmodus übernimmt daraus Schrift, Stärke, Größe, Farbe, Leuchten und
 * Hintergrund und schreibt Änderungen daran wieder dorthin zurück – so sehen
 * alle Uhren immer gleich aus. Eigene Einstellungen des Lernmodus (Format,
 * 12/24 h, Datum, Prüfung, Pixelverschiebung) bleiben getrennt.
 */
import type { FocusLook } from './focusLook';
import type { StudyModeSettings } from './studyMode';
import { contrastRatio, isHexColor } from './colors';

/** Felder, die alle Uhren teilen (Schlüssel im Lernmodus) */
export const SHARED_STUDY_KEYS = ['font', 'weight', 'size', 'color', 'glow', 'background', 'bgColor', 'gradient', 'imageDim', 'imageBlur'] as const;
type SharedStudyKey = (typeof SHARED_STUDY_KEYS)[number];

/** Lernmodus-Einstellungen mit dem gemeinsamen Design überlagern */
export function withSharedLook(own: StudyModeSettings, look: FocusLook): StudyModeSettings {
  return {
    ...own,
    font: look.font,
    weight: look.weight,
    size: look.size,
    color: look.color,
    glow: look.glow,
    background: look.background,
    bgColor: look.bgColor,
    gradient: look.gradient,
    imageDim: look.dim,
    imageBlur: look.blur,
  };
}

/** Teilt eine Änderung im Lernmodus in „gemeinsames Design“ und „nur Lernmodus“ auf. */
export function splitStudyPatch(patch: Partial<StudyModeSettings>): { look: Partial<FocusLook>; own: Partial<StudyModeSettings> } {
  const look: Partial<FocusLook> = {};
  const own: Partial<StudyModeSettings> = {};
  for (const [k, v] of Object.entries(patch) as [keyof StudyModeSettings, never][]) {
    if (!(SHARED_STUDY_KEYS as readonly string[]).includes(k)) {
      (own as Record<string, unknown>)[k] = v;
      continue;
    }
    const key = k as SharedStudyKey;
    if (key === 'imageDim') look.dim = v;
    else if (key === 'imageBlur') look.blur = v;
    else (look as Record<string, unknown>)[key] = v;
  }
  return { look, own };
}

const MERGED_KEY = 'studyspace.clocklook.merged.v1';
const STUDY_KEY = 'studyspace.studymode.v1';
const STUDY_IMAGE_KEY = 'studyspace.studymode.image.v1';
const FOCUS_IMAGE_KEY = 'studyspace.focuslook.image.v1';

/**
 * Einmalig beim Umstieg: Wer den Lernmodus schon gestaltet hatte, behält dieses
 * Design (Vorrang vor dem Fokus-Design) – samt eigenem Hintergrundbild.
 * Gibt die zu übernehmenden Design-Werte zurück (oder null).
 */
export function legacyStudyLook(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): Partial<FocusLook> | null {
  if (!storage) return null;
  try {
    if (storage.getItem(MERGED_KEY)) return null;
    storage.setItem(MERGED_KEY, '1');
    const raw = storage.getItem(STUDY_KEY);
    const img = storage.getItem(STUDY_IMAGE_KEY);
    if (img && img.startsWith('data:image/') && !storage.getItem(FOCUS_IMAGE_KEY)) storage.setItem(FOCUS_IMAGE_KEY, img);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<StudyModeSettings>;
    const out: Partial<FocusLook> = {};
    if (typeof s.font === 'string') out.font = s.font;
    if (typeof s.weight === 'number') out.weight = s.weight;
    if (typeof s.size === 'number') out.size = s.size;
    if (typeof s.color === 'string') out.color = s.color;
    if (typeof s.glow === 'boolean') out.glow = s.glow;
    if (typeof s.background === 'string') out.background = s.background;
    if (typeof s.bgColor === 'string') out.bgColor = s.bgColor;
    if (Array.isArray(s.gradient)) out.gradient = s.gradient as FocusLook['gradient'];
    if (typeof s.imageDim === 'number') out.dim = s.imageDim;
    if (typeof s.imageBlur === 'number') out.blur = s.imageBlur;
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Kontrast: Ziffern und Beschriftungen müssen auf dem Hintergrund lesbar sein
// ---------------------------------------------------------------------

/** Ungefähre Hintergrundfarbe (für Bilder/Berge/Polarlicht: dunkel durch Abdunkeln) */
export function backgroundTone(look: Pick<FocusLook, 'background' | 'bgColor' | 'gradient' | 'dim'>): string {
  if (look.background === 'solid' || look.background === 'aurora') return look.bgColor;
  if (look.background === 'gradient') return mix(look.gradient);
  return '#141629'; // Berge und eigenes Bild: unter der Abdunklung im Mittel dunkel
}

function mix(colors: readonly string[]): string {
  const rgb = colors.filter(isHexColor).map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  if (rgb.length === 0) return '#000000';
  const avg = [0, 1, 2].map((i) => Math.round(rgb.reduce((s, x) => s + x[i]!, 0) / rgb.length));
  return `#${avg.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Ist der Hintergrund hell? Dann werden Beschriftungen und Knöpfe dunkel. */
export function isLightBackground(look: Pick<FocusLook, 'background' | 'bgColor' | 'gradient' | 'dim'>): boolean {
  if (look.background !== 'solid' && look.background !== 'gradient' && look.background !== 'aurora') return false;
  const tone = backgroundTone(look);
  return contrastRatio(tone, '#000000') > contrastRatio(tone, '#FFFFFF');
}

/** Kontrast der Ziffern zum Hintergrund (≥ 3 : 1 für große Schrift nach WCAG) */
export function digitContrast(look: Pick<FocusLook, 'background' | 'bgColor' | 'gradient' | 'dim' | 'color'>): number {
  return contrastRatio(look.color, backgroundTone(look));
}
