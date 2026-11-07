// Bildschirmfotos aller wichtigen Ansichten (Smartphone, iPad, Desktop; Hell und Dunkel)
// gegen die nachgebildete Supabase-API – zur visuellen Kontrolle des Designs.
//
// Aufruf:  npm run build:e2e && node scripts/screens.mjs [Zielordner]
//          ONLY=dashboard,team  begrenzt die Seiten
//
// Die Beispieldaten existieren nur in diesem Skript (nicht in der App).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, handle, base } from './mock-supabase.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'screenshots-local'));
const API = 'https://mock-project.supabase.co';
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}/Semester3/`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
mkdirSync(OUT, { recursive: true });

// ---- Beispieldaten ----------------------------------------------------
const berlinToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const M = (i) => db.modules[i].id;
const plan = [
  [-2, 4, 'Kostenartenrechnung', ['Einzel- und Gemeinkosten', 'Kalkulatorische Kosten', 'Übungsblatt 3']],
  [-1, 0, 'Werkstoffprüfung', ['Zugversuch', 'Härteprüfung Brinell/Vickers']],
  [0, 4, 'Kostenstellenrechnung', ['Anbauverfahren verstehen', 'Stufenleiterverfahren verstehen', 'Übungsaufgaben lösen', 'Zusammenfassung wiederholen']],
  [0, 3, 'Integralrechnung', ['Partielle Integration', 'Substitution']],
  [1, 2, 'Erster Hauptsatz', ['Geschlossene Systeme', 'Offene Systeme', 'Aufgaben Kapitel 2']],
  [2, 1, 'Lineare Optimierung', ['Simplex-Verfahren', 'Dualität']],
  [4, 5, 'Normteile', ['Schraubenverbindungen', 'Passungen']],
  [7, 0, 'Eisen-Kohlenstoff-Diagramm', ['Phasen lesen', 'Abkühlkurven']],
];
let n = 0;
for (const [offset, mod, title, tasks] of plan) {
  n++;
  const entryId = `55555555-5555-4555-8555-0000000000${String(n).padStart(2, '0')}`;
  db.study_entries.push(base({ id: entryId, module_id: M(mod), topic_id: null, study_date: addDays(berlinToday, offset), title, description: null, sort_order: n, deleted_at: null }));
  tasks.forEach((t, i) => {
    const taskId = `66666666-6666-4666-8666-0000000${String(n).padStart(2, '0')}${String(i).padStart(3, '0')}`;
    db.tasks.push(base({ id: taskId, study_entry_id: entryId, title: t, description: null, sort_order: i + 1, deleted_at: null }));
    db.members.forEach((m, mi) => {
      // Vergangene Tage weitgehend erledigt, heute teilweise, Zukunft offen
      const done = offset < 0 ? (i + mi) % 3 !== 0 : offset === 0 ? (i + mi) % 2 === 0 : false;
      if (done) {
        const day = addDays(berlinToday, Math.min(offset, 0) - (mi % 2));
        db.task_completions.push(base({ task_id: taskId, member_id: m.id, is_completed: true, completed_at: `${day}T${10 + mi}:15:00.000Z` }));
      }
    });
  });
}
db.members[0].name = 'Luk';
db.members[1].name = 'Diana';
db.members[2].name = 'Jonas';
db.members[3].name = 'Mira';

// ---- Ablauf ------------------------------------------------------------
const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VITE_BASE_PATH: '/Semester3/' } });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview timeout')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), res()));
});

const browser = await chromium.launch();
const targets = [
  ['desktop', { viewport: { width: 1440, height: 960 } }],
  ['ipad', { ...devices['iPad Pro 11'], deviceScaleFactor: 1 }],
  ['iphone', { ...devices['iPhone 14 Pro'], deviceScaleFactor: 2 }],
];
const pages = [
  ['picker', null],
  ['dashboard', '#/'],
  ['lernplan', '#/lernplan'],
  ['timeline', '#/lernplan?ansicht=timeline'],
  ['faecher', '#/faecher'],
  ['team', '#/team'],
  ['pruefungen', '#/pruefungen'],
  ['fokus', '#/fokus'],
  ['fokus-vollbild', '#/fokus/vollbild'],
  ['analyse', '#/analyse'],
  ['einstellungen', '#/einstellungen'],
  ['benachrichtigungen', '#/einstellungen/benachrichtigungen'],
];
try {
  for (const scheme of ['dark', 'light']) {
    for (const [device, opts] of targets) {
      if (process.env.DEVICES && !process.env.DEVICES.split(',').includes(device)) continue;
      const ctx = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: 'block', ...opts, colorScheme: scheme });
      await ctx.route(`${API}/rest/v1/**`, handle);
      await ctx.route(`${API}/realtime/**`, (r) => r.abort());
      await ctx.route(`${API}/functions/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await ctx.addInitScript(() => {
        localStorage.setItem('studyspace.push.onboarding', 'dismissed');
        // Laufende Fokus-Session (seit 6 Minuten), damit der Countdown sichtbar läuft
        if (!sessionStorage.getItem('seeded')) {
          const now = Date.now();
          localStorage.setItem('studyspace.focus.v1', JSON.stringify({ timer: { phase: 'focus', durationSec: 1500, endsAt: now + 19 * 60_000, pausedRemainingSec: null, startedAt: now - 6 * 60_000, elapsedBeforePauseSec: 0, moduleId: null }, settings: { presetIndex: 0, sound: true } }));
          sessionStorage.setItem('seeded', '1');
        }
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('  pageerror', String(e)));
      await page.goto(BASE);
      await page.getByRole('heading', { name: 'Wer lernt heute?' }).waitFor();
      await page.waitForTimeout(2600);
      if (!ONLY || ONLY.includes('picker')) await page.screenshot({ path: join(OUT, `${device}-${scheme}-picker.png`) });
      await page.getByRole('button', { name: 'Als Luk lernen' }).click();
      await page.getByRole('heading', { name: /Luk/ }).first().waitFor();
      for (const [name, hash] of pages.slice(1)) {
        if (ONLY && !ONLY.includes(name)) continue;
        await page.evaluate((h) => (location.hash = h), hash);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(2300);
        await page.screenshot({ path: join(OUT, `${device}-${scheme}-${name}.png`), fullPage: process.env.FULL === '1' });
      }
      await ctx.close();
      console.log(`✓ ${device} ${scheme}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
