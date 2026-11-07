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
  const bar = nav.locator('.glass').first();
  for (const [label, hash] of [['Fächer', '#/faecher'], ['Team', '#/team'], ['Lernplan', '#/lernplan'], ['Home', '#/']]) {
    await nav.getByRole('link', { name: label }).click();
    await p.waitForTimeout(300);
    check(new URL(p.url()).hash.split('?')[0] === hash, `Tab-Leiste (${name}): Antippen öffnet „${label}“`);
  }
  // Wischgesten sind entfernt: Ziehen über die Leiste wechselt die Seite nicht
  const box = await bar.boundingBox();
  const y = box.y + box.height / 2;
  const tab = (i) => box.x + 6 + ((box.width - 12) / 5) * (i + 0.5);
  await p.mouse.move(tab(0), y);
  await p.mouse.down();
  await p.mouse.move(tab(3), y, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  check(new URL(p.url()).hash === '#/', `Tab-Leiste (${name}): keine Wischnavigation mehr`);
  const touchAction = await bar.evaluate((el) => getComputedStyle(el).touchAction);
  check(touchAction !== 'none', `Tab-Leiste (${name}): normales Scrollen nicht blockiert (touch-action=${touchAction})`);

  // Liquid Glass: Hintergrundunschärfe auf Leiste, Logo und Profilbutton
  for (const [what, loc] of [['Tab-Leiste', bar], ['Logo', p.getByTestId('mobile-logo')], ['Profilbutton', p.getByTestId('profile-button')]]) {
    const bf = await loc.evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter || '');
    check(/blur\(/.test(bf), `Liquid Glass (${name}): ${what} mit Hintergrundunschärfe`);
  }

  // Profilbutton: Avatar exakt mittig, Knopf exakt rund
  const pb = p.getByTestId('profile-button');
  const btn = await pb.boundingBox();
  const av = await pb.locator('span').first().boundingBox();
  const dx = Math.abs(btn.x + btn.width / 2 - (av.x + av.width / 2));
  const dy = Math.abs(btn.y + btn.height / 2 - (av.y + av.height / 2));
  check(dx <= 0.5 && dy <= 0.5 && Math.abs(btn.width - btn.height) <= 0.5, `Profilbutton (${name}): Avatar zentriert (Δx=${dx}, Δy=${dy}), Knopf rund (${btn.width}×${btn.height})`);

  // Logo bleibt beim Scrollen an seiner Position
  const logo = p.getByTestId('mobile-logo');
  const before = await logo.boundingBox();
  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(400);
  const after = await logo.boundingBox();
  const scrolled = await p.evaluate(() => window.scrollY);
  check(scrolled > 0 && Math.abs(after.y - before.y) <= 1, `Kopfzeile (${name}): Logo bleibt beim Scrollen oben (vorher ${before.y}, nachher ${after.y})`);

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
  await shot(page, '01-profilauswahl-desktop-dark');
  await page.getByRole('button', { name: 'Als Person 1 lernen' }).click();
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
  for (const [path, name] of [['#/', 'dashboard'], ['#/lernplan', 'lernplan-monat'], ['#/faecher', 'faecher'], [`#/faecher/${db.modules[4].id}`, 'modul-controlling'], ['#/pruefungen', 'pruefungen'], ['#/materialien', 'materialien'], ['#/einstellungen', 'einstellungen'], ['#/verlauf', 'verlauf']]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(500);
    check(!(await hasHorizontalOverflow(page)), `L: kein horizontaler Überlauf (${name}, 1440 px)`);
    await shot(page, `10-${name}-desktop-dark`);
  }
  // Desktop: Seitenleiste als Liquid Glass, Profilbutton, Fortschrittskreise
  await page.goto(`${BASE}#/`);
  await page.waitForTimeout(2200);
  const sideBf = await page.locator('aside .glass').first().evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter || '');
  check(/blur\(/.test(sideBf), `Liquid Glass (Desktop): Seitenleiste mit Hintergrundunschärfe (${sideBf})`);
  const activeNav = await page.locator('aside [aria-current="page"] .lens').count();
  check(activeNav === 1, 'Seitenleiste: aktiver Navigationspunkt mit gläserner Hervorhebung');
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

  // --- Durchsichtigkeit des Glases: Regler wirkt sofort und bleibt gespeichert ---
  {
    await page.goto(`${BASE}#/einstellungen`);
    const slider = page.locator('#ss-glass-clarity');
    await slider.waitFor();
    const lgK = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lg-k').trim());
    const previewBlur = () => page.getByTestId('glass-preview').evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter || '');
    check((await lgK()) === '1', `Glas-Regler: Standardwert ausgewogen (--lg-k=${await lgK()})`);
    await slider.fill('100');
    const clear = await previewBlur();
    check((await lgK()) === '0.25', `Glas-Regler: „Sehr klar“ wirkt sofort (--lg-k=${await lgK()})`);
    await slider.fill('0');
    const milky = await previewBlur();
    check((await lgK()) === '4' && clear !== milky, `Glas-Regler: Live-Vorschau ändert sich (${clear} → ${milky})`);
    await slider.fill('100');
    await page.reload();
    await page.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await slider.waitFor();
    check((await slider.inputValue()) === '100' && (await lgK()) === '0.25', 'Glas-Regler: Einstellung bleibt nach dem Neuladen erhalten');
    await page.getByRole('button', { name: 'Auf Standard zurücksetzen' }).click();
    check((await lgK()) === '1' && (await slider.inputValue()) === '50', 'Glas-Regler: Zurücksetzen auf Standard');
  }

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
      await p.goto(`${BASE}#/einstellungen`);
      await p.getByRole('heading', { name: 'Einstellungen' }).waitFor();
      check((await p.getByRole('radiogroup', { name: 'Haptisches Feedback' }).count()) === 1, 'Haptik: Einstellung „Haptisches Feedback“ vorhanden, wo unterstützt');
      // iOS zoomt bei Eingabefeldern unter 16 px automatisch hinein – das darf nicht passieren
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
    ]) {
      await p.goto(`${BASE}${path}`);
      await p.waitForTimeout(500);
      check(!(await hasHorizontalOverflow(p)), `L: kein horizontaler Überlauf (${pname}, ${name})`);
      await shot(p, `21-${pname}-${name}`);
    }
    if (name === '320') {
      const isDark = await p.evaluate(() => document.documentElement.classList.contains('dark'));
      check(!isDark, 'M: Systemeinstellung „hell“ wird übernommen');
      await p.getByRole('radio', { name: 'Dunkel' }).click();
      check(await p.evaluate(() => document.documentElement.classList.contains('dark')), 'M: manuelle Umstellung auf Dunkel');
    }
    check(errs.length === 0, `keine JavaScript-Fehler (${name})${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
  }

  // --- Neue Bereiche: Timeline, Analyse, Fokus ---------------------------
  {
    const t0 = Date.now();
    // Laufender Timer, der in gut einer Sekunde endet (25 Min. Fokus fast vorbei)
    const timer = { phase: 'focus', durationSec: 1500, endsAt: t0 + 2500, pausedRemainingSec: null, startedAt: t0 - 1497500, elapsedBeforePauseSec: 0, moduleId: db.modules[4].id };
    const { page: p, errors: errs, ctx: c } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    await c.addInitScript((t) => {
      if (!sessionStorage.getItem('focus-seeded')) {
        localStorage.setItem('studyspace.focus.v1', JSON.stringify({ timer: t, settings: { presetIndex: 0, sound: false } }));
        sessionStorage.setItem('focus-seeded', '1');
      }
    }, timer);
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await p.getByRole('heading', { name: /Person 1/ }).waitFor();

    // Fokus: abgelaufene Phase wird gespeichert und die Pause beginnt
    await p.waitForTimeout(3500);
    const fs = db.focus_sessions;
    check(fs.length === 1 && fs[0].duration_seconds === 1500 && fs[0].member_id.endsWith('01') && fs[0].module_id === db.modules[4].id, `Fokus: abgelaufene Fokusphase gespeichert (${JSON.stringify(fs.map((x) => x.duration_seconds))})`);
    await p.goto(`${BASE}#/fokus`);
    await p.getByRole('heading', { name: 'Fokus', exact: true }).waitFor();
    check((await p.getByText('Pause', { exact: true }).count()) > 0, 'Fokus: nach der Fokusphase folgt automatisch die Pause');
    await p.getByRole('radio', { name: '25 / 5' }).click();
    const clock = () => p.locator('p.num').filter({ hasText: /^\d\d:\d\d$/ }).first().textContent();
    check((await clock()) === '25:00', 'Fokus: Rhythmus 25/5 setzt den Timer zurück');
    await p.getByRole('button', { name: 'Fokus starten' }).click();
    await p.waitForTimeout(2300);
    const running = await clock();
    check(/^24:5\d$/.test(running ?? ''), `Fokus: Timer läuft (${running})`);
    await p.getByRole('button', { name: 'Fokus pausieren' }).click();
    const paused = await clock();
    await p.waitForTimeout(1500);
    check((await clock()) === paused, 'Fokus: Pause hält den Timer an');
    await p.reload();
    await p.getByRole('button', { name: 'Als Person 1 lernen' }).click();
    await p.getByRole('heading', { name: 'Fokus', exact: true }).waitFor();
    check((await clock()) === paused, 'Fokus: angehaltener Stand bleibt nach dem Neuladen erhalten');
    check((await p.getByText('25 Min.').count()) > 0, 'Fokus: gespeicherte Lernzeit wird angezeigt');
    await shot(p, '30-fokus-desktop-light');

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
    await shot(p, '32-analyse-desktop-light');
    check(errs.length === 0, `keine JavaScript-Fehler (Fokus/Analyse)${errs.length ? ': ' + errs.join(' | ') : ''}`);
    await c.close();
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
