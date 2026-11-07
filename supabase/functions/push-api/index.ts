// =====================================================================
// StudySpace – Edge Function „push-api“
// ---------------------------------------------------------------------
// Verwaltung der Push-Abonnements EINES Geräts. Es gibt keine Anmeldung;
// jedes Gerät erzeugt einen geheimen Zufallstoken (32 Byte), der nur im
// Gerät gespeichert wird. Die Datenbank kennt ausschließlich dessen
// SHA-256-Hash. Alle Aktionen wirken nur auf das Gerät mit diesem Token.
//
//   POST { action: 'register',   token, subscription, memberId, platform?, prefs? }
//   POST { action: 'update',     token, memberId?, prefs?, enabled? }
//   POST { action: 'status',     token }
//   POST { action: 'test',       token }
//   POST { action: 'unregister', token }
//
// Es ist NICHT möglich, beliebige Nachrichten an andere Geräte zu senden:
// Die Testnachricht hat einen festen Text und geht nur an das eigene Gerät.
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   (SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { clientIp, corsHeaders, json, rateLimited } from '../_shared/http.ts';
import { isAllowedPushEndpoint, sendPush, sha256Hex, validateVapidKeys, type VapidKeys } from '../_shared/webpush.ts';
import { normalizePrefs } from '../_shared/prefs.ts';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEVICES = 200;
const TEST_COOLDOWN_MS = 30_000;
const TEST_PER_HOUR = 10;

const vapid: VapidKeys = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
};

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Body = Record<string, unknown>;

function clean(s: unknown, max: number): string | null {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').slice(0, max) : null;
}
const strip = (s: string) => s.replace(/=+$/, '');

async function findDevice(token: string) {
  const hash = await sha256Hex(token);
  const { data, error } = await db.from('push_devices').select('*').eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  return { device: data, hash };
}

async function activeMember(id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
  const { data } = await db.from('members').select('id, is_active').eq('id', id).maybeSingle();
  return data && data.is_active ? data.id : null;
}

function publicStatus(d: Record<string, unknown> | null) {
  if (!d) return { registered: false };
  return {
    registered: true,
    enabled: d.enabled,
    memberId: d.member_id,
    prefs: normalizePrefs(d.prefs),
    lastSuccessAt: d.last_success_at,
    lastError: d.last_error,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Nur POST erlaubt.' }, 405);

  const ip = clientIp(req);
  if (rateLimited(`ip:${ip}`, 60, 60_000)) return json(req, { error: 'Zu viele Anfragen. Bitte kurz warten.' }, 429, { 'Retry-After': '60' });

  const vapidProblem = validateVapidKeys(vapid);
  if (vapidProblem) return json(req, { error: 'Push ist auf dem Server noch nicht eingerichtet.', detail: vapidProblem, code: 'not_configured' }, 503);

  let body: Body;
  try {
    const text = await req.text();
    if (text.length > 8000) return json(req, { error: 'Anfrage zu groß.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json(req, { error: 'Ungültige Anfrage.' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!TOKEN_RE.test(token)) return json(req, { error: 'Ungültiger Gerätetoken.' }, 400);

  try {
    switch (body.action) {
      // -----------------------------------------------------------------
      case 'register': {
        const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
        const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
        const p256dh = typeof sub?.keys?.p256dh === 'string' ? strip(sub.keys.p256dh) : '';
        const auth = typeof sub?.keys?.auth === 'string' ? strip(sub.keys.auth) : '';
        if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 2048) return json(req, { error: 'Unbekannter Push-Dienst.' }, 400);
        if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return json(req, { error: 'Ungültige Schlüssel des Abonnements.' }, 400);
        const memberId = await activeMember(body.memberId);
        if (!memberId) return json(req, { error: 'Unbekanntes Lernprofil.' }, 400);

        const { device, hash } = await findDevice(token);
        // Gleiches Abo unter anderem Token (z. B. Browserdaten gelöscht): Der
        // Endpoint ist ein Geheimnis des Browsers – wer ihn kennt, ist dieses Gerät.
        const { data: byEndpoint } = await db.from('push_devices').select('id').eq('endpoint', endpoint).maybeSingle();
        const { data: maxRow } = await db.from('activity_log').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
        const row = {
          token_hash: hash,
          member_id: memberId,
          endpoint,
          p256dh,
          auth,
          platform: clean(body.platform, 40),
          user_agent: clean(req.headers.get('user-agent'), 300),
          enabled: true,
          prefs: normalizePrefs(body.prefs ?? device?.prefs),
          last_seen_at: new Date().toISOString(),
          last_error: null,
          failure_count: 0,
        };
        const existingId = device?.id ?? byEndpoint?.id;
        if (existingId) {
          // Eine eventuelle zweite Zeile (altes Token mit anderem Endpoint) zusammenführen
          if (device && byEndpoint && device.id !== byEndpoint.id) await db.from('push_devices').delete().eq('id', byEndpoint.id);
          const { data, error } = await db.from('push_devices').update(row).eq('id', device?.id ?? byEndpoint!.id).select().single();
          if (error) throw error;
          return json(req, publicStatus(data));
        }
        const { count } = await db.from('push_devices').select('id', { count: 'exact', head: true });
        if ((count ?? 0) >= MAX_DEVICES) return json(req, { error: 'Maximale Anzahl an Geräten erreicht.' }, 409);
        const { data, error } = await db
          .from('push_devices')
          .insert({ ...row, plan_cursor: maxRow?.id ?? 0 })
          .select()
          .single();
        if (error) throw error;
        return json(req, publicStatus(data), 201);
      }

      // -----------------------------------------------------------------
      case 'update': {
        const { device } = await findDevice(token);
        if (!device) return json(req, { registered: false }, 404);
        const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
        if (body.memberId !== undefined) {
          const memberId = await activeMember(body.memberId);
          if (!memberId) return json(req, { error: 'Unbekanntes Lernprofil.' }, 400);
          patch.member_id = memberId;
        }
        if (body.prefs !== undefined) patch.prefs = normalizePrefs({ ...normalizePrefs(device.prefs), ...(body.prefs as object) });
        if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
        const { data, error } = await db.from('push_devices').update(patch).eq('id', device.id).select().single();
        if (error) throw error;
        return json(req, publicStatus(data));
      }

      // -----------------------------------------------------------------
      case 'status': {
        const { device } = await findDevice(token);
        if (device) await db.from('push_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
        return json(req, publicStatus(device));
      }

      // -----------------------------------------------------------------
      case 'unregister': {
        const { device } = await findDevice(token);
        if (device) await db.from('push_devices').delete().eq('id', device.id);
        return json(req, { registered: false });
      }

      // -----------------------------------------------------------------
      case 'test': {
        const { device } = await findDevice(token);
        if (!device) return json(req, { error: 'Dieses Gerät ist nicht registriert.', code: 'not_registered' }, 404);
        if (rateLimited(`test:${device.id}`, 3, TEST_COOLDOWN_MS)) return json(req, { error: 'Bitte kurz warten.', retryAfter: 30 }, 429, { 'Retry-After': '30' });

        const since = new Date(Date.now() - 3600_000).toISOString();
        const { data: recent } = await db.from('push_log').select('created_at').eq('device_id', device.id).eq('kind', 'test').gte('created_at', since).order('created_at', { ascending: false });
        const last = recent?.[0] ? Date.parse(recent[0].created_at) : 0;
        if (Date.now() - last < TEST_COOLDOWN_MS) {
          const wait = Math.ceil((TEST_COOLDOWN_MS - (Date.now() - last)) / 1000);
          return json(req, { error: `Bitte noch ${wait} Sekunden warten.`, retryAfter: wait }, 429, { 'Retry-After': String(wait) });
        }
        if ((recent?.length ?? 0) >= TEST_PER_HOUR) return json(req, { error: 'Maximal 10 Testnachrichten pro Stunde.', retryAfter: 600 }, 429);

        const message = {
          title: 'StudySpace funktioniert! 🎉',
          body: 'Deine Benachrichtigungen sind erfolgreich eingerichtet. Ab jetzt verpasst du keine wichtigen Lerntermine mehr.',
          url: '#/einstellungen/benachrichtigungen',
          tag: 'test',
        };
        const key = `test:${new Date().toISOString()}`;
        const { data: log } = await db
          .from('push_log')
          .insert({ device_id: device.id, kind: 'test', dedupe_key: key, title: message.title, body: message.body, url: message.url, status: 'pending' })
          .select('id')
          .single();
        const res = await sendPush({ endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth }, message, vapid, { ttl: 600, urgency: 'high', topic: 'test' });
        const status = res.ok ? 'sent' : res.gone ? 'expired' : 'failed';
        if (log) await db.from('push_log').update({ status, http_status: res.status, error: res.error ?? null, sent_at: new Date().toISOString() }).eq('id', log.id);
        if (res.ok) await db.from('push_devices').update({ last_success_at: new Date().toISOString(), last_error: null, failure_count: 0 }).eq('id', device.id);
        else if (res.gone) await db.from('push_devices').delete().eq('id', device.id);
        else await db.from('push_devices').update({ last_error: res.error ?? 'Fehler', failure_count: (device.failure_count ?? 0) + 1 }).eq('id', device.id);

        if (res.ok) return json(req, { accepted: true, status: res.status });
        if (res.gone) return json(req, { accepted: false, code: 'expired', error: 'Das Abonnement ist abgelaufen. Bitte Benachrichtigungen erneut aktivieren.' }, 410);
        return json(req, { accepted: false, error: `Der Push-Dienst hat die Nachricht abgelehnt (${res.status || 'keine Verbindung'}).` }, 502);
      }

      default:
        return json(req, { error: 'Unbekannte Aktion.' }, 400);
    }
  } catch (err) {
    console.error('push-api', err);
    return json(req, { error: 'Interner Fehler. Bitte später erneut versuchen.' }, 500);
  }
});
