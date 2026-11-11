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
  await check('Registrierung prüft das Passwort', async () => {
    await a.getByTestId('auth-to-signup').click();
    await a.getByLabel('Dein Name').fill('Anna');
    await a.getByLabel('E-Mail').fill('anna@example.com');
    await a.getByLabel('Passwort').fill('kurz');
    await a.getByRole('button', { name: 'Konto erstellen' }).click();
    await a.getByText('Mindestens 10 Zeichen.').waitFor();
  });
  await check('Registrierung → Gruppenauswahl; ohne Plus kein Erstellen', async () => {
    await a.getByLabel('Passwort').fill('sicheresPasswort1');
    await a.getByRole('button', { name: 'Konto erstellen' }).click();
    await a.getByTestId('group-screen').waitFor();
    await a.getByRole('radio', { name: 'Erstellen' }).or(a.getByRole('button', { name: 'Erstellen' })).first().click();
    await a.getByTestId('plus-required').waitFor();
    await shot(a, '02-gruppe-ohne-plus');
    assert((await a.getByRole('button', { name: /kaufen|bezahlen|abonnieren/i }).count()) === 0, 'Kaufknopf ohne Zahlungssystem');
  });
  await check('Mit Plus (serverseitig) Gruppe erstellen → Dashboard', async () => {
    mock.state.users.find((u) => u.email === 'anna@example.com').plus = true;
    await a.reload();
    await a.getByTestId('group-screen').waitFor();
    await a.getByRole('radio', { name: 'Erstellen' }).or(a.getByRole('button', { name: 'Erstellen' })).first().click();
    await a.getByTestId('group-name').fill('Gruppe A');
    await a.getByTestId('group-create').click();
    await a.getByTestId('header-greeting').or(a.locator('main')).first().waitFor({ timeout: 10000 });
    await a.waitForFunction(() => !document.querySelector('[data-testid="group-screen"]'));
    await a.waitForTimeout(1200);
    await shot(a, '03-dashboard');
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
  await check('Konto zeigt E-Mail, Plus-Seite zeigt Tarife ohne Kaufknopf', async () => {
    await a.goto(`${BASE}#/einstellungen/konto`);
    assert((await a.getByTestId('account-email').innerText()) === 'anna@example.com', 'E-Mail');
    await a.goto(`${BASE}#/einstellungen/plus`);
    await a.getByTestId('plans').waitFor();
    for (const t of ['4,99 €', '19,99 €', '0 €']) assert((await a.getByText(t, { exact: true }).count()) > 0, `Preis ${t}`);
    await shot(a, '05-plus');
  });

  console.log('App: Einladung per Link');
  const group = mock.state.groups[0];
  const ctxB = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const b = watch(await ctxB.newPage());
  await check('Einladungslink → Anmeldung mit Hinweis', async () => {
    await b.goto(`${BASE}#/beitreten/${group.code}`);
    await b.getByText('um der Lerngruppe beizutreten', { exact: false }).waitFor();
  });
  await check('Kostenlos registrieren → Einladung mit Vorschau → beitreten', async () => {
    await b.getByTestId('auth-to-signup').click();
    await b.getByLabel('Dein Name').fill('Ben');
    await b.getByLabel('E-Mail').fill('ben@example.com');
    await b.getByLabel('Passwort').fill('nochSicherer22');
    await b.getByRole('button', { name: 'Konto erstellen' }).click();
    await b.getByTestId('invite-preview').waitFor();
    assert((await b.getByTestId('invite-preview').innerText()).includes('Gruppe A'), 'Vorschau zeigt Gruppe');
    await b.waitForTimeout(1200);
    await shot(b, '06-einladung-handy');
    await b.getByTestId('join-submit').click();
    await b.waitForFunction(() => !document.querySelector('[data-testid="group-screen"]'), null, { timeout: 10000 });
    assert(mock.state.memberships.filter((m) => m.group_id === group.id).length === 2, 'zwei Mitglieder');
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
    await b.getByTestId('sign-out').click();
    await b.getByTestId('auth-signin').waitFor();
    const left = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('studyspace.app.cache.') || k.includes('auth-token') || k === 'studyspace-app-auth'));
    assert(left.length === 0, `übrig: ${left.join(', ')}`);
  });
  await check('Anmelden mit falschem Passwort → verständliche Meldung', async () => {
    await b.getByLabel('E-Mail').fill('ben@example.com');
    await b.getByLabel('Passwort').fill('falsch12345');
    await b.getByRole('button', { name: 'Anmelden' }).click();
    await b.getByText('E-Mail oder Passwort ist falsch.').waitFor();
  });
  await check('„Angemeldet bleiben“ aus → Sitzung nur im Tab', async () => {
    await b.getByLabel('Passwort').fill('nochSicherer22');
    await b.getByRole('switch', { name: 'Angemeldet bleiben' }).click();
    await b.getByRole('button', { name: 'Anmelden' }).click();
    await b.waitForFunction(() => !document.querySelector('[data-testid="auth-signin"]'), null, { timeout: 10000 });
    const where = await b.evaluate(() => ({ local: !!localStorage.getItem('studyspace-app-auth'), session: !!sessionStorage.getItem('studyspace-app-auth') }));
    assert(!where.local && where.session, JSON.stringify(where));
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
    assert((await c.getByTestId('stat-users').innerText()).includes('2'), 'zwei Benutzer');
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
