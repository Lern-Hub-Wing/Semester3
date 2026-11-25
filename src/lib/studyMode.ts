/**
 * Lernmodus: Vollbild-Uhr. Hier liegen die Einstellungen (pro Gerät,
 * lokal gespeichert) und die reine Zeitformatierung.
 */
import { isHexColor } from './colors';

export type ClockFont = 'inter' | 'thin' | 'rounded' | 'mono' | 'serif' | 'digital' | 'grotesk' | 'clean' | 'geo' | 'future' | 'elegant' | 'hand' | 'soft' | 'bold';
export type ClockBackground = 'mountains' | 'solid' | 'gradient' | 'aurora' | 'image';

export interface StudyModeSettings {
  /** Ziffern: Stunden:Minuten oder Stunden:Minuten:Sekunden */
  format: 'hm' | 'hms';
  hour12: boolean;
  font: ClockFont;
  weight: number;
  /** Größe der Uhr in Prozent der maximal möglichen Größe */
  size: number;
  color: string;
  glow: boolean;
  secondsStyle: 'same' | 'small';
  animateDigits: boolean;
  background: ClockBackground;
  bgColor: string;
  gradient: [string, string, string];
  gradientAngle: number;
  /** Abdunkeln des Hintergrundbilds in Prozent */
  imageDim: number;
  /** Weichzeichnen des Hintergrundbilds in px */
  imageBlur: number;
  showDate: boolean;
  showExam: boolean;
  /** Verschiebt die Uhr minütlich um wenige Pixel (schützt OLED-Displays vor Einbrennen) */
  pixelShift: boolean;
}

export const CLOCK_FONTS: { id: ClockFont; label: string; family: string; min: number; max: number; defaultWeight: number }[] = [
  { id: 'inter', label: 'Modern', family: "'Inter Variable', system-ui, sans-serif", min: 100, max: 900, defaultWeight: 600 },
  { id: 'thin', label: 'Fein', family: "'Inter Variable', system-ui, sans-serif", min: 100, max: 500, defaultWeight: 200 },
  { id: 'rounded', label: 'Rund', family: "'Nunito Variable', ui-rounded, system-ui, sans-serif", min: 200, max: 1000, defaultWeight: 700 },
  { id: 'grotesk', label: 'Grotesk', family: "'Space Grotesk Variable', system-ui, sans-serif", min: 300, max: 700, defaultWeight: 500 },
  { id: 'mono', label: 'Mono', family: "'JetBrains Mono Variable', ui-monospace, monospace", min: 100, max: 800, defaultWeight: 400 },
  { id: 'serif', label: 'Klassisch', family: "'Playfair Display Variable', Georgia, serif", min: 400, max: 900, defaultWeight: 500 },
  { id: 'digital', label: 'Digital', family: "'Orbitron Variable', ui-monospace, monospace", min: 400, max: 900, defaultWeight: 600 },
  { id: 'clean', label: 'Klar', family: "'Montserrat Variable', system-ui, sans-serif", min: 100, max: 900, defaultWeight: 600 },
  { id: 'geo', label: 'Geometrisch', family: "'Outfit Variable', system-ui, sans-serif", min: 100, max: 900, defaultWeight: 500 },
  { id: 'future', label: 'Futur', family: "'Sora Variable', system-ui, sans-serif", min: 100, max: 800, defaultWeight: 500 },
  { id: 'elegant', label: 'Elegant', family: "'Fraunces Variable', Georgia, serif", min: 100, max: 900, defaultWeight: 400 },
  { id: 'hand', label: 'Handschrift', family: "'Caveat Variable', cursive", min: 400, max: 700, defaultWeight: 600 },
  { id: 'soft', label: 'Weich', family: "'Comfortaa Variable', ui-rounded, system-ui, sans-serif", min: 300, max: 700, defaultWeight: 600 },
  { id: 'bold', label: 'Kräftig', family: "'Bricolage Grotesque Variable', system-ui, sans-serif", min: 200, max: 800, defaultWeight: 700 },
];

export const GRADIENT_PRESETS: { id: string; label: string; colors: [string, string, string]; angle: number }[] = [
  { id: 'pastell', label: 'Pastell', colors: ['#AFC5F5', '#CBB8F5', '#F5C6A5'], angle: 135 },
  { id: 'nacht', label: 'Mitternacht', colors: ['#0C1018', '#1B2440', '#3A2B5C'], angle: 160 },
  { id: 'abend', label: 'Abendrot', colors: ['#2B1E3F', '#8E4C6E', '#F2A07B'], angle: 160 },
  { id: 'ozean', label: 'Ozean', colors: ['#0B2A3C', '#1F6F8B', '#A6DED7'], angle: 145 },
  { id: 'wald', label: 'Wald', colors: ['#0E1F17', '#2F5D46', '#C3D7AD'], angle: 150 },
  { id: 'morgen', label: 'Morgen', colors: ['#FDE2E4', '#E2ECE9', '#BEE1E6'], angle: 135 },
  { id: 'polar', label: 'Polarlicht', colors: ['#071A24', '#13625E', '#7FE0C3'], angle: 165 },
  { id: 'lavendel', label: 'Lavendel', colors: ['#1E1638', '#5B3F94', '#D7B4F0'], angle: 150 },
  { id: 'gletscher', label: 'Gletscher', colors: ['#0A1F3A', '#2F6FC0', '#BFE1FF'], angle: 160 },
  { id: 'kirsche', label: 'Kirschblüte', colors: ['#2A0E1E', '#7A1F4B', '#F28BA8'], angle: 155 },
  { id: 'wueste', label: 'Wüste', colors: ['#2E1B10', '#A85A1F', '#F2C879'], angle: 150 },
  { id: 'neon', label: 'Neon', colors: ['#10002B', '#5B21B6', '#22D3EE'], angle: 140 },
  { id: 'tiefsee', label: 'Tiefsee', colors: ['#01060F', '#0B1F3A', '#1D4E89'], angle: 170 },
  { id: 'sonnenuntergang', label: 'Sonnenuntergang', colors: ['#1B1033', '#C2416B', '#FDB46C'], angle: 165 },
  { id: 'moos', label: 'Moos', colors: ['#0B140D', '#2D4A2B', '#93B57C'], angle: 155 },
  { id: 'graphit', label: 'Graphit', colors: ['#0D0F14', '#262B36', '#4B5263'], angle: 160 },
  { id: 'pfirsich', label: 'Pfirsich', colors: ['#FFE5D9', '#FFCAD4', '#F4ACB7'], angle: 135 },
  { id: 'minze', label: 'Minze', colors: ['#E3F8F2', '#BDE8DA', '#8FD3C2'], angle: 140 },
];

export const CLOCK_COLORS = ['#FFFFFF', '#F2F5FA', '#AFC5F5', '#CBB8F5', '#AADCCB', '#F5C6A5', '#F4B9B6', '#E8CB9D', '#FFE08A', '#8FE3F0', '#FF9EC7', '#1D2533'];
export const BG_COLORS = ['#000000', '#0C1018', '#151B27', '#1B2440', '#2B1E3F', '#0E1F17', '#3A1428', '#2E1B10', '#F6F8FC', '#FFFFFF'];

export const DEFAULT_STUDY_MODE: StudyModeSettings = {
  format: 'hms',
  hour12: false,
  font: 'inter',
  weight: 600,
  size: 90,
  color: '#F2F5FA',
  glow: true,
  secondsStyle: 'same',
  animateDigits: true,
  background: 'aurora',
  bgColor: '#0C1018',
  gradient: ['#0C1018', '#1B2440', '#3A2B5C'],
  gradientAngle: 160,
  imageDim: 35,
  imageBlur: 0,
  showDate: true,
  showExam: false,
  pixelShift: true,
};

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
const color = (v: unknown, fallback: string) => (typeof v === 'string' && isHexColor(v) ? v.toUpperCase() : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Prüft gespeicherte Einstellungen und ersetzt ungültige Werte durch Standards. */
export function sanitizeStudyMode(input: unknown): StudyModeSettings {
  const d = DEFAULT_STUDY_MODE;
  const o = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof StudyModeSettings, unknown>>;
  const font = oneOf(o.font, CLOCK_FONTS.map((f) => f.id), d.font);
  const fontDef = CLOCK_FONTS.find((f) => f.id === font)!;
  const g = Array.isArray(o.gradient) ? o.gradient : [];
  return {
    format: oneOf(o.format, ['hm', 'hms'] as const, d.format),
    hour12: bool(o.hour12, d.hour12),
    font,
    weight: clamp(o.weight, fontDef.min, fontDef.max, fontDef.defaultWeight),
    size: clamp(o.size, 40, 100, d.size),
    color: color(o.color, d.color),
    glow: bool(o.glow, d.glow),
    secondsStyle: oneOf(o.secondsStyle, ['same', 'small'] as const, d.secondsStyle),
    animateDigits: bool(o.animateDigits, d.animateDigits),
    background: oneOf(o.background, ['mountains', 'solid', 'gradient', 'aurora', 'image'] as const, d.background),
    bgColor: color(o.bgColor, d.bgColor),
    gradient: [color(g[0], d.gradient[0]), color(g[1], d.gradient[1]), color(g[2], d.gradient[2])],
    gradientAngle: clamp(o.gradientAngle, 0, 360, d.gradientAngle),
    imageDim: clamp(o.imageDim, 0, 85, d.imageDim),
    imageBlur: clamp(o.imageBlur, 0, 24, d.imageBlur),
    showDate: bool(o.showDate, d.showDate),
    showExam: bool(o.showExam, d.showExam),
    pixelShift: bool(o.pixelShift, d.pixelShift),
  };
}

export interface ClockParts {
  hours: string;
  minutes: string;
  seconds: string | null;
  period: 'AM' | 'PM' | null;
}

/** Zerlegt eine Uhrzeit (Ortszeit des Geräts) für die Anzeige. */
export function clockParts(date: Date, settings: Pick<StudyModeSettings, 'format' | 'hour12'>): ClockParts {
  const h = date.getHours();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = settings.hour12 ? String(h % 12 === 0 ? 12 : h % 12) : pad(h);
  return {
    hours,
    minutes: pad(date.getMinutes()),
    seconds: settings.format === 'hms' ? pad(date.getSeconds()) : null,
    period: settings.hour12 ? (h < 12 ? 'AM' : 'PM') : null,
  };
}

// ---------------------------------------------------------------------
// Speicherung (pro Gerät)
// ---------------------------------------------------------------------
const KEY = 'studyspace.studymode.v1';
const IMAGE_KEY = 'studyspace.studymode.image.v1';

export function loadStudyMode(): StudyModeSettings {
  try {
    return sanitizeStudyMode(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return DEFAULT_STUDY_MODE;
  }
}

export function saveStudyMode(s: StudyModeSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* nicht verfügbar – gilt dann nur für diese Sitzung */
  }
}

export function loadStudyImage(): string | null {
  try {
    const v = localStorage.getItem(IMAGE_KEY);
    return v && v.startsWith('data:image/') ? v : null;
  } catch {
    return null;
  }
}

/** Speichert das Hintergrundbild. Gibt false zurück, wenn der Speicher nicht reicht. */
export function saveStudyImage(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(IMAGE_KEY, dataUrl);
    else localStorage.removeItem(IMAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Verkleinert ein Bild im Browser (max. 1920 px, JPEG), damit es lokal gespeichert werden kann. */
export async function resizeImage(file: File, maxSide = 1920, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Alle Schriften laden (für die Vorschau in der Schriftauswahl) */
export function loadAllClockFonts(): void {
  for (const f of CLOCK_FONTS) void loadClockFont(f.id);
}

/** Lädt die gewählte Schriftart erst bei Bedarf (kleineres Start-Bundle). */
export function loadClockFont(font: ClockFont): Promise<unknown> {
  switch (font) {
    case 'rounded':
      return import('@fontsource-variable/nunito');
    case 'grotesk':
      return import('@fontsource-variable/space-grotesk');
    case 'mono':
      return import('@fontsource-variable/jetbrains-mono');
    case 'serif':
      return import('@fontsource-variable/playfair-display');
    case 'digital':
      return import('@fontsource-variable/orbitron');
    case 'clean':
      return import('@fontsource-variable/montserrat');
    case 'geo':
      return import('@fontsource-variable/outfit');
    case 'future':
      return import('@fontsource-variable/sora');
    case 'elegant':
      return import('@fontsource-variable/fraunces');
    case 'hand':
      return import('@fontsource-variable/caveat');
    case 'soft':
      return import('@fontsource-variable/comfortaa');
    case 'bold':
      return import('@fontsource-variable/bricolage-grotesque');
    default:
      return Promise.resolve();
  }
}
