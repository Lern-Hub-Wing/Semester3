// =====================================================================
// StudySpace App – Edge Function „app-push“ (nur im NEUEN App-Projekt)
// ---------------------------------------------------------------------
// Quelle dieser Funktion. Bereitgestellt wird die daraus erzeugte Datei
// supabase-app/functions/app-push/index.ts (npm run app:functions) –
// eine einzige Datei, damit sie sich notfalls auch im Supabase-Dashboard
// einfügen lässt.
//
// 1) Geräte verwalten – nur ANGEMELDET (Authorization: Bearer <Sitzung>):
//    POST { action: 'register' | 'update' | 'status' | 'test' | 'unregister', token, … }
//    Jedes Gerät gehört genau einem Konto. Alle Aktionen wirken nur auf
//    Geräte des angemeldeten Kontos; die Testnachricht hat festen Text.
//
// 2) Versand – nur mit Secret (Header x-dispatch-secret = APP_PUSH_SECRET):
//    POST { action: 'dispatch' }
//    Aufgerufen sofort nach dem Eintragen einer Hausaufgabe (Datenbank-
//    Trigger über pg_net) und zusätzlich alle 5 Minuten (Supabase Cron),
//    damit Mitteilungen nach der Ruhezeit oder nach Fehlern nachkommen.
//    Siehe supabase-app/push_setup.sql.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT  (Schlüsselpaar)
//   APP_PUSH_SECRET   mind. 24 zufällige Zeichen (gleicher Wert wie in push_setup.sql)
//   (SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { clientIp, corsHeaders, json, rateLimited, safeEqual } from '../../supabase/functions/_shared/http.ts';
import { checkVapidPair, isAllowedPushEndpoint, pushServiceReason, sendPush, sha256Hex, validateVapidKeys, type VapidKeys } from '../../supabase/functions/_shared/webpush.ts';
import { normalizePrefs } from '../../supabase/functions/_shared/prefs.ts';
import { APP_HOMEWORK_WINDOW_MS, planAppHomework, type AppDevice } from '../../supabase/functions/_shared/appPush.ts';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TEST_COOLDOWN_MS = 30_000;
const TEST_PER_HOUR = 10;
const HEARTBEAT_KEY = 'app-push:heartbeat';

const vapid: VapidKeys = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
};
const SECRET = Deno.env.get('APP_PUSH_SECRET') ?? '';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Body = Record<string, unknown>;
type Device = Record<string, any>;

function clean(s: unknown, max: number): string | null {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').slice(0, max) : null;
}
const strip = (s: string) => s.replace(/=+$/, '');

/** Angemeldetes, aktives Konto aus dem Bearer-Token – sonst null */
async function currentUser(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (jwt.split('.').length !== 3) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: profile } = await db.from('profiles').select('status').eq('id', data.user.id).maybeSingle();
  if (profile && profile.status !== 'active') return null;
  return data.user.id;
}

async function deviceOf(userId: string, token: string): Promise<{ device: Device | null; hash: string }> {
  const hash = await sha256Hex(token);
  const { data, error } = await db.from('push_devices').select('*').eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  // Gerät eines anderen Kontos (z. B. abgemeldet und anders angemeldet): wie nicht registriert
  return { device: data && data.user_id === userId ? data : null, hash };
}

async function heartbeatAt(): Promise<string | null> {
  const { data } = await db.from('push_state').select('value').eq('key', HEARTBEAT_KEY).maybeSingle();
  const at = (data?.value as { at?: unknown } | undefined)?.at;
  return typeof at === 'string' ? at : null;
}

function publicStatus(d: Device | null) {
  if (!d) return { registered: false, serverKey: vapid.publicKey };
  return {
    registered: true,
    serverKey: vapid.publicKey,
    enabled: d.enabled,
    memberId: null,
    prefs: normalizePrefs(d.prefs),
    lastSuccessAt: d.last_success_at,
    lastError: d.last_error,
  };
}

let pairCheck: Promise<string | null> | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Nur POST erlaubt.' }, 405);

  const vapidProblem = validateVapidKeys(vapid) ?? (await (pairCheck ??= checkVapidPair(vapid)));
  if (vapidProblem) return json(req, { error: 'Mitteilungen sind auf dem Server noch nicht eingerichtet.', detail: vapidProblem, code: 'not_configured' }, 503);

  let body: Body;
  try {
    const text = await req.text();
    if (text.length > 8000) return json(req, { error: 'Anfrage zu groß.' }, 413);
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(req, { error: 'Ungültige Anfrage.' }, 400);
  }

  // -------------------------------------------------------------------
  // Versand (Trigger / Cron)
  // -------------------------------------------------------------------
  if (body.action === 'dispatch') {
    const given = req.headers.get('x-dispatch-secret') ?? '';
    if (!SECRET || SECRET.length < 24 || !safeEqual(given, SECRET)) return json(req, { error: 'unauthorized' }, 401);
    try {
      return json(req, await dispatch());
    } catch (err) {
      console.error('app-push dispatch', err);
      return json(req, { ok: false, error: String(err).slice(0, 300) }, 500);
    }
  }

  // -------------------------------------------------------------------
  // Geräteverwaltung (angemeldet)
  // -------------------------------------------------------------------
  if (rateLimited(`ip:${clientIp(req)}`, 60, 60_000)) return json(req, { error: 'Zu viele Anfragen. Bitte kurz warten.' }, 429, { 'Retry-After': '60' });
  const userId = await currentUser(req);
  if (!userId) return json(req, { error: 'Bitte erneut anmelden.', code: 'unauthorized' }, 401);
  const token = typeof body.token === 'string' ? body.token : '';
  if (!TOKEN_RE.test(token)) return json(req, { error: 'Ungültiger Gerätetoken.' }, 400);

  try {
    switch (body.action) {
      case 'register': {
        const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
        const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
        const p256dh = typeof sub?.keys?.p256dh === 'string' ? strip(sub.keys.p256dh) : '';
        const auth = typeof sub?.keys?.auth === 'string' ? strip(sub.keys.auth) : '';
        if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 2048) return json(req, { error: 'Unbekannter Push-Dienst.' }, 400);
        if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return json(req, { error: 'Ungültige Schlüssel des Abonnements.' }, 400);

        const hash = await sha256Hex(token);
        // Gleiches Gerät (Token) oder gleiches Abo (Endpoint) – auch wenn es vorher zu einem anderen Konto gehörte:
        // Wer Token bzw. Endpoint kennt, IST dieses Gerät. Es meldet sich damit beim bisherigen Konto ab.
        const { data: byToken } = await db.from('push_devices').select('*').eq('token_hash', hash).maybeSingle();
        const { data: byEndpoint } = await db.from('push_devices').select('id').eq('endpoint', endpoint).maybeSingle();
        const keep = byToken?.user_id === userId ? byToken : null;
        const row = {
          token_hash: hash,
          user_id: userId,
          member_id: null,
          endpoint,
          p256dh,
          auth,
          platform: clean(body.platform, 40),
          user_agent: clean(req.headers.get('user-agent'), 300),
          enabled: true,
          prefs: normalizePrefs(body.prefs ?? keep?.prefs),
          last_seen_at: new Date().toISOString(),
          last_error: null,
          failure_count: 0,
        };
        if (byEndpoint && byEndpoint.id !== byToken?.id) await db.from('push_devices').delete().eq('id', byEndpoint.id);
        if (byToken) {
          // Neues Konto auf diesem Gerät: Zeitpunkt neu setzen (keine alten Hausaufgaben nachliefern)
          const patch = byToken.user_id === userId ? row : { ...row, created_at: new Date().toISOString() };
          const { data, error } = await db.from('push_devices').update(patch).eq('id', byToken.id).select().single();
          if (error) throw error;
          return json(req, publicStatus(data));
        }
        const { data, error } = await db.from('push_devices').insert(row).select().single();
        if (error) {
          if (/Höchstens 10/.test(error.message)) return json(req, { error: 'Mitteilungen sind schon auf 10 Geräten dieses Kontos aktiv. Bitte auf einem alten Gerät ausschalten.' }, 409);
          throw error;
        }
        return json(req, publicStatus(data), 201);
      }

      case 'update': {
        const { device } = await deviceOf(userId, token);
        if (!device) return json(req, { registered: false }, 404);
        const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
        if (body.prefs !== undefined) patch.prefs = normalizePrefs({ ...normalizePrefs(device.prefs), ...(body.prefs as object) });
        if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
        const { data, error } = await db.from('push_devices').update(patch).eq('id', device.id).select().single();
        if (error) throw error;
        return json(req, publicStatus(data));
      }

      case 'status': {
        const { device } = await deviceOf(userId, token);
        if (device) await db.from('push_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
        return json(req, { ...publicStatus(device), schedulerAt: await heartbeatAt() });
      }

      case 'unregister': {
        const { device } = await deviceOf(userId, token);
        if (device) await db.from('push_devices').delete().eq('id', device.id);
        return json(req, { registered: false });
      }

      case 'test': {
        const { device } = await deviceOf(userId, token);
        if (!device) return json(req, { error: 'Dieses Gerät ist nicht registriert.', code: 'not_registered' }, 404);
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
          body: 'Mitteilungen sind eingerichtet. Du erfährst ab jetzt sofort, wenn jemand aus deiner Gruppe eine Hausaufgabe einträgt.',
          url: '#/einstellungen/benachrichtigungen',
          tag: 'test',
        };
        const { data: log } = await db
          .from('push_log')
          .insert({ device_id: device.id, kind: 'test', dedupe_key: `test:${new Date().toISOString()}`, title: message.title, body: message.body, url: message.url, status: 'pending' })
          .select('id')
          .single();
        const res = await sendPush({ endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth }, message, vapid, { ttl: 600, urgency: 'high', topic: 'test' });
        await recordResult(device, log?.id ?? null, res);
        if (res.ok) return json(req, { accepted: true, status: res.status });
        if (res.gone) return json(req, { accepted: false, code: 'expired', error: 'Das Abonnement ist abgelaufen. Bitte Mitteilungen erneut einschalten.' }, 410);
        const reason = pushServiceReason(res.error);
        return json(req, { accepted: false, code: 'rejected', reason, error: `Der Push-Dienst hat die Nachricht abgelehnt (${res.status || 'keine Verbindung'}${reason ? `: ${reason}` : ''}).` }, 502);
      }

      default:
        return json(req, { error: 'Unbekannte Aktion.' }, 400);
    }
  } catch (err) {
    console.error('app-push', err);
    return json(req, { error: 'Interner Fehler. Bitte später erneut versuchen.' }, 500);
  }
});

async function recordResult(device: Device, logId: number | null, res: Awaited<ReturnType<typeof sendPush>>) {
  const status = res.ok ? 'sent' : res.gone ? 'expired' : 'failed';
  if (logId !== null) await db.from('push_log').update({ status, http_status: res.status, error: res.error ?? null, sent_at: new Date().toISOString() }).eq('id', logId);
  if (res.ok) {
    await db.from('push_devices').update({ last_success_at: new Date().toISOString(), last_error: null, failure_count: 0 }).eq('id', device.id);
  } else if (res.gone) {
    await db.from('push_devices').delete().eq('id', device.id);
  } else {
    const count = (device.failure_count ?? 0) + 1;
    device.failure_count = count;
    await db.from('push_devices').update({ last_error: res.error ?? 'Fehler', failure_count: count, enabled: count < 10 }).eq('id', device.id);
  }
}

/** Neue Hausaufgaben an die Geräte der anderen Gruppenmitglieder senden */
async function dispatch() {
  const now = new Date();
  const since = new Date(now.getTime() - APP_HOMEWORK_WINDOW_MS).toISOString();
  const beat = (extra: Record<string, unknown>) =>
    db.from('push_state').upsert({ key: HEARTBEAT_KEY, value: { at: new Date().toISOString(), ...extra }, updated_at: new Date().toISOString() });

  const { data: activity, error: aErr } = await db
    .from('activity_log')
    .select('id, group_id, occurred_at, actor_member_id, entity_id')
    .eq('entity_type', 'homework')
    .eq('action', 'created')
    .not('group_id', 'is', null)
    .gte('occurred_at', since)
    .order('id', { ascending: true })
    .limit(500);
  if (aErr) throw aErr;
  if (!activity?.length) {
    await beat({ sent: 0 });
    return { ok: true, events: 0, sent: 0 };
  }
  const groupIds = [...new Set(activity.map((a) => a.group_id as string))];
  const [hw, memberships] = await Promise.all([
    db.from('homework').select('id, group_id, module_id, title, due_date, deleted_at').in('id', [...new Set(activity.map((a) => a.entity_id))]),
    db.from('group_members').select('group_id, user_id, member_id').in('group_id', groupIds).is('left_at', null),
  ]);
  if (hw.error) throw hw.error;
  if (memberships.error) throw memberships.error;
  const userIds = [...new Set((memberships.data ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) {
    await beat({ sent: 0 });
    return { ok: true, events: activity.length, sent: 0 };
  }
  const [devicesRes, modules, members, groups] = await Promise.all([
    db.from('push_devices').select('id, user_id, endpoint, p256dh, auth, prefs, created_at, failure_count').eq('enabled', true).in('user_id', userIds),
    db.from('modules').select('id, name').in('group_id', groupIds),
    db.from('members').select('id, name').in('group_id', groupIds),
    db.from('groups').select('id, name').in('id', groupIds),
  ]);
  if (devicesRes.error) throw devicesRes.error;
  const devices = devicesRes.data ?? [];
  if (devices.length === 0) {
    await beat({ sent: 0 });
    return { ok: true, events: activity.length, devices: 0, sent: 0 };
  }
  const { data: logs } = await db
    .from('push_log')
    .select('device_id, dedupe_key')
    .in('device_id', devices.map((d) => d.id))
    .like('dedupe_key', 'homework:%')
    .gte('created_at', new Date(now.getTime() - 3 * 86_400_000).toISOString());
  const sentBy = new Map<string, Set<string>>();
  for (const l of logs ?? []) {
    if (!sentBy.has(l.device_id)) sentBy.set(l.device_id, new Set());
    sentBy.get(l.device_id)!.add(l.dedupe_key);
  }

  const infos: AppDevice[] = devices.map((d) => ({ id: d.id, user_id: d.user_id, prefs: normalizePrefs(d.prefs), created_at: d.created_at, sent: sentBy.get(d.id) ?? new Set() }));
  const plan = planAppHomework({
    now,
    activity: activity as any,
    homework: (hw.data ?? []) as any,
    memberships: (memberships.data ?? []) as any,
    devices: infos,
    moduleNames: new Map((modules.data ?? []).map((m) => [m.id, m.name])),
    memberNames: new Map((members.data ?? []).map((m) => [m.id, m.name])),
    groupNames: new Map((groups.data ?? []).map((g) => [g.id, g.name])),
  });

  const byId = new Map(devices.map((d) => [d.id, d]));
  let sent = 0;
  let failed = 0;
  for (const n of plan) {
    // Reservieren: (device_id, dedupe_key) ist eindeutig → nie doppelt, auch wenn Trigger und Cron gleichzeitig laufen
    const { data: reserved, error: resErr } = await db
      .from('push_log')
      .insert({ device_id: n.deviceId, kind: 'homework', dedupe_key: n.dedupeKey, title: n.title.slice(0, 120), body: n.body.slice(0, 400), url: n.url, status: 'pending', meta: { homeworkIds: n.homeworkIds } })
      .select('id')
      .single();
    if (resErr || !reserved) continue;
    for (const key of n.alsoKeys) {
      await db.from('push_log').insert({ device_id: n.deviceId, kind: 'homework', dedupe_key: key, title: n.title.slice(0, 120), body: n.body.slice(0, 400), url: n.url, status: 'merged' });
    }
    const d = byId.get(n.deviceId)!;
    const res = await sendPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, { title: n.title, body: n.body, url: n.url, tag: `homework-${n.homeworkIds[0]}` }, vapid, {
      ttl: 24 * 3600,
      urgency: 'normal',
      // Eigenes Thema je Hausaufgabe: mehrere Mitteilungen ersetzen sich nicht gegenseitig
      topic: `hw${n.homeworkIds[0].replace(/-/g, '').slice(0, 30)}`,
    });
    if (!res.ok && !res.gone && (res.status === 0 || res.status === 429 || res.status >= 500)) {
      // Vorübergehender Fehler: Reservierung freigeben → der nächste Lauf versucht es erneut
      await db.from('push_log').delete().eq('device_id', d.id).in('dedupe_key', [n.dedupeKey, ...n.alsoKeys]);
      failed++;
      continue;
    }
    await recordResult(d, reserved.id, res);
    if (res.ok) sent++;
    else failed++;
  }
  await beat({ sent, failed });
  return { ok: true, events: activity.length, devices: devices.length, planned: plan.length, sent, failed };
}
