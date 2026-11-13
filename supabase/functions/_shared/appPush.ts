/**
 * App (Konten + Lerngruppen): Wer bekommt welche Mitteilung „neue
 * Hausaufgabe“? Reine Funktion ohne Datenbank – wird von der Edge Function
 * „app-push“ aufgerufen und in Vitest geprüft.
 *
 * Regeln:
 *  – nur Geräte von Konten, die (noch) Mitglied der Gruppe sind
 *  – nie an die Person, die die Hausaufgabe eingetragen hat
 *  – nur Hausaufgaben, die nach dem Einschalten des Geräts entstanden sind
 *  – gelöschte oder bereits fällige Hausaufgaben entfallen
 *  – Ruhezeit des Geräts: warten, danach nachliefern (bis 36 Stunden)
 *  – jede Hausaufgabe höchstens einmal je Gerät (dedupeKey homework:<id>)
 */
import { berlinParts } from './berlin.ts';
import { homeworkMessage, type NewHomework } from './homework.ts';
import { inQuietHours, type PushPrefs } from './prefs.ts';

export const APP_HOMEWORK_WINDOW_MS = 36 * 3600 * 1000;

export interface AppActivity {
  id: number;
  group_id: string;
  occurred_at: string;
  actor_member_id: string | null;
  entity_id: string;
}
export interface AppHomework {
  id: string;
  group_id: string;
  module_id: string;
  title: string;
  due_date: string;
  deleted_at: string | null;
}
export interface AppMembership {
  group_id: string;
  user_id: string;
  member_id: string | null;
}
export interface AppDevice {
  id: string;
  user_id: string;
  prefs: PushPrefs;
  created_at: string;
  /** Bereits protokollierte dedupeKeys */
  sent: Set<string>;
}
export interface AppPlanned {
  deviceId: string;
  dedupeKey: string;
  alsoKeys: string[];
  title: string;
  body: string;
  url: string;
  homeworkIds: string[];
}

export function planAppHomework(input: {
  now: Date;
  activity: AppActivity[];
  homework: AppHomework[];
  memberships: AppMembership[];
  devices: AppDevice[];
  moduleNames: Map<string, string>;
  memberNames: Map<string, string>;
  groupNames: Map<string, string>;
}): AppPlanned[] {
  const nowMs = input.now.getTime();
  const local = berlinParts(input.now);
  const today = local.date;
  const hwById = new Map(input.homework.map((h) => [h.id, h]));
  const memberOf = new Map<string, Map<string, string | null>>(); // user → (group → member)
  for (const m of input.memberships) {
    if (!memberOf.has(m.user_id)) memberOf.set(m.user_id, new Map());
    memberOf.get(m.user_id)!.set(m.group_id, m.member_id);
  }
  const events = [...input.activity].sort((a, b) => a.id - b.id);
  const out: AppPlanned[] = [];

  for (const dev of input.devices) {
    if (!dev.prefs.homework) continue;
    if (inQuietHours(local.minutes, dev.prefs)) continue; // später nachliefern
    const groups = memberOf.get(dev.user_id);
    if (!groups || groups.size === 0) continue;
    const since = Date.parse(dev.created_at);
    const items: (NewHomework & { groupId: string })[] = [];
    for (const ev of events) {
      if (!groups.has(ev.group_id)) continue;
      const mine = groups.get(ev.group_id);
      if (mine && ev.actor_member_id === mine) continue; // eigene Hausaufgabe
      const at = Date.parse(ev.occurred_at);
      if (at < since || nowMs - at > APP_HOMEWORK_WINDOW_MS) continue;
      const hw = hwById.get(ev.entity_id);
      if (!hw || hw.group_id !== ev.group_id || hw.deleted_at || hw.due_date < today) continue;
      if (dev.sent.has(`homework:${hw.id}`) || items.some((i) => i.id === hw.id)) continue;
      items.push({
        id: hw.id,
        groupId: hw.group_id,
        title: hw.title,
        moduleName: input.moduleNames.get(hw.module_id) ?? null,
        dueDate: hw.due_date,
        actorName: ev.actor_member_id ? (input.memberNames.get(ev.actor_member_id) ?? null) : null,
      });
    }
    if (items.length === 0) continue;
    const msg = homeworkMessage(items, today);
    // Wer in mehreren Gruppen ist, erfährt, aus welcher die Hausaufgabe stammt
    const oneGroup = items.every((i) => i.groupId === items[0].groupId);
    const groupName = groups.size > 1 && oneGroup ? input.groupNames.get(items[0].groupId) : undefined;
    const [first, ...rest] = items;
    out.push({
      deviceId: dev.id,
      dedupeKey: `homework:${first.id}`,
      alsoKeys: rest.map((i) => `homework:${i.id}`),
      title: msg.title,
      body: groupName ? `${msg.body} · ${groupName}` : msg.body,
      url: '#/hausaufgaben',
      homeworkIds: items.map((i) => i.id),
    });
  }
  return out;
}
