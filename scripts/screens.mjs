// Bildschirmfotos aller wichtigen Ansichten (Smartphone, iPad, Desktop; Hell und Dunkel)
// gegen die nachgebildete Supabase-API – zur visuellen Kontrolle des Designs.
//
// Aufruf:  npm run build:e2e && node scripts/screens.mjs [Zielordner]
//          ONLY=dashboard,team  begrenzt die Seiten
//          DEVICES=iphone,se    begrenzt die Geräte (desktop, ipad, iphone, se = 320 px)
//          AUDIT=1              prüft jede Ansicht zusätzlich automatisch (Dialoge im Bild,
//                               abgeschnittene Texte, zu kleine Tippflächen) → audit.json
//
// Die Beispieldaten existieren nur in diesem Skript (nicht in der App).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
// Hausaufgaben (Migration 005)
const hw = (i, mod, title, due, extra = {}) =>
  db.homework.push(base({ id: `77777777-7777-4777-8777-00000000000${i}`, module_id: M(mod), title, description: null, due_date: addDays(berlinToday, due), earliest_start: null, priority: 2, effort_minutes: null, unit_count: null, deleted_at: null, ...extra }));
const part = (i, h, kind, title, day, sort) =>
  db.homework_parts.push(base({ id: `88888888-8888-4888-8888-0000000000${i}`, homework_id: `77777777-7777-4777-8777-00000000000${h}`, kind, title, planned_date: day === null ? null : addDays(berlinToday, day), sort_order: sort, deleted_at: null }));
if (db.homework) {
  hw(1, 4, 'Übungsblatt 5 – Plankostenrechnung', 4, { priority: 3, unit_count: 3, description: 'Aufgaben 1–4, Abgabe als PDF im Moodle.' });
  part(11, 1, 'subtask', 'Aufgabe 1 und 2', null, 0);
  part(12, 1, 'subtask', 'Aufgabe 3 und 4', null, 1);
  part(13, 1, 'unit', 'Arbeitseinheit 1 von 3', 0, 1000);
  part(14, 1, 'unit', 'Arbeitseinheit 2 von 3', 1, 1001);
  part(15, 1, 'unit', 'Arbeitseinheit 3 von 3', 2, 1002);
  hw(2, 2, 'Laborbericht Wärmeübertragung', 9, { unit_count: 2 });
  part(21, 2, 'unit', 'Arbeitseinheit 1 von 2', 3, 1000);
  part(22, 2, 'unit', 'Arbeitseinheit 2 von 2', 6, 1001);
  hw(3, 3, 'Integrale Übung 7', -1);
  hw(4, 5, 'Skizze Welle-Nabe-Verbindung', 12, { priority: 1 });
  db.homework_completions.push(base({ target_id: '88888888-8888-4888-8888-000000000011', homework_id: '77777777-7777-4777-8777-000000000001', member_id: db.members[0].id, is_completed: true, completed_at: `${berlinToday}T09:00:00.000Z` }));
  db.homework_completions.push(base({ target_id: '77777777-7777-4777-8777-000000000004', homework_id: '77777777-7777-4777-8777-000000000004', member_id: db.members[1].id, is_completed: true, completed_at: `${berlinToday}T09:00:00.000Z` }));
}
// Fokuszeiten dieser Woche (für die Fokus-Statistik)
{
  const minutes = [50, 75, 40, 100, 70, 110, 165];
  minutes.forEach((m, i) => {
    const day = addDays(berlinToday, i - 6);
    const start = new Date(`${day}T08:00:00Z`);
    const end = new Date(start.getTime() + m * 60000);
    db.focus_sessions.push({ id: `99999999-9999-4999-8999-00000000000${i}`, member_id: db.members[0].id, module_id: null, started_at: start.toISOString(), ended_at: end.toISOString(), duration_seconds: m * 60, created_at: end.toISOString() });
  });
}
// Fokuszeiten der anderen (Lernzeit der Woche im Team), eine Sitzung über Mitternacht
{
  const weekStart = (() => {
    const d = new Date(`${berlinToday}T12:00:00Z`);
    return addDays(berlinToday, -((d.getUTCDay() + 6) % 7));
  })();
  const rows = [
    [1, 0, '17:00', 95], [1, 1, '18:30', 120], [1, 2, '07:30', 45],
    [2, 0, '10:00', 60], [2, 1, '21:50', 70],
    [3, 1, '09:00', 25],
  ];
  rows.forEach(([mi, day, hhmm, min], i) => {
    const d = addDays(weekStart, day);
    if (d > berlinToday) return;
    const start = new Date(`${d}T${hhmm}:00Z`);
    const end = new Date(start.getTime() + min * 60000);
    if (end > new Date()) return;
    db.focus_sessions.push({ id: `99999999-9999-4999-8999-1000000000${String(i).padStart(2, '0')}`, member_id: db.members[mi].id, module_id: null, started_at: start.toISOString(), ended_at: end.toISOString(), duration_seconds: min * 60, created_at: end.toISOString() });
  });
}
// Musik-Bibliothek (Beispiel-IDs; Vorschaubilder werden in Screenshots nicht geladen)
if (db.music_tracks) {
  [['lofi', 'Lofi Study', 'jfKfPfyJRdk'], ['lofi', 'Lofi 2', '5qap5aO4i9A'], ['regen', 'Leichter Regen', 'mPZkdNFkNps'], ['gewitter', 'Regen & Donner', 'nDq6TstdEi8'], ['kamin', 'Kaminfeuer', 'L_LUpnjgPso']].forEach(([category, title, youtube_id], i) =>
    db.music_tracks.push(base({ id: `aaaaaaaa-1111-4111-8111-00000000000${i}`, category, title, youtube_id, start_seconds: null, sort_order: i, deleted_at: null })),
  );
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
  // kleinstes unterstütztes Display (iPhone SE 1. Generation)
  ['se', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone 14 Pro'].userAgent }],
];
const mobileOnly = (fn) => Object.assign(fn, { mobileOnly: true });
const press = (name) => async (page) => page.getByRole('button', { name }).first().click();
const pages = [
  ['picker', null],
  ['dashboard', '#/'],
  ['lernplan', '#/lernplan'],
  ['lernplan-monat', '#/lernplan?ansicht=monat'],
  ['lernplan-tag', '#/lernplan?ansicht=tag'],
  ['lernplan-liste', '#/lernplan?ansicht=liste'],
  ['timeline', '#/lernplan?ansicht=timeline'],
  ['lerntag-neu', '#/lernplan', 'Neuer Lerntag'],
  ['faecher', '#/faecher'],
  ['fach', `#/faecher/${db.modules[0].id}`],
  ['pruefung-neu', '#/faecher', 'Prüfung'],
  ['fach-neu', '#/faecher', 'Fach'],
  ['team', '#/team'],
  ['person', `#/team/${db.members[0].id}`],
  ['hausaufgaben', '#/hausaufgaben'],
  ['hausaufgabe-neu', '#/hausaufgaben', 'Neue Hausaufgabe'],
  ['materialien', '#/materialien'],
  ['musik', '#/musik'],
  ['musik-neu', '#/musik', 'Neu'],
  ['fokus', '#/fokus'],
  ['fokus-einstellungen', '#/fokus', 'Fokus-Einstellungen'],
  ['fokus-musik', '#/fokus', 'Musik'],
  ['analyse', '#/analyse'],
  ['einstellungen', '#/einstellungen'],
  ['einst-darstellung', '#/einstellungen/darstellung'],
  ['einst-personen', '#/einstellungen/personen'],
  ['einst-faecher', '#/einstellungen/faecher'],
  ['einst-daten', '#/einstellungen/daten'],
  ['einst-info', '#/einstellungen/info'],
  ['benachrichtigungen', '#/einstellungen/benachrichtigungen'],
  ['papierkorb', '#/papierkorb'],
  ['verlauf', '#/verlauf'],
  ['suche', '#/', 'Suche öffnen'],
  ['profilmenue', '#/', /Profilmenü/],
  ['mehr', '#/', mobileOnly(async (page) => page.getByRole('link', { name: 'Mehr' }).or(page.getByRole('tab', { name: 'Mehr' })).or(page.getByRole('button', { name: 'Mehr' })).first().click())],
];

/** Automatische Prüfung der gerade sichtbaren Ansicht (läuft im Browser). */
function inspect(touch) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  const txt = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48);
  const out = { dialogs: [], truncated: [], small: [] };
  // Dialoge und Menüs müssen vollständig im Bild liegen
  for (const d of document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')) {
    if (!visible(d)) continue;
    const r = d.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) out.dialogs.push(`${txt(d).slice(0, 30)} → ${Math.round(r.left)},${Math.round(r.top)} – ${Math.round(r.right)},${Math.round(r.bottom)} (Bild ${vw}×${vh})`);
  }
  // Abgeschnittene Texte („…“)
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 3) continue;
    const st = getComputedStyle(el);
    const clamp = st.webkitLineClamp && st.webkitLineClamp !== 'none';
    if ((st.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (clamp && el.scrollHeight > el.clientHeight + 2)) {
      const t = txt(el);
      if (t && !seen.has(t)) (seen.add(t), out.truncated.push(t));
    }
  }
  // Tippflächen (nur Touch-Geräte): mindestens 32 px in beide Richtungen
  if (touch) {
    for (const el of document.querySelectorAll('button, a[href], [role=button], [role=switch], [role=checkbox], [role=radio], select, input:not([type=hidden])')) {
      if (!visible(el) || el.closest('[inert]') || el.closest('p, li p')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 32 || r.height < 32) out.small.push(`${txt(el) || el.tagName} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    out.small = [...new Set(out.small)];
  }
  return out;
}
const audit = {};

try {
  for (const scheme of ['dark', 'light']) {
    for (const [device, opts] of targets) {
      if (process.env.DEVICES && !process.env.DEVICES.split(',').includes(device)) continue;
      const ctx = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: 'block', ...opts, colorScheme: scheme });
      await ctx.route(`${API}/rest/v1/**`, handle);
      await ctx.route(`${API}/realtime/**`, (r) => r.abort());
      await ctx.route(`${API}/functions/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await ctx.route(/https:\/\/(www\.youtube\.com|i\.ytimg\.com)\//, (r) => r.abort());
      await ctx.addInitScript(() => {
        localStorage.setItem('studyspace.push.onboarding', 'dismissed');
        // Laufende Fokus-Session (seit 6 Minuten), damit der Countdown sichtbar läuft
        if (!sessionStorage.getItem('seeded')) {
          const now = Date.now();
          localStorage.setItem('studyspace.focus.v1', JSON.stringify({ timer: { phase: 'focus', long: false, round: 2, durationSec: 1500, endsAt: now + 19 * 60_000, pausedRemainingSec: null, startedAt: now - 6 * 60_000, elapsedBeforePauseSec: 0, finished: false, moduleId: null }, settings: { preset: 'klassisch' } }));
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
      // FLIGHT=1: Bildfolge des Übergangs Profilwahl → Dashboard (Berg gleitet ins Fenster)
      if (process.env.FLIGHT) {
        const t0 = Date.now();
        for (let k = 0; Date.now() - t0 < 2000; k++) {
          const ms = Date.now() - t0;
          await page.screenshot({ path: join(OUT, `${device}-${scheme}-flight-${String(k).padStart(2, '0')}-${ms}.jpg`), type: 'jpeg', quality: 40, scale: 'css' });
        }
      }
      await page.getByRole('heading', { name: /Luk/ }).first().waitFor();
      for (const [name, hash, click] of pages.slice(1)) {
        if (ONLY && !ONLY.includes(name)) continue;
        await page.evaluate((h) => (location.hash = h), hash);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(2300);
        if (click) {
          if (click.mobileOnly && !opts.isMobile) continue;
          try {
            if (typeof click === 'function') await click(page);
            else await page.getByRole('button', { name: click, exact: typeof click === 'string' }).first().click({ timeout: 5000 });
          } catch (e) {
            console.log(`  ! ${device} ${name}: Aktion nicht möglich (${String(e).split('\n')[0].slice(0, 90)})`);
            (audit[`${device}-${scheme}`] ??= {})[name] = { fehler: 'Aktion nicht möglich' };
            continue;
          }
          await page.waitForTimeout(900);
        }
        await page.screenshot({ path: join(OUT, `${device}-${scheme}-${name}.png`), fullPage: process.env.FULL === '1' });
        if (process.env.AUDIT) {
          const res = await page.evaluate(inspect, !!opts.hasTouch);
          if (res.dialogs.length || res.truncated.length || res.small.length) (audit[`${device}-${scheme}`] ??= {})[name] = res;
        }
        if (click) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(350);
        }
      }
      await ctx.close();
      console.log(`✓ ${device} ${scheme}`);
    }
  }
  if (process.env.AUDIT) writeFileSync(join(OUT, 'audit.json'), JSON.stringify(audit, null, 2));
} finally {
  await browser.close();
  server.kill();
}
