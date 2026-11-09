/**
 * Hausaufgaben – Typen und reine Planungslogik (ohne React, testbar).
 *
 * Grundregeln:
 *  – Der Bearbeitungszeitraum reicht von heute (bzw. dem frühesten Beginn)
 *    bis zum Tag VOR dem Abgabedatum. Der Abgabetag ist kein Arbeitstag.
 *  – Die Verteilung schlägt nur Termine vor. Sie verschiebt nie bestehende
 *    Aufgaben und erfindet keine fachlichen Unteraufgaben – nur neutrale
 *    Arbeitseinheiten in der vom Nutzer gewählten Anzahl.
 */
import { addDaysISO, diffDaysISO } from './time';
import type { ISODate, UUID } from './types';

export type Priority = 1 | 2 | 3;

export interface Homework {
  id: UUID;
  module_id: UUID;
  title: string;
  description: string | null;
  due_date: ISODate;
  earliest_start: ISODate | null;
  priority: Priority;
  effort_minutes: number | null;
  unit_count: number | null;
  deleted_at: string | null;
  changed_by: UUID | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface HomeworkPart {
  id: UUID;
  homework_id: UUID;
  kind: 'subtask' | 'unit';
  title: string;
  planned_date: ISODate | null;
  sort_order: number;
  deleted_at: string | null;
  changed_by: UUID | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface HomeworkCompletion {
  target_id: UUID;
  homework_id: UUID;
  member_id: UUID;
  is_completed: boolean;
  completed_at: string | null;
  changed_by: UUID | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'Niedrig', 2: 'Normal', 3: 'Hoch' };

export function hwKey(targetId: UUID, memberId: UUID): string {
  return `${targetId}:${memberId}`;
}

// ---------------------------------------------------------------------
// Bearbeitungszeitraum
// ---------------------------------------------------------------------

export interface WorkWindow {
  /** Erster Arbeitstag */
  start: ISODate;
  /** Letzter Arbeitstag (Tag vor der Abgabe) */
  end: ISODate;
  /** Alle Arbeitstage (leer, wenn kein Tag mehr bleibt) */
  days: ISODate[];
}

export function workWindow(today: ISODate, due: ISODate, earliestStart: ISODate | null = null): WorkWindow {
  const start = earliestStart && earliestStart > today ? earliestStart : today;
  const end = addDaysISO(due, -1);
  const days: ISODate[] = [];
  if (end >= start) {
    const n = diffDaysISO(start, end);
    for (let i = 0; i <= n && i < 400; i++) days.push(addDaysISO(start, i));
  }
  return { start, end, days };
}

/** Tage bis zur Abgabe (0 = heute fällig, negativ = überfällig) */
export function daysUntil(due: ISODate, today: ISODate): number {
  return diffDaysISO(today, due);
}

export function dueLabel(due: ISODate, today: ISODate): string {
  const d = daysUntil(due, today);
  if (d < -1) return `seit ${-d} Tagen überfällig`;
  if (d === -1) return 'seit gestern überfällig';
  if (d === 0) return 'heute fällig';
  if (d === 1) return 'morgen fällig';
  return `in ${d} Tagen fällig`;
}

// ---------------------------------------------------------------------
// Verteilung von Arbeitseinheiten
// ---------------------------------------------------------------------

export interface DistributeInput {
  count: number;
  window: WorkWindow;
  /** Bereits geplante Last je Tag (Lernplan-Aufgaben + andere Hausaufgaben) */
  load: Record<ISODate, number>;
  /** Tage mit Prüfungen (werden möglichst gemieden, ebenso der Tag davor) */
  examDays: ISODate[];
  priority: Priority;
}

/**
 * Verteilt `count` Einheiten auf freie Tage des Zeitraums.
 * – hält einen Puffer vor der Abgabe frei (wenn genug Tage da sind),
 * – meidet Prüfungstage und den Tag davor,
 * – bevorzugt wenig belegte Tage, verteilt gleichmäßig über den Zeitraum,
 * – hohe Priorität plant eher früh, niedrige eher später.
 * Gibt sortierte Datumswerte zurück (bei sehr kurzem Zeitraum auch
 * mehrere Einheiten am selben Tag).
 */
export function distributeUnits({ count, window, load, examDays, priority }: DistributeInput): ISODate[] {
  const n = Math.max(0, Math.min(30, Math.round(count)));
  if (n === 0 || window.days.length === 0) return [];
  const exams = new Set(examDays);
  const nearExam = new Set(examDays.map((d) => addDaysISO(d, -1)));

  // Puffer: bei hoher Priorität bis zu 2 Tage, sonst 1 – nur wenn genug Tage übrig bleiben
  const wantBuffer = priority === 3 ? 2 : priority === 2 ? 1 : 0;
  let days = window.days;
  for (let b = wantBuffer; b > 0; b--) {
    if (window.days.length - b >= n) {
      days = window.days.slice(0, window.days.length - b);
      break;
    }
  }
  // Prüfungstage meiden, solange genug andere Tage bleiben
  const noExam = days.filter((d) => !exams.has(d));
  if (noExam.length >= n) days = noExam;

  if (days.length <= n) {
    // Weniger Tage als Einheiten: reihum verteilen
    return Array.from({ length: n }, (_, i) => days[Math.floor((i * days.length) / n)]!).sort();
  }

  const cost = (d: ISODate) => (load[d] ?? 0) + (nearExam.has(d) ? 1.5 : 0) + (exams.has(d) ? 3 : 0);
  const out: ISODate[] = [];
  const used = new Set<ISODate>();
  // Zeitraum in n gleich große Abschnitte teilen; je Abschnitt den günstigsten Tag
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * days.length) / n);
    const to = Math.floor(((i + 1) * days.length) / n);
    const seg = days.slice(from, Math.max(from + 1, to)).filter((d) => !used.has(d));
    const ordered = priority === 1 ? [...seg].reverse() : seg;
    let best = ordered[0]!;
    for (const d of ordered) if (cost(d) < cost(best)) best = d;
    used.add(best);
    out.push(best);
  }
  return out.sort();
}

/** Standard-Anzahl an Einheiten aus dem Aufwand (60 Min. je Einheit) – nur als Vorschlag im Formular */
export function suggestedUnits(effortMinutes: number | null, windowDays: number): number {
  const base = effortMinutes ? Math.ceil(effortMinutes / 60) : 2;
  return Math.max(1, Math.min(base, Math.max(1, windowDays), 30));
}

export function unitTitle(i: number, total: number): string {
  return `Arbeitseinheit ${i + 1} von ${total}`;
}

// ---------------------------------------------------------------------
// Neuplanung bei geändertem Abgabedatum
// ---------------------------------------------------------------------

export interface ReplanChange {
  id: UUID;
  from: ISODate | null;
  to: ISODate;
}

/**
 * Schlägt neue Termine für Einheiten vor, wenn sich das Abgabedatum ändert.
 * – Erledigte Einheiten (completedIds) behalten ihr Datum.
 * – Ohne `all` werden nur Einheiten verschoben, die nicht mehr in den
 *   neuen Zeitraum passen; mit `all` werden alle offenen neu verteilt.
 * IDs bleiben erhalten – damit auch der Erledigt-Status.
 */
export function replanUnits(
  units: Pick<HomeworkPart, 'id' | 'planned_date'>[],
  window: WorkWindow,
  opts: { completedIds: Set<UUID>; all: boolean; load: Record<ISODate, number>; examDays: ISODate[]; priority: Priority },
): ReplanChange[] {
  const inWindow = (d: ISODate | null) => !!d && d >= window.start && d <= window.end;
  const open = units.filter((u) => !opts.completedIds.has(u.id));
  const move = opts.all ? open : open.filter((u) => !inWindow(u.planned_date));
  if (move.length === 0) return [];
  // Tage der verbleibenden Einheiten zählen als belegt
  const load = { ...opts.load };
  for (const u of units) if (!move.includes(u) && u.planned_date) load[u.planned_date] = (load[u.planned_date] ?? 0) + 1;
  const dates = distributeUnits({ count: move.length, window, load, examDays: opts.examDays, priority: opts.priority });
  if (dates.length === 0) return [];
  const sorted = [...move].sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''));
  return sorted.map((u, i) => ({ id: u.id, from: u.planned_date, to: dates[i] ?? dates[dates.length - 1]! })).filter((c) => c.from !== c.to);
}

// ---------------------------------------------------------------------
// Fortschritt
// ---------------------------------------------------------------------

export interface HomeworkProgress {
  done: boolean;
  /** erledigte / alle Teile (Unteraufgaben + Einheiten); ohne Teile: 0/1 bzw. 1/1 */
  completed: number;
  total: number;
  ratio: number;
}

export function homeworkProgress(hw: Pick<Homework, 'id'>, parts: Pick<HomeworkPart, 'id'>[], isDone: (targetId: UUID) => boolean): HomeworkProgress {
  const done = isDone(hw.id);
  if (parts.length === 0) return { done, completed: done ? 1 : 0, total: 1, ratio: done ? 1 : 0 };
  const completed = done ? parts.length : parts.filter((p) => isDone(p.id)).length;
  return { done, completed, total: parts.length, ratio: completed / parts.length };
}
