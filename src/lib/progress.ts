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

export function ratio(done: number, total: number): Ratio {
  if (total <= 0) return { done: 0, total: 0, pct: null };
  // Abrunden: 100 % wird ausschließlich angezeigt, wenn wirklich alles erledigt ist.
  return { done, total, pct: done >= total ? 100 : Math.floor((done / total) * 100) };
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
