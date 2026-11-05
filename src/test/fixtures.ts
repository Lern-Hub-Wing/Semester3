import type { Completion, Exam, Member, Module, StudyEntry, Task, Topic } from '../lib/types';

const t0 = '2026-11-01T10:00:00.000Z';
const v = { version: 1, created_at: t0, updated_at: t0, changed_by: null };

export const member = (id: string, extra: Partial<Member> = {}): Member => ({ id, name: id, color: '#AFC5F5', sort_order: 0, is_active: true, ...v, ...extra });
export const mod = (id: string, extra: Partial<Module> = {}): Module => ({ id, name: id, color: '#B4D3F2', description: null, sort_order: 0, archived_at: null, ...v, ...extra });
export const topic = (id: string, module_id: string): Topic => ({ id, module_id, title: id, description: null, sort_order: 0, archived_at: null, ...v });
export const entry = (id: string, module_id: string, study_date: string, extra: Partial<StudyEntry> = {}): StudyEntry => ({
  id, module_id, topic_id: null, study_date, title: id, description: null, sort_order: 0, deleted_at: null, ...v, ...extra,
});
export const task = (id: string, study_entry_id: string, extra: Partial<Task> = {}): Task => ({
  id, study_entry_id, title: id, description: null, sort_order: 0, deleted_at: null, ...v, ...extra,
});
export const done = (task_id: string, member_id: string, is_completed = true, version = 1): Completion => ({
  task_id, member_id, is_completed, completed_at: is_completed ? t0 : null, ...v, version,
});
export const exam = (id: string, starts: string, ends: string, extra: Partial<Exam> = {}): Exam => ({
  id, module_id: 'm', starts_at: starts, ends_at: ends, timezone: 'Europe/Berlin', location: null, notes: null, deleted_at: null, ...v, ...extra,
});

export function byId<T extends { id: string }>(...rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}
export function completions(...rows: Completion[]): Record<string, Completion> {
  return Object.fromEntries(rows.map((r) => [`${r.task_id}:${r.member_id}`, r]));
}
