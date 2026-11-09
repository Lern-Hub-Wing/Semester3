// Rendert das Berg-Panorama (Alpenglühen) für Hero-Karten und Fokus.
// Kleines Höhenfeld-Raymarching in reinem JavaScript: Gelände aus
// „ridged multifractal“-Rauschen, Schnee je nach Höhe/Neigung, tiefe
// Abendsonne mit weichen Schatten, Dunst zum Horizont.
// Ergebnis: public/scenery/mountains.webp (+ .jpg als Rückfall).
//
// Aufruf: node scripts/render-mountains.mjs
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = Number(process.env.W ?? 2000);
const H = Number(process.env.H ?? 1000);

// ---------------------------------------------------------------------
// Deterministisches Rauschen
// ---------------------------------------------------------------------
let seed = 20261109;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const G = 1024; // Gitter des Höhenfelds
const perm = new Uint16Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const grad = (h, x, y) => {
  const g = h & 7;
  const u = g < 4 ? x : y;
  const v = g < 4 ? y : x;
  return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v);
};
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function perlin(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const a = perm[X] + Y, b = perm[X + 1] + Y;
  const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y));
  const l2 = grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1));
  return (l1 + v * (l2 - l1)) * 0.5;
}
function ridged(x, y) {
  let sum = 0, amp = 0.55, freq = 1, weight = 1;
  for (let o = 0; o < 9; o++) {
    let n = 1 - Math.abs(perlin(x * freq, y * freq));
    n *= n;
    n *= weight;
    weight = Math.min(1, Math.max(0, n * 2));
    sum += n * amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// ---------------------------------------------------------------------
// Höhenfeld: Welt x ∈ [-1, 1], z ∈ [0, 2] (z = Tiefe vom Betrachter weg)
// ---------------------------------------------------------------------
console.time('höhenfeld');
const hf = new Float32Array(G * G);
for (let j = 0; j < G; j++) {
  for (let i = 0; i < G; i++) {
    const x = (i / (G - 1)) * 2 - 1;
    const z = (j / (G - 1)) * 2;
    const r = ridged(x * 2.4 + 11.3, z * 2.4 + 4.1);
    // markantes Hauptmassiv in der Mitte hinten, Nebengipfel rechts/links
    const peak = (cx, cz, rad, a) => a * Math.exp(-((x - cx) ** 2 + ((z - cz) * 0.9) ** 2) / (rad * rad));
    const massif = peak(0.0, 1.6, 0.22, 0.56) + peak(0.02, 1.62, 0.5, 0.12) + peak(0.55, 1.4, 0.22, 0.3) + peak(-0.6, 1.35, 0.25, 0.26) + peak(0.92, 1.75, 0.3, 0.22);
    // Grundgelände: vorne niedrige Hügel, nach hinten ansteigend
    let h = r * (0.16 + 0.18 * Math.min(1, z / 1.4)) + massif * (0.88 + 0.25 * r);
    hf[j * G + i] = h;
  }
}
console.timeEnd('höhenfeld');

function height(x, z) {
  const fx = ((x + 1) / 2) * (G - 1);
  const fz = (z / 2) * (G - 1);
  if (fx < 0 || fz < 0 || fx >= G - 1 || fz >= G - 1) return -1;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = hf[j * G + i], b = hf[j * G + i + 1], c = hf[(j + 1) * G + i], d = hf[(j + 1) * G + i + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}
function normal(x, z) {
  const e = 2 / G;
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  const n = [-hx, 2 * e, -hz];
  const l = Math.hypot(...n);
  return n.map((v) => v / l);
}

// ---------------------------------------------------------------------
// Kamera, Licht, Farben
// ---------------------------------------------------------------------
const cam = { x: 0, y: 0.52, z: -0.35 };
const pitch = 0.0;
const fov = 0.62;
const sun = norm([-0.72, 0.2, -0.38]); // tief von links vorne → rosa Flanken, rechte Seiten im Schatten
function norm(v) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v) => Math.min(1, Math.max(0, v));

const SKY_TOP = [0.035, 0.035, 0.12];
const SKY_MID = [0.22, 0.15, 0.4];
const SKY_HOR = [0.95, 0.52, 0.68];
const SUN_COL = [1.0, 0.47, 0.62];
const AMB = [0.055, 0.05, 0.15];
const FOG = [0.3, 0.22, 0.48];
const ROCK = [0.13, 0.11, 0.2];
const SNOW = [1.0, 0.97, 1.0];

function sky(dy) {
  const t = clamp(dy * 3.1 + 0.03);
  const e = (k) => k * k * (3 - 2 * k);
  return t < 0.4 ? mix(SKY_HOR, SKY_MID, e(t / 0.4)) : mix(SKY_MID, SKY_TOP, e((t - 0.4) / 0.6));
}

function shadow(px, py, pz) {
  let t = 0.01, res = 1;
  for (let s = 0; s < 40 && t < 1.6; s++) {
    const x = px + sun[0] * t, y = py + sun[1] * t, z = pz + sun[2] * t;
    const h = height(x, z);
    if (h < 0) break;
    const d = y - h;
    if (d < 0.0005) return 0;
    res = Math.min(res, (14 * d) / t);
    t += Math.max(0.006, d * 0.6);
  }
  return clamp(res);
}

console.time('render');
const img = new Uint8Array(W * H * 3);
const aspect = W / H;
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const u = ((px + 0.5) / W) * 2 - 1;
    const v = 1 - ((py + 0.5) / H) * 2;
    let dir = norm([u * fov * aspect * 0.5, v * fov * 0.5 + pitch, 1]);
    let t = 0.02, hit = false, x = 0, y = 0, z = 0;
    for (let s = 0; s < 420; s++) {
      x = cam.x + dir[0] * t;
      y = cam.y + dir[1] * t;
      z = cam.z + dir[2] * t;
      if (z > 2 || Math.abs(x) > 1.05) break;
      const h = height(x, z);
      if (h >= 0 && y < h) {
        // feiner nachsetzen
        let a = t - 0.004, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          const yy = cam.y + dir[1] * m;
          if (yy < height(cam.x + dir[0] * m, cam.z + dir[2] * m)) b = m;
          else a = m;
        }
        t = b;
        x = cam.x + dir[0] * t; y = cam.y + dir[1] * t; z = cam.z + dir[2] * t;
        hit = true;
        break;
      }
      t += Math.max(0.0015, t * 0.004, (y - Math.max(h, 0)) * 0.35);
    }
    let col;
    if (!hit) {
      col = sky(dir[1]);
      // Schimmer der untergegangenen Sonne links am Horizont
      const g = Math.max(0, 1 - Math.hypot(u + 0.6, (v + 0.05) * 2.2));
      col = mix(col, [1, 0.72, 0.8], g * g * 0.35);
    } else {
      const n = normal(x, z);
      const hgt = y;
      const slope = n[1];
      // Schnee: über der Schneegrenze und nicht zu steil, mit Rauschen
      const snowLine = 0.5 + perlin(x * 18, z * 18) * 0.07;
      const snow = clamp((hgt - snowLine) * 7) * clamp((slope - 0.38) * 3.5);
      const albedo = mix(ROCK, SNOW, snow);
      const diff = Math.max(0, n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]);
      const sh = diff > 0 ? shadow(x, y + 0.001, z) : 0;
      // Alpenglühen: nur hohe Lagen fangen das letzte Licht, Täler liegen im Schatten
      const glow = clamp((hgt - 0.3) / 0.32);
      const sunLight = SUN_COL.map((c) => c * diff * sh * 3.3 * glow * glow);
      const sky1 = AMB.map((c) => c * (0.45 + 0.55 * slope) * (0.6 + 0.8 * clamp(hgt / 0.6)));
      col = albedo.map((a, i) => a * (sunLight[i] + sky1[i]));
      // Dunst/Luftperspektive
      const fogAmt = 1 - Math.exp(-Math.max(0, t - 0.7) * 0.3);
      const hazeCol = mix(FOG, sky(0.02), 0.35);
      col = mix(col, hazeCol, clamp(fogAmt * 0.7));
      // Bodennebel in Tälern
      const valley = clamp((0.2 - hgt) * 5) * clamp((t - 0.4) * 1.5);
      col = mix(col, [0.45, 0.36, 0.62], valley * 0.55);
    }
    // sanfter Kontrast + Gamma
    const o = (py * W + px) * 3;
    for (let i = 0; i < 3; i++) {
      const c = col[i] / (1 + col[i] * 0.18);
      img[o + i] = Math.round(clamp(Math.pow(c, 1 / 2.05)) * 255);
    }
  }
  if (py % 100 === 0) process.stdout.write(`\r${Math.round((py / H) * 100)} %`);
}
console.log();
console.timeEnd('render');

// Sterne (sehr dezent, nur oben im Himmel)
for (let s = 0; s < Math.round((W * H) / 14000); s++) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H * 0.3);
  const o = (y * W + x) * 3;
  if (img[o] > 120) continue;
  const b = 90 + rnd() * 110 * (1 - y / (H * 0.3));
  for (let i = 0; i < 3; i++) img[o + i] = Math.max(img[o + i], Math.round(b));
}

// ---------------------------------------------------------------------
// PNG schreiben, dann im Browser zu WebP/JPEG kodieren
// ---------------------------------------------------------------------
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = join(ROOT, 'public/scenery');
mkdirSync(outDir, { recursive: true });
const pngBuf = png(W, H, img);
if (process.env.KEEP_PNG) writeFileSync(join(outDir, 'mountains.png'), pngBuf);

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const enc = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const out = {};
  for (const [name, w] of [['', img.width], ['-1200', 1200]]) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((img.height * w) / img.width);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    out[`webp${name}`] = c.toDataURL('image/webp', 0.86);
    out[`jpg${name}`] = c.toDataURL('image/jpeg', 0.86);
  }
  return out;
}, pngBuf.toString('base64'));
await browser.close();
for (const [key, data] of Object.entries(enc)) {
  const m = /^(webp|jpg)(-1200)?$/.exec(key);
  const file = `mountains${m[2] ?? ''}.${m[1]}`;
  const buf = Buffer.from(data.split(',')[1], 'base64');
  writeFileSync(join(outDir, file), buf);
  console.log(`${file}: ${Math.round(buf.length / 1024)} KB`);
}
