/**
 * Ziffern-Maße je Schrift: Jede Uhr-Schrift hat andere Ziffernbreiten und
 * -höhen (z. B. „Digital“ sehr breit, „Handschrift“ mit Schwüngen). Statt fester
 * Boxen (→ abgeschnittene oder überlappende Ziffern) wird einmal gemessen.
 */
import { useEffect, useState } from 'react';

export interface DigitMetrics {
  /** breiteste Ziffer (em) */
  width: number;
  /** Platz über der Grundlinie (em) */
  ascent: number;
  /** Platz unter der Grundlinie (em) */
  descent: number;
  /** Breite des Doppelpunkts (em) */
  colon: number;
}

const FALLBACK: DigitMetrics = { width: 0.62, ascent: 0.75, descent: 0.05, colon: 0.3 };
const cache = new Map<string, DigitMetrics>();

export function measureDigits(family: string, weight: number): DigitMetrics {
  const key = `${weight}|${family}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return FALLBACK;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return FALLBACK;
  ctx.font = `${weight} 100px ${family}`;
  let width = 0;
  let ascent = 0;
  let descent = 0;
  for (const d of '0123456789') {
    const m = ctx.measureText(d);
    width = Math.max(width, m.width);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || 75);
    descent = Math.max(descent, m.actualBoundingBoxDescent || 0);
  }
  const colon = ctx.measureText(':').width;
  const out: DigitMetrics = {
    width: Math.max(0.45, width / 100),
    ascent: ascent / 100,
    descent: descent / 100,
    colon: Math.max(0.22, colon / 100),
  };
  // Nur speichern, wenn die Schrift wirklich geladen ist (sonst misst man die Ersatzschrift).
  // document.fonts.check() hilft nicht: Es meldet „true“, solange die Schrift noch gar nicht eingebunden ist.
  if (primaryLoaded(family)) cache.set(key, out);
  return out;
}

function primaryLoaded(family: string): boolean {
  const primary = family.split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
  if (/^(system-ui|ui-|sans-serif|serif|monospace|cursive)/.test(primary)) return true;
  if (!document.fonts) return true;
  for (const f of document.fonts) if (f.family.replace(/['"]/g, '') === primary && f.status === 'loaded') return true;
  return false;
}

/** Maße für die aktuelle Schrift – misst nach dem Laden der Schrift neu. */
export function useDigitMetrics(family: string | undefined, weight: number | undefined): DigitMetrics {
  const fam = family ?? 'system-ui';
  const w = weight ?? 600;
  const [m, setM] = useState(() => measureDigits(fam, w));
  useEffect(() => {
    let alive = true;
    setM(measureDigits(fam, w));
    const again = () => alive && setM(measureDigits(fam, w));
    void document.fonts?.load?.(`${w} 100px ${fam}`, '0123456789:').then(again, () => undefined);
    // Schrift wird oft erst danach eingebunden (nachgeladene CSS-Datei) → beim Fertigladen neu messen
    document.fonts?.addEventListener?.('loadingdone', again);
    return () => {
      alive = false;
      document.fonts?.removeEventListener?.('loadingdone', again);
    };
  }, [fam, w]);
  return m;
}
