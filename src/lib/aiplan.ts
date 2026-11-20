/**
 * KI-Lernplan – reine Logik ohne Netzwerk (getestet in src/test/aiplan.test.ts).
 *
 * Ablauf:
 *  1. Fragebogen → `PlanInput` (Fächer, Themen, Zeitraum, Lernzeiten)
 *  2. `budgets()` verteilt die verfügbare Lernzeit auf die Fächer
 *  3. Die KI (Edge Function „app-ai-plan“) zerlegt die Themen in Lerneinheiten
 *     (Lernen, Üben, Wiederholen, Probeklausur) – ohne KI erledigt das
 *     `fallbackUnits()` nach festen Regeln
 *  4. `schedule()` legt die Einheiten exakt in die freien Tage bis zur Prüfung
 *     (feste Regeln: Kapazität je Tag, Prüfungsdatum, Wiederholung zum Schluss)
 */
import { addDaysISO, diffDaysISO } from './time';
import type { ISODate, UUID } from './types';

export type Status = 'schule' | 'abitur' | 'ausbildung' | 'studium';
export type Goal = 'bestehen' | 'gut' | 'sehr_gut';
export type DayPart = 'morgens' | 'nachmittags' | 'abends' | 'flexibel';
export type Difficulty = 'leicht' | 'mittel' | 'schwer';
export type UnitKind = 'learn' | 'practice' | 'review' | 'mock_exam';

export interface TopicInput {
  title: string;
  difficulty: Difficulty;
}
export interface SubjectInput {
  id: UUID;
  name: string;
  /** Prüfungstag (YYYY-MM-DD) – davor wird gelernt */
  examDate: ISODate;
  /** 1 = unsicher … 5 = sehr sicher */
  confidence: number;
  topics: TopicInput[];
}
export interface PlanInput {
  status: Status;
  goal: Goal;
  dayPart: DayPart;
  /** Wochentage, an denen gelernt wird (0 = Sonntag … 6 = Samstag) */
  weekdays: number[];
  minutesPerDay: number;
  sessionMinutes: number;
  start: ISODate;
  /** freie Tage (Urlaub, Arbeit …) */
  offDays: ISODate[];
  methods: string[];
  notes: string;
  subjects: SubjectInput[];
}
export interface Unit {
  title: string;
  topic: string;
  minutes: number;
  kind: UnitKind;
}
export interface SubjectUnits {
  subjectId: UUID;
  units: Unit[];
}
export interface PlannedItem extends Unit {
  subjectId: UUID;
}
export interface PlanDay {
  date: ISODate;
  items: PlannedItem[];
}
export interface Schedule {
  days: PlanDay[];
  /** Einheiten, die bis zur Prüfung keinen Platz mehr fanden */
  overflow: PlannedItem[];
  totalMinutes: number;
  /** Anzahl Lerntage (je Tag und Fach ein Eintrag im Lernplan) */
  entries: number;
}

export const KIND_LABEL: Record<UnitKind, string> = { learn: 'Lernen', practice: 'Üben', review: 'Wiederholen', mock_exam: 'Probeklausur' };

const weekdayOf = (d: ISODate) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Lerntage mit Kapazität von `start` bis zum Tag vor `until` */
export function studyDays(input: Pick<PlanInput, 'start' | 'weekdays' | 'offDays' | 'minutesPerDay'>, until: ISODate): { date: ISODate; capacity: number }[] {
  const out: { date: ISODate; capacity: number }[] = [];
  const off = new Set(input.offDays);
  for (let d = input.start; diffDaysISO(d, until) > 0; d = addDaysISO(d, 1)) {
    if (!input.weekdays.includes(weekdayOf(d)) || off.has(d)) continue;
    out.push({ date: d, capacity: input.minutesPerDay });
  }
  return out;
}

/**
 * Lernzeit je Fach (Minuten): Tage bis zur Prüfung, Schwierigkeit der
 * Themen und eigene Unsicherheit gewichten. Fächer teilen sich Tage, die
 * vor mehreren Prüfungen liegen.
 */
export function budgets(input: PlanInput): Record<UUID, number> {
  const weight: Record<UUID, number> = {};
  for (const s of input.subjects) {
    const diff = s.topics.reduce((a, t) => a + (t.difficulty === 'schwer' ? 1.5 : t.difficulty === 'leicht' ? 0.7 : 1), 0) || 1;
    const unsure = 1 + (5 - Math.min(5, Math.max(1, s.confidence))) * 0.15;
    const goal = input.goal === 'sehr_gut' ? 1.2 : input.goal === 'bestehen' ? 0.85 : 1;
    weight[s.id] = diff * unsure * goal;
  }
  const out: Record<UUID, number> = Object.fromEntries(input.subjects.map((s) => [s.id, 0]));
  const last = input.subjects.reduce<ISODate | null>((m, s) => (!m || s.examDate > m ? s.examDate : m), null);
  if (!last) return out;
  for (const day of studyDays(input, last)) {
    const open = input.subjects.filter((s) => diffDaysISO(day.date, s.examDate) > 0);
    const sum = open.reduce((a, s) => a + weight[s.id], 0);
    for (const s of open) out[s.id] += (day.capacity * weight[s.id]) / sum;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

/** Ohne KI: Einheiten nach festen Regeln (je Thema Lernen + Üben, am Ende Wiederholen + Probeklausur) */
export function fallbackUnits(input: PlanInput, budget: Record<UUID, number>): SubjectUnits[] {
  const len = input.sessionMinutes;
  return input.subjects.map((s) => {
    const topics = s.topics.length ? s.topics : [{ title: s.name, difficulty: 'mittel' as Difficulty }];
    const units: Unit[] = [];
    for (const t of topics) {
      units.push({ title: `${t.title}: Grundlagen erarbeiten`, topic: t.title, minutes: len, kind: 'learn' });
      if (t.difficulty === 'schwer') units.push({ title: `${t.title}: vertiefen`, topic: t.title, minutes: len, kind: 'learn' });
      units.push({ title: `${t.title}: Aufgaben üben`, topic: t.title, minutes: len, kind: 'practice' });
    }
    for (const t of topics) units.push({ title: `${t.title}: wiederholen`, topic: t.title, minutes: Math.max(20, Math.round(len * 0.6)), kind: 'review' });
    units.push({ title: `Probeklausur ${s.name}`, topic: s.name, minutes: Math.max(len, 60), kind: 'mock_exam' });
    // Mehr Zeit als nötig: zusätzliche Übungsrunden für schwere/unsichere Themen
    let used = units.reduce((a, u) => a + u.minutes, 0);
    const hard = topics.filter((t) => t.difficulty !== 'leicht');
    for (let i = 0; used + len <= (budget[s.id] ?? 0) * 0.9 && hard.length && i < 12; i++) {
      const t = hard[i % hard.length];
      units.splice(units.findIndex((u) => u.kind === 'review'), 0, { title: `${t.title}: weitere Übungsaufgaben`, topic: t.title, minutes: len, kind: 'practice' });
      used += len;
    }
    return { subjectId: s.id, units };
  });
}

/**
 * Verteilt die Einheiten auf die Lerntage.
 *  – nie am oder nach dem Prüfungstag
 *  – Wiederholen/Probeklausur erst im letzten Viertel bis zur Prüfung
 *  – am Tag höchstens `maxSubjectsPerDay` Fächer (Fokus statt Zersplitterung)
 *  – Dringlichkeit = verbleibende Minuten / verbleibende Kapazität bis zur Prüfung
 *  – höchstens `maxEntries` Lerntage (Grenze der App: 100 aktive Lerntage je Gruppe)
 */
export function schedule(input: PlanInput, perSubject: SubjectUnits[], opts: { maxSubjectsPerDay?: number; maxEntries?: number } = {}): Schedule {
  const maxSubjects = opts.maxSubjectsPerDay ?? 2;
  const maxEntries = opts.maxEntries ?? 100;
  const exam = new Map(input.subjects.map((s) => [s.id, s.examDate]));
  const queues = new Map(perSubject.filter((p) => exam.has(p.subjectId)).map((p) => [p.subjectId, p.units.map((u) => ({ ...u, subjectId: p.subjectId }))]));
  const last = input.subjects.reduce<ISODate | null>((m, s) => (!m || s.examDate > m ? s.examDate : m), null);
  const days = last ? studyDays(input, last) : [];
  // Beginn der Wiederholungsphase je Fach: letztes Viertel der Lerntage vor der Prüfung (mind. 1 Tag)
  const reviewFrom = new Map<UUID, ISODate>();
  for (const s of input.subjects) {
    const own = days.filter((d) => diffDaysISO(d.date, s.examDate) > 0);
    const k = Math.max(1, Math.round(own.length * 0.25));
    reviewFrom.set(s.id, own[Math.max(0, own.length - k)]?.date ?? s.examDate);
  }
  const capacityUntil = (id: UUID, fromIdx: number) => {
    const e = exam.get(id)!;
    let c = 0;
    for (let i = fromIdx; i < days.length && diffDaysISO(days[i].date, e) > 0; i++) c += days[i].capacity;
    return c;
  };
  const out: PlanDay[] = [];
  let entries = 0;
  days.forEach((day, idx) => {
    let left = day.capacity;
    const items: PlannedItem[] = [];
    const subjectsToday = new Set<UUID>();
    for (let guard = 0; left >= 15 && guard < 40; guard++) {
      const candidates = [...queues.entries()]
        .filter(([id, q]) => q.length > 0 && diffDaysISO(day.date, exam.get(id)!) > 0)
        .filter(([id]) => subjectsToday.has(id) || subjectsToday.size < maxSubjects)
        .filter(([id]) => subjectsToday.has(id) || entries < maxEntries)
        .map(([id, q]) => {
          const inReview = day.date >= (reviewFrom.get(id) ?? day.date);
          // Vor der Wiederholungsphase nur Lernen/Üben (solange es davon noch etwas gibt)
          const nextIdx = inReview ? 0 : q.findIndex((u) => u.kind === 'learn' || u.kind === 'practice');
          const remaining = q.reduce((a, u) => a + u.minutes, 0);
          const urgency = remaining / Math.max(1, capacityUntil(id, idx));
          return { id, q, nextIdx, urgency };
        })
        .filter((c) => c.nextIdx >= 0 && c.q[c.nextIdx].minutes <= left + 10)
        .sort((a, b) => b.urgency - a.urgency || (exam.get(a.id)! < exam.get(b.id)! ? -1 : 1));
      const pick = candidates[0];
      if (!pick) break;
      const [unit] = pick.q.splice(pick.nextIdx, 1);
      if (!subjectsToday.has(pick.id)) entries++;
      subjectsToday.add(pick.id);
      items.push(unit);
      left -= unit.minutes;
    }
    if (items.length) out.push({ date: day.date, items });
  });
  const overflow = [...queues.values()].flat();
  return { days: out, overflow, totalMinutes: out.reduce((a, d) => a + d.items.reduce((b, i) => b + i.minutes, 0), 0), entries };
}

/** Prüft und bereinigt die Antwort der KI (fremde Fächer, unsinnige Dauern …) */
export function sanitizeUnits(raw: unknown, input: PlanInput): SubjectUnits[] | null {
  const subjects = (raw as { subjects?: unknown })?.subjects;
  if (!Array.isArray(subjects)) return null;
  const ids = new Set(input.subjects.map((s) => s.id));
  const kinds: UnitKind[] = ['learn', 'practice', 'review', 'mock_exam'];
  const out: SubjectUnits[] = [];
  for (const s of subjects as { subject_id?: unknown; units?: unknown }[]) {
    if (typeof s?.subject_id !== 'string' || !ids.has(s.subject_id) || !Array.isArray(s.units)) continue;
    const units: Unit[] = [];
    for (const u of s.units as Record<string, unknown>[]) {
      const title = typeof u?.title === 'string' ? u.title.trim().slice(0, 180) : '';
      const kind = kinds.includes(u?.kind as UnitKind) ? (u.kind as UnitKind) : null;
      const minutes = Math.round(Number(u?.minutes));
      if (!title || !kind || !Number.isFinite(minutes)) continue;
      units.push({ title, topic: typeof u.topic === 'string' ? u.topic.trim().slice(0, 120) : '', minutes: Math.min(180, Math.max(15, minutes)), kind });
      if (units.length >= 80) break;
    }
    if (units.length) out.push({ subjectId: s.subject_id, units });
  }
  return out.length ? out : null;
}
