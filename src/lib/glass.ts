/**
 * Durchsichtigkeit der Glasflächen (Regler in den Einstellungen).
 * 0 = milchig/dicht · 50 = Standard · 100 = sehr klar.
 * Ergebnis ist der Faktor --lg-k, mit dem Füllung und Unschärfe skaliert werden.
 */
export const GLASS_CLARITY_DEFAULT = 50;

export function clampClarity(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : GLASS_CLARITY_DEFAULT;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** 100 → 0,25 (klar) · 50 → 1 (Standard) · 0 → 4 (milchig) */
export function glassFactor(clarity: number): number {
  return Math.round(2 ** ((50 - clampClarity(clarity)) / 25) * 1000) / 1000;
}

export function clarityLabel(clarity: number): string {
  const c = clampClarity(clarity);
  if (c >= 85) return 'Sehr klar';
  if (c >= 60) return 'Klar';
  if (c >= 40) return 'Ausgewogen';
  if (c >= 15) return 'Milchig';
  return 'Sehr milchig';
}
