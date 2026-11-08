/**
 * Vorschau der nächsten Erinnerung – mit GENAU der Logik, die auch der
 * Server-Scheduler nutzt (planNotifications). Dafür wird die Zeit in
 * 15-Minuten-Schritten vorgespult, bis die erste Nachricht fällig wäre.
 */
import { planNotifications, type Snapshot } from '../../supabase/functions/_shared/reminders.ts';
import type { PushPrefs } from '../../supabase/functions/_shared/prefs.ts';
import type { Completion, Exam, Member, Module, StudyEntry, Task } from './types';

export interface ReminderPreview {
  at: Date;
  title: string;
  body: string;
  url: string;
}

interface Input {
  members: Record<string, Member>;
  modules: Record<string, Module>;
  exams: Record<string, Exam>;
  entries: Record<string, StudyEntry>;
  tasks: Record<string, Task>;
  completions: Record<string, Completion>;
  memberId: string;
  prefs: PushPrefs;
  now: number;
  /** Wie weit in die Zukunft gesucht wird (Stunden) */
  horizonHours?: number;
}

export function nextReminder({ members, modules, exams, entries, tasks, completions, memberId, prefs, now, horizonHours = 48 }: Input): ReminderPreview | null {
  const base: Omit<Snapshot, 'now'> = {
    members: Object.values(members).map((m) => ({ id: m.id, name: m.name, is_active: m.is_active })),
    modules: Object.values(modules).map((m) => ({ id: m.id, name: m.name, archived_at: m.archived_at })),
    exams: Object.values(exams).map((e) => ({ id: e.id, module_id: e.module_id, starts_at: e.starts_at, ends_at: e.ends_at, deleted_at: e.deleted_at })),
    entries: Object.values(entries).map((e) => ({ id: e.id, module_id: e.module_id, study_date: e.study_date, deleted_at: e.deleted_at })),
    tasks: Object.values(tasks).map((t) => ({ id: t.id, study_entry_id: t.study_entry_id, deleted_at: t.deleted_at })),
    completions: Object.values(completions).map((c) => ({ task_id: c.task_id, member_id: c.member_id, is_completed: c.is_completed })),
    activity: [],
    state: {},
  };
  // Nur Erinnerungen, die vom Zeitpunkt abhängen (keine Erfolge/Änderungen)
  const p: PushPrefs = { ...prefs, planChanges: false, groupSuccess: false, personalSuccess: false };
  const sent = new Set<string>();
  const device = () => [{ id: 'vorschau', member_id: memberId, prefs: p, plan_cursor: 0, sent, lastOverdue: null }];
  // Was jetzt schon fällig ist, hat der Server bereits verschickt (bzw. verschickt es gerade) → nicht als „nächste“ zeigen
  planNotifications({ ...base, now: new Date(now) }, device());
  const step = 15 * 60 * 1000;
  const start = Math.floor(now / step) * step + step;
  for (let t = start; t <= now + horizonHours * 3600_000; t += step) {
    const res = planNotifications({ ...base, now: new Date(t) }, device());
    const n = res.notifications[0];
    if (n) return { at: new Date(t), title: n.title, body: n.body, url: n.url };
  }
  return null;
}
