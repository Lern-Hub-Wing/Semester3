// =====================================================================
// StudySpace App – Edge Function „admin-auth“ (nur im NEUEN App-Projekt)
// ---------------------------------------------------------------------
// Anmeldung für den Admin-Bereich /app/admin/ mit BENUTZERNAMEN statt
// E-Mail – die hinterlegte E-Mail-Adresse verlässt den Server nie.
//
//   POST { action: 'status' }                         → { setup_done }
//   POST { action: 'setup', token, password }         → legt den Admin an
//   POST { action: 'login', username, password }      → { access_token, refresh_token }
//
// Ersteinrichtung: Es gibt KEIN Standardpasswort. Das Passwort wählst du
// selbst; geschützt wird der Vorgang durch das Secret ADMIN_SETUP_TOKEN,
// das nur du kennst (Supabase → Edge Functions → Secrets). Nach dem ersten
// Admin ist die Einrichtung dauerhaft gesperrt. Jede Admin-Funktion in der
// Datenbank verlangt zusätzlich Zwei-Faktor (TOTP, aal2).
//
// Secrets:
//   ADMIN_SETUP_TOKEN   mindestens 24 zufällige Zeichen (nach der Einrichtung löschbar)
//   ADMIN_USERNAME      optional, Standard „Luke“
//   ADMIN_LOGIN_EMAIL   optional; Standard ist eine interne, nicht zustellbare Adresse
//   ALLOWED_ORIGINS     optional, z. B. https://lern-hub-wing.github.io
//   (SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SETUP_TOKEN = Deno.env.get('ADMIN_SETUP_TOKEN') ?? '';
const USERNAME = (Deno.env.get('ADMIN_USERNAME') ?? 'Luke').trim();
const LOGIN_EMAIL = (Deno.env.get('ADMIN_LOGIN_EMAIL') ?? `${USERNAME.toLowerCase()}.admin@studyspace-admin.invalid`).trim();
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow = ALLOWED.length === 0 ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
const ip = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function passwordProblem(pw: string): string | null {
  if (pw.length < 14) return 'Mindestens 14 Zeichen.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Groß- und Kleinbuchstaben sowie Ziffern verwenden.';
  return null;
}

async function adminExists(): Promise<boolean> {
  const { count, error } = await db.from('admins').select('user_id', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Nur POST' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Ungültige Anfrage' }, 400);
  }
  const action = String(body.action ?? '');
  try {
    if (action === 'status') {
      return json(req, { setup_done: await adminExists(), setup_possible: SETUP_TOKEN.length >= 24 });
    }

    if (action === 'setup') {
      if (limited(`setup:${ip(req)}`, 5, 15 * 60_000)) return json(req, { error: 'Zu viele Versuche. Bitte 15 Minuten warten.' }, 429);
      if (SETUP_TOKEN.length < 24) return json(req, { error: 'Die Ersteinrichtung ist nicht freigeschaltet (Secret ADMIN_SETUP_TOKEN fehlt).' }, 403);
      if (await adminExists()) return json(req, { error: 'Der Admin-Zugang ist bereits eingerichtet.' }, 409);
      const token = String(body.token ?? '');
      if (!safeEqual(token, SETUP_TOKEN)) {
        await sleep(800);
        return json(req, { error: 'Einrichtungsschlüssel falsch.' }, 403);
      }
      const password = String(body.password ?? '');
      const problem = passwordProblem(password);
      if (problem) return json(req, { error: problem }, 400);
      const { data, error } = await db.auth.admin.createUser({ email: LOGIN_EMAIL, password, email_confirm: true, app_metadata: { studyspace_admin: true } });
      if (error || !data.user) return json(req, { error: `Konto konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}` }, 500);
      const { error: insErr } = await db.from('admins').insert({ user_id: data.user.id, username: USERNAME });
      if (insErr) {
        await db.auth.admin.deleteUser(data.user.id);
        return json(req, { error: 'Admin-Rolle konnte nicht gespeichert werden.' }, 500);
      }
      await db.from('admin_audit').insert({ admin_id: data.user.id, action: 'admin.setup', target_type: 'admin', target_id: data.user.id });
      return json(req, { ok: true, username: USERNAME });
    }

    if (action === 'login') {
      if (limited(`login:${ip(req)}`, 10, 15 * 60_000)) return json(req, { error: 'Zu viele Versuche. Bitte 15 Minuten warten.' }, 429);
      const username = String(body.username ?? '').trim();
      const password = String(body.password ?? '');
      const fail = async () => (await sleep(600), json(req, { error: 'Benutzername oder Passwort falsch.' }, 401));
      if (!username || !password || password.length > 200) return fail();
      const { data: admin } = await db.from('admins').select('user_id').ilike('username', username).maybeSingle();
      if (!admin) return fail();
      const { data: u } = await db.auth.admin.getUserById(admin.user_id);
      if (!u?.user?.email) return fail();
      const auth = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await auth.auth.signInWithPassword({ email: u.user.email, password });
      if (error || !data.session) return fail();
      return json(req, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    }

    return json(req, { error: 'Unbekannte Aktion' }, 400);
  } catch (err) {
    console.error(err);
    return json(req, { error: 'Serverfehler' }, 500);
  }
});
