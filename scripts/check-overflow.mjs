// Prüft jede Seite auf seitliches Verrutschen (Überbreite) – Hoch- und
// Querformat, schmales und normales Handy, Tablet.
// Aufruf: npm run build:e2e && node scripts/check-overflow.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, handle, handleFunctions } from './mock-supabase.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}/Semester3/`;
const API = 'https://mock-project.supabase.co';

const routes = [
  '#/', '#/lernplan', '#/lernplan?ansicht=tag', '#/lernplan?ansicht=woche', '#/lernplan?ansicht=monat', '#/lernplan?ansicht=liste', '#/lernplan?ansicht=timeline',
  '#/hausaufgaben', '#/faecher', `#/faecher/${db.modules[4].id}`, '#/team', `#/team/${db.members[0].id}`, '#/materialien',
  '#/fokus', '#/analyse', '#/einstellungen', '#/einstellungen/benachrichtigungen', '#/papierkorb', '#/verlauf', '#/lernmodus',
];
const sizes = [
  ['320 hoch', { width: 320, height: 640 }],
  ['390 hoch', { width: 390, height: 844 }],
  ['844 quer', { width: 844, height: 390 }],
  ['iPad', { width: 820, height: 1180 }],
];

const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VITE_BASE_PATH: '/Semester3/' } });
await new Promise((r) => setTimeout(r, 3500));
const browser = await chromium.launch();
let bad = 0;
try {
  for (const [label, viewport] of sizes) {
    const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 800, hasTouch: true, serviceWorkers: 'block' });
    await ctx.route(`${API}/rest/v1/**`, handle);
    await ctx.route(`${API}/realtime/**`, (r) => r.abort());
    await ctx.route(`${API}/functions/v1/**`, handleFunctions);
    await ctx.addInitScript(() => localStorage.setItem('studyspace.push.onboarding', 'dismissed'));
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await p.waitForTimeout(1200);
    for (const r of routes) {
      await p.evaluate((h) => (location.hash = h), r);
      await p.waitForTimeout(900);
      const res = await p.evaluate((w) => {
        const doc = document.documentElement;
        // Versuch, die Seite seitlich zu verschieben
        window.scrollTo(200, window.scrollY);
        const shifted = window.scrollX !== 0;
        window.scrollTo(0, window.scrollY);
        const offenders = [...document.querySelectorAll('body *')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' || el.closest('[aria-hidden="true"], .ambient, .landscape, .hero-scene')) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.right <= w + 1) return false;
            for (let a = el.parentElement; a; a = a.parentElement) {
              const ox = getComputedStyle(a).overflowX;
              if (a !== document.body && a !== doc && /hidden|clip|auto|scroll/.test(ox)) return false;
            }
            return true;
          })
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px`);
        return { scrollWidth: doc.scrollWidth, shifted, offenders };
      }, viewport.width);
      const ok = res.scrollWidth <= viewport.width + 1 && !res.shifted && res.offenders.length === 0;
      if (!ok) {
        bad++;
        console.log(`✗ ${label} ${r}: scrollWidth ${res.scrollWidth}, verschiebbar ${res.shifted}`, res.offenders);
      }
    }
    console.log(`✓ ${label}: ${routes.length} Seiten geprüft`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(bad ? `\n${bad} Seite(n) mit Überbreite` : '\nKEINE SEITE VERRUTSCHT');
process.exit(bad ? 1 : 0);
