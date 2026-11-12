// Browsertests der NEUEN App (/app/) und des Admin-Bereichs (/app/admin/)
// gegen eine nachgebildete Supabase-API (scripts/mock-app-supabase.mjs).
// Vorher bauen: npm run build:e2e:app
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createAppMock } from './mock-app-supabase.mjs';

// Playwright ist global vorinstalliert (bzw. in CI per npm install --no-save)
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}/Semester3/app/`;
const API = 'https://mock-project.supabase.co';
const mock = createAppMock();
let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n    ${String(err?.message ?? err).split('\n')[0]}`);
  }
}
// SHOTS=<ordner> speichert Bildschirmfotos der wichtigsten Schritte
const SHOTS = process.env.SHOTS;
const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
};
const assert = (c, msg) => {
  if (!c) throw new Error(msg);
};

const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env, VITE_EDITION: 'app', VITE_BASE_PATH: '/Semester3/app/' },
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview server timeout')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(timer), resolve()));
});

const browser = await chromium.launch();
async function context(device = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', ...device });
  await ctx.route(`${API}/auth/v1/**`, mock.handleAuth);
  await ctx.route(`${API}/rest/v1/**`, mock.handleRest);
  await ctx.route(`${API}/realtime/**`, (r) => r.abort());
  await ctx.route(`${API}/functions/v1/**`, mock.handleFunctions);
  return ctx;
}
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  return p;
};

try {
  console.log('App: Konto und Lerngruppe');
  const ctxA = await context();
  const a = watch(await ctxA.newPage());

  await check('Startseite zeigt die Anmeldung (ohne Profilwahl)', async () => {
    await a.goto(BASE);
    await a.getByTestId('auth-signin').waitFor({ timeout: 10000 });
    await a.waitForTimeout(900);
    await shot(a, '01-anmeldung');
    assert((await a.getByText('Wer lernt heute?').count()) === 0, 'Profilwahl sichtbar');
  });
  await check('Google/Apple erscheinen nur, wenn im Projekt eingeschaltet', async () => {
    assert((await a.getByRole('button', { name: /Mit Google/ }).count()) === 0, 'Google-Knopf ohne Konfiguration');
    assert((await a.getByRole('button', { name: /Mit Apple/ }).count()) === 0, 'Apple-Knopf ohne Konfiguration');
  });
  await check('Registrierung: klarer Wechsel, Name nicht abgeschnitten, Passwort prüfbar', async () => {
    await a.getByRole('radio', { name: 'Neues Konto' }).click();
    await a.getByTestId('auth-signup').waitFor();
    await a.waitForTimeout(500);
    // Rahmen des Namensfelds liegt vollständig im sichtbaren Bereich
    const clip = await a.getByLabel('Wie heißt du?').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const box = el.closest('.overflow-hidden')?.getBoundingClientRect();
      return box ? { left: r.left - box.left, right: box.right - r.right } : { left: 9, right: 9 };
    });
    assert(clip.left >= 2 && clip.right >= 2, `Namensfeld abgeschnitten: ${JSON.stringify(clip)}`);
    await a.getByLabel('Wie heißt du?').fill('Anna');
    await a.getByLabel('E-Mail').fill('anna@example.com');
    await a.getByLabel('Passwort', { exact: true }).fill('kurz');
    await a.getByRole('button', { name: 'Passwort anzeigen' }).click();
    assert((await a.getByLabel('Passwort', { exact: true }).getAttribute('type')) === 'text', 'Passwort sichtbar');
    await a.getByRole('button', { name: 'Konto erstellen' }).click();
    await a.getByText('Mindestens 10 Zeichen.').first().waitFor();
    await shot(a, '02-registrierung');
  });
  await check('Erster Start: „Wie möchtest du lernen?“ mit drei Wegen', async () => {
    await a.getByLabel('Passwort', { exact: true }).fill('sicheresPasswort1');
    await a.getByRole('button', { name: 'Konto erstellen' }).click();
    await a.getByTestId('welcome-screen').waitFor();
    for (const id of ['join', 'solo', 'group']) await a.getByTestId(`welcome-${id}`).waitFor();
    assert((await a.getByText('Wie möchtest du lernen?').count()) > 0, 'Frage sichtbar');
    await a.waitForTimeout(900);
    await shot(a, '03-willkommen');
  });
  await check('Eigene Gruppe: Gruppenpass wählen → Kauf simulieren → Gruppe erstellen', async () => {
    await a.getByTestId('welcome-group').click();
    await a.getByTestId('checkout-group').waitFor();
    for (const t of ['4,99 €', '24,99 €']) assert((await a.getByTestId('checkout-group').getByText(t, { exact: true }).count()) > 0, `Preis ${t}`);
    await a.getByTestId('offer-group_monthly').click();
    await shot(a, '04-gruppenpass');
    await a.getByTestId('checkout-buy').click();
    await a.getByTestId('group-panel').waitFor();
    assert(mock.state.betaPurchases.some((b) => b.plan === 'group_monthly'), 'Beta-Kauf erfasst');
    await a.getByTestId('group-name').fill('Gruppe A');
    await a.getByTestId('group-create').click();
    await a.waitForFunction(() => !document.querySelector('[data-testid="welcome-screen"]'), null, { timeout: 10000 });
  });
  await check('Einführung startet, hebt echte Elemente hervor, Überspringen oben links', async () => {
    await a.getByTestId('tour').waitFor({ timeout: 8000 });
    await a.getByTestId('tour-step-welcome').waitFor();
    const skip = await a.getByTestId('tour-skip').boundingBox();
    assert(skip && skip.x < 40 && skip.y < 60, `Überspringen nicht oben links: ${JSON.stringify(skip)}`);
    await shot(a, '05-einfuehrung-start');
    await a.getByTestId('tour-next').click();
    await a.getByTestId('tour-step-subjects').waitFor();
    await a.waitForTimeout(700);
    await shot(a, '06-einfuehrung-faecher');
    // bis zum Ende durchklicken
    for (let i = 0; i < 12 && (await a.getByTestId('tour-next').count()); i++) {
      await a.getByTestId('tour-next').click();
      await a.waitForTimeout(250);
    }
    await a.getByTestId('tour-step-done').waitFor();
    await shot(a, '07-einfuehrung-ende');
    await a.getByTestId('tour-done').click();
    await a.getByTestId('tour').waitFor({ state: 'detached' });
    assert(mock.state.users.find((u) => u.email === 'anna@example.com').tutorial_done, 'Einführung gespeichert');
    await a.reload();
    await a.waitForTimeout(2500);
    assert((await a.getByTestId('tour').count()) === 0, 'Einführung erscheint nicht erneut');
  });
  await check('Keine Materialien / Uploads in der Navigation', async () => {
    assert((await a.getByRole('link', { name: 'Materialien' }).count()) === 0, 'Materialien-Link vorhanden');
    await a.goto(`${BASE}#/materialien`);
    await a.waitForFunction(() => location.hash === '#/' || location.hash === '');
    assert((await a.locator('input[type=file]').count()) === 0, 'Datei-Eingabe vorhanden');
  });
  await check('Lerngruppe: Einladungscode für Inhaber sichtbar', async () => {
    await a.goto(`${BASE}#/einstellungen/gruppe`);
    await a.getByTestId('invite-code').waitFor();
    const code = (await a.getByTestId('invite-code').innerText()).replace('-', '');
    assert(/^[A-HJ-NP-Z2-9]{8}$/.test(code), `Code-Format: ${code}`);
    assert((await a.getByTestId('group-members').locator('li').count()) === 1, 'ein Mitglied');
    await shot(a, '04-einstellungen-gruppe');
  });
  await check('Konto zeigt E-Mail; Tarif & Abo mit Solo/Gruppe, Kündigen, Einführung erneut', async () => {
    await a.goto(`${BASE}#/einstellungen/konto`);
    assert((await a.getByTestId('account-email').innerText()) === 'anna@example.com', 'E-Mail');
    await a.goto(`${BASE}#/einstellungen/plus`);
    await a.getByTestId('plus-section').waitFor();
    assert((await a.getByTestId('own-plan').innerText()).includes('Gruppe monatlich'), 'eigener Tarif');
    await a.getByTestId('tier-solo').click();
    for (const t of ['2,49 €', '11,99 €']) assert((await a.getByTestId('checkout-solo').getByText(t, { exact: true }).count()) > 0, `Preis ${t}`);
    await shot(a, '08-tarif');
    await a.getByTestId('plan-cancel').click();
    await a.getByRole('button', { name: 'Kündigen' }).last().click();
    await a.waitForFunction(() => !document.querySelector('[data-testid="plan-cancel"]'));
    await a.getByTestId('replay-tour').click();
    await a.getByTestId('tour').waitFor();
    await a.keyboard.press('Escape');
    await a.getByTestId('tour').waitFor({ state: 'detached' });
  });

  console.log('App: Einladung per Link');
  const group = mock.state.groups.find((g) => g.kind === 'team');
  const ctxB = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const b = watch(await ctxB.newPage());
  await check('Einladungslink → Anmeldung mit Hinweis', async () => {
    await b.goto(`${BASE}#/beitreten/${group.code}`);
    await b.getByText('um der Lerngruppe beizutreten', { exact: false }).waitFor();
  });
  await check('Kostenlos registrieren → Einladung mit Vorschau → beitreten', async () => {
    await b.getByRole('radio', { name: 'Neues Konto' }).click();
    await b.getByLabel('Wie heißt du?').fill('Ben');
    await b.getByLabel('E-Mail').fill('ben@example.com');
    await b.getByLabel('Passwort', { exact: true }).fill('nochSicherer22');
    await b.getByRole('button', { name: 'Konto erstellen' }).click();
    await b.getByTestId('invite-preview').waitFor();
    assert((await b.getByTestId('invite-preview').innerText()).includes('Gruppe A'), 'Vorschau zeigt Gruppe');
    await b.waitForTimeout(1200);
    await shot(b, '06-einladung-handy');
    await b.getByTestId('join-submit').click();
    await b.waitForFunction(() => !document.querySelector('[data-testid="welcome-screen"]'), null, { timeout: 10000 });
    assert(mock.state.memberships.filter((m) => m.group_id === group.id).length === 2, 'zwei Mitglieder');
    // Einführung auf dem Handy: Tab-Leiste wird hervorgehoben, Überspringen oben links
    await b.getByTestId('tour').waitFor({ timeout: 8000 });
    await b.getByTestId('tour-next').click();
    await b.waitForTimeout(700);
    await shot(b, '09-einfuehrung-handy');
    await b.getByTestId('tour-skip').click();
    await b.getByTestId('tour').waitFor({ state: 'detached' });
  });
  await check('Mitglied sieht keinen Einladungscode, kann austreten', async () => {
    await b.goto(`${BASE}#/einstellungen/gruppe`);
    await b.getByTestId('group-members').waitFor();
    assert((await b.getByTestId('invite-code').count()) === 0, 'Code für Mitglied sichtbar');
    await b.getByTestId('leave-group').waitFor();
  });
  await check('Kein seitliches Überlaufen auf dem Handy', async () => {
    for (const path of ['#/', '#/einstellungen', '#/einstellungen/gruppe', '#/einstellungen/plus']) {
      await b.goto(`${BASE}${path}`);
      await b.waitForTimeout(400);
      const over = await b.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(over <= 1, `${path}: ${over}px zu breit`);
    }
  });
  await check('Daten anderer Gruppen werden nie angefragt (alle Anfragen mit Konto)', async () => {
    assert(mock.state.requests.filter((r) => r.kind === 'rest' && !r.user).length === 0, 'Anfrage ohne Anmeldung');
  });
  await check('Abmelden entfernt Sitzung und Zwischenspeicher', async () => {
    await b.goto(`${BASE}#/einstellungen/konto`);
    // Abmelden lädt die Seite neu – erst danach den Speicher prüfen (sonst wechselt der Kontext mitten im Prüfen)
    await Promise.all([b.waitForEvent('load'), b.getByTestId('sign-out').click()]);
    await b.getByTestId('auth-signin').waitFor();
    /** @type {string[]} */
    let left = [];
    for (let i = 0; i < 5; i++) {
      try {
        left = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('studyspace.app.cache.') || k.includes('auth-token') || k === 'studyspace-app-auth'));
        break;
      } catch {
        await b.waitForLoadState('load');
      }
    }
    assert(left.length === 0, `übrig: ${left.join(', ')}`);
  });
  await check('Anmelden mit falschem Passwort → verständliche Meldung', async () => {
    await b.getByLabel('E-Mail').fill('ben@example.com');
    await b.getByLabel('Passwort', { exact: true }).fill('falsch12345');
    await b.getByRole('button', { name: 'Anmelden' }).click();
    await b.getByText('E-Mail oder Passwort ist falsch.').waitFor();
  });
  await check('„Angemeldet bleiben“ aus → Sitzung nur im Tab', async () => {
    await b.getByLabel('Passwort', { exact: true }).fill('nochSicherer22');
    await b.getByRole('switch', { name: 'Angemeldet bleiben' }).click();
    await b.getByRole('button', { name: 'Anmelden' }).click();
    await b.waitForFunction(() => !document.querySelector('[data-testid="auth-signin"]'), null, { timeout: 10000 });
    const where = await b.evaluate(() => ({ local: !!localStorage.getItem('studyspace-app-auth'), session: !!sessionStorage.getItem('studyspace-app-auth') }));
    assert(!where.local && where.session, JSON.stringify(where));
  });

  console.log('App: Alleine lernen (Testphase → nur lesen)');
  const ctxS = await context();
  const so = watch(await ctxS.newPage());
  await check('Alleine lernen: 14 Tage kostenlos ohne Zahlungsdaten', async () => {
    await so.goto(BASE);
    await so.getByRole('radio', { name: 'Neues Konto' }).click();
    await so.getByLabel('Wie heißt du?').fill('Sam');
    await so.getByLabel('E-Mail').fill('sam@example.com');
    await so.getByLabel('Passwort', { exact: true }).fill('sicheresPasswort3');
    await so.getByRole('button', { name: 'Konto erstellen' }).click();
    await so.getByTestId('welcome-solo').click();
    await so.getByTestId('trial-start').click();
    await so.waitForFunction(() => !document.querySelector('[data-testid="welcome-screen"]'), null, { timeout: 10000 });
    await so.getByTestId('tour').waitFor({ timeout: 8000 });
    await so.getByTestId('tour-skip').click();
    assert((await so.getByTestId('plus-banner').count()) === 0, 'kein Hinweis während der Testphase');
    assert((await so.getByRole('link', { name: 'Team' }).count()) === 1, 'Navigation vorhanden');
  });
  await check('Nach Ablauf: ruhiger Nur-Lesen-Hinweis, ausblendbar', async () => {
    const u = mock.state.users.find((x) => x.email === 'sam@example.com');
    u.ents.find((e) => e.plan === 'trial').ends_at = new Date(Date.now() - 864e5).toISOString();
    await so.reload();
    await so.getByTestId('plus-banner').waitFor({ timeout: 10000 });
    assert((await so.getByTestId('plus-banner').innerText()).includes('Testphase ist beendet'), 'Text');
    await shot(so, '10-nur-lesen');
    await so.getByRole('button', { name: 'Für heute ausblenden' }).click();
    await so.getByTestId('plus-banner').waitFor({ state: 'detached' });
  });

  console.log('Admin-Bereich');
  const ctxC = await context();
  const c = watch(await ctxC.newPage());
  await check('Ohne Einrichtungsschlüssel: Einrichtung gesperrt', async () => {
    mock.state.adminSetupPossible = false;
    await c.goto(`${BASE}admin/`);
    await c.getByTestId('admin-setup-locked').waitFor();
  });
  await check('Ersteinrichtung verlangt Schlüssel und starkes Passwort', async () => {
    mock.state.adminSetupPossible = true;
    await c.reload();
    await c.getByTestId('admin-setup').waitFor();
    await c.getByLabel('Einrichtungsschlüssel (ADMIN_SETUP_TOKEN)').fill('falsch');
    await c.getByLabel('Neues Passwort').fill('KurzesPW1');
    await c.getByLabel('Passwort wiederholen').fill('KurzesPW1');
    await c.getByRole('button', { name: 'Admin einrichten' }).click();
    await c.getByText('Mindestens 14 Zeichen.').waitFor();
    await c.getByLabel('Neues Passwort').fill('LangesAdminPasswort2026');
    await c.getByLabel('Passwort wiederholen').fill('LangesAdminPasswort2026');
    await c.getByRole('button', { name: 'Admin einrichten' }).click();
    await c.getByText('Einrichtungsschlüssel falsch.').waitFor();
    await c.getByLabel('Einrichtungsschlüssel (ADMIN_SETUP_TOKEN)').fill('test-setup-token-0123456789abcdef');
    await c.getByRole('button', { name: 'Admin einrichten' }).click();
    await c.getByTestId('admin-login').waitFor();
  });
  await check('Anmeldung „Luke“ → Zwei-Faktor einrichten (QR) → Dashboard', async () => {
    await c.getByLabel('Benutzername').fill('Luke');
    await c.getByLabel('Passwort').fill('LangesAdminPasswort2026');
    await c.getByRole('button', { name: 'Weiter' }).click();
    await c.getByTestId('admin-mfa').waitFor();
    await c.getByAltText('QR-Code für die Authenticator-App').waitFor();
    await shot(c, '07-admin-2fa');
    await c.getByLabel('Code').fill('000000');
    await c.getByRole('button', { name: 'Bestätigen' }).click();
    await c.getByText('Der Code stimmt nicht', { exact: false }).waitFor();
    await c.getByLabel('Code').fill('123456');
    await c.getByRole('button', { name: 'Bestätigen' }).click();
    await c.getByTestId('admin-overview').waitFor();
  });
  await check('Keine erfundenen Umsätze ohne Zahlungssystem', async () => {
    await c.getByTestId('revenue-none').waitFor();
    await shot(c, '08-admin-uebersicht');
    assert((await c.getByText('MRR', { exact: true }).count()) === 0, 'MRR angezeigt');
    assert((await c.getByTestId('stat-users').innerText()).includes('3'), 'drei Benutzer');
  });
  await check('Beta-Käufe getrennt sichtbar und abschaltbar', async () => {
    await c.getByText('Kauf simulieren in der App').waitFor();
    await c.getByRole('switch', { name: 'Beta-Käufe erlauben' }).click();
    await c.waitForFunction(() => true);
    await c.waitForTimeout(500);
    assert(mock.state.betaEnabled === false, 'Beta aus');
    await c.getByRole('switch', { name: 'Beta-Käufe erlauben' }).click();
    await c.waitForTimeout(500);
    assert(mock.state.betaEnabled === true, 'Beta an');
  });
  await check('Finanzen: Gewinn-Simulator mit Diagramm, Skalierung und aktuellen Zahlen', async () => {
    await c.getByRole('radio', { name: 'Finanzen' }).or(c.getByRole('button', { name: 'Finanzen' })).first().click();
    await c.getByTestId('admin-finance').waitFor();
    await c.getByRole('img', { name: 'Brutto, Netto und Gewinn je Monat' }).waitFor();
    const before = await c.getByTestId('sim-profit').innerText();
    await c.getByTestId('sim-from-current').click();
    await c.getByLabel('Neue zahlende Abos pro Monat').fill('200');
    await c.waitForTimeout(300);
    assert((await c.getByTestId('sim-profit').innerText()) !== before, 'Simulation reagiert');
    await c.getByRole('img', { name: 'Brutto, Netto und Gewinn je Monat' }).hover({ position: { x: 300, y: 120 } });
    await c.waitForTimeout(200);
    await shot(c, '11-admin-finanzen');
    await c.getByTestId('sim-table-toggle').click();
    assert((await c.locator('table tbody tr').count()) >= 12, 'Monatstabelle');
  });
  await check('Benutzerliste', async () => {
    await c.getByRole('radio', { name: 'Benutzer' }).or(c.getByRole('button', { name: 'Benutzer' })).first().click();
    await c.getByTestId('admin-users').getByText('anna@example.com').waitFor();
  });

  await check('Keine Skriptfehler', async () => assert(errors.length === 0, errors.join(' | ')));
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${passed} bestanden, ${failures.length} fehlgeschlagen`);
if (failures.length) process.exit(1);
