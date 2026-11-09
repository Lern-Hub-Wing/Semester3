// Erzeugt App-Icons, Favicon und iOS-Startbildschirme aus einem SVG.
// Aufruf: npm run icons  (benötigt Playwright + Chromium)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright wird per require geladen, damit eine global installierte Version genutzt werden kann.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Gleiche Geometrie wie src/components/Logo.tsx (MARK), viewBox 2 4 44 36
const MARK = {
  back: 'M20 36 L31.5 15 L44 36 Z',
  front: 'M4 36 L18.5 10 L33 36 Z',
  snowFront: 'M18.5 10 L23.7 19.4 L21.2 17.9 L18.7 20.6 L16.3 17.6 L13.3 19.4 Z',
  snowBack: 'M31.5 15 L35.4 22.2 L33.5 21 L31.7 22.8 L29.8 20.8 L27.7 21.9 Z',
};

/** Berg-Zeichen, zentriert auf (cx, cy) mit Breite w */
function mark(cx, cy, w) {
  const k = w / 44;
  const tx = cx - 24 * k; // Mittelpunkt der viewBox (24, 22)
  const ty = cy - 22 * k;
  return `<g transform="translate(${tx} ${ty}) scale(${k})">
    <path d="${MARK.back}" fill="url(#back)" stroke="url(#back)" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="${MARK.snowBack}" fill="#EEECFF" opacity=".92"/>
    <path d="${MARK.front}" fill="url(#front)" stroke="url(#front)" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="${MARK.snowFront}" fill="#FBFAFF"/>
  </g>`;
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1D1B3F"/><stop offset="1" stop-color="#121129"/>
    </linearGradient>
    <linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C7C1FF"/><stop offset="1" stop-color="#8A82F2"/></linearGradient>
    <linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8F87F0"/><stop offset="1" stop-color="#5D55C9"/></linearGradient>
  </defs>`;
}

function iconSvg(size, { scale = 0.6, rounded = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs()}
    <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="url(#bg)"/>
    ${mark(size / 2, size * 0.5, size * scale)}
  </svg>`;
}

function splashSvg(w, h) {
  const m = Math.min(w, h) * 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs()}
    <rect width="${w}" height="${h}" fill="#121129"/>
    ${mark(w / 2, h * 0.45, m)}
    <text x="${w / 2}" y="${h * 0.45 + m * 0.75}" text-anchor="middle" font-family="Inter, -apple-system, 'Segoe UI', sans-serif"
      font-size="${m * 0.24}" font-weight="650" fill="#F3F2FC" letter-spacing="-0.5">Study<tspan fill="#B3ADFF">Space</tspan></text>
  </svg>`;
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs()}
  <rect width="64" height="64" rx="15" fill="url(#bg)"/>${mark(32, 32, 44)}</svg>`;

/** Einfarbiges Symbol für die Statusleiste (Android-Benachrichtigungen): weiß auf transparent */
function badgeSvg(size) {
  const k = (size * 0.8) / 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="translate(${size / 2 - 24 * k} ${size / 2 - 22 * k}) scale(${k})" fill="#fff">
      <path d="${MARK.back}" opacity=".75"/><path d="${MARK.front}"/>
    </g></svg>`;
}

async function render(page, svg, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: true });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log('✓', out.replace(root, 'public'));
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await render(page, badgeSvg(96), 96, 96, join(root, 'icons/badge-96.png'));
if (process.env.ONLY === 'badge') {
  await browser.close();
  process.exit(0);
}
writeFileSync(join(root, 'favicon.svg'), favicon);
await render(page, iconSvg(192), 192, 192, join(root, 'icons/icon-192.png'));
await render(page, iconSvg(512), 512, 512, join(root, 'icons/icon-512.png'));
await render(page, iconSvg(512, { scale: 0.46 }), 512, 512, join(root, 'icons/icon-maskable-512.png'));
await render(page, iconSvg(180), 180, 180, join(root, 'icons/apple-touch-icon.png'));
await render(page, iconSvg(64, { rounded: true }), 64, 64, join(root, 'icons/favicon-64.png'));
for (const [w, h] of [[1290, 2796], [1179, 2556], [1170, 2532], [750, 1334], [1640, 2360], [2048, 2732]]) {
  await render(page, splashSvg(w, h), w, h, join(root, `splash/splash-${w}x${h}.png`));
}
await browser.close();
