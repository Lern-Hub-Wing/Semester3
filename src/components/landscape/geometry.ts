import { PEAK } from './peak';

/** Lage des Panoramabilds in einem Rahmen (px, relativ zur linken oberen Ecke des Rahmens). */
export interface ImgGeo {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Wie `object-fit: cover` mit `object-position: px py` (Anteile 0–1). */
export function coverGeometry(w: number, h: number, px = 0.5, py = 0.4): ImgGeo {
  const scale = Math.max(w / PEAK.width, h / PEAK.height);
  const width = PEAK.width * scale;
  const height = PEAK.height * scale;
  return { left: (w - width) * px, top: (h - height) * py, width, height };
}

/**
 * Lage im Fenster mit herausragendem Gipfel: der Gipfel sitzt `tip` px unter
 * der Oberkante des um `pop` px nach oben erweiterten Rahmens, waagerecht mittig.
 * `top` bezieht sich auf die Oberkante des erweiterten Rahmens.
 */
export function peakGeometry(w: number, h: number, pop: number, tip = 3): ImgGeo {
  const total = h + pop;
  const scale = Math.max(w / PEAK.width, (total - tip) / ((1 - PEAK.y) * PEAK.height));
  const width = PEAK.width * scale;
  const height = PEAK.height * scale;
  const left = Math.min(0, Math.max(w - width, w / 2 - PEAK.x * width));
  const top = tip - PEAK.y * height;
  return { left, top, width, height };
}
