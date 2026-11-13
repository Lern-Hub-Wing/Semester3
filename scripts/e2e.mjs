// End-to-End-Test im echten Browser (Chromium via Playwright).
//
// Die Supabase-REST-API wird im Browser durch eine kleine In-Memory-
// Nachbildung ersetzt (nur für diesen Test – die App selbst enthält keine
// Demodaten). So laufen alle echten Codepfade: Laden, Speichern,
// optimistische Updates, Versionsprüfung und Fehlerbehandlung.
//
// Aufruf:  npm run build:e2e && npm run test:e2e
//          (SCREENSHOTS=1 speichert Bildschirmfotos in screenshots-local/)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SCREENSHOTS ? join(ROOT, 'screenshots-local') : null;
const API = 'https://mock-project.supabase.co';
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/Semester3/`;

import { db, requests, handle, handleFunctions, push } from './mock-supabase.mjs';

// ---------------------------------------------------------------------
// Testablauf
// ---------------------------------------------------------------------
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
}

/**
 * Headless-Chromium unterstützt die Benachrichtigungsberechtigung nicht
 * (meldet immer „denied“). Für die Push-Tests wird sie wie in einem echten
 * Browser nachgebildet: „default“, bis requestPermission() aufgerufen wird.
 */
function fakeNotificationPermission() {
  window.__permissionRequests = 0;
  let state = localStorage.getItem('e2e.perm') ?? 'default';
  Object.defineProperty(Notification, 'permission', { get: () => state, configurable: true });
  Notification.requestPermission = async () => {
    window.__permissionRequests++;
    state = 'granted';
    localStorage.setItem('e2e.perm', state);
    return state;
  };
}

async function newPage(browser, { freshPush, ...opts } = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: 'block', ...opts });
  await ctx.route(`${API}/rest/v1/**`, handle);
  await ctx.route(`${API}/realtime/**`, (r) => r.abort());
  await ctx.route(`${API}/functions/v1/**`, handleFunctions);
  // Die Push-Einführung nur in den Tests dafür zeigen (sonst überdeckt sie die übrigen Abläufe)
  if (!freshPush) await ctx.addInitScript(() => localStorage.setItem('studyspace.push.onboarding', 'dismissed'));
  await ctx.addInitScript(() => {
    if (typeof navigator.vibrate === 'function') {
      window.__vibrations = [];
      navigator.vibrate = (pattern) => (window.__vibrations.push(pattern), true);
    }
  });
  const page = await ctx.newPage();
  if (process.env.CPU_THROTTLE) {
    // Langsamere Geräte nachbilden (deckt Timing-Fehler auf)
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_THROTTLE) });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|realtime|ERR_FAILED|Failed to load resource/i.test(m.text()) && errors.push(m.text()));
  return { ctx, page, errors };
}

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

async function hasHorizontalOverflow(page) {
  // Gegen die eingestellte Gerätebreite prüfen – nicht gegen window.innerWidth:
  // Mobile Browser (auch iOS Safari) verbreitern den Layout-Viewport mit zu
  // breitem Inhalt, dann wäre innerWidth selbst schon zu groß.
  const width = page.viewportSize()?.width ?? 0;
  return page.evaluate((w) => {
    if (document.documentElement.scrollWidth > w + 1 || window.innerWidth > w + 1) return true;
    // Auch abgeschnittene Überbreite erkennen (body nutzt overflow-x: clip)
    const main = document.querySelector('main') ?? document.body;
    const clipped = (el) => {
      for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
        if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX) && a.getBoundingClientRect().right <= w + 1) return true;
      }
      return false;
    };
    return [...main.querySelectorAll('*')].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > w + 1 && getComputedStyle(el).position !== 'fixed' && !clipped(el);
    });
  }, width);
}

/** Fortschrittskreise: Leuchtschein ohne rechteckige Kanten (Struktur + Pixel). */
async function checkRingGlow(page, label) {
  const info = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg.-rotate-90')];
    return svgs.map((svg) => {
      const size = svg.viewBox.baseVal.width;
      const f = svg.querySelector('filter');
      const blurOnElements = [...svg.querySelectorAll('*')].some((el) => /blur\(/.test(getComputedStyle(el).filter));
      return {
        overflow: getComputedStyle(svg).overflow,
        hasFilter: !!f,
        userSpace: f?.getAttribute('filterUnits') === 'userSpaceOnUse',
        region: f ? Number(f.getAttribute('width')) / size : 0,
        blurOnElements,
      };
    });
  });
  const ok = info.length > 0 && info.every((r) => r.overflow === 'visible' && r.hasFilter && r.userSpace && r.region >= 1.3 && !r.blurOnElements);
  check(ok, `Fortschrittskreise (${label}): Leuchtschein als SVG-Filter mit großer Filterfläche, kein CSS-Blur auf SVG (${info.length} Kreise)`);
  // Pixelprobe: Ecken des Kreis-Quadrats (außerhalb des Kreises) dürfen nicht heller als der Hintergrund sein
  const ring = page.locator('svg.-rotate-90').first();
  const bb = await ring.boundingBox();
  const pad = 14;
  const buf = await page.screenshot({ clip: { x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2 } });
  const diff = await page.evaluate(async ({ b64, pad }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const lum = (x, y) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3;
    };
    // Eine abgeschnittene (rechteckige) Leuchtfläche zeigt sich als Helligkeitssprung
    // genau an der Kante des Quadrats um den Kreis: innen direkt neben der Kante
    // gegen außen direkt neben der Kante – an allen vier Ecken, waagerecht und senkrecht.
    const n = img.width - 1;
    const edges = [];
    for (const [cx, cy, sx, sy] of [[pad, pad, 1, 1], [n - pad, pad, -1, 1], [pad, n - pad, 1, -1], [n - pad, n - pad, -1, -1]]) {
      const y = cy + sy * 4;
      const x = cx + sx * 4;
      edges.push(Math.abs(lum(cx + sx * 2, y) - lum(cx - sx * 2, y)));
      edges.push(Math.abs(lum(x, cy + sy * 2) - lum(x, cy - sy * 2)));
    }
    return Math.max(...edges);
  }, { b64: buf.toString('base64'), pad });
  check(diff <= 4, `Fortschrittskreis (${label}): keine rechteckige Leuchtkante (größter Sprung an der Quadratkante ${diff.toFixed(1)})`);
}

/** Smartphone: Navigation, Glas, Profilbutton, Sticky-Logo, Abstände, Team-Kreise, Haptik. */
async function mobileDesignChecks(p, name) {
  const nav = p.getByRole('navigation', { name: 'Hauptnavigation' }).last();
  const bar = nav;
  const glass = nav.locator('.lg-tab-bar-glass').first();
  // Tab-Leiste wie in der App: Home · Kalender · Aufgaben · Team · Mehr
  for (const [label, hash] of [['Aufgaben', '#/hausaufgaben'], ['Team', '#/team'], ['Kalender', '#/lernplan'], ['Home', '#/']]) {
    await nav.getByRole('link', { name: label }).click();
    await p.waitForTimeout(350);
    check(new URL(p.url()).hash.split('?')[0] === hash, `Tab-Leiste (${name}): Antippen öffnet „${label}“`);
  }
  // Ziehen auf der Leiste: Linse folgt dem Finger, navigiert wird erst beim Loslassen
  const box = await bar.boundingBox();
  const y = box.y + box.height / 2;
  const tab = (i) => box.x + 6 + ((box.width - 12) / 5) * (i + 0.5);
  await p.mouse.move(tab(0), y);
  await p.mouse.down();
  await p.mouse.move(tab(1), y, { steps: 12 });
  await p.waitForTimeout(150);
  const lifted = await bar.evaluate((el) => el.hasAttribute('data-lifted'));
  check(new URL(p.url()).hash === '#/' && lifted, `Tab-Leiste (${name}): Linse folgt beim Ziehen, noch keine Navigation`);
  await p.mouse.up();
  await p.waitForTimeout(500);
  check(new URL(p.url()).hash.split('?')[0] === '#/lernplan', `Tab-Leiste (${name}): Loslassen über „Kalender“ navigiert dorthin (${new URL(p.url()).hash})`);
  // Keine globale Wischnavigation über dem Seiteninhalt
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.mouse.move(60, 320);
  await p.mouse.down();
  await p.mouse.move(330, 320, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  check(new URL(p.url()).hash.split('?')[0] === '#/lernplan', `Tab-Leiste (${name}): Wischen über den Inhalt wechselt keine Seite`);
  await nav.getByRole('link', { name: 'Home' }).click();
  await p.waitForTimeout(300);
  // „Mehr“: gruppierte Liste statt vieler Kacheln, auf kleinen Geräten vollständig erreichbar
  await nav.getByRole('button', { name: 'Mehr' }).click();
  const more = p.getByTestId('more-sheet');
  await more.waitFor();
  const groups = await more.locator('.list-group').count();
  const lastRow = more.getByRole('button', { name: /Papierkorb/ });
  await lastRow.scrollIntoViewIfNeeded();
  const lr = await lastRow.boundingBox();
  check(groups === 3 && lr && lr.y + lr.height <= (p.viewportSize()?.height ?? 0), `Mehr (${name}): drei Gruppen, letzter Eintrag erreichbar (${groups})`);
  check((await more.getByRole('button', { name: /Änderungsverlauf|^Team/ }).count()) === 0 && (await more.getByTestId('more-focus').count()) === 1, `Mehr (${name}): schlicht wie in der App (Fokus oben, Team in der Tab-Leiste)`);
  await more.getByRole('button', { name: /Statistiken/ }).click();
  await p.waitForTimeout(400);
  check(new URL(p.url()).hash === '#/analyse' && (await p.getByTestId('more-sheet').count()) === 0, `Mehr (${name}): Eintrag öffnet die Seite und schließt das Menü`);
  await nav.getByRole('link', { name: 'Home' }).click();
  await p.waitForTimeout(300);
  const touchAction = await bar.evaluate((el) => getComputedStyle(el).touchAction);
  check(touchAction === 'pan-y', `Tab-Leiste (${name}): senkrechtes Scrollen bleibt frei (touch-action=${touchAction})`);

  // Liquid Glass bleibt: Tab-Leiste mit Glas-Effekt (Unschärfe bzw. Lichtbrechung)
  const tabBf = await glass.evaluate((el) => {
    const all = [el, ...el.querySelectorAll('*')];
    return all.map((n) => getComputedStyle(n).backdropFilter || getComputedStyle(n).webkitBackdropFilter || '').find((v) => v && v !== 'none') ?? '';
  });
  check(/blur\(|url\(/.test(tabBf), `Liquid Glass (${name}): Tab-Leiste mit Glas-Effekt (${tabBf.slice(0, 60)})`);

  // Profilbutton: Avatar exakt mittig, Knopf exakt rund
  const pb = p.getByTestId('profile-button');
  const btn = await pb.boundingBox();
  const av = await pb.locator('span').first().boundingBox();
  const dx = Math.abs(btn.x + btn.width / 2 - (av.x + av.width / 2));
  const dy = Math.abs(btn.y + btn.height / 2 - (av.y + av.height / 2));
  check(dx <= 0.5 && dy <= 0.5 && Math.abs(btn.width - btn.height) <= 0.5, `Profilbutton (${name}): Avatar zentriert (Δx=${dx}, Δy=${dy}), Knopf rund (${btn.width}×${btn.height})`);

  // Kopfzeile bleibt beim Scrollen an ihrer Position
  // Kopfzeile auf dem Handy: bewusst ohne Logo und ohne Sync-Symbol
  check((await p.getByTestId('mobile-logo').filter({ visible: true }).count()) === 1, `Kopfzeile (${name}): StudySpace-Logo oben (Designsprache 4.0)`);
  check((await p.locator('header button[aria-label*="Tippen zum Aktualisieren"]').filter({ visible: true }).count()) === 0, `Kopfzeile (${name}): kein Sync-Symbol`);
  const logo = p.getByTestId('profile-button');
  const before = await logo.boundingBox();
  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(400);
  const after = await logo.boundingBox();
  const scrolled = await p.evaluate(() => window.scrollY);
  check(scrolled > 0 && Math.abs(after.y - before.y) <= 1, `Kopfzeile (${name}): Kopfzeile bleibt beim Scrollen oben (vorher ${before.y}, nachher ${after.y})`);

  // Seitenende: nichts liegt dauerhaft unter der Tab-Leiste
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(500);
  const lastBottom = await p.evaluate(() => Math.max(...[...document.querySelectorAll('main .card, main section')].map((e) => e.getBoundingClientRect().bottom)));
  const barTop = (await bar.boundingBox()).y;
  check(lastBottom <= barTop - 4, `Abstand (${name}): letzte Karte endet über der Tab-Leiste (${Math.round(lastBottom)} ≤ ${Math.round(barTop)})`);

  // Team-Fortschritt im Dashboard: alle aktiven Personen, Kreise vollständig in der Karte
  await p.evaluate(() => window.scrollTo(0, 0));
  const active = db.members.filter((m) => m.is_active).length;
  const grid = p.getByTestId('team-progress');
  await grid.scrollIntoViewIfNeeded();
  await p.waitForTimeout(1800);
  const info = await grid.evaluate((g) => {
    const card = g.closest('.card').getBoundingClientRect();
    const svgs = [...g.querySelectorAll('svg')];
    return {
      n: svgs.length,
      inside: svgs.every((s) => {
        const r = s.getBoundingClientRect();
        return r.left >= card.left - 0.5 && r.right <= card.right + 0.5 && r.top >= card.top - 0.5 && r.bottom <= card.bottom + 0.5 && r.right <= innerWidth;
      }),
    };
  });
  check(info.n === active && info.inside, `Team (${name}): alle ${active} aktiven Personen mit vollständigen Kreisen (${info.n} sichtbar)`);

  // Teamseite: alle Personen, Kreise nicht abgeschnitten
  await p.goto(`${BASE}#/team`);
  await p.waitForTimeout(1200);
  const teamOk = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('main ul > li .card, main ul > li > button.card')];
    return cards.every((c) => {
      const svg = c.querySelector('svg.-rotate-90');
      if (!svg) return false;
      const r = svg.getBoundingClientRect();
      const b = c.getBoundingClientRect();
      return r.left >= b.left && r.right <= b.right && r.right <= innerWidth;
    }) && cards.length > 0;
  });
  check(teamOk, `Teamseite (${name}): alle Personenkarten mit vollständigen Kreisen`);
  await p.goto(`${BASE}#/`);
}

const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VITE_BASE_PATH: '/Semester3/' } });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview server timeout')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(timer), resolve()));
});

const browser = await chromium.launch();
try {
  // --- Test A: Personenauswahl ------------------------------------------
  const { page, errors, ctx } = await newPage(browser, { viewport: { width: 1440, height: 960 }, colorScheme: 'dark' });
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Wer lernt heute?' }).waitFor();
  const cards = page.getByRole('button', { name: /^Als .* lernen$/ });
  await page.waitForTimeout(900);
  check((await cards.count()) === 4, 'A: vier Profilkarten werden angezeigt');
  check((await page.getByText(/bewusst keine Anmeldung|wessen Haken gesetzt werden/).count()) === 0, 'A: Profilwahl ohne Hinweistexte');
  await shot(page, '01-profilauswahl-desktop-dark');
  await page.getByRole('button', { name: 'Als Person 1 lernen' }).click();
  // Übergang: der Berg bleibt stehen und gleitet ins Countdown-Fenster
  const flight = page.getByTestId('mountain-flight');
  const flew = await flight.waitFor({ state: 'attached', timeout: 2500 }).then(() => true, () => false);
  const heroHiddenDuringFlight = flew && (await page.getByTestId('dashboard-hero').count()) > 0 ? await page.locator('.peak-stage').first().evaluate((el) => getComputedStyle(el).visibility) : 'hidden';
  await flight.waitFor({ state: 'detached', timeout: 4000 });
  const heroVisible = await page.locator('.peak-stage').first().evaluate((el) => getComputedStyle(el).visibility);
  check(flew && heroHiddenDuringFlight === 'hidden' && heroVisible === 'visible', `A: Berg gleitet ins Countdown-Fenster, danach ist das Fenster sichtbar (${flew}, ${heroHiddenDuringFlight} → ${heroVisible})`);
  await page.getByRole('heading', { name: /Person 1/ }).waitFor();
  check(true, 'A: Dashboard von Person 1 geöffnet');
  // Leuchtschein der Fortschrittskreise darf nicht eckig abgeschnitten werden
  const ringOverflow = await page.locator('svg.-rotate-90').first().evaluate((el) => getComputedStyle(el).overflow);
  check(ringOverflow === 'visible', `Fortschrittskreis: Leuchtschein wird nicht abgeschnitten (overflow=${ringOverflow})`);
  check((await page.getByText('NÄCHSTE PRÜFUNG', { exact: false }).count()) > 0 || (await page.getByText('Nächste Prüfung').count()) > 0, 'I: Countdown wird angezeigt');
  check((await page.getByText('Werkstoffkunde').count()) > 0, 'I: nächste Prüfung ist Werkstoffkunde');
  await shot(page, '02-dashboard-leer-desktop-dark');

  // --- Lerntag mit Aufgaben anlegen ------------------------------------
  await page.getByRole('button', { name: 'Ersten Lerntag anlegen' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('radio', { name: 'Controlling' }).click();
  await page.getByLabel('Titel').fill('Kostenstellenrechnung');
  const taskTitles = ['Anbauverfahren verstehen', 'Stufenleiterverfahren verstehen', 'Übungsaufgaben lösen', 'Zusammenfassung wiederholen'];
  for (let i = 0; i < taskTitles.length; i++) {
    await page.getByLabel(`Aufgabe ${i + 1}`, { exact: true }).fill(taskTitles[i]);
    if (i < taskTitles.length - 1) await page.getByLabel(`Aufgabe ${i + 1}`, { exact: true }).press('Enter');
  }
  await shot(page, '03-lerntag-editor-desktop-dark');
  await page.getByRole('button', { name: 'Lerntag speichern' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(db.study_entries.length === 1 && db.tasks.length === 4, 'C: Lerntag mit 4 Aufgaben in der Datenbank gespeichert');
  check(db.tasks.every((t) => t.changed_by === '11111111-1111-4111-8111-000000000001'), 'Änderungen tragen das aktive Profil (changed_by)');

  // --- Test B: Haken setzen -------------------------------------------
  const box = page.getByRole('checkbox', { name: /Anbauverfahren verstehen – offen für Person 1/ });
  await box.click();
  await page.waitForTimeout(400);
  const c1 = db.task_completions.find((c) => c.member_id.endsWith('01'));
  check(!!c1 && c1.is_completed, 'B: Haken für Person 1 gespeichert');
  check(!db.task_completions.some((c) => c.member_id.endsWith('02')), 'B: Person 2 bleibt unberührt');
  await shot(page, '04-dashboard-mit-aufgaben-desktop-dark');

  // Neuladen: Profilauswahl bleibt in der Sitzung, Haken bleibt
  await page.reload();
  // Bei jedem Öffnen wird wieder gefragt, wer lernt
  await page.getByRole('heading', { name: 'Wer lernt heute?' }).waitFor();
  check(true, 'A: Nach dem Neuladen erscheint wieder „Wer lernt heute?“');
  await page.getByRole('button', { name: 'Als Person 1 lernen' }).click();
  await page.getByRole('heading', { name: /Person 1/ }).waitFor();
  check((await page.getByRole('checkbox', { name: /Anbauverfahren verstehen – erledigt für Person 1/ }).count()) === 1, 'B: Haken bleibt nach Neuladen erhalten');

  // Personenwechsel über das Profilmenü
  await page.getByRole('button', { name: /Profilmenü/ }).click();
  await page.getByRole('menuitem', { name: 'Person 2' }).click();
  await page.getByRole('heading', { name: /Person 2/ }).waitFor();
  check((await page.getByRole('checkbox', { name: /Anbauverfahren verstehen – offen für Person 2/ }).count()) === 1, 'B: Person 2 sieht ihren eigenen (offenen) Status');

  // --- Test D: Titel ändern behält Haken --------------------------------
  const taskId = db.tasks.find((t) => t.title === 'Anbauverfahren verstehen').id;
  await page.goto(`${BASE}#/lernplan?ansicht=liste`);
  await page.getByText('Kostenstellenrechnung').first().waitFor();
  await page.getByRole('button', { name: 'Weitere Aktionen' }).first().click();
  await page.getByRole('menuitem', { name: 'Bearbeiten' }).click();
  // Das Formular muss schon beim ersten Anzeigen alle bestehenden Aufgaben enthalten –
  // sonst würde Speichern sie fälschlich in den Papierkorb verschieben.
  const firstTask = page.getByLabel('Aufgabe 1', { exact: true });
  await firstTask.waitFor();
  const prefilled = await page.getByRole('dialog').locator('ol input').evaluateAll((els) => els.map((e) => e.value));
  check(JSON.stringify(prefilled) === JSON.stringify(taskTitles), `D: Editor zeigt sofort alle 4 bestehenden Aufgaben (${JSON.stringify(prefilled)})`);
  await firstTask.fill('Anbauverfahren sicher beherrschen');
  await page.getByLabel('Datum').fill('2026-12-20');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const renamed = db.tasks.find((t) => t.id === taskId);
  check(renamed.title === 'Anbauverfahren sicher beherrschen', 'D: Titel geändert, gleiche Aufgaben-ID');
  if (renamed.title !== 'Anbauverfahren sicher beherrschen') {
    console.log('  Diagnose Aufgaben:', JSON.stringify(db.tasks.map((t) => [t.id.slice(0, 8), t.title, !!t.deleted_at])));
    console.log('  Diagnose Requests:', JSON.stringify(requests.slice(-8).map((r) => [r.method, r.table, r.url, r.body])));
  }
  check(db.study_entries[0].study_date === '2026-12-20', 'E: Datum verschoben');
  check(db.task_completions.some((c) => c.task_id === taskId && c.is_completed), 'D/E: Haken bleiben erhalten');
  check(db.tasks.length === 4 && db.tasks.every((t) => !t.deleted_at), 'D/E: keine Aufgabe neu angelegt oder versehentlich gelöscht');

  // --- Test K: Papierkorb ---------------------------------------------
  await page.goto(`${BASE}#/lernplan?ansicht=tag&datum=2026-12-20`);
  await page.getByText('Anbauverfahren sicher beherrschen').waitFor();
  const row = page.locator('li', { hasText: 'Anbauverfahren sicher beherrschen' });
  await row.hover();
  await row.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'In den Papierkorb' }).click();
  await page.waitForTimeout(300);
  check(!!db.tasks.find((t) => t.id === taskId).deleted_at, 'K: Aufgabe als gelöscht markiert (nicht entfernt)');
  await page.goto(`${BASE}#/papierkorb`);
  const trashed = page.locator('li', { hasText: 'Anbauverfahren sicher beherrschen' });
  await trashed.first().waitFor();
  check((await page.getByRole('button', { name: 'Wiederherstellen' }).count()) === 1, 'K: genau ein Eintrag im Papierkorb');
  await trashed.getByRole('button', { name: 'Wiederherstellen' }).click();
  await page.waitForTimeout(300);
  check(!db.tasks.find((t) => t.id === taskId).deleted_at && db.task_completions.some((c) => c.task_id === taskId && c.is_completed), 'K: wiederhergestellt, Haken erhalten');

  // --- Test F: neue Person ---------------------------------------------
  await page.goto(`${BASE}#/team`);
  await page.getByRole('button', { name: 'Person', exact: true }).click();
  await page.getByLabel('Name').fill('Person 5');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(db.members.length === 5 && db.task_completions.filter((c) => c.is_completed).length === 1, 'F: neue Person angelegt, bestehende Haken unverändert');
  await shot(page, '05-team-desktop-dark');

  // --- Fehlerfall: Speichern schlägt fehl -> Rücksprung -----------------
  process.env.FAIL_WRITES = '1';
  await page.goto(`${BASE}#/lernplan?ansicht=tag&datum=2026-12-20`);
  const other = page.getByRole('checkbox', { name: /Übungsaufgaben lösen – offen für Person 2/ });
  await other.click();
  await page.waitForTimeout(600);
  check((await page.getByRole('checkbox', { name: /Übungsaufgaben lösen – offen für Person 2/ }).count()) === 1, 'Fehlgeschlagenes Speichern wird zurückgesetzt (nicht als gespeichert angezeigt)');
  check((await page.getByText(/nicht gespeichert|Fehler/i).count()) > 0, 'Fehlermeldung wird angezeigt');
  delete process.env.FAIL_WRITES;

  // --- Im Editor entfernte Aufgabe: nur genau diese wandert in den Papierkorb --
  await page.goto(`${BASE}#/lernplan?ansicht=tag&datum=2026-12-20`);
  await page.getByText('Kostenstellenrechnung').first().waitFor();
  await page.getByRole('button', { name: 'Weitere Aktionen' }).first().click();
  await page.getByRole('menuitem', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Aufgabe 4', { exact: true }).waitFor();
  check((await page.getByLabel('Aufgabe 4', { exact: true }).inputValue()) === 'Zusammenfassung wiederholen', 'Editor zeigt beim Öffnen die gespeicherten Aufgaben');
  await page.getByRole('dialog').locator('li', { has: page.getByLabel('Aufgabe 4', { exact: true }) }).getByRole('button', { name: 'Aufgabe entfernen' }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const removed = db.tasks.filter((t) => t.deleted_at).map((t) => t.title);
  check(JSON.stringify(removed) === JSON.stringify(['Zusammenfassung wiederholen']), `Nur die entfernte Aufgabe liegt im Papierkorb (${JSON.stringify(removed)})`);

  // Seiten durchklicken (keine Laufzeitfehler)
  for (const [path, name] of [['#/', 'dashboard'], ['#/lernplan', 'lernplan-monat'], ['#/faecher', 'faecher'], [`#/faecher/${db.modules[4].id}`, 'modul-controlling'], ['#/materialien', 'materialien'], ['#/einstellungen', 'einstellungen'], ['#/verlauf', 'verlauf']]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(500);
    check(!(await hasHorizontalOverflow(page)), `L: kein horizontaler Überlauf (${name}, 1440 px)`);
    await shot(page, `10-${name}-desktop-dark`);
  }
  // Desktop: Seitenleiste als Liquid Glass, Profilbutton, Fortschrittskreise
  await page.goto(`${BASE}#/`);
  await page.waitForTimeout(2200);
  const sideBorder = await page.locator('aside .ss-sidebar').first().evaluate((el) => getComputedStyle(el).borderRightWidth);
  check(sideBorder === '1px', `Seitenleiste: flach mit feiner Trennlinie (${sideBorder})`);
  const activeNav = await page.locator('aside [aria-current="page"] .side-lens').count();
  check(activeNav === 1, 'Seitenleiste: aktiver Navigationspunkt hervorgehoben');
  check((await page.locator('aside').getByText('Space', { exact: true }).count()) === 1, 'Seitenleiste: Wortmarke „StudySpace“');
  {
    const pb = page.getByTestId('profile-button');
    const btn = await pb.boundingBox();
    const av = await pb.locator('span').first().boundingBox();
    const dy = Math.abs(btn.y + btn.height / 2 - (av.y + av.height / 2));
    const left = av.x - btn.x;
    const top = av.y - btn.y;
    check(dy <= 0.5 && Math.abs(left - top) <= 0.5, `Profilbutton (Desktop): Avatar vertikal zentriert, gleiche Abstände links/oben (${left}/${top})`);
  }
  await checkRingGlow(page, 'Dashboard');
  await page.goto(`${BASE}#/team`);
  await page.waitForTimeout(2200);
  await checkRingGlow(page, 'Teamseite');


  // --- Lernmodus: Start, sekundengenaue Uhr, Ausblenden, Darstellung, Beenden ---
  {
    await page.goto(`${BASE}#/`);
    await page.getByTestId('study-mode-card').waitFor();
    await page.getByRole('button', { name: 'Lernmodus starten' }).click();
    const clock = page.getByTestId('study-clock');
    await clock.waitFor();
    check(new URL(page.url()).hash === '#/lernmodus', 'Lernmodus: Knopf auf dem Dashboard öffnet den Lernmodus');
    const secondsOfDay = (h, m, s) => h * 3600 + m * 60 + s;
    const label = await clock.getAttribute('aria-label');
    const now = await page.evaluate(() => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()]; });
    const m = /Uhrzeit (\d\d):(\d\d):(\d\d)$/.exec(label ?? '');
    const diff = m ? Math.abs(secondsOfDay(+m[1], +m[2], +m[3]) - secondsOfDay(...now)) % 86398 : 99;
    check(!!m && diff <= 2, `Lernmodus: Uhr zeigt die aktuelle Zeit mit Sekunden (${label})`);
    await page.waitForTimeout(1300);
    check((await clock.getAttribute('aria-label')) !== label, 'Lernmodus: Sekunden laufen weiter');
    const root = page.getByTestId('study-mode');
    check((await root.getAttribute('data-controls')) === 'visible', 'Lernmodus: Bedienelemente beim Start sichtbar');
    await page.waitForTimeout(4000);
    check((await root.getAttribute('data-controls')) === 'hidden', 'Lernmodus: ohne Eingabe blenden sich alle Bedienelemente aus');
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    await page.waitForTimeout(100);
    check((await root.getAttribute('data-controls')) === 'visible', 'Lernmodus: Bewegung blendet die Bedienelemente wieder ein');

    await page.getByRole('button', { name: 'Darstellung anpassen' }).click();
    const panel = page.getByRole('dialog', { name: 'Darstellung des Lernmodus' });
    await panel.waitFor();
    await panel.getByRole('radio', { name: /Digital/ }).click();
    await page.waitForTimeout(800);
    const box = await clock.boundingBox();
    check(box.x >= 0 && box.x + box.width <= 1440, `Lernmodus: breite Schrift passt auf den Bildschirm (${Math.round(box.x)}–${Math.round(box.x + box.width)} px)`);
    const panelBox = await panel.boundingBox();
    check(box.x + box.width <= panelBox.x, 'Lernmodus: Uhr bleibt neben dem Einstellungsfeld sichtbar (Live-Vorschau)');
    await panel.getByRole('radio', { name: 'HH:MM', exact: true }).click();
    check(/^Uhrzeit \d\d:\d\d$/.test((await clock.getAttribute('aria-label')) ?? ''), 'Lernmodus: Ziffern auf HH:MM umstellbar (ohne Sekunden)');
    await panel.getByRole('radio', { name: 'Verlauf' }).click();
    check((await page.getByTestId('study-bg').getAttribute('data-bg')) === 'gradient', 'Lernmodus: Hintergrund auf Farbverlauf umstellbar');
    const family = await clock.evaluate((el) => getComputedStyle(el).fontFamily);
    check(/Orbitron/.test(family), `Lernmodus: Schriftart der Uhr umstellbar (${family})`);
    await page.reload();
    await page.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await clock.waitFor();
    const persisted = /^Uhrzeit \d\d:\d\d$/.test((await clock.getAttribute('aria-label')) ?? '') && (await page.getByTestId('study-bg').getAttribute('data-bg')) === 'gradient';
    check(persisted, 'Lernmodus: Darstellung bleibt nach dem Neuladen erhalten');
    check(!(await hasHorizontalOverflow(page)), 'L: kein horizontaler Überlauf (Lernmodus, 1440 px)');
    await shot(page, '12-lernmodus-desktop');
    await page.mouse.move(500, 300);
    await page.getByRole('button', { name: 'Lernmodus beenden' }).click();
    await page.getByTestId('study-mode-card').waitFor();
    check(new URL(page.url()).hash === '#/', 'Lernmodus: Beenden führt zurück zum Dashboard');
  }
  check(errors.length === 0, `keine JavaScript-Fehler (Desktop)${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();

  // --- Test L/M: Smartphone (320 px), iPhone, iPad; Light Mode -----------
  const sizes = [
    ['320', { viewport: { width: 320, height: 640 }, colorScheme: 'light', hasTouch: true, isMobile: true }],
    ['iphone', { ...devices['iPhone 13'], colorScheme: 'dark' }],
    ['ipad', { ...devices['iPad (gen 7)'], colorScheme: 'light' }],
  ];
  for (const [name, opts] of sizes) {
    const { page: p, errors: errs, ctx: c } = await newPage(browser, opts);
    await p.goto(BASE);
    await p.getByRole('heading', { name: 'Wer lernt heute?' }).waitFor();
    await p.waitForTimeout(900);
    check(!(await hasHorizontalOverflow(p)), `L: kein horizontaler Überlauf auf der Profilauswahl (${name})`);
    await shot(p, `20-profilauswahl-${name}`);
    await p.getByRole('button', { name: 'Als Person 3 lernen' }).click();
    await p.getByRole('heading', { name: /Person 3/ }).waitFor();
    if (name === '320' || name === 'iphone') {
      await mobileDesignChecks(p, name);
    }
    if (name === 'iphone') {
      // Haptik: kurzer Impuls beim Abhaken (Vibration API wird hier mitprotokolliert)
      await p.goto(`${BASE}#/lernplan?ansicht=tag&datum=2026-12-20`);
      const box = p.getByRole('checkbox', { name: /für Person 3/ }).first();
      await box.waitFor();
      await box.click();
      await p.waitForTimeout(200);
      const vib = await p.evaluate(() => window.__vibrations ?? []);
      const last = vib[vib.length - 1];
      const total = Array.isArray(last) ? last.reduce((a, b) => a + b, 0) : last;
      check(vib.length >= 1 && total <= 80, `Haptik: kurzer Impuls beim Abhaken (${JSON.stringify(last)})`);
      await p.goto(`${BASE}#/einstellungen/darstellung`);
      await p.getByTestId('settings-darstellung').waitFor();
      check((await p.getByRole('switch', { name: 'Haptisches Feedback' }).count()) === 1, 'Haptik: Einstellung „Haptisches Feedback“ vorhanden, wo unterstützt');
      // iOS zoomt bei Eingabefeldern unter 16 px automatisch hinein – das darf nicht passieren
      await p.goto(`${BASE}#/einstellungen/info`);
      await p.getByTestId('settings-info').waitFor();
      const small = await p.evaluate(() =>
        [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => !['range', 'checkbox', 'radio', 'color', 'file'].includes(el.type))
          .map((el) => [el.getAttribute('aria-label') ?? el.name ?? el.type, parseFloat(getComputedStyle(el).fontSize)])
          .filter(([, size]) => size < 16),
      );
      check(small.length === 0, `Kein Auto-Zoom (iPhone): alle Eingabefelder ≥ 16 px${small.length ? ' – ' + JSON.stringify(small) : ''}`);
      const minW = await p.locator('.field').first().evaluate((el) => getComputedStyle(el).minWidth);
      check(minW === '0px', `Einstellungen (iPhone): Eingabefelder dürfen schrumpfen (min-width=${minW})`);
      check(await p.evaluate(() => getComputedStyle(document.documentElement).touchAction === 'manipulation'), 'Kein Zoomen per Doppeltippen (touch-action: manipulation)');
      await p.goto(`${BASE}#/`);
      await p.getByTestId('study-mode-card').waitFor();
      check((await p.getByTestId('iphone-install-hint').count()) === 1, 'Lernmodus (iPhone-Safari): Hinweis auf „Zum Home-Bildschirm“ für echtes Vollbild');
      // Lernmodus auf dem Smartphone: hochkant → Hinweis, quer → Uhr
      const portraitSize = p.viewportSize();
      await p.goto(`${BASE}#/lernmodus`);
      await p.getByTestId('study-rotate').waitFor();
      check((await p.getByText('Bitte quer hinlegen').count()) === 1 && (await p.getByTestId('study-clock').count()) === 0, 'Lernmodus (iPhone hochkant): Hinweis „Bitte quer hinlegen“');
      await shot(p, '22-lernmodus-iphone-hochkant');
      await p.setViewportSize({ width: portraitSize.height, height: portraitSize.width });
      await p.getByTestId('study-clock').waitFor();
      check((await p.getByTestId('study-rotate').count()) === 0, 'Lernmodus (iPhone quer): Uhr im Vollbild statt Hinweis');
      {
        const hint = p.getByTestId('iphone-fullscreen-hint');
        const hb = (await hint.count()) ? await hint.boundingBox() : null;
        check(!!hb && hb.x >= 0 && hb.x + hb.width <= portraitSize.height, 'Lernmodus (iPhone quer): Vollbild-Hinweis sichtbar und vollständig auf dem Bildschirm');
      }
      const cb = await p.getByTestId('study-clock').boundingBox();
      check(cb.x >= 0 && cb.x + cb.width <= portraitSize.height, `Lernmodus (iPhone quer): Uhr passt auf den Bildschirm (${Math.round(cb.width)} px)`);
      check(!(await hasHorizontalOverflow(p)), 'L: kein horizontaler Überlauf (Lernmodus, iPhone quer)');
      // Antippen der freien Fläche blendet die Steuerung aus und wieder ein
      const sm = p.getByTestId('study-mode');
      await p.touchscreen.tap(Math.round(portraitSize.height * 0.06), Math.round(portraitSize.width / 2));
      check((await sm.getAttribute('data-controls')) === 'hidden', 'Lernmodus (iPhone): Antippen blendet die Bedienelemente aus');
      await p.touchscreen.tap(Math.round(portraitSize.height * 0.06), Math.round(portraitSize.width / 2));
      check((await sm.getAttribute('data-controls')) === 'visible', 'Lernmodus (iPhone): erneutes Antippen blendet sie wieder ein');
      await shot(p, '22-lernmodus-iphone-quer');
      await p.setViewportSize(portraitSize);
      await p.goto(`${BASE}#/`);
    }
    for (const [path, pname] of [
      ['#/', 'dashboard'],
      ['#/lernplan', 'lernplan'],
      ['#/lernplan?ansicht=timeline', 'timeline'],
      ['#/faecher', 'faecher'],
      ['#/team', 'team'],
      ['#/fokus', 'fokus'],
      ['#/analyse', 'analyse'],
      ['#/einstellungen/benachrichtigungen', 'benachrichtigungen'],
      ['#/einstellungen', 'einstellungen'],
      ['#/einstellungen/darstellung', 'einst-darstellung'],
      ['#/einstellungen/personen', 'einst-personen'],
      ['#/einstellungen/faecher', 'einst-faecher'],
      ['#/einstellungen/daten', 'einst-daten'],
      ['#/einstellungen/info', 'einst-info'],
    ]) {
      await p.goto(`${BASE}${path}`);
      await p.waitForTimeout(500);
      check(!(await hasHorizontalOverflow(p)), `L: kein horizontaler Überlauf (${pname}, ${name})`);
      await shot(p, `21-${pname}-${name}`);
    }
    if (name === '320') {
      const isDark = await p.evaluate(() => document.documentElement.classList.contains('dark'));
      check(!isDark, 'M: Systemeinstellung „hell“ wird übernommen');
      // Einstellungen auf dem Handy: ruhige Übersicht, Kategorie als eigene Seite
      await p.goto(`${BASE}#/einstellungen`);
      const nav = p.getByTestId('settings-nav');
      await nav.waitFor();
      check((await nav.locator('.list-group').count()) === 4 && (await p.getByRole('radio', { name: 'Dunkel' }).count()) === 0, 'Einstellungen (Handy): gruppierte Übersicht ohne Bedienelemente');
      await nav.getByRole('link', { name: /Darstellung & Bedienung/ }).click();
      await p.getByTestId('settings-darstellung').waitFor();
      check((await p.getByRole('link', { name: 'Einstellungen' }).count()) >= 1, 'Einstellungen (Handy): Unterseite mit Zurück-Link');
      await p.getByRole('radio', { name: 'Dunkel' }).click();
      check(await p.evaluate(() => document.documentElement.classList.contains('dark')), 'M: manuelle Umstellung auf Dunkel');
    }
    check(errs.length === 0, `keine JavaScript-Fehler (${name})${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }

  // --- Neue Bereiche: Fokus 2.0, Timeline, Analyse ------------------------
  {
    const t0 = Date.now();
    // Laufender Timer, der in gut einer Sekunde endet (Runde 1 von 4, 25 Min. Fokus fast vorbei)
    const timer = { phase: 'focus', long: false, round: 1, durationSec: 1500, endsAt: t0 + 2500, pausedRemainingSec: null, startedAt: t0 - 1497500, elapsedBeforePauseSec: 0, finished: false, moduleId: db.modules[4].id };
    const { page: p, errors: errs, ctx: c } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await c.addInitScript((t) => {
      if (!sessionStorage.getItem('focus-seeded')) {
        localStorage.setItem('studyspace.focus.v1', JSON.stringify({ timer: t, settings: { preset: 'klassisch', sound: false } }));
        sessionStorage.setItem('focus-seeded', '1');
      }
    }, timer);
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await p.getByRole('heading', { name: /Person 1/ }).waitFor();

    // Abgelaufene Fokusphase wird gespeichert (nur echte Fokuszeit), danach kurze Pause
    await p.waitForTimeout(3500);
    const fs = db.focus_sessions;
    check(fs.length === 1 && fs[0].duration_seconds === 1500 && fs[0].member_id.endsWith('01') && fs[0].module_id === db.modules[4].id, `Fokus: abgelaufene Fokusphase gespeichert (${JSON.stringify(fs.map((x) => x.duration_seconds))})`);
    // Team: Lernzeit dieser Woche aus den gespeicherten Fokus-Sessions (sofort, ohne Neuladen)
    await p.evaluate(() => (location.hash = '#/team'));
    const teamWeek = p.getByTestId('focus-team');
    await teamWeek.waitFor();
    const mineRow = teamWeek.locator(`[data-member="${db.members[0].id}"]`);
    const rowSec = Number(await mineRow.getAttribute('data-seconds'));
    const total = Number(await teamWeek.getAttribute('data-total'));
    check(rowSec === 1500 && total === 1500 && (await mineRow.innerText()).includes('25 Min.'), `Team: Lernzeit dieser Woche je Person und gesamt (${rowSec} s, gesamt ${total} s)`);
    check((await teamWeek.getByTestId('focus-team-row').count()) === db.members.filter((m) => m.is_active).length, 'Team: alle aktiven Personen in der Lernzeit-Übersicht');
    await p.evaluate(() => (location.hash = '#/'));
    await p.getByTestId('dashboard-hero').waitFor();

    // Dashboard: Fokus-Karte öffnet direkt die immersive Ansicht; keine Erinnerungsvorschau mehr
    const hero = p.getByTestId('dashboard-hero');
    check((await hero.locator('.landscape img').count()) === 1, 'Dashboard: Hero mit Berg-Panorama');
    // Bergspitze ragt aus dem Fenster heraus (freigestellte Ebene oberhalb der Oberkante)
    const peakGeo = await p.evaluate(() => {
      const stage = document.querySelector('[data-testid="dashboard-hero"]');
      const pop = document.querySelector('.peak-pop');
      const img = pop?.querySelector('img');
      if (!stage || !pop || !img) return null;
      const s = stage.getBoundingClientRect(), q = pop.getBoundingClientRect();
      return { above: Math.round(s.top - q.top), loaded: img.complete && img.naturalWidth > 0, src: img.currentSrc };
    });
    check(!!peakGeo && peakGeo.above >= 24 && peakGeo.loaded && /mountains-peak/.test(peakGeo.src), `Dashboard: Bergspitze ragt über das Fenster hinaus (${JSON.stringify(peakGeo)})`);
    check((await hero.getByText('Nächste Prüfung').count()) === 1 && (await hero.getAttribute('aria-label')) === 'Prüfungscountdown', 'Dashboard: Countdown zur nächsten Prüfung im Hero');
    check((await p.getByTestId('focus-stats').count()) === 1, 'Dashboard: Fokus-Statistik');
    const today = Number(await p.getByTestId('focus-today').getAttribute('data-seconds'));
    check(today === 1500, `Fokus-Statistik: heutige Fokuszeit aus gespeicherten Phasen (${today} s)`);
    check((await p.getByTestId('header-greeting').count()) === 1, 'Dashboard: Begrüßung in der Kopfzeile');
    check((await p.getByTestId('lockscreen-preview').count()) === 0, 'Dashboard: Karte „Nächste Erinnerung“ entfernt');
    check((await p.getByText('Konzentriert lernen mit Pausen').count()) === 0, 'Dashboard: überflüssiger Hilfstext entfernt');
    await shot(p, '30-dashboard-desktop-light');
    // Zeit vom Antippen bis die Fokusansicht im Bild ist – im Browser gemessen
    const focusDelay = await p.evaluate(
      () =>
        new Promise((res) => {
          const t = performance.now();
          document.querySelector('[data-testid="focus-start"]').click();
          const tick = () => (document.querySelector('[data-testid="focus-immersive"]') ? res(Math.round(performance.now() - t)) : requestAnimationFrame(tick));
          tick();
        }),
    );
    const imm = p.getByTestId('focus-immersive');
    await imm.waitFor();
    // Fokus legt sich sofort über die App: das Dashboard bleibt darunter stehen (nicht bedienbar)
    const under = await p.evaluate(() => {
      const hero = document.querySelector('[data-testid="dashboard-hero"]');
      return { hero: !!hero, inert: !!hero?.closest('[inert]') };
    });
    check(focusDelay < 250 && under.hero && under.inert, `Fokus: öffnet sofort im Vollbild, Dashboard bleibt darunter (${focusDelay} ms, ${JSON.stringify(under)})`);
    await p.waitForTimeout(300);
    check(await p.evaluate(() => !!document.fullscreenElement), 'Fokus: öffnet direkt im Vollbild (Laptop/Desktop)');
    check(new URL(p.url()).hash === '#/fokus', 'Fokus: „Fokus starten“ öffnet die Fokusansicht');
    const phase = () => p.getByTestId('focus-phase').textContent();
    check((await phase())?.includes('Kurze Pause') && (await imm.getAttribute('data-phase')) === 'short', `Fokus: nach Runde 1 folgt automatisch die kurze Pause (${await phase()})`);
    check((await imm.locator('.landscape img').count()) === 1, 'Fokus: Berg-Panorama im Hintergrund');
    check((await p.getByTestId('focus-toggle').getAttribute('aria-label')) === 'Starten', 'Fokus: kein Autostart – bewusster Start (Standard)');

    // Pause überspringen → Runde 2 läuft sofort
    await p.getByRole('button', { name: 'Pause überspringen' }).click();
    await p.waitForTimeout(300);
    check((await phase())?.includes('Runde 2 von 4'), `Fokus: Pause übersprungen → „${await phase()}“`);
    const clock = () => p.getByTestId('focus-time').getAttribute('data-value');
    const t1 = await clock();
    await p.waitForTimeout(2200);
    const t2 = await clock();
    check(!!t1 && !!t2 && t2 < t1, `Fokus: Countdown läuft herunter (${t1} → ${t2})`);
    // Steuerleiste blendet sich aus und kehrt bei Bewegung zurück
    await p.mouse.move(640, 300);
    await p.waitForTimeout(4600);
    check((await imm.getAttribute('data-controls')) === 'hidden', 'Fokus: Steuerleiste blendet sich automatisch aus');
    await p.mouse.move(700, 420);
    await p.waitForTimeout(200);
    check((await imm.getAttribute('data-controls')) === 'visible', 'Fokus: Bewegung zeigt die Steuerleiste wieder');
    await p.getByRole('button', { name: 'Pausieren' }).click();
    const paused = await clock();
    await p.waitForTimeout(1500);
    check((await clock()) === paused, 'Fokus: Pause hält den Timer an');
    await p.reload();
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await imm.waitFor();
    check((await clock()) === paused && (await phase())?.includes('Runde 2'), 'Fokus: Stand und Runde bleiben nach dem Neuladen erhalten');

    // Session beenden → Runde 1; Rhythmus „Kurz“ wählen
    await p.getByRole('button', { name: 'Session beenden und Lernzeit speichern' }).click();
    await p.getByRole('button', { name: 'Fokus-Einstellungen' }).click();
    const panel = p.getByRole('dialog', { name: 'Fokus-Einstellungen' });
    await panel.waitFor();
    await panel.getByRole('radio', { name: 'Kurz' }).click();
    await p.waitForTimeout(300);
    check((await clock()) === '15:00' && (await phase())?.includes('Runde 1 von 4'), `Fokus: Rhythmus „Kurz“ (15/5) gesetzt (${await clock()})`);
    check((await panel.getByTestId('focus-rhythm').textContent())?.includes('15 Min. Fokus · 5 Min. Pause'), 'Fokus: Rhythmus wird angezeigt');
    // Individuell: Runden bis zur langen Pause ändern
    await panel.getByRole('radio', { name: 'Individuell' }).click();
    await panel.getByLabel('Runden bis zur langen Pause').fill('3');
    await p.waitForTimeout(200);
    check((await phase())?.includes('von 3'), `Fokus: individuelle Rundenzahl wirkt sofort (${await phase()})`);
    // Darstellung: Sekunden aus, Hintergrund Polarlicht
    await panel.getByRole('radio', { name: 'Anzeige' }).click();
    await panel.getByRole('switch', { name: 'Sekunden anzeigen' }).click();
    await p.waitForTimeout(500);
    const shown = (await p.getByTestId('focus-time').innerText()).replace(/\s/g, '');
    check(!shown.includes(':'), `Fokus: Anzeige ohne Sekunden („${shown}“)`);
    await panel.getByRole('radio', { name: 'Bild' }).click();
    await panel.getByRole('radio', { name: 'Polarlicht' }).click();
    check((await p.getByTestId('focus-bg').getAttribute('data-bg')) === 'aurora', 'Fokus: Hintergrund „Polarlicht“');
    const look = await p.evaluate(() => JSON.parse(localStorage.getItem('studyspace.focuslook.v1') ?? '{}'));
    check(look.background === 'aurora' && look.showSeconds === false, 'Fokus: Darstellung wird gespeichert');
    await shot(p, '33-fokus-einstellungen-desktop');
    await panel.getByRole('radio', { name: 'Steuerung' }).click();
    check((await panel.getByRole('switch', { name: 'Beim Öffnen sofort starten' }).getAttribute('aria-checked')) === 'false', 'Fokus: Autostart beim Öffnen standardmäßig aus');
    await panel.getByRole('button', { name: 'Darstellung zurücksetzen' }).click();
    check((await p.getByTestId('focus-bg').getAttribute('data-bg')) === 'mountains', 'Fokus: Zurücksetzen stellt die Berglandschaft wieder her');
    check(!(await hasHorizontalOverflow(p)), 'L: kein horizontaler Überlauf (Fokus)');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(700);
    check((await p.getByRole('dialog', { name: 'Fokus-Einstellungen' }).count()) === 0 && new URL(p.url()).hash === '#/fokus', 'Fokus: Escape schließt zuerst die Einstellungen');
    // Im Vollbild beendet die erste Escape-Taste nur das Vollbild (macht der Browser selbst)
    await p.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
    await p.waitForTimeout(200);
    await p.keyboard.press('Escape');
    // Das Dashboard liegt unter dem Fokus bereit – deshalb auf die Adresse warten
    await p.waitForURL(/#\/$/, { timeout: 3000 }).catch(() => undefined);
    await p.getByTestId('focus-immersive').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
    check(new URL(p.url()).hash === '#/' && (await p.getByTestId('focus-immersive').count()) === 0, 'Fokus: Escape führt zurück zur vorherigen Seite');

    // Timeline: alle Module als Zeilen, sechs Prüfungen als Rauten
    await p.goto(`${BASE}#/lernplan?ansicht=timeline`);
    const tl = p.getByTestId('semester-timeline');
    await tl.waitFor();
    check((await tl.locator(':scope > div:first-child li').count()) === db.modules.length, 'Timeline: jedes Modul hat eine Zeile');
    check((await tl.locator('[title^="Prüfung "]').count()) === 6, 'Timeline: alle sechs Prüfungen sind eingetragen');
    check(!(await hasHorizontalOverflow(p)), 'L: kein horizontaler Überlauf (Timeline, 1280 px)');
    await shot(p, '31-timeline-desktop-light');

    // Analyse: Werte entsprechen der Datenbank
    await p.goto(`${BASE}#/analyse`);
    const stat = p.getByTestId('stat-done');
    await stat.waitFor();
    const activeTasks = new Set(db.tasks.filter((t) => !t.deleted_at).map((t) => t.id));
    const expected = db.task_completions.filter((x) => x.member_id.endsWith('01') && x.is_completed && activeTasks.has(x.task_id)).length;
    check(Number(await stat.getAttribute('data-value')) === expected, `Analyse: „Erledigt diese Woche“ = echte Erledigungen (${expected})`);
    check((await p.getByText('Fokus-Timer').count()) > 0 && (await p.getByText('25 Min.').count()) > 0, 'Analyse: Lernzeit aus gespeicherten Fokusphasen');
    // Gewählter Zeitraum lesbar: Schrift hebt sich vom hervorgehobenen Segment ab
    const segContrast = await p.evaluate(() => {
      const sel = document.querySelector('.ss-seg-accent .lg-tab[data-selected]');
      const seg = document.querySelector('.ss-seg-accent > .lg-segmented');
      if (!sel || !seg) return null;
      return { text: getComputedStyle(sel).color, thumb: getComputedStyle(seg).getPropertyValue('--lg-segment-thumb').trim() };
    });
    check(!!segContrast && segContrast.thumb !== '' && !/^#fff|white|rgb\(255, 255, 255\)$/i.test(segContrast.thumb) && segContrast.text === 'rgb(255, 255, 255)', `Analyse: gewähltes Segment „Woche“ lesbar (${JSON.stringify(segContrast)})`);
    await shot(p, '32-analyse-desktop-light');
    check(errs.length === 0, `keine JavaScript-Fehler (Fokus/Analyse)${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }

  // --- Musik-Bibliothek: gemeinsame YouTube-Links --------------------------
  {
    const { page: p, errors: errs, ctx: c } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await p.getByTestId('dashboard-hero').waitFor();
    // Prüfungen gehören zu den Fächern: kein eigener Tab, alte Links führen dorthin
    check((await p.locator('aside').getByRole('link', { name: 'Prüfungen' }).count()) === 0, 'Fächer: kein eigener Tab „Prüfungen“ mehr');
    await p.goto(`${BASE}#/pruefungen`);
    await p.waitForURL(/#\/faecher$/);
    await p.getByTestId('subject-card').first().waitFor();
    await p.waitForTimeout(400);
    const activeModules = db.modules.filter((m) => !m.archived_at).length;
    check((await p.getByTestId('subject-card').count()) === activeModules, `Fächer: alle Fächer als Karten (${activeModules})`);
    check((await p.getByTestId('subject-exam').count()) >= 1, 'Fächer: Prüfungstermin direkt am Fach');
    await p.getByTestId('subject-card').filter({ hasText: 'Controlling' }).getByRole('link').click();
    const examBox = p.getByTestId('module-exams');
    await examBox.waitFor();
    check((await examBox.getByTestId('exam-card').count()) >= 1, 'Fach: Prüfung in der Detailseite (bearbeitbar)');
    await examBox.getByRole('button', { name: 'Termin' }).click();
    const examDlg = p.getByRole('dialog', { name: 'Neue Prüfung' });
    await examDlg.waitFor();
    check((await examDlg.getByLabel('Prüfungsmodul').inputValue()) === db.modules[4].id, 'Fach: neue Prüfung mit vorausgewähltem Fach');
    await p.keyboard.press('Escape');
    // Auswahlfelder: ein Doppelpfeil, kein gekacheltes Muster
    await p.goto(`${BASE}#/lernplan`);
    const sel = p.getByLabel('Nach Modul filtern');
    await sel.waitFor();
    const selBg = await sel.evaluate((el) => ({ repeat: getComputedStyle(el).backgroundRepeat, img: getComputedStyle(el).backgroundImage, app: getComputedStyle(el).appearance }));
    check(selBg.repeat === 'no-repeat' && selBg.img.startsWith('url(') && selBg.app === 'none', `Auswahlfelder: Doppelpfeil ohne Wiederholung (${selBg.repeat})`);
    await p.goto(`${BASE}#/`);
    await p.getByTestId('dashboard-hero').waitFor();
    // Einstieg auch über die Einstellungen
    await p.locator('aside').getByRole('link', { name: 'Einstellungen' }).click();
    const musicEntry = p.getByTestId('settings-music');
    await musicEntry.waitFor();
    // An/Aus-Einstellungen sind Apple-Schalter (Glisse), keine Segmente
    check((await p.getByRole('switch', { name: 'Klänge' }).count()) === 1 && (await p.getByRole('switch', { name: 'Kompakte Darstellung' }).count()) === 1, 'Einstellungen: Klänge und Kompakte Darstellung als Schalter');
    const soundSwitch = p.getByRole('switch', { name: 'Klänge' });
    const before = await soundSwitch.getAttribute('aria-checked');
    await soundSwitch.click();
    check((await soundSwitch.getAttribute('aria-checked')) !== before, 'Einstellungen: Schalter „Klänge“ lässt sich umschalten');
    await soundSwitch.click();
    const musicCount = db.music_tracks.filter((t) => !t.deleted_at).length;
    check((await musicEntry.innerText()).includes(`${musicCount} Titel`), `Einstellungen: Musik-Bibliothek zeigt ${musicCount} Titel`);
    await musicEntry.click();
    await p.waitForURL(/#\/musik/);
    check(p.url().endsWith('#/musik'), 'Einstellungen → Musik-Bibliothek öffnet die Musikseite');
    const lib = p.getByTestId('music-library');
    await lib.waitFor();
    check(new URL(p.url()).hash === '#/musik', 'Musik: über die Seitenleiste erreichbar');
    await lib.getByRole('button', { name: 'Lofi', exact: false }).first().click();
    const slots = lib.getByTestId('music-slot');
    check((await slots.count()) === 10, `Musik: 10 freie Plätze „Lofi 1–10“ (${await slots.count()})`);
    await slots.first().click();
    const dlg = p.getByRole('dialog', { name: 'Link hinzufügen' });
    await dlg.waitFor();
    check((await dlg.getByLabel('Name').inputValue()) === 'Lofi 1', 'Musik: Name „Lofi 1“ vorbelegt');
    await dlg.getByLabel('YouTube-Link').fill('https://evil.example/watch?v=jfKfPfyJRdk');
    await dlg.getByTestId('music-save').click();
    check((await dlg.getByRole('alert').textContent())?.includes('YouTube-Link'), 'Musik: fremde Links werden abgelehnt');
    await dlg.getByLabel('YouTube-Link').fill('https://youtu.be/jfKfPfyJRdk?t=90');
    await dlg.getByTestId('music-save').click();
    await dlg.waitFor({ state: 'detached' });
    await p.waitForTimeout(300);
    const saved = db.music_tracks.find((t) => t.title === 'Lofi 1');
    check(!!saved && saved.youtube_id === 'jfKfPfyJRdk' && saved.start_seconds === 90 && saved.category === 'lofi', 'Musik: Link gespeichert (nur Video-ID + Startzeit)');
    check((await lib.getByTestId('music-slot').count()) === 9, 'Musik: Platz belegt, 9 frei');
    check((await lib.getByRole('button', { name: 'Lofi 1 abspielen' }).count()) === 1, 'Musik: Titel mit Abspielknopf');
    // YouTube-Video ist standardmäßig versteckt (nur Steuerleiste), lässt sich einblenden
    await lib.getByRole('button', { name: 'Lofi 1 abspielen' }).click();
    const mini = p.getByTestId('mini-player');
    await mini.waitFor();
    const video = p.getByTestId('mini-player-video');
    const hiddenBox = await video.evaluate((el) => ({ vis: el.dataset.visible, op: getComputedStyle(el).opacity, w: el.getBoundingClientRect().width }));
    check(hiddenBox.vis === 'false' && hiddenBox.op === '0' && hiddenBox.w >= 200 && (await mini.boundingBox()).height < 70, `Musik: YouTube-Video versteckt, Player läuft im Hintergrund weiter (${JSON.stringify(hiddenBox)})`);
    await mini.getByRole('button', { name: 'Video anzeigen' }).click();
    check((await video.getAttribute('data-visible')) === 'true', 'Musik: Video lässt sich bei Bedarf einblenden');
    await mini.getByRole('button', { name: 'Video ausblenden' }).click();
    await mini.getByRole('button', { name: 'Musik beenden' }).click();
    await mini.waitFor({ state: 'detached' });
    // Für alle sichtbar: zweites Gerät/Person
    const { page: q, ctx: c2 } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await q.goto(`${BASE}#/musik`);
    await q.getByRole('button', { name: 'Als Person 2 lernen' }).click();
    await q.getByTestId('music-library').waitFor();
    await q.waitForTimeout(500);
    check((await q.getByRole('button', { name: 'Lofi 1 abspielen' }).count()) === 1, 'Musik: Link ist für alle Personen verfügbar');
    await c2.close();
    // Umbenennen und entfernen
    await lib.getByRole('button', { name: 'Weitere Aktionen für Lofi 1' }).click();
    await p.getByRole('menuitem', { name: 'Umbenennen' }).click();
    const ren = p.getByRole('dialog', { name: 'Umbenennen' });
    await ren.getByLabel('Name').fill('Lofi Study');
    await ren.getByRole('button', { name: 'Speichern' }).click();
    await p.waitForTimeout(300);
    check(db.music_tracks.find((t) => t.id === saved.id)?.title === 'Lofi Study', 'Musik: umbenannt');
    await lib.getByRole('button', { name: 'Weitere Aktionen für Lofi Study' }).click();
    await p.getByRole('menuitem', { name: 'Entfernen' }).click();
    await p.waitForTimeout(300);
    check(!!db.music_tracks.find((t) => t.id === saved.id)?.deleted_at, 'Musik: entfernt (Papierkorb, kein echtes Löschen)');
    check(!(await hasHorizontalOverflow(p)), 'L: kein horizontaler Überlauf (Musik)');
    await shot(p, '35-musik-desktop');
    check(errs.length === 0, `keine JavaScript-Fehler (Musik)${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }

  // --- Fokus auf dem Smartphone: Hoch- und Querformat -----------------------
  for (const [label, viewport] of [['hoch', { width: 390, height: 844 }], ['quer', { width: 844, height: 390 }]]) {
    const { page: p, errors: errs, ctx: c } = await newPage(browser, { viewport, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    await p.goto(`${BASE}#/fokus`);
    await p.getByRole('button', { name: 'Als Person 3 lernen' }).click();
    const imm = p.getByTestId('focus-immersive');
    await imm.waitFor();
    const digits = await p.getByTestId('focus-time').boundingBox();
    const toggle = await p.getByTestId('focus-toggle').boundingBox();
    const inside = (b) => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 0.5 && b.y + b.height <= viewport.height + 0.5;
    check(inside(digits) && inside(toggle), `Fokus (${label}format): Zeit und Steuerung vollständig sichtbar`);
    check(!(await hasHorizontalOverflow(p)), `L: kein horizontaler Überlauf (Fokus ${label})`);
    await p.getByTestId('focus-toggle').tap();
    await p.waitForTimeout(300);
    check((await p.getByTestId('focus-toggle').getAttribute('aria-label')) === 'Pausieren', `Fokus (${label}format): Start per Antippen`);
    // Musik: Panel öffnen, erzeugtes Lofi an und wieder aus (ohne Internet)
    await p.getByRole('button', { name: 'Musik', exact: true }).tap();
    const panel = p.getByRole('dialog', { name: 'Musik' });
    await panel.waitFor();
    await panel.getByRole('button', { name: 'Lofi (erzeugt) abspielen' }).tap();
    await p.waitForTimeout(500);
    check((await p.getByTestId('mini-player').count()) === 1 && (await panel.getByRole('button', { name: 'Lofi (erzeugt) pausieren' }).count()) === 1, `Fokus (${label}format): Lofi spielt, Mini-Player sichtbar`);
    await p.getByRole('button', { name: 'Musik beenden' }).tap();
    await p.waitForTimeout(400);
    check((await p.getByTestId('mini-player').count()) === 0, `Fokus (${label}format): Musik beendet`);
    await p.getByRole('button', { name: 'Musik schließen' }).tap();
    const bar = await p.getByRole('toolbar', { name: 'Fokus-Steuerung' }).boundingBox();
    check(!!bar && bar.x >= 0 && bar.x + bar.width <= viewport.width + 0.5, `Fokus (${label}format): Steuerleiste passt in die Breite`);
    await shot(p, `34-fokus-iphone-${label}`);
    check(errs.length === 0, `keine JavaScript-Fehler (Fokus ${label})${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }

  // --- Hausaufgaben ---------------------------------------------------------
  {
    const berlinToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    const plus = (n) => {
      const d = new Date(`${berlinToday}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const tasksBefore = JSON.stringify(db.tasks.map((t) => [t.id, t.study_entry_id, t.deleted_at]));
    const entriesBefore = JSON.stringify(db.study_entries.map((e) => [e.id, e.study_date]));
    const { page: p, errors: errs, ctx: c } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await p.getByRole('heading', { name: /Person 1/ }).waitFor();
    await p.locator('aside').getByRole('link', { name: 'Hausaufgaben' }).click();
    await p.getByRole('heading', { name: 'Hausaufgaben', exact: true }).waitFor();
    check(new URL(p.url()).hash === '#/hausaufgaben', 'Hausaufgaben: über die Seitenleiste erreichbar');
    await p.getByRole('button', { name: 'Neue Hausaufgabe' }).first().click();
    const dlg = p.getByRole('dialog', { name: 'Neue Hausaufgabe' });
    await dlg.waitFor();
    // Pflichtfelder werden geprüft
    await dlg.getByTestId('homework-save').click();
    check((await dlg.getByRole('alert').textContent())?.includes('Titel'), 'Hausaufgaben: Titel ist Pflicht');
    await dlg.getByLabel('Titel').fill('Übungsblatt 6');
    await dlg.getByLabel('Modul').selectOption({ label: 'Controlling' });
    const due = plus(5);
    await dlg.getByLabel('Abgabe', { exact: true }).fill(due);
    // Kalender: Bearbeitungszeitraum heute bis Vortag, Abgabe markiert
    const cal = dlg.getByTestId('homework-calendar');
    check((await cal.locator('[data-work]').count()) === 5, `Hausaufgaben: 5 Arbeitstage bis zum Vortag (${await cal.locator('[data-work]').count()})`);
    check((await cal.locator('[data-due]').count()) === 1, 'Hausaufgaben: Abgabetag im Kalender markiert (kein Arbeitstag)');
    await dlg.getByRole('switch', { name: 'Arbeitseinheiten einplanen' }).click();
    const preview = dlg.getByTestId('homework-preview');
    await preview.locator('input[type=date]').nth(1).waitFor();
    const dates = await preview.locator('input[type=date]').evaluateAll((els) => els.map((e) => e.value));
    check(dates.length === 2 && dates.every((d) => d >= berlinToday && d < due), `Hausaufgaben: Vorschau plant vor dem Abgabetag (${dates.join(', ')})`);
    // Datum in der Vorschau von Hand ändern
    await preview.locator('input[type=date]').first().fill(berlinToday);
    await dlg.getByTestId('homework-save').click();
    await dlg.waitFor({ state: 'detached' });
    await p.waitForTimeout(400);
    const hw = db.homework.find((h) => h.title === 'Übungsblatt 6');
    const units = db.homework_parts.filter((x) => x.homework_id === hw?.id && x.kind === 'unit');
    check(!!hw && hw.due_date === due && hw.module_id === db.modules[4].id, 'Hausaufgaben: gespeichert mit Modul und Abgabedatum');
    check(units.length === 2 && units.some((u) => u.planned_date === berlinToday) && units.every((u) => u.planned_date < due), `Hausaufgaben: Einheiten mit bestätigten Daten eingetragen (${units.map((u) => u.planned_date).join(', ')})`);
    check(db.homework_parts.filter((x) => x.homework_id === hw?.id && x.kind === 'subtask').length === 0, 'Hausaufgaben: keine Unteraufgaben erfunden');
    check(JSON.stringify(db.tasks.map((t) => [t.id, t.study_entry_id, t.deleted_at])) === tasksBefore && JSON.stringify(db.study_entries.map((e) => [e.id, e.study_date])) === entriesBefore, 'Hausaufgaben: bestehende Lernplan-Aufgaben unverändert');
    const item = p.getByTestId('homework-item').filter({ hasText: 'Übungsblatt 6' });
    check((await item.getByTestId('homework-due').textContent())?.includes('in 5 Tagen fällig'), 'Hausaufgaben: Countdown bis zur Abgabe');
    // Erste Einheit abhaken (Person 1)
    await item.getByRole('button', { name: 'Details anzeigen' }).click();
    const firstUnit = units.sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0];
    await item.getByRole('checkbox', { name: `${firstUnit.title} erledigt` }).click();
    await p.waitForTimeout(400);
    check(db.homework_completions.some((x) => x.target_id === firstUnit.id && x.member_id.endsWith('01') && x.is_completed), 'Hausaufgaben: Erledigung je Person gespeichert');
    // Abgabe vorziehen → Neuplanung erst nach Bestätigung, Erledigung bleibt
    await item.getByRole('button', { name: 'Bearbeiten' }).click();
    const edit = p.getByRole('dialog', { name: 'Hausaufgabe bearbeiten' });
    await edit.waitFor();
    const newDue = plus(2);
    await edit.getByLabel('Abgabe', { exact: true }).fill(newDue);
    await edit.getByTestId('homework-save').click();
    await p.getByTestId('homework-replan').waitFor();
    check(db.homework.find((h) => h.id === hw.id).due_date === due, 'Hausaufgaben: neues Abgabedatum erst nach Bestätigung gespeichert');
    await p.getByTestId('homework-replan-apply').click();
    await p.getByRole('dialog').waitFor({ state: 'detached' });
    await p.waitForTimeout(400);
    const after = db.homework_parts.filter((x) => x.homework_id === hw.id && x.kind === 'unit');
    check(db.homework.find((h) => h.id === hw.id).due_date === newDue && after.every((u) => u.planned_date < newDue), `Hausaufgaben: Einheiten an neue Abgabe angepasst (${after.map((u) => u.planned_date).join(', ')})`);
    check(db.homework_completions.some((x) => x.target_id === firstUnit.id && x.is_completed), 'Hausaufgaben: Erledigungen bleiben nach Terminänderung erhalten');
    // Fortschrittskreis vorher (Team-Seite: Person 1)
    const ringPct = async () => {
      await p.goto(`${BASE}#/team/${db.members[0].id}`);
      const ring = p.getByRole('img', { name: /Fortschritt/ }).first();
      await ring.waitFor();
      await p.waitForTimeout(300);
      return Number(await ring.getAttribute('data-pct'));
    };
    const ringBefore = await ringPct();
    await p.goto(`${BASE}#/hausaufgaben`);
    await item.waitFor();
    // Ganze Hausaufgabe abhaken
    await item.getByRole('checkbox', { name: 'Übungsblatt 6 erledigt' }).click();
    await p.waitForTimeout(400);
    check(db.homework_completions.some((x) => x.target_id === hw.id && x.member_id.endsWith('01') && x.is_completed), 'Hausaufgaben: als erledigt markiert');
    const ringAfter = await ringPct();
    check(ringAfter > ringBefore, `Fortschritt: erledigte Hausaufgabe erhöht den Fortschrittskreis sofort (${ringBefore} % → ${ringAfter} %)`);
    // Lernplan: Zeitraum als farbige Leiste, am Abgabetag „Abgabe“
    await p.goto(`${BASE}#/lernplan?ansicht=monat&datum=${newDue}`);
    const bar = p.getByTestId('hw-bar').filter({ has: p.getByText('Übungsblatt 6', { exact: true }) });
    await bar.first().waitFor();
    const dueBar = bar.and(p.locator('[data-due]'));
    check((await dueBar.count()) === 1 && (await dueBar.innerText()).includes('Abgabe') && /erledigt/.test((await dueBar.getAttribute('aria-label')) ?? ''), `Lernplan: Hausaufgabe als Zeitraum-Leiste mit Abgabe (${await dueBar.count()})`);
    await bar.first().click();
    check((await p.getByRole('dialog', { name: 'Hausaufgabe bearbeiten' }).count()) === 1, 'Lernplan: Leiste öffnet die Hausaufgabe');
    await p.keyboard.press('Escape');
    await p.goto(`${BASE}#/lernplan?ansicht=woche&datum=${newDue}`);
    await bar.first().waitFor();
    check((await bar.count()) >= 1, 'Lernplan: Leiste auch in der Wochenansicht');
    // Dashboard-Karte und Schnellaktion
    await p.goto(`${BASE}#/`);
    await p.getByTestId('dashboard-hero').waitFor();
    check((await p.getByTestId('homework-card').count()) === 1, 'Dashboard: Hausaufgaben-Karte');
    await p.getByRole('button', { name: 'Hausaufgabe hinzufügen' }).click();
    check((await p.getByRole('dialog', { name: 'Neue Hausaufgabe' }).count()) === 1, 'Dashboard: „+ Hausaufgabe hinzufügen“ öffnet das Formular');
    await p.keyboard.press('Escape');
    check(errs.length === 0, `keine JavaScript-Fehler (Hausaufgaben)${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();

    // Ohne Migration 005: Funktion bleibt aus, Rest der App läuft
    const saved = { homework: db.homework, homework_parts: db.homework_parts, homework_completions: db.homework_completions };
    delete db.homework;
    delete db.homework_parts;
    delete db.homework_completions;
    try {
      const { page: q, errors: errs2, ctx: c2 } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
      await q.goto(BASE);
      await q.getByRole('button', { name: 'Als Person 2 lernen' }).click();
      await q.getByTestId('dashboard-hero').waitFor();
      await q.waitForTimeout(800);
      check((await q.getByTestId('homework-card').count()) === 0 && (await q.getByRole('button', { name: 'Hausaufgabe hinzufügen' }).count()) === 0, 'Ohne Migration 005: keine Hausaufgaben-Karte, keine Schnellaktion');
      check((await q.locator('#today-card').count()) >= 1, 'Ohne Migration 005: Dashboard funktioniert weiter');
      await q.goto(`${BASE}#/hausaufgaben`);
      await q.getByTestId('homework-setup').waitFor();
      check((await q.getByTestId('homework-setup').textContent())?.includes('005_homework.sql'), 'Ohne Migration 005: verständlicher Hinweis auf die SQL-Datei');
      check(errs2.length === 0, `keine JavaScript-Fehler (ohne Migration 005)${errs2.length ? ': ' + errs2.join(' | ') : ''}`);
      await c2.close();
    } finally {
      Object.assign(db, saved);
    }
  }

  // --- Push: iPhone im Browser → Installationsanleitung --------------------
  {
    const { page: p, errors: errs, ctx: c } = await newPage(browser, { ...devices['iPhone 13'], colorScheme: 'dark', freshPush: true });
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 2 lernen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Erst auf den Home-Bildschirm' });
    await dlg.waitFor({ timeout: 6000 });
    check((await dlg.getByText('Zum Home-Bildschirm').count()) > 0, 'Push (iPhone-Browser): Anleitung „Zum Home-Bildschirm“ statt Berechtigungsanfrage');
    check(!push.calls.some((x) => x.action === 'register'), 'Push (iPhone-Browser): keine Registrierung ohne Installation');
    await shot(p, '40-push-installieren-iphone');
    await dlg.getByRole('button', { name: 'Verstanden' }).click();
    await p.reload();
    await p.getByRole('button', { name: 'Als Person 2 lernen' }).click();
    await p.waitForTimeout(2200);
    check((await p.getByRole('dialog').count()) === 0, 'Push (iPhone-Browser): Anleitung erscheint nicht bei jedem Start erneut');
    await p.goto(`${BASE}#/einstellungen/benachrichtigungen`);
    await p.getByRole('heading', { name: 'Zuerst zum Home-Bildschirm hinzufügen' }).waitFor();
    check(!(await hasHorizontalOverflow(p)), 'L: kein horizontaler Überlauf (Benachrichtigungen, iPhone)');
    check(errs.length === 0, `keine JavaScript-Fehler (Push iPhone)${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }

  // --- Push: „Vielleicht später“ fragt nicht erneut -------------------------
  {
    // Headless-Chromium meldet sonst pauschal „denied“; die Anfrage selbst wird mitgezählt
    const { page: p, ctx: c } = await newPage(browser, { viewport: { width: 1280, height: 900 }, freshPush: true, serviceWorkers: 'allow' });
    await c.addInitScript(fakeNotificationPermission);
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 3 lernen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Bleib auf dem Laufenden.' });
    await dlg.waitFor({ timeout: 6000 });
    check((await dlg.getByText('Controlling steht heute an.').count()) === 1, 'Push-Einführung: Beispielbenachrichtigung wird gezeigt');
    check(await p.evaluate(() => window.__permissionRequests === 0), 'Push-Einführung: Systemberechtigung wird nicht automatisch angefragt');
    await dlg.getByRole('button', { name: 'Vielleicht später' }).click();
    await p.reload();
    await p.getByRole('button', { name: 'Als Person 3 lernen' }).click();
    await p.waitForTimeout(2200);
    check((await p.getByRole('dialog').count()) === 0, 'Push-Einführung: nach „Vielleicht später“ keine erneute Nachfrage');
    await c.close();
  }

  // --- Push: Aktivieren, Einstellungen, Test, Profilwechsel, Abmelden ------
  {
    const { page: p, errors: errs, ctx: c } = await newPage(browser, {
      viewport: { width: 1280, height: 900 },
      colorScheme: 'dark',
      freshPush: true,
      serviceWorkers: 'allow',
    });
    await c.addInitScript(fakeNotificationPermission);
    // Headless-Chromium hat keinen Push-Dienst: subscribe() wird durch ein gleichwertiges Abo ersetzt.
    await c.addInitScript(() => {
      const make = (endpoint) => ({
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) } }),
        unsubscribe: async () => (localStorage.removeItem('e2e.sub'), true),
      });
      PushManager.prototype.subscribe = async function () {
        localStorage.setItem('e2e.sub', 'https://web.push.apple.com/e2e-endpoint');
        return make('https://web.push.apple.com/e2e-endpoint');
      };
      PushManager.prototype.getSubscription = async function () {
        const e = localStorage.getItem('e2e.sub');
        return e ? make(e) : null;
      };
    });
    await p.goto(BASE);
    await p.waitForTimeout(1500); // Service Worker registrieren lassen
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    const dlg = p.getByRole('dialog', { name: 'Bleib auf dem Laufenden.' });
    await dlg.waitFor({ timeout: 8000 });
    await shot(p, '41-push-einfuehrung-desktop');
    check(await p.evaluate(() => window.__permissionRequests === 0), 'Push: keine Berechtigungsanfrage vor dem Tippen');
    await dlg.getByRole('button', { name: 'Benachrichtigungen aktivieren' }).click();
    await p.getByRole('dialog', { name: 'Alles eingerichtet!' }).waitFor({ timeout: 15000 });
    check(await p.evaluate(() => window.__permissionRequests === 1), 'Push: Berechtigung genau einmal – beim Tippen auf „aktivieren“ – angefragt');
    const reg = [...push.devices.values()][0];
    check(!!reg && reg.memberId.endsWith('01') && reg.endpoint === 'https://web.push.apple.com/e2e-endpoint', 'Push: Gerät mit Abo für Person 1 registriert');
    check(push.calls.filter((x) => x.action === 'register').every((x) => /^[A-Za-z0-9_-]{43}$/.test(x.token)), 'Push: geheimer Gerätetoken wird mitgeschickt');
    await p.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    await p.getByRole('heading', { name: 'Benachrichtigungen sind aktiviert' }).waitFor();
    check((await p.getByText('Dieses Gerät empfängt Erinnerungen für Person 1.').count()) === 1, 'Push: Status „aktiviert“ mit Lernprofil');
    await p.getByRole('switch', { name: 'Prüfungserinnerungen' }).click();
    await p.waitForTimeout(900);
    check(reg.prefs.exams === false, 'Push: Einstellung (Prüfungserinnerungen aus) wird gespeichert');
    // Uhrzeit in der Ruhezeit (z. B. 23:05 bei Ruhezeit ab 21:00): App sagt, wann die Nachricht stattdessen kommt
    await p.getByLabel('Erinnerung an Offenes').fill('23:05');
    await p.waitForTimeout(900);
    const warn = p.getByTestId('quiet-warning');
    check(reg.prefs.eveningTime === '23:05' && (await warn.count()) === 1 && (await warn.innerText()).includes('20:45'), `Push: Hinweis bei Uhrzeit in der Ruhezeit (${(await warn.allInnerTexts()).join(' | ')})`);
    await p.getByLabel('Erinnerung an Offenes').fill('19:00');
    await p.waitForTimeout(900);
    check((await warn.count()) === 0, 'Push: kein Hinweis außerhalb der Ruhezeit');
    await p.getByRole('button', { name: 'Testbenachrichtigung senden' }).click();
    await p.getByText('Vom Push-Dienst zum Versand angenommen.').waitFor();
    check(push.tests.length === 1, 'Push: Testbenachrichtigung über den Server angefordert');
    await shot(p, '42-push-einstellungen-desktop');
    check(await p.getByRole('button', { name: /Erneut möglich in|Testbenachrichtigung senden/ }).isEnabled(), 'Push: Testknopf nach Erfolg weiter erreichbar');
    await p.getByRole('button', { name: 'Testbenachrichtigung senden' }).click();
    await p.getByRole('button', { name: /Erneut möglich in \d+ s/ }).waitFor();
    check(push.tests.length === 1, 'Push: Sperrfrist verhindert Serien von Testnachrichten');
    // Profilwechsel: ausdrücklich fragen, für wen das Gerät Erinnerungen erhält
    await p.getByRole('button', { name: /Profilmenü/ }).click();
    await p.getByRole('menuitem', { name: 'Person 2' }).click();
    const sw = p.getByRole('alertdialog', { name: 'Erinnerungen für Person 2 erhalten?' });
    await sw.waitFor();
    await sw.getByRole('button', { name: 'Für Person 2' }).click();
    await p.waitForTimeout(500);
    check(reg.memberId.endsWith('02'), 'Push: Profilwechsel überträgt die Erinnerungen auf Person 2');
    check(push.devices.size === 1, 'Push: kein doppeltes Abo beim Profilwechsel');
    // Neuladen: kein erneutes Fragen, Status bleibt aktiv
    await p.reload();
    await p.getByRole('button', { name: 'Als Person 2 lernen' }).click();
    await p.goto(`${BASE}#/einstellungen/benachrichtigungen`);
    await p.getByRole('heading', { name: 'Benachrichtigungen sind aktiviert' }).waitFor();
    check((await p.getByRole('dialog').count()) === 0, 'Push: nach der Aktivierung keine erneute Einführung');
    await p.getByRole('switch', { name: 'Benachrichtigungen auf diesem Gerät' }).click();
    await p.getByRole('button', { name: 'Ausschalten' }).click();
    await p.getByRole('heading', { name: 'Benachrichtigungen sind deaktiviert' }).waitFor();
    check(push.devices.size === 0, 'Push: Deaktivieren meldet das Gerät beim Server ab');
    check(errs.length === 0, `keine JavaScript-Fehler (Push Desktop)${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }
} catch (err) {
  failures++;
  console.error('✗ Abbruch:', err);
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : '\nALLE BROWSERTESTS BESTANDEN');
process.exit(failures ? 1 : 0);
