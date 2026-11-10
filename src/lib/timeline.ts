/**
 * Semester-Timeline: Module als Zeilen, Kalenderwochen als Spalten.
 * Lernphase = erster bis letzter geplanter Lerntag eines Moduls,
 * Prüfung = Raute am Prüfungstag. Alles wird aus echten Daten berechnet.
 */
import type { Completion, Exam, ISODate, Module, UUID } from './types';
import { addDaysISO, diffDaysISO, instantToZoned, isoWeekNumber, startOfWeekISO } from './time';
import { groupRatio, type Ratio, type TaskView } from './progress';

export interface TimelineRow {
  module: Module;
  /** Erster und letzter Lerntag (oder null, wenn noch nichts geplant ist) */
  phase: { from: ISODate; to: ISODate } | null;
  /** Alle Tage mit Lerneinträgen dieses Moduls */
  days: ISODate[];
  exams: { date: ISODate; exam: Exam }[];
  group: Ratio;
}

export interface TimelineWeek {
  start: ISODate;
  kw: number;
}

export interface Timeline {
  start: ISODate;
  /** Anzahl Tage im Bereich (Vielfaches von 7) */
  days: number;
  weeks: TimelineWeek[];
  rows: TimelineRow[];
  today: ISODate;
}

interface Input {
  modules: Module[];
  views: TaskView[];
  exams: Exam[];
  completions: Record<string, Completion>;
  memberIds: UUID[];
  today: ISODate;
  /** Gruppenfortschritt je Fach inkl. Hausaufgaben (Standard: nur Lernplan-Aufgaben) */
  groupOf?: (moduleId: UUID) => Ratio;
  /** Mindestanzahl Wochen, damit kurze Pläne nicht gestreckt wirken */
  minWeeks?: number;
  /** Höchstens so viele Wochen vor heute anzeigen */
  maxPastWeeks?: number;
}

export function buildTimeline({ modules, views, exams, completions, memberIds, today, groupOf, minWeeks = 6, maxPastWeeks = 2 }: Input): Timeline {
  const activeExams = exams.filter((e) => !e.deleted_at);
  const rows: TimelineRow[] = modules.map((module) => {
    const mv = views.filter((v) => v.module.id === module.id);
    const days = [...new Set(mv.map((v) => v.date))].sort();
    const ex = activeExams
      .filter((e) => e.module_id === module.id)
      .map((exam) => ({ date: instantToZoned(exam.starts_at, exam.timezone || 'Europe/Berlin').date, exam }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      module,
      phase: days.length ? { from: days[0], to: days[days.length - 1] } : null,
      days,
      exams: ex,
      group: groupOf ? groupOf(module.id) : groupRatio(mv, memberIds, completions),
    };
  });

  const allDates = rows.flatMap((r) => [...r.days, ...r.exams.map((e) => e.date)]);
  const earliest = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : today;
  const latest = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : today;

  // Bereich: wenige Wochen Vergangenheit, dann bis zum letzten Termin
  const pastLimit = startOfWeekISO(addDaysISO(today, -7 * maxPastWeeks));
  let start = startOfWeekISO(earliest < today ? earliest : today);
  if (start < pastLimit) start = pastLimit;
  const lastDay = latest > today ? latest : today;
  let weeksCount = Math.floor(diffDaysISO(start, startOfWeekISO(lastDay)) / 7) + 1;
  weeksCount = Math.max(weeksCount, minWeeks);
  const weeks: TimelineWeek[] = Array.from({ length: weeksCount }, (_, i) => {
    const ws = addDaysISO(start, i * 7);
    return { start: ws, kw: isoWeekNumber(ws) };
  });

  return { start, days: weeksCount * 7, weeks, rows, today };
}

/** Position eines Tages im Bereich (0…1, Tagesmitte); außerhalb → null */
export function dayPosition(t: Timeline, date: ISODate): number | null {
  const d = diffDaysISO(t.start, date);
  if (d < 0 || d >= t.days) return null;
  return (d + 0.5) / t.days;
}

/** Ausschnitt einer Lernphase im sichtbaren Bereich (links/Breite in 0…1) */
export function phaseSpan(t: Timeline, from: ISODate, to: ISODate): { left: number; width: number } | null {
  const a = Math.max(0, diffDaysISO(t.start, from));
  const b = Math.min(t.days - 1, diffDaysISO(t.start, to));
  if (b < 0 || a > t.days - 1 || b < a) return null;
  return { left: a / t.days, width: (b - a + 1) / t.days };
}
