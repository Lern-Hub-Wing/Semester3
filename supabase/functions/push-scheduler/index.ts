// =====================================================================
// StudySpace – Edge Function „push-scheduler“
// ---------------------------------------------------------------------
// Wird von Supabase Cron alle 5 Minuten aufgerufen und – mit
// supabase/push_instant.sql – sofort nach jeder neuen Hausaufgabe (siehe
// supabase/cron.sql). Lädt den aktuellen Lernplan, berechnet mit
// planNotifications() die fälligen Erinnerungen und versendet sie.
//
// Idempotent: Für jede Nachricht wird VOR dem Versand eine Zeile in
// push_log mit eindeutigem (device_id, dedupe_key) angelegt. Läuft der
// Scheduler doppelt oder verspätet, scheitert das zweite Anlegen – die
// Nachricht geht nie zweimal raus.
//
// Schutz: Aufruf nur mit dem Secret SCHEDULER_SECRET im Header
// „x-scheduler-secret“. Ohne dieses Secret antwortet die Funktion mit 401.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, safeEqual } from '../_shared/http.ts';
import { sendPush, validateVapidKeys, type VapidKeys } from '../_shared/webpush.ts';
import { normalizePrefs } from '../_shared/prefs.ts';
import { planNotifications, type DeviceInfo, type Snapshot, type StateValue } from '../_shared/reminders.ts';

const vapid: VapidKeys = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
};
const SECRET = Deno.env.get('SCHEDULER_SECRET') ?? '';
const HEARTBEAT_KEY = 'scheduler:heartbeat';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Lädt eine Tabelle vollständig (seitenweise, 1000 Zeilen je Anfrage). */
async function all<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  const given = req.headers.get('x-scheduler-secret') ?? '';
  if (!SECRET || SECRET.length < 24 || !safeEqual(given, SECRET)) return json(req, { error: 'unauthorized' }, 401);
  const vapidProblem = validateVapidKeys(vapid);
  if (vapidProblem) return json(req, { error: vapidProblem }, 503);

  const started = Date.now();
  // Lebenszeichen: zeigt in der App, dass die Zeitsteuerung (Cron) wirklich läuft
  const beat = (extra: Record<string, unknown>) =>
    db.from('push_state').upsert({ key: HEARTBEAT_KEY, value: { at: new Date().toISOString(), ...extra }, updated_at: new Date().toISOString() });
  try {
    const devices = await all<any>('push_devices', 'id, member_id, endpoint, p256dh, auth, prefs, plan_cursor, failure_count', (q) => q.eq('enabled', true));
    if (devices.length === 0) {
      await beat({ devices: 0, sent: 0 });
      return json(req, { ok: true, devices: 0, sent: 0 });
    }

    const minCursor = devices.reduce((m, d) => (d.plan_cursor === null ? m : Math.min(m, Number(d.plan_cursor))), Number.MAX_SAFE_INTEGER);
    const [members, modules, exams, entries, tasks, completions, stateRows, activity, logs] = await Promise.all([
      all<any>('members', 'id, name, is_active'),
      all<any>('modules', 'id, name, archived_at'),
      all<any>('exams', 'id, module_id, starts_at, ends_at, deleted_at', (q) => q.is('deleted_at', null).gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())),
      all<any>('study_entries', 'id, module_id, study_date, deleted_at', (q) => q.is('deleted_at', null)),
      all<any>('tasks', 'id, study_entry_id, deleted_at', (q) => q.is('deleted_at', null)),
      all<any>('task_completions', 'task_id, member_id, is_completed', (q) => q.eq('is_completed', true)),
      all<any>('push_state', 'key, value'),
      minCursor === Number.MAX_SAFE_INTEGER
        ? db.from('activity_log').select('id, occurred_at, actor_member_id, entity_type, entity_id, action').order('id', { ascending: false }).limit(1).then((r) => r.data ?? [])
        : all<any>('activity_log', 'id, occurred_at, actor_member_id, entity_type, entity_id, action', (q) => q.gt('id', minCursor).order('id', { ascending: true })),
      // Protokoll der letzten 8 Tage: bereits gesendete Schlüssel + letzte Überfällig-Erinnerung
      all<any>('push_log', 'device_id, kind, dedupe_key, created_at, meta, status', (q) => q.gte('created_at', new Date(Date.now() - 8 * 86_400_000).toISOString()).order('created_at', { ascending: true })),
    ]);

    // Hausaufgaben mit Abgabe ab 8 Tagen zurück (für „neue Hausaufgabe“, Morgen-/Abend-/Überfällig-Erinnerung)
    // samt Teilen und Haken. Fehlen die Tabellen (Migration 005 nicht eingespielt), einfach ohne.
    const hwFrom = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const [homework, homeworkParts, homeworkCompletions] = await Promise.all([
      all<any>('homework', 'id, module_id, title, due_date, deleted_at', (q) => q.is('deleted_at', null).gte('due_date', hwFrom)).catch(() => []),
      all<any>('homework_parts', 'id, homework_id', (q) => q.is('deleted_at', null)).catch(() => []),
      all<any>('homework_completions', 'target_id, member_id, is_completed', (q) => q.eq('is_completed', true)).catch(() => []),
    ]);

    const sentBy = new Map<string, Set<string>>();
    const lastOverdue = new Map<string, { at: string; taskIds: string[] }>();
    for (const l of logs) {
      if (!sentBy.has(l.device_id)) sentBy.set(l.device_id, new Set());
      sentBy.get(l.device_id)!.add(l.dedupe_key);
      if (l.kind === 'overdue' && l.status !== 'failed' && Array.isArray(l.meta?.taskIds)) lastOverdue.set(l.device_id, { at: l.created_at, taskIds: l.meta.taskIds });
    }

    const snap: Snapshot = {
      now: new Date(),
      members,
      modules,
      exams,
      entries,
      tasks,
      completions,
      homework,
      homeworkParts,
      homeworkCompletions,
      activity: [...activity].sort((a: any, b: any) => a.id - b.id),
      state: Object.fromEntries(stateRows.map((r: any) => [r.key, r.value as StateValue])),
    };
    const infos: DeviceInfo[] = devices.map((d) => ({
      id: d.id,
      member_id: d.member_id,
      prefs: normalizePrefs(d.prefs),
      plan_cursor: d.plan_cursor === null ? null : Number(d.plan_cursor),
      sent: sentBy.get(d.id) ?? new Set(),
      lastOverdue: lastOverdue.get(d.id) ?? null,
    }));

    const plan = planNotifications(snap, infos);

    // Zustand und Cursor zuerst speichern (bei Fehlern lieber eine Meldung auslassen als doppelt senden)
    const stateEntries = Object.entries(plan.state);
    if (stateEntries.length) {
      const { error } = await db.from('push_state').upsert(stateEntries.map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })));
      if (error) throw error;
    }
    await Promise.all(Object.entries(plan.cursors).map(([id, cursor]) => db.from('push_devices').update({ plan_cursor: cursor }).eq('id', id)));

    const byId = new Map(devices.map((d) => [d.id, d]));
    let sent = 0;
    let failed = 0;
    for (const n of plan.notifications) {
      // Reservieren: schlägt fehl, wenn derselbe Schlüssel schon existiert (Idempotenz)
      const { data: reserved, error: resErr } = await db
        .from('push_log')
        .insert({ device_id: n.deviceId, kind: n.kind, dedupe_key: n.dedupeKey, title: n.title, body: n.body, url: n.url, status: 'pending', meta: n.meta ?? null })
        .select('id')
        .single();
      if (resErr || !reserved) continue;
      for (const extra of n.alsoKeys ?? []) {
        await db.from('push_log').insert({ device_id: n.deviceId, kind: extra.kind, dedupe_key: extra.key, title: n.title, body: n.body, url: n.url, status: 'merged', meta: extra.meta ?? null });
      }
      const d = byId.get(n.deviceId);
      const res = await sendPush(
        { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth },
        { title: n.title, body: n.body, url: n.url, tag: n.topic, badge: n.badge },
        vapid,
        { ttl: n.ttl, urgency: n.urgency, topic: n.topic },
      );
      const status = res.ok ? 'sent' : res.gone ? 'expired' : 'failed';
      await db.from('push_log').update({ status, http_status: res.status, error: res.error ?? null, sent_at: new Date().toISOString() }).eq('id', reserved.id);
      if (res.ok) {
        sent++;
        await db.from('push_devices').update({ last_success_at: new Date().toISOString(), last_error: null, failure_count: 0 }).eq('id', d.id);
      } else {
        failed++;
        if (!res.gone && (res.status === 0 || res.status === 429 || res.status >= 500)) {
          // Vorübergehender Fehler des Push-Dienstes: Reservierung freigeben → nächster Lauf versucht es erneut
          await db.from('push_log').delete().eq('id', reserved.id);
        }
        if (res.gone) {
          // Abgelaufenes/abgemeldetes Abo automatisch entfernen
          await db.from('push_devices').delete().eq('id', d.id);
          byId.delete(d.id);
        } else {
          const count = (d.failure_count ?? 0) + 1;
          d.failure_count = count;
          await db.from('push_devices').update({ last_error: res.error ?? 'Fehler', failure_count: count, enabled: count < 10 }).eq('id', d.id);
        }
      }
    }

    // Gelegentlich aufräumen (alte Protokolle, lange deaktivierte Geräte)
    if (new Date().getUTCMinutes() < 5) await db.rpc('ss_push_cleanup');

    await beat({ devices: devices.length, sent, failed });
    return json(req, { ok: true, devices: devices.length, planned: plan.notifications.length, sent, failed, ms: Date.now() - started });
  } catch (err) {
    console.error('push-scheduler', err);
    return json(req, { ok: false, error: String(err).slice(0, 300) }, 500);
  }
});
