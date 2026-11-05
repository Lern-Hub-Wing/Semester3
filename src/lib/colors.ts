/** Farbwerkzeuge für Personen- und Fachfarben. */

export const DEFAULT_MEMBER_COLORS = ['#AFC5F5', '#CBB8F5', '#AADCCB', '#F5C6A5'];

/** Harmonierende Pastellfarben für den Color Picker. */
export const PASTEL_PALETTE = [
  '#AFC5F5', '#B4D3F2', '#A6DED7', '#AADCCB', '#C3D7AD', '#DCE3A3',
  '#E8CB9D', '#F5C6A5', '#F4B9B6', '#F2B8CF', '#E6BDEB', '#CBB8F5',
  '#C9B7F2', '#B8C0F0', '#A9D4E8', '#BFE3C0', '#F0D9A8', '#D9C2B0',
];

export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function normalizeHex(value: string): string {
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return v.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** rgba()-String mit Transparenz */
export function alpha(hex: string, a: number): string {
  if (!isHexColor(hex)) return `rgba(150,160,180,${a})`;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Relative Helligkeit nach WCAG */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Lesbare Schriftfarbe auf einer Farbfläche */
export function readableTextOn(hex: string): string {
  return contrastRatio(hex, '#1D2533') >= contrastRatio(hex, '#FFFFFF') ? '#1D2533' : '#FFFFFF';
}

/** Dunklere Variante (für Text/Linien in Fachfarbe im Light Mode) */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Nächste noch freie Standardfarbe für eine neue Person */
export function suggestColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()));
  return PASTEL_PALETTE.find((c) => !taken.has(c)) ?? PASTEL_PALETTE[used.length % PASTEL_PALETTE.length];
}

/** Initialen für Avatare: "Person 1" → "P1", "Anna Lena" → "AL" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
