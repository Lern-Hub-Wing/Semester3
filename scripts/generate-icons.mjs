// Erzeugt App-Icons, Favicon und iOS-Startbildschirme aus einem SVG.
// Aufruf: npm run icons  (benötigt Playwright + Chromium)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright wird per require geladen, damit eine global installierte Version genutzt werden kann.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const COLORS = ['#AFC5F5', '#CBB8F5', '#AADCCB', '#F5C6A5'];

/** Vier Bögen (die Gruppe) ergeben gemeinsam einen vollen Kreis. */
function mark(cx, cy, r, stroke) {
  const len = 2 * Math.PI * r;
  const seg = len / 4;
  const gap = stroke * 1.45;
  const arcs = COLORS.map(
    (c, i) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${seg - gap} ${len - seg + gap}" stroke-dashoffset="${-i * seg - gap / 2}" transform="rotate(-90 ${cx} ${cy})"/>`,
  ).join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r * 1.35}" fill="url(#halo)"/>
    ${arcs}
    <circle cx="${cx}" cy="${cy}" r="${r * 0.36}" fill="url(#core)"/>`;
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#161D2B"/><stop offset="1" stop-color="#0A0E16"/>
    </linearGradient>
    <radialGradient id="glowA" cx="20%" cy="10%" r="70%"><stop offset="0" stop-color="#AFC5F5" stop-opacity=".35"/><stop offset="1" stop-color="#AFC5F5" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="90%" cy="95%" r="70%"><stop offset="0" stop-color="#CBB8F5" stop-opacity=".28"/><stop offset="1" stop-color="#CBB8F5" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo"><stop offset=".55" stop-color="#ffffff" stop-opacity=".07"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <radialGradient id="core" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#DCE4F7"/></radialGradient>
  </defs>`;
}

function iconSvg(size, { scale = 0.25, rounded = false } = {}) {
  const r = size * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs()}
    <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="url(#bg)"/>
    <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="url(#glowA)"/>
    <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="url(#glowB)"/>
    ${mark(size / 2, size / 2, r, r * 0.42)}
  </svg>`;
}

function splashSvg(w, h) {
  const r = Math.min(w, h) * 0.085;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs()}
    <rect width="${w}" height="${h}" fill="#0C1018"/>
    ${mark(w / 2, h * 0.45, r, r * 0.42).replace(/<circle[^>]*url\(#halo\)[^>]*\/>/, '')}
    <text x="${w / 2}" y="${h * 0.45 + r * 2.4}" text-anchor="middle" font-family="Inter, -apple-system, 'Segoe UI', sans-serif"
      font-size="${r * 0.62}" font-weight="600" fill="#F2F5FA" letter-spacing="-0.5">StudySpace</text>
  </svg>`;
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs()}
  <rect width="64" height="64" rx="15" fill="url(#bg)"/>${mark(32, 32, 19, 8.5)}</svg>`;

/** Einfarbiges Symbol für die Statusleiste (Android-Benachrichtigungen): weiß auf transparent */
function badgeSvg(size) {
  const c = size / 2;
  const r = size * 0.3;
  const stroke = size * 0.13;
  const len = 2 * Math.PI * r;
  const seg = len / 4;
  const gap = stroke * 1.45;
  const arcs = [0, 1, 2, 3]
    .map((i) => `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${seg - gap} ${len - seg + gap}" stroke-dashoffset="${-i * seg - gap / 2}" transform="rotate(-90 ${c} ${c})"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}<circle cx="${c}" cy="${c}" r="${r * 0.36}" fill="#fff"/></svg>`;
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
await render(page, iconSvg(512, { scale: 0.2 }), 512, 512, join(root, 'icons/icon-maskable-512.png'));
await render(page, iconSvg(180), 180, 180, join(root, 'icons/apple-touch-icon.png'));
await render(page, iconSvg(64, { rounded: true }), 64, 64, join(root, 'icons/favicon-64.png'));
for (const [w, h] of [[1290, 2796], [1179, 2556], [1170, 2532], [750, 1334], [1640, 2360], [2048, 2732]]) {
  await render(page, splashSvg(w, h), w, h, join(root, `splash/splash-${w}x${h}.png`));
}
await browser.close();
