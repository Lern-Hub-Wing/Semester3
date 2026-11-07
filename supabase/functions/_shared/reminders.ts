/**
 * Erinnerungslogik von StudySpace – reine Funktion ohne Datenbank oder
 * Netzwerk: Aus einem Datenstand, der aktuellen Uhrzeit und den Geräten
 * wird berechnet, welche Benachrichtigungen JETZT fällig sind.
 *
 * Der Scheduler (Edge Function, alle 5 Minuten per Supabase Cron) ruft
 * planNotifications() auf und versendet das Ergebnis. Jede Nachricht hat
 * einen eindeutigen dedupeKey; das Versandprotokoll verhindert, dass ein
 * Schlüssel zweimal an dasselbe Gerät geht (idempotent, auch bei doppelten
 * oder verspäteten Läufen).
 *
 * Alle Uhrzeiten gelten in Europe/Berlin (inkl. Zeitumstellung).
 */
import { addDays, berlinInstant, berlinParts, dayLabel, diffDays, formatDateShort } from './berlin.ts';
import { inQuietHours, minutesToTime, timeToMinutes, type PushPrefs } from './prefs.ts';

export type Kind = 'morning' | 'evening' | 'overdue' | 'exam' | 'plan' | 'group' | 'personal' | 'test';

export interface Snapshot {
  now: Date;
  members: { id: string; name: string; is_active: boolean }[];
  modules: { id: string; name: string; archived_at: string | null }[];
  exams: { id: string; module_id: string; starts_at: string; ends_at: string; deleted_at: string | null }[];
  entries: { id: string; module_id: string; study_date: string; deleted_at: string | null }[];
  tasks: { id: string; study_entry_id: string; deleted_at: string | null }[];
  completions: { task_id: string; member_id: string; is_completed: boolean }[];
  /** Änderungsverlauf ab dem kleinsten Geräte-Cursor (aufsteigend nach id) */
  activity: { id: number; occurred_at: string; actor_member_id: string | null; entity_type: string; entity_id: string; action: string }[];
  /** Gespeicherter Zustand des Schedulers (push_state) */
  state: Record<string, StateValue>;
}

export interface StateValue {
  complete: boolean;
  since: string;
  /** true, wenn der Zustand durch einen echten Wechsel entstand (nicht beim ersten Erfassen) */
  transition: boolean;
}

export interface DeviceInfo {
  id: string;
  member_id: string | null;
  prefs: PushPrefs;
  plan_cursor: number | null;
  /** Bereits protokollierte dedupeKeys dieses Geräts */
  sent: Set<string>;
  /** Letzte Erinnerung an überfällige Aufgaben */
  lastOverdue: { at: string; taskIds: string[] } | null;
}

export interface Planned {
  deviceId: string;
  kind: Kind;
  dedupeKey: string;
  title: string;
  body: string;
  url: string;
  ttl: number;
  urgency: 'low' | 'normal' | 'high';
  topic: string;
  badge: number | null;
  meta?: Record<string, unknown>;
  /** Weitere Schlüssel, die mit dieser Nachricht erledigt sind (zusammengefasste Erinnerungen) */
  alsoKeys?: { key: string; kind: Kind; meta?: Record<string, unknown> }[];
}

export interface PlanResult {
  notifications: Planned[];
  /** Neue Cursor im Änderungsverlauf je Gerät */
  cursors: Record<string, number>;
  /** Geänderte Einträge für push_state */
  state: Record<string, StateValue>;
}

/** Uhrzeit für Prüfungserinnerungen 7/3/1 Tage vorher */
export const EXAM_DAY_TIME = '17:00';
/** So lange nach dem geplanten Zeitpunkt darf eine Tageserinnerung noch verschickt werden */
const DAILY_WINDOW_MIN = 180;
/** Änderungen werden gesammelt, bis 10 Minuten lang nichts Neues passiert ist */
const PLAN_DEBOUNCE_MS = 10 * 60 * 1000;
/** Überfällige Aufgaben ohne neue Fälle frühestens nach so vielen Tagen erneut erwähnen */
const OVERDUE_REPEAT_DAYS = 3;
/** Erfolgsmeldungen höchstens so lange nach dem Erreichen des Ziels nachholen (z. B. nach Ruhezeit) */
const SUCCESS_WINDOW_MS = 24 * 3600 * 1000;

interface TaskInfo {
  id: string;
  date: string;
  moduleId: string;
}

/**
 * Effektive Minute einer täglichen Erinnerung unter Berücksichtigung der Ruhezeit:
 *  – fällt sie in den Morgenteil der Ruhezeit → zum Ende der Ruhezeit
 *  – fällt sie in den Abendteil → 15 Minuten vor Beginn der Ruhezeit
 */
export function effectiveMinute(target: number, prefs: Pick<PushPrefs, 'quietStart' | 'quietEnd'>): number {
  if (!inQuietHours(target, prefs)) return target;
  const qs = timeToMinutes(prefs.quietStart);
  const qe = timeToMinutes(prefs.quietEnd);
  if (qs > qe && target >= qs) return Math.max(0, qs - 15);
  return qe;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** „Controlling“, „Controlling und Mathematik“, „A, B und 2 weiteren Modulen“ */
function listModules(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} und ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} und ${names[2]}`;
  return `${names[0]}, ${names[1]} und ${names.length - 2} weiteren Modulen`;
}

function moduleBreakdown(tasks: TaskInfo[], moduleName: (id: string) => string): string {
  const byModule = new Map<string, number>();
  for (const t of tasks) byModule.set(t.moduleId, (byModule.get(t.moduleId) ?? 0) + 1);
  const sorted = [...byModule.entries()].sort((a, b) => b[1] - a[1]);
  return listModules(sorted.map(([id]) => moduleName(id)));
}

function forDay(date: string, today: string): string {
  const diff = diffDays(today, date);
  if (diff === 0) return 'Für heute';
  if (diff === 1) return 'Für morgen';
  if (diff > 1 && diff < 7) return `Für ${dayLabel(date, today)}`;
  return `Für den ${dayLabel(date, today)}`;
}

function minutesUntilLabel(mins: number): string {
  if (mins >= 60) {
    const h = Math.round(mins / 60);
    return h === 1 ? 'einer Stunde' : `${h} Stunden`;
  }
  const m = Math.max(5, Math.round(mins / 5) * 5);
  return `${m} Minuten`;
}

export function planNotifications(snap: Snapshot, devices: DeviceInfo[]): PlanResult {
  const now = snap.now;
  const nowMs = now.getTime();
  const local = berlinParts(now);
  const today = local.date;

  const modules = new Map(snap.modules.map((m) => [m.id, m]));
  const moduleName = (id: string) => modules.get(id)?.name ?? 'einem Modul';
  const entries = new Map(snap.entries.map((e) => [e.id, e]));
  const activeMembers = snap.members.filter((m) => m.is_active);
  const memberIds = new Set(activeMembers.map((m) => m.id));

  // Aktive Aufgaben = nicht gelöscht, Lerntag nicht gelöscht, Modul nicht archiviert (wie in der App)
  const tasks: TaskInfo[] = [];
  for (const t of snap.tasks) {
    if (t.deleted_at) continue;
    const e = entries.get(t.study_entry_id);
    if (!e || e.deleted_at) continue;
    const m = modules.get(e.module_id);
    if (!m || m.archived_at) continue;
    tasks.push({ id: t.id, date: e.study_date, moduleId: e.module_id });
  }
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const done = new Set(snap.completions.filter((c) => c.is_completed).map((c) => `${c.task_id}:${c.member_id}`));
  const isDone = (taskId: string, memberId: string) => done.has(`${taskId}:${memberId}`);

  const memberCache = new Map<string, { todayAll: TaskInfo[]; todayOpen: TaskInfo[]; overdue: TaskInfo[] }>();
  const forMember = (memberId: string) => {
    let c = memberCache.get(memberId);
    if (!c) {
      const todayAll = tasks.filter((t) => t.date === today);
      c = {
        todayAll,
        todayOpen: todayAll.filter((t) => !isDone(t.id, memberId)),
        overdue: tasks.filter((t) => t.date < today && !isDone(t.id, memberId)),
      };
      memberCache.set(memberId, c);
    }
    return c;
  };

  const out: Planned[] = [];
  const cursors: Record<string, number> = {};
  const stateOut: Record<string, StateValue> = {};

  // -------------------------------------------------------------------
  // Erfolge: Zustandswechsel „Modul zu 100 % erledigt“ (Gruppe/Person)
  // -------------------------------------------------------------------
  const transitions = (key: string, complete: boolean): StateValue => {
    const prev = snap.state[key];
    let next: StateValue;
    if (!prev) next = { complete, since: now.toISOString(), transition: false };
    else if (prev.complete !== complete) next = { complete, since: now.toISOString(), transition: true };
    else next = prev;
    if (next !== prev) stateOut[key] = next;
    return next;
  };
  const groupWins: { moduleId: string; since: string }[] = [];
  const personalWins: { memberId: string; moduleId: string; since: string }[] = [];
  for (const m of snap.modules) {
    if (m.archived_at) continue;
    const mt = tasks.filter((t) => t.moduleId === m.id);
    if (mt.length === 0) continue;
    const groupComplete = activeMembers.length > 0 && activeMembers.every((mem) => mt.every((t) => isDone(t.id, mem.id)));
    const g = transitions(`group_complete:${m.id}`, groupComplete);
    if (g.complete && g.transition && nowMs - Date.parse(g.since) < SUCCESS_WINDOW_MS) groupWins.push({ moduleId: m.id, since: g.since });
    for (const mem of activeMembers) {
      const p = transitions(`member_complete:${mem.id}:${m.id}`, mt.every((t) => isDone(t.id, mem.id)));
      if (p.complete && p.transition && nowMs - Date.parse(p.since) < SUCCESS_WINDOW_MS) personalWins.push({ memberId: mem.id, moduleId: m.id, since: p.since });
    }
  }

  const maxActivityId = snap.activity.reduce((a, r) => Math.max(a, r.id), 0);

  for (const dev of devices) {
    const prefs = dev.prefs;
    const quietNow = inQuietHours(local.minutes, prefs);
    const memberId = dev.member_id && memberIds.has(dev.member_id) ? dev.member_id : null;
    const push = (p: Omit<Planned, 'deviceId' | 'badge'>, badge: number | null) => {
      if (dev.sent.has(p.dedupeKey)) return false;
      out.push({ ...p, deviceId: dev.id, badge: prefs.badge ? badge : null });
      dev.sent.add(p.dedupeKey);
      for (const a of p.alsoKeys ?? []) dev.sent.add(a.key);
      return true;
    };

    // ---------------- Änderungen am Lernplan (Cursor auch ohne Profil weiterführen)
    planChanges(dev, memberId, quietNow);

    if (!memberId) continue;
    const mine = forMember(memberId);
    const badge = mine.todayOpen.length + mine.overdue.length;

    // ---------------- A/C: Morgenübersicht + überfällige Aufgaben
    const morningEff = effectiveMinute(timeToMinutes(prefs.morningTime), prefs);
    const overdueEff = effectiveMinute(timeToMinutes(prefs.overdueTime), prefs);
    const morningDue = prefs.morning && !quietNow && local.minutes >= morningEff && local.minutes < morningEff + DAILY_WINDOW_MIN;
    const overdueIds = mine.overdue.map((t) => t.id).sort();
    const overdueKey = `overdue:${today}`;
    const overdueWanted =
      prefs.overdue &&
      overdueIds.length > 0 &&
      !dev.sent.has(overdueKey) &&
      (!dev.lastOverdue ||
        overdueIds.some((id) => !dev.lastOverdue!.taskIds.includes(id)) ||
        nowMs - Date.parse(dev.lastOverdue.at) >= OVERDUE_REPEAT_DAYS * 86_400_000);
    const overdueText = () => {
      const allYesterday = mine.overdue.every((t) => t.date === addDays(today, -1));
      return allYesterday
        ? `${plural(overdueIds.length, 'Aufgabe', 'Aufgaben')} von gestern ${overdueIds.length === 1 ? 'wartet' : 'warten'} noch auf dich.`
        : `${plural(overdueIds.length, 'Aufgabe', 'Aufgaben')} aus vergangenen Lerntagen ${overdueIds.length === 1 ? 'wartet' : 'warten'} noch auf dich.`;
    };
    const overdueMeta = { taskIds: overdueIds.slice(0, 200) };

    const morningKey = `morning:${today}`;
    if (morningDue && mine.todayAll.length > 0 && mine.todayOpen.length > 0 && !dev.sent.has(morningKey)) {
      const n = mine.todayOpen.length;
      let body = `Heute ${n === 1 ? 'steht' : 'stehen'} ${plural(n, 'Aufgabe', 'Aufgaben')} in ${moduleBreakdown(mine.todayOpen, moduleName)} an. Du schaffst das!`;
      // Zusammenfassen, wenn die Überfällig-Erinnerung in die Nähe (≤ 60 Min.) fällt
      const merge = overdueWanted && Math.abs(overdueEff - morningEff) <= 60;
      if (merge) body += ` Außerdem: ${overdueText()}`;
      push(
        {
          kind: 'morning',
          dedupeKey: morningKey,
          title: 'Dein Lernplan für heute',
          body,
          url: '#/',
          ttl: 4 * 3600,
          urgency: 'normal',
          topic: 'morning',
          alsoKeys: merge ? [{ key: overdueKey, kind: 'overdue', meta: overdueMeta }] : undefined,
        },
        badge,
      );
    }

    const overdueDue = !quietNow && local.minutes >= overdueEff && local.minutes < overdueEff + DAILY_WINDOW_MIN;
    if (overdueDue && overdueWanted && !dev.sent.has(overdueKey)) {
      push(
        { kind: 'overdue', dedupeKey: overdueKey, title: 'Da ist noch etwas offen', body: overdueText(), url: '#/lernplan?ansicht=liste&status=ueberfaellig', ttl: 6 * 3600, urgency: 'normal', topic: 'overdue', meta: overdueMeta },
        badge,
      );
    }

    // ---------------- B: Abends noch offene Aufgaben
    const eveningEff = effectiveMinute(timeToMinutes(prefs.eveningTime), prefs);
    const eveningKey = `evening:${today}`;
    if (prefs.evening && !quietNow && local.minutes >= eveningEff && local.minutes < eveningEff + DAILY_WINDOW_MIN && mine.todayOpen.length > 0 && !dev.sent.has(eveningKey)) {
      const n = mine.todayOpen.length;
      push(
        {
          kind: 'evening',
          dedupeKey: eveningKey,
          title: 'Noch nicht ganz geschafft!',
          body: `Du hast heute noch ${plural(n, 'Aufgabe', 'Aufgaben')} in ${moduleBreakdown(mine.todayOpen, moduleName)} offen.`,
          url: '#/',
          ttl: 3 * 3600,
          urgency: 'normal',
          topic: 'evening',
        },
        badge,
      );
    }

    // ---------------- D: Prüfungen
    if (prefs.exams) {
      for (const ex of snap.exams) {
        if (ex.deleted_at) continue;
        const mod = modules.get(ex.module_id);
        if (!mod || mod.archived_at) continue;
        const startMs = Date.parse(ex.starts_at);
        if (startMs <= nowMs) continue; // begonnen oder vorbei: keine Vorbereitungserinnerung mehr
        const start = new Date(startMs);
        const examLocal = berlinParts(start);
        const startTime = examLocal.time;
        const base = `exam:${ex.id}:${ex.starts_at}`;
        const openInModule = tasks.filter((t) => t.moduleId === mod.id && !isDone(t.id, memberId)).length;

        for (const daysBefore of [7, 3, 1] as const) {
          const day = addDays(examLocal.date, -daysBefore);
          if (day !== today) continue;
          const eff = effectiveMinute(timeToMinutes(EXAM_DAY_TIME), prefs);
          if (quietNow || local.minutes < eff || local.minutes >= eff + 240) continue;
          const body =
            daysBefore === 7
              ? `Noch eine Woche bis ${mod.name}. Schau dir deinen Lernfortschritt an.`
              : daysBefore === 3
                ? `${mod.name} ist in 3 Tagen. ${openInModule === 0 ? 'Alle Lernaufgaben sind erledigt – stark vorbereitet!' : `Du hast noch ${plural(openInModule, 'offene Lernaufgabe', 'offene Lernaufgaben')}.`}`
                : `Morgen um ${startTime} Uhr ist deine ${mod.name} Prüfung. Viel Erfolg bei der Vorbereitung!`;
          push(
            {
              kind: 'exam',
              dedupeKey: `${base}:${daysBefore}d`,
              title: daysBefore === 7 ? 'Prüfung in einer Woche' : daysBefore === 3 ? 'Prüfung in 3 Tagen' : 'Prüfung morgen',
              body,
              url: '#/pruefungen',
              ttl: Math.min(24 * 3600, Math.max(600, Math.floor((startMs - nowMs) / 1000))),
              urgency: daysBefore === 1 ? 'high' : 'normal',
              topic: `exam${ex.id.replace(/-/g, '').slice(0, 20)}`,
            },
            badge,
          );
        }

        // Am Prüfungstag: 2 Stunden vorher (Ruhezeit beachten, rechtzeitig nachholen)
        const two = twoHourTarget(start, examLocal.date, prefs);
        const atMs = two.at.getTime();
        const key2h = `${base}:2h`;
        if (nowMs >= atMs && nowMs < startMs - 10 * 60 * 1000 && nowMs - atMs < 4 * 3600 * 1000 && !quietNow) {
          if (two.previousEvening && dev.sent.has(`${base}:1d`)) {
            dev.sent.add(key2h); // bereits durch „Prüfung morgen“ abgedeckt
          } else {
            const mins = Math.round((startMs - nowMs) / 60000);
            push(
              {
                kind: 'exam',
                dedupeKey: key2h,
                title: two.previousEvening ? 'Prüfung morgen früh' : `Gleich: ${mod.name}`,
                body: two.previousEvening ? `Morgen um ${startTime} Uhr beginnt ${mod.name}. Viel Erfolg!` : `In ${minutesUntilLabel(mins)} beginnt ${mod.name}. Viel Erfolg!`,
                url: '#/pruefungen',
                ttl: Math.max(300, Math.floor((startMs - nowMs) / 1000)),
                urgency: 'high',
                topic: `exam${ex.id.replace(/-/g, '').slice(0, 20)}`,
              },
              badge,
            );
          }
        }
      }
    }

    // ---------------- F: Gemeinsame Erfolge
    if (prefs.groupSuccess && !quietNow) {
      for (const w of groupWins) {
        push(
          {
            kind: 'group',
            dedupeKey: `group:${w.moduleId}:${w.since}`,
            title: 'Gemeinsam geschafft! 🎉',
            body: `Ihr habt alle Aufgaben in ${moduleName(w.moduleId)} abgeschlossen. Starkes Team!`,
            url: `#/faecher/${w.moduleId}`,
            ttl: 24 * 3600,
            urgency: 'normal',
            topic: 'group',
          },
          badge,
        );
      }
    }

    // ---------------- G: Persönliche Erfolge (größere Ziele: ein ganzes Modul)
    if (prefs.personalSuccess && !quietNow) {
      for (const w of personalWins) {
        if (w.memberId !== memberId) continue;
        push(
          {
            kind: 'personal',
            dedupeKey: `personal:${w.memberId}:${w.moduleId}:${w.since}`,
            title: 'Modul geschafft!',
            body: `Du hast alle Aufgaben in ${moduleName(w.moduleId)} erledigt. Weiter so!`,
            url: `#/faecher/${w.moduleId}`,
            ttl: 24 * 3600,
            urgency: 'normal',
            topic: 'personal',
          },
          badge,
        );
      }
    }

    // Innere Hilfsfunktion: E – Änderungen am gemeinsamen Lernplan
    function planChanges(d: DeviceInfo, member: string | null, quiet: boolean) {
      if (d.plan_cursor === null) {
        cursors[d.id] = maxActivityId; // Neues Gerät: keine Vergangenheit nachliefern
        return;
      }
      const rows = snap.activity.filter((r) => r.id > d.plan_cursor!);
      if (rows.length === 0) return;
      const relevant = rows.filter((r) => isRelevantChange(r) && (!member || r.actor_member_id !== member));
      const latestId = rows[rows.length - 1].id;
      if (!d.prefs.planChanges || relevant.length === 0) {
        cursors[d.id] = latestId;
        return;
      }
      const newest = Math.max(...relevant.map((r) => Date.parse(r.occurred_at)));
      if (nowMs - newest < PLAN_DEBOUNCE_MS || quiet) return; // weiter sammeln bzw. Ruhezeit abwarten
      const text = describeChanges(relevant, taskById, entries, snap.exams, moduleName, today);
      cursors[d.id] = latestId;
      if (!text) return;
      const maxRelevant = Math.max(...relevant.map((r) => r.id));
      const isExam = relevant.some((r) => r.entity_type === 'exams');
      push(
        { kind: 'plan', dedupeKey: `plan:${maxRelevant}`, title: 'Lernplan aktualisiert', body: text, url: isExam ? '#/pruefungen' : '#/lernplan', ttl: 12 * 3600, urgency: 'low', topic: 'plan' },
        member ? forMember(member).todayOpen.length + forMember(member).overdue.length : null,
      );
    }
  }

  return { notifications: out, cursors, state: stateOut };
}

function isRelevantChange(r: Snapshot['activity'][number]): boolean {
  if (r.entity_type === 'study_entries') return r.action === 'created' || r.action === 'moved' || r.action === 'restored';
  if (r.entity_type === 'tasks') return r.action === 'created' || r.action === 'restored';
  if (r.entity_type === 'exams') return r.action === 'created' || r.action === 'updated' || r.action === 'restored';
  return false;
}

function describeChanges(
  rows: Snapshot['activity'],
  taskById: Map<string, TaskInfo>,
  entries: Map<string, Snapshot['entries'][number]>,
  exams: Snapshot['exams'],
  moduleName: (id: string) => string,
  today: string,
): string | null {
  const sentences: string[] = [];

  // Neue Aufgaben, gruppiert nach Lerntag
  const newTasks = [...new Set(rows.filter((r) => r.entity_type === 'tasks').map((r) => r.entity_id))]
    .map((id) => taskById.get(id))
    .filter((t): t is TaskInfo => !!t);
  if (newTasks.length) {
    const days = [...new Set(newTasks.map((t) => t.date))];
    const mods = [...new Set(newTasks.map((t) => t.moduleId))];
    const n = newTasks.length;
    if (days.length === 1) {
      const where = mods.length === 1 ? ` in ${moduleName(mods[0])}` : '';
      sentences.push(`${forDay(days[0], today)} ${n === 1 ? 'wurde' : 'wurden'} ${plural(n, 'neue Aufgabe', 'neue Aufgaben')}${where} hinzugefügt.`);
    } else {
      sentences.push(`Es gibt ${plural(n, 'neue Aufgabe', 'neue Aufgaben')} an ${days.length} Lerntagen.`);
    }
  }

  // Verschobene Lerntage (nicht gerade neu angelegt)
  const createdEntries = new Set(rows.filter((r) => r.entity_type === 'study_entries' && r.action === 'created').map((r) => r.entity_id));
  const moved = [...new Set(rows.filter((r) => r.entity_type === 'study_entries' && r.action === 'moved' && !createdEntries.has(r.entity_id)).map((r) => r.entity_id))].filter(
    (id) => entries.get(id) && !entries.get(id)!.deleted_at,
  );
  if (moved.length === 1) {
    const e = entries.get(moved[0])!;
    sentences.push(`Ein Lerntag in ${moduleName(e.module_id)} wurde auf ${formatDateShort(e.study_date)} verschoben.`);
  } else if (moved.length > 1) {
    sentences.push(`${moved.length} Lerntage wurden verschoben.`);
  }

  // Prüfungstermine
  const examIds = [...new Set(rows.filter((r) => r.entity_type === 'exams').map((r) => r.entity_id))];
  const changedExams = examIds.map((id) => exams.find((e) => e.id === id)).filter((e): e is Snapshot['exams'][number] => !!e && !e.deleted_at);
  if (changedExams.length === 1) {
    const e = changedExams[0];
    const p = berlinParts(new Date(e.starts_at));
    sentences.push(`Prüfung ${moduleName(e.module_id)}: ${formatDateShort(p.date)} um ${p.time} Uhr.`);
  } else if (changedExams.length > 1) {
    sentences.push(`${changedExams.length} Prüfungstermine wurden geändert.`);
  }

  if (!sentences.length) return null;
  return sentences.slice(0, 2).join(' ');
}

/**
 * Zeitpunkt der Erinnerung „2 Stunden vor der Prüfung“.
 * Liegt er in der Ruhezeit, wird er auf das Ende der Ruhezeit verschoben –
 * sofern dann noch mindestens 30 Minuten bis zum Beginn bleiben. Sonst wird
 * am Vorabend erinnert (15 Minuten vor Beginn der Ruhezeit).
 */
export function twoHourTarget(start: Date, examDate: string, prefs: Pick<PushPrefs, 'quietStart' | 'quietEnd'>): { at: Date; previousEvening: boolean } {
  const target = new Date(start.getTime() - 2 * 3600 * 1000);
  const t = berlinParts(target);
  if (!inQuietHours(t.minutes, prefs)) return { at: target, previousEvening: false };
  const qeAt = berlinInstant(examDate, prefs.quietEnd);
  if (qeAt.getTime() > target.getTime() && qeAt.getTime() <= start.getTime() - 30 * 60 * 1000) return { at: qeAt, previousEvening: false };
  const qs = timeToMinutes(prefs.quietStart);
  return { at: berlinInstant(addDays(examDate, -1), minutesToTime(Math.max(0, qs - 15))), previousEvening: true };
}
