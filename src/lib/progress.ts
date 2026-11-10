import { completionKey } from './types';
import type { Completion, ISODate, Member, Module, StudyEntry, Task, Topic, UUID } from './types';

/** Aufgabe mit den Angaben ihres Lerntags (für Filter und Berechnungen). */
export interface TaskView {
  task: Task;
  entry: StudyEntry;
  module: Module;
  topic: Topic | null;
  date: ISODate;
}

export interface Ratio {
  done: number;
  total: number;
  /** null = keine Aufgaben vorhanden (Leerzustand statt falscher 100 %) */
  pct: number | null;
}

// ---------------------------------------------------------------------
// Hausaufgaben im Fortschritt
// ---------------------------------------------------------------------
// Regel (überall dieselbe):
//  – Jede aktive Hausaufgabe zählt als GENAU EIN Posten – so viel wie eine
//    Aufgabe aus dem Lernplan, egal in wie viele Arbeitseinheiten oder
//    Unteraufgaben sie zerlegt ist. Einheiten und Unteraufgaben sind Schritte
//    DIESES Postens und werden nie zusätzlich gezählt (keine Doppelzählung,
//    auch wenn Einheiten im Lernplan-Kalender erscheinen).
//  – Erledigt (1,0) ist sie, sobald die Hausaufgabe abgehakt ist oder alle
//    ihre Teile abgehakt sind. Vorher zählt der Anteil erledigter Teile
//    (z. B. 2 von 4 Einheiten = 0,5) – nur für den Prozentwert.
//  – `done` bleibt die Zahl VOLLSTÄNDIG erledigter Posten („6 erledigt“).

/** Eine Hausaufgabe als Fortschritts-Posten */
export interface HomeworkItem {
  id: UUID;
  moduleId: UUID;
  /** aktive Unteraufgaben und Arbeitseinheiten */
  partIds: UUID[];
}

/** Alles, was in einen Fortschrittswert einfließt */
export interface ProgressScope {
  tasks: TaskView[];
  homework: HomeworkItem[];
}

/** Erledigungen beider Quellen */
export interface DoneLookup {
  tasks: Record<string, Completion>;
  /** Schlüssel `${zielId}:${personId}` (Hausaufgabe oder Teil) */
  homework: Record<string, { is_completed: boolean } | undefined>;
}

export const EMPTY_SCOPE: ProgressScope = { tasks: [], homework: [] };

/** Anteil 0–1, zu dem eine Person eine Hausaufgabe erledigt hat. */
export function homeworkCredit(item: HomeworkItem, memberId: UUID, done: DoneLookup['homework']): number {
  if (done[`${item.id}:${memberId}`]?.is_completed) return 1;
  if (item.partIds.length === 0) return 0;
  let n = 0;
  for (const id of item.partIds) if (done[`${id}:${memberId}`]?.is_completed) n++;
  return n / item.partIds.length;
}

/** Persönlicher Fortschritt aus Lernplan-Aufgaben UND Hausaufgaben. */
export function scopeMemberRatio(scope: ProgressScope, memberId: UUID, done: DoneLookup): Ratio {
  let full = 0;
  let credit = 0;
  for (const t of scope.tasks) if (isDone(done.tasks, t.task.id, memberId)) (full++, credit++);
  for (const h of scope.homework) {
    const c = homeworkCredit(h, memberId, done.homework);
    credit += c;
    if (c >= 1) full++;
  }
  return ratio(full, scope.tasks.length + scope.homework.length, credit);
}

/** Gruppenfortschritt: alle Erledigungen aller Personen ÷ (Posten × Personen). */
export function scopeGroupRatio(scope: ProgressScope, memberIds: UUID[], done: DoneLookup): Ratio {
  let full = 0;
  let credit = 0;
  for (const m of memberIds) {
    for (const t of scope.tasks) if (isDone(done.tasks, t.task.id, m)) (full++, credit++);
    for (const h of scope.homework) {
      const c = homeworkCredit(h, m, done.homework);
      credit += c;
      if (c >= 1) full++;
    }
  }
  return ratio(full, (scope.tasks.length + scope.homework.length) * memberIds.length, credit);
}

/** Ausschnitt für ein Fach */
export function scopeForModule(scope: ProgressScope, moduleId: UUID): ProgressScope {
  return { tasks: scope.tasks.filter((t) => t.module.id === moduleId), homework: scope.homework.filter((h) => h.moduleId === moduleId) };
}

/** Aktive Hausaufgaben (nicht gelöscht, Fach nicht archiviert) als Posten. */
export function activeHomeworkItems(
  homework: Record<string, { id: UUID; module_id: UUID; deleted_at: string | null }>,
  parts: Record<string, { id: UUID; homework_id: UUID; deleted_at: string | null }>,
  modules: Record<string, Module>,
): HomeworkItem[] {
  const byHw = new Map<UUID, UUID[]>();
  for (const p of Object.values(parts)) {
    if (p.deleted_at) continue;
    const list = byHw.get(p.homework_id);
    if (list) list.push(p.id);
    else byHw.set(p.homework_id, [p.id]);
  }
  const out: HomeworkItem[] = [];
  for (const h of Object.values(homework)) {
    if (h.deleted_at) continue;
    const m = modules[h.module_id];
    if (!m || m.archived_at) continue;
    out.push({ id: h.id, moduleId: h.module_id, partIds: byHw.get(h.id) ?? [] });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface ProgressSource {
  modules: Record<string, Module>;
  topics: Record<string, Topic>;
  entries: Record<string, StudyEntry>;
  tasks: Record<string, Task>;
}

/**
 * Aktive Aufgaben = nicht gelöscht, Lerntag nicht gelöscht, Modul nicht
 * archiviert. Nur diese zählen für Fortschrittswerte.
 */
export function activeTaskViews(src: ProgressSource): TaskView[] {
  const out: TaskView[] = [];
  for (const task of Object.values(src.tasks)) {
    if (task.deleted_at) continue;
    const entry = src.entries[task.study_entry_id];
    if (!entry || entry.deleted_at) continue;
    const module = src.modules[entry.module_id];
    if (!module || module.archived_at) continue;
    const topic = entry.topic_id ? src.topics[entry.topic_id] ?? null : null;
    out.push({ task, entry, module, topic, date: entry.study_date });
  }
  out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.entry.sort_order - b.entry.sort_order ||
      a.entry.created_at.localeCompare(b.entry.created_at) ||
      a.task.sort_order - b.task.sort_order ||
      a.task.created_at.localeCompare(b.task.created_at),
  );
  return out;
}

export function isDone(completions: Record<string, Completion>, taskId: UUID, memberId: UUID): boolean {
  return completions[completionKey(taskId, memberId)]?.is_completed === true;
}

export function ratio(done: number, total: number, credit: number = done): Ratio {
  if (total <= 0) return { done: 0, total: 0, pct: null };
  // Abrunden: 100 % wird ausschließlich angezeigt, wenn wirklich alles erledigt ist.
  // `credit` enthält zusätzlich anteilig erledigte Hausaufgaben (siehe unten).
  const full = credit >= total - 1e-9;
  return { done, total, pct: full ? 100 : Math.min(99, Math.floor((credit / total) * 100 + 1e-9)) };
}

/** Persönlicher Fortschritt: erledigte Aufgaben ÷ alle relevanten aktiven Aufgaben. */
export function memberRatio(tasks: TaskView[], memberId: UUID, completions: Record<string, Completion>): Ratio {
  let done = 0;
  for (const t of tasks) if (isDone(completions, t.task.id, memberId)) done++;
  return ratio(done, tasks.length);
}

/**
 * Gruppenfortschritt: Summe aller Erledigungen aller aktiven Personen ÷
 * (Aufgaben × aktive Personen). 100 % erst, wenn alle alles erledigt haben.
 */
export function groupRatio(tasks: TaskView[], memberIds: UUID[], completions: Record<string, Completion>): Ratio {
  let done = 0;
  for (const t of tasks) for (const m of memberIds) if (isDone(completions, t.task.id, m)) done++;
  return ratio(done, tasks.length * memberIds.length);
}

export interface TaskGroupStatus {
  doneMembers: UUID[];
  openMembers: UUID[];
  allDone: boolean;
}

export function taskGroupStatus(taskId: UUID, memberIds: UUID[], completions: Record<string, Completion>): TaskGroupStatus {
  const doneMembers: UUID[] = [];
  const openMembers: UUID[] = [];
  for (const m of memberIds) (isDone(completions, taskId, m) ? doneMembers : openMembers).push(m);
  return { doneMembers, openMembers, allDone: memberIds.length > 0 && openMembers.length === 0 };
}

export function activeMembers(members: Record<string, Member>): Member[] {
  return Object.values(members)
    .filter((m) => m.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export function sortedMembers(members: Record<string, Member>): Member[] {
  return Object.values(members).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** Aufgaben gruppiert nach Schlüssel (Modul, Thema, Datum …). */
export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Offene Aufgaben einer Person aus vergangenen Lerntagen. */
export function overdueFor(tasks: TaskView[], memberId: UUID, completions: Record<string, Completion>, today: ISODate): TaskView[] {
  return tasks.filter((t) => t.date < today && !isDone(completions, t.task.id, memberId));
}

/** Verbleibende gemeinsame Erledigungen bis 100 %. */
export function remainingForGroup(r: Ratio): number {
  return Math.max(0, r.total - r.done);
}
