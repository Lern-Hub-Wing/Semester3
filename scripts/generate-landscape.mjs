// Erzeugt die Berglandschaft (SVG-Pfade) für den Hero-Bereich.
// Aufruf: node scripts/generate-landscape.mjs  → src/components/landscape/ridges.ts
// Deterministisch (fester Seed), damit das Bild bei jedem Build gleich bleibt.
import { writeFileSync } from 'node:fs';

const W = 1600;
const H = 720;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Kammlinie per Mittelpunktverschiebung, mit gezielt gesetzten Gipfeln */
function ridge({ seed, base, amp, rough, peaks = [], steps = 7 }) {
  const r = rng(seed);
  const n = 2 ** steps;
  const ys = new Array(n + 1).fill(0);
  ys[0] = (r() - 0.5) * amp;
  ys[n] = (r() - 0.5) * amp;
  for (let size = n, scale = amp; size > 1; size /= 2, scale *= rough) {
    for (let i = size / 2; i < n; i += size) ys[i] = (ys[i - size / 2] + ys[i + size / 2]) / 2 + (r() - 0.5) * scale;
  }
  return ys.map((v, i) => {
    const x = (i / n) * W;
    let y = base + v;
    for (const p of peaks) y -= p.h * Math.exp(-(((x - p.x) / p.w) ** 2));
    return [x, Math.max(20, Math.min(H, y))];
  });
}

/** Nur die Kammlinie (für die mondbeschienene Kante) */
function curve(p, smooth = 1) {
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * smooth, p1[1] + ((p2[1] - p0[1]) / 6) * smooth];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * smooth, p2[1] - ((p3[1] - p1[1]) / 6) * smooth];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Weiche Kurve durch die Punkte (Catmull-Rom → kubische Bézier), geschlossen nach unten */
function toPath(pts, smooth = 1) {
  const p = pts;
  let d = `M${-20},${H + 20} L${-20},${p[0][1].toFixed(1)} L${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * smooth, p1[1] + ((p2[1] - p0[1]) / 6) * smooth];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * smooth, p2[1] - ((p3[1] - p1[1]) / 6) * smooth];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  d += ` L${W + 20},${p[p.length - 1][1].toFixed(1)} L${W + 20},${H + 20} Z`;
  return d;
}

// Gestaffelte Ketten: oben fern und fein, unten nah und dunkel
const farPts = ridge({
  seed: 11, base: 330, amp: 90, rough: 0.6, steps: 7,
  peaks: [
    { x: 1060, w: 120, h: 220 }, { x: 900, w: 80, h: 120 }, { x: 1250, w: 90, h: 150 },
    { x: 640, w: 110, h: 95 }, { x: 330, w: 140, h: 120 }, { x: 1480, w: 120, h: 90 }, { x: 120, w: 90, h: 60 },
  ],
});
const mid1Pts = ridge({ seed: 23, base: 405, amp: 110, rough: 0.58, steps: 7, peaks: [{ x: 470, w: 130, h: 130 }, { x: 760, w: 90, h: 60 }, { x: 1190, w: 150, h: 95 }, { x: 1560, w: 110, h: 70 }] });
const mid2Pts = ridge({ seed: 37, base: 480, amp: 90, rough: 0.6, steps: 7, peaks: [{ x: 180, w: 150, h: 85 }, { x: 1430, w: 150, h: 100 }, { x: 900, w: 200, h: 45 }] });
const nearPts = ridge({ seed: 53, base: 570, amp: 80, rough: 0.6, steps: 7, peaks: [{ x: 1560, w: 220, h: 120 }, { x: 40, w: 200, h: 100 }, { x: 700, w: 260, h: 30 }] });
const layers = {
  far: toPath(farPts),
  farRim: curve(farPts),
  mid1: toPath(mid1Pts),
  mid1Rim: curve(mid1Pts),
  mid2: toPath(mid2Pts),
  near: toPath(nearPts),
};

const stars = [];
{
  const r = rng(7);
  for (let i = 0; i < 70; i++) stars.push([Math.round(r() * W), Math.round(r() * 300), +(0.4 + r() * 1.1).toFixed(2), +(0.25 + r() * 0.6).toFixed(2)]);
}

const out = `// Automatisch erzeugt von scripts/generate-landscape.mjs – nicht von Hand bearbeiten.
export const LANDSCAPE_W = ${W};
export const LANDSCAPE_H = ${H};
export const RIDGES = ${JSON.stringify(layers, null, 2)} as const;
/** [x, y, Radius, Deckkraft] */
export const STARS: [number, number, number, number][] = ${JSON.stringify(stars)};
`;
writeFileSync(new URL('../src/components/landscape/ridges.ts', import.meta.url), out);
console.log('✓ src/components/landscape/ridges.ts', Object.values(layers).reduce((a, d) => a + d.length, 0), 'Zeichen');
