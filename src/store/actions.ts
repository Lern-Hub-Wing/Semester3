/**
 * Alle Schreiboperationen der App. Jede Funktion
 *   – zeigt die Änderung sofort an (optimistisch),
 *   – speichert sie in Supabase,
 *   – springt bei Fehlern automatisch auf den gespeicherten Stand zurück
 *     und meldet den Fehler verständlich.
 * Rückgabewert: true = gespeichert, false = nicht gespeichert.
 */
import { getSupabase } from '../lib/supabase';
import { ConflictError, describeError } from '../lib/errors';
import { uuid } from '../lib/uuid';
import { completionKey } from '../lib/types';
import type {
  Attachment, AttachmentTarget, Completion, Exam, ISODate, Member, Module, RowByTable,
  SettingKey, StudyEntry, TableName, Task, Topic, UUID,
} from '../lib/types';
import { buildStoragePath, checkFile, sniffMatches } from '../lib/files';
import { config } from '../lib/config';
import { useData } from './data';
import { write, type WriteResult } from './engine';
import { getActiveMemberId } from './session';
import { toast } from './toast';

const sb = () => getSupabase();
const nowIso = () => new Date().toISOString();
const actor = () => getActiveMemberId();

type IdTable = Exclude<TableName, 'task_completions' | 'app_settings'>;
type Patch<T extends IdTable> = Partial<Omit<RowByTable[T], 'id' | 'version' | 'created_at' | 'updated_at'>>;

function report<T extends TableName>(res: WriteResult<T>, success?: string): boolean {
  if (res.ok) {
    if (success) toast.success(success);
    return true;
  }
  toast.error(res.conflict ? `${res.error} Der neueste Stand wurde geladen – bitte erneut prüfen.` : res.error);
  return false;
}

async function fetchById<T extends IdTable>(table: T, id: UUID): Promise<RowByTable[T] | null> {
  const { data, error } = await sb().from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as RowByTable[T] | null;
}

/** Legt eine Zeile an (Client-UUID → sofort referenzierbar). */
async function createRow<T extends IdTable>(table: T, payload: Record<string, unknown> & { id: UUID }, optimistic: RowByTable[T]) {
  return write({
    table,
    key: payload.id,
    optimistic,
    run: async () => {
      const { data, error } = await sb().from(table).insert({ ...payload, changed_by: actor() }).select().single();
      if (error) throw error;
      return data as RowByTable[T];
    },
  });
}

/**
 * Aktualisiert eine Zeile. Mit `baseVersion` wird optimistisches Sperren
 * verwendet: Hat jemand anderes die Zeile seit dem Öffnen des Formulars
 * geändert, wird nichts überschrieben, sondern ein Konflikt gemeldet.
 */
async function updateRow<T extends IdTable>(table: T, id: UUID, patch: Patch<T>, baseVersion?: number) {
  const current = useData.getState()[table][id] as RowByTable[T] | undefined;
  return write({
    table,
    key: id,
    optimistic: current ? ({ ...current, ...patch } as RowByTable[T]) : undefined,
    run: async () => {
      let q = sb().from(table).update({ ...patch, changed_by: actor() }).eq('id', id);
      if (baseVersion !== undefined) q = q.eq('version', baseVersion);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw error;
      if (!data) throw new ConflictError();
      return data as RowByTable[T];
    },
    refetch: () => fetchById(table, id),
  });
}

function base(id: UUID) {
  const t = nowIso();
  return { id, version: 0, created_at: t, updated_at: t, changed_by: actor() };
}

function nextSort(rows: { sort_order: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
}

// ---------------------------------------------------------------------
// Personen
// ---------------------------------------------------------------------

export async function createMember(name: string, color: string): Promise<UUID | null> {
  const id = uuid();
  const sort_order = nextSort(Object.values(useData.getState().members));
  const payload = { id, name: name.trim(), color, sort_order, is_active: true };
  const res = await createRow('members', payload, { ...base(id), ...payload } as Member);
  return report(res, `${payload.name} wurde hinzugefügt`) ? id : null;
}

export async function updateMember(id: UUID, patch: Patch<'members'>, baseVersion?: number) {
  return report(await updateRow('members', id, patch, baseVersion));
}

export async function setMemberActive(id: UUID, active: boolean) {
  const name = useData.getState().members[id]?.name ?? 'Person';
  return report(
    await updateRow('members', id, { is_active: active }),
    active ? `${name} ist wieder aktiv` : `${name} wurde deaktiviert – die Daten bleiben erhalten`,
  );
}

// ---------------------------------------------------------------------
// Module & Themen
// ---------------------------------------------------------------------

export async function createModule(input: { name: string; color: string; description?: string | null }): Promise<UUID | null> {
  const id = uuid();
  const sort_order = nextSort(Object.values(useData.getState().modules));
  const payload = { id, name: input.name.trim(), color: input.color, description: input.description?.trim() || null, sort_order, archived_at: null };
  const res = await createRow('modules', payload, { ...base(id), ...payload } as Module);
  return report(res, 'Modul erstellt') ? id : null;
}

export async function updateModule(id: UUID, patch: Patch<'modules'>, baseVersion?: number) {
  return report(await updateRow('modules', id, patch, baseVersion), 'Gespeichert');
}

export async function archiveModule(id: UUID) {
  const ok = report(await updateRow('modules', id, { archived_at: nowIso() }));
  if (ok) toast.success('Modul archiviert', { label: 'Rückgängig', run: () => void restoreModule(id) });
  return ok;
}

export async function restoreModule(id: UUID) {
  return report(await updateRow('modules', id, { archived_at: null }), 'Modul wiederhergestellt');
}

/** Speichert eine neue Reihenfolge (nur geänderte Zeilen werden geschrieben). */
async function reorder<T extends 'modules' | 'module_topics' | 'tasks' | 'members'>(table: T, orderedIds: UUID[]) {
  const rows = useData.getState()[table] as Record<string, { sort_order: number }>;
  const jobs = orderedIds
    .map((id, index) => ({ id, sort_order: index + 1 }))
    .filter(({ id, sort_order }) => rows[id] && rows[id].sort_order !== sort_order)
    .map(({ id, sort_order }) => updateRow(table, id, { sort_order } as Patch<T>));
  const results = await Promise.all(jobs);
  const failed = results.find((r) => !r.ok);
  return failed ? report(failed) : true;
}

export const reorderModules = (ids: UUID[]) => reorder('modules', ids);
export const reorderMembers = (ids: UUID[]) => reorder('members', ids);
export const reorderTopics = (ids: UUID[]) => reorder('module_topics', ids);
export const reorderTasks = (ids: UUID[]) => reorder('tasks', ids);

export async function createTopic(moduleId: UUID, title: string): Promise<UUID | null> {
  const id = uuid();
  const siblings = Object.values(useData.getState().module_topics).filter((t) => t.module_id === moduleId);
  const payload = { id, module_id: moduleId, title: title.trim(), description: null, sort_order: nextSort(siblings), archived_at: null };
  const res = await createRow('module_topics', payload, { ...base(id), ...payload } as Topic);
  return report(res, 'Thema angelegt') ? id : null;
}

export async function updateTopic(id: UUID, patch: Patch<'module_topics'>, baseVersion?: number) {
  return report(await updateRow('module_topics', id, patch, baseVersion));
}

export async function archiveTopic(id: UUID) {
  const ok = report(await updateRow('module_topics', id, { archived_at: nowIso() }));
  if (ok) toast.success('Thema archiviert', { label: 'Rückgängig', run: () => void restoreTopic(id) });
  return ok;
}

export async function restoreTopic(id: UUID) {
  return report(await updateRow('module_topics', id, { archived_at: null }), 'Thema wiederhergestellt');
}

// ---------------------------------------------------------------------
// Prüfungen
// ---------------------------------------------------------------------

export interface ExamInput {
  module_id: UUID;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
}

export async function createExam(input: ExamInput): Promise<UUID | null> {
  const id = uuid();
  const payload = { id, ...input, timezone: 'Europe/Berlin', deleted_at: null };
  const res = await createRow('exams', payload, { ...base(id), ...payload } as Exam);
  return report(res, 'Prüfung gespeichert') ? id : null;
}

export async function updateExam(id: UUID, patch: Patch<'exams'>, baseVersion?: number) {
  return report(await updateRow('exams', id, patch, baseVersion), 'Prüfung gespeichert');
}

export async function deleteExam(id: UUID) {
  const ok = report(await updateRow('exams', id, { deleted_at: nowIso() }));
  if (ok) toast.success('Prüfung in den Papierkorb verschoben', { label: 'Rückgängig', run: () => void restoreExam(id) });
  return ok;
}

export async function restoreExam(id: UUID) {
  return report(await updateRow('exams', id, { deleted_at: null }), 'Prüfung wiederhergestellt');
}

// ---------------------------------------------------------------------
// Lerntage & Aufgaben
// ---------------------------------------------------------------------

export interface TaskDraft {
  /** vorhandene Aufgabe (stabile ID) oder undefined für neu */
  id?: UUID;
  title: string;
}

export interface EntryDraft {
  module_id: UUID;
  topic_id: UUID | null;
  study_date: ISODate;
  title: string;
  description: string | null;
  tasks: TaskDraft[];
  /**
   * Aufgaben, die im Editor ausdrücklich entfernt wurden. Nur diese wandern
   * in den Papierkorb – Aufgaben, die der Editor nicht kennt (z. B. weil sie
   * gerade von einem anderen Gerät angelegt wurden oder beim Öffnen noch
   * nicht geladen waren), bleiben unangetastet.
   */
  removedTaskIds?: UUID[];
}

async function insertTasks(entryId: UUID, titles: { id: UUID; title: string; sort_order: number }[]) {
  const results = await Promise.all(
    titles.map((t) => {
      const payload = { id: t.id, study_entry_id: entryId, title: t.title.trim(), description: null, sort_order: t.sort_order, deleted_at: null };
      return createRow('tasks', payload, { ...base(t.id), ...payload } as Task);
    }),
  );
  return results.every((r) => r.ok) ? true : report(results.find((r) => !r.ok)!);
}

/** Legt einen Lerntag inkl. Unteraufgaben an. Gibt die ID zurück. */
export async function createEntry(draft: EntryDraft): Promise<UUID | null> {
  const id = uuid();
  const siblings = Object.values(useData.getState().study_entries).filter((e) => e.study_date === draft.study_date && !e.deleted_at);
  const payload = {
    id,
    module_id: draft.module_id,
    topic_id: draft.topic_id,
    study_date: draft.study_date,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    sort_order: nextSort(siblings),
    deleted_at: null,
  };
  const res = await createRow('study_entries', payload, { ...base(id), ...payload } as StudyEntry);
  if (!report(res)) return null;
  const tasks = draft.tasks
    .filter((t) => t.title.trim())
    .map((t, i) => ({ id: uuid(), title: t.title, sort_order: i + 1 }));
  if (tasks.length && !(await insertTasks(id, tasks))) {
    toast.error('Der Lerntag wurde gespeichert, aber nicht alle Aufgaben. Bitte prüfen.');
    return id;
  }
  toast.success(tasks.length ? `Lerntag mit ${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} erstellt` : 'Lerntag erstellt');
  return id;
}

/**
 * Speichert Änderungen an einem bestehenden Lerntag. Aufgaben behalten
 * ihre IDs – Titeländerungen, Umsortieren und Verschieben erhalten daher
 * alle Haken. In den Papierkorb wandern ausschließlich Aufgaben aus
 * `draft.removedTaskIds`; alle anderen bleiben bestehen.
 */
export async function saveEntry(id: UUID, draft: EntryDraft, baseVersion: number): Promise<boolean> {
  const state = useData.getState();
  const entry = state.study_entries[id];
  if (!entry) return false;

  const patch: Patch<'study_entries'> = {};
  if (entry.module_id !== draft.module_id) patch.module_id = draft.module_id;
  if (entry.topic_id !== draft.topic_id) patch.topic_id = draft.topic_id;
  if (entry.study_date !== draft.study_date) patch.study_date = draft.study_date;
  if (entry.title !== draft.title.trim()) patch.title = draft.title.trim();
  const desc = draft.description?.trim() || null;
  if (entry.description !== desc) patch.description = desc;

  if (Object.keys(patch).length) {
    const res = await updateRow('study_entries', id, patch, baseVersion);
    if (!report(res)) return false;
  }

  const plan = planTaskChanges(id, draft, state.tasks);
  const jobs: Promise<WriteResult<'tasks'>>[] = [
    ...plan.updates.map((u) => updateRow('tasks', u.id, u.patch)),
    ...plan.removals.map((taskId) => updateRow('tasks', taskId, { deleted_at: nowIso() })),
  ];

  const results = await Promise.all(jobs);
  const failed = results.find((r) => !r.ok);
  if (failed) return report(failed);
  if (plan.inserts.length && !(await insertTasks(id, plan.inserts))) return false;
  toast.success('Lerntag gespeichert');
  return true;
}

export interface TaskChangePlan {
  updates: { id: UUID; patch: Patch<'tasks'> }[];
  inserts: { id: UUID; title: string; sort_order: number }[];
  removals: UUID[];
}

/**
 * Berechnet die nötigen Aufgabenänderungen für einen Lerntag (reine Funktion,
 * getestet in src/test/saveEntry.test.ts).
 */
export function planTaskChanges(entryId: UUID, draft: Pick<EntryDraft, 'tasks' | 'removedTaskIds'>, tasks: Record<string, Task>, newId: () => UUID = uuid): TaskChangePlan {
  const plan: TaskChangePlan = { updates: [], inserts: [], removals: [] };
  const belongs = (taskId: UUID) => {
    const t = tasks[taskId];
    return !!t && t.study_entry_id === entryId;
  };
  let position = 0;
  draft.tasks.forEach((t) => {
    const title = t.title.trim();
    if (t.id) {
      // Unbekannte oder inzwischen verschobene Aufgaben nicht anfassen.
      if (!belongs(t.id)) return;
      const sort_order = ++position;
      const cur = tasks[t.id];
      const p: Patch<'tasks'> = {};
      // Ein geleerter Titel löscht nichts – der bisherige Titel bleibt.
      if (title && cur.title !== title) p.title = title;
      if (cur.sort_order !== sort_order) p.sort_order = sort_order;
      if (Object.keys(p).length) plan.updates.push({ id: t.id, patch: p });
    } else if (title) {
      plan.inserts.push({ id: newId(), title, sort_order: ++position });
    }
  });
  const kept = new Set(draft.tasks.map((t) => t.id).filter(Boolean));
  for (const taskId of new Set(draft.removedTaskIds ?? [])) {
    if (belongs(taskId) && !kept.has(taskId) && !tasks[taskId].deleted_at) plan.removals.push(taskId);
  }
  return plan;
}

export async function moveEntry(id: UUID, date: ISODate) {
  return report(await updateRow('study_entries', id, { study_date: date }), 'Lerntag verschoben – alle Haken bleiben erhalten');
}

export async function deleteEntry(id: UUID) {
  const ok = report(await updateRow('study_entries', id, { deleted_at: nowIso() }));
  if (ok) toast.success('Lerntag in den Papierkorb verschoben', { label: 'Rückgängig', run: () => void restoreEntry(id) });
  return ok;
}

export async function restoreEntry(id: UUID) {
  return report(await updateRow('study_entries', id, { deleted_at: null }), 'Lerntag wiederhergestellt');
}

export async function addTask(entryId: UUID, title: string): Promise<UUID | null> {
  const id = uuid();
  const siblings = Object.values(useData.getState().tasks).filter((t) => t.study_entry_id === entryId);
  const ok = await insertTasks(entryId, [{ id, title, sort_order: nextSort(siblings) }]);
  if (ok) toast.success('Aufgabe erstellt');
  return ok ? id : null;
}

export async function updateTask(id: UUID, patch: Patch<'tasks'>, baseVersion?: number) {
  return report(await updateRow('tasks', id, patch, baseVersion));
}

/** Verschiebt eine Aufgabe in einen anderen Lerntag – die ID und alle Haken bleiben. */
export async function moveTask(id: UUID, targetEntryId: UUID) {
  const siblings = Object.values(useData.getState().tasks).filter((t) => t.study_entry_id === targetEntryId);
  return report(
    await updateRow('tasks', id, { study_entry_id: targetEntryId, sort_order: nextSort(siblings) }),
    'Aufgabe verschoben – alle Haken bleiben erhalten',
  );
}

export async function deleteTask(id: UUID) {
  const ok = report(await updateRow('tasks', id, { deleted_at: nowIso() }));
  if (ok) toast.success('Aufgabe in den Papierkorb verschoben', { label: 'Rückgängig', run: () => void restoreTask(id) });
  return ok;
}

export async function restoreTask(id: UUID) {
  return report(await updateRow('tasks', id, { deleted_at: null }), 'Aufgabe wiederhergestellt – Haken sind erhalten');
}

// ---------------------------------------------------------------------
// Erledigungsstatus
// ---------------------------------------------------------------------

/** Setzt den Haken genau einer Person. Andere Personen bleiben unberührt. */
export async function setCompletion(taskId: UUID, memberId: UUID, isCompleted: boolean): Promise<boolean> {
  const key = completionKey(taskId, memberId);
  const current = useData.getState().task_completions[key];
  const t = nowIso();
  const optimistic: Completion = current
    ? { ...current, is_completed: isCompleted, completed_at: isCompleted ? current.completed_at ?? t : null }
    : { task_id: taskId, member_id: memberId, is_completed: isCompleted, completed_at: isCompleted ? t : null, version: 0, created_at: t, updated_at: t, changed_by: actor() };
  const res = await write({
    table: 'task_completions',
    key,
    optimistic,
    run: async () => {
      const { data, error } = await sb()
        .from('task_completions')
        .upsert({ task_id: taskId, member_id: memberId, is_completed: isCompleted, changed_by: actor() }, { onConflict: 'task_id,member_id' })
        .select()
        .single();
      if (error) throw error;
      return data as Completion;
    },
  });
  return report(res);
}

// ---------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------

export interface UploadTarget {
  module_id: UUID | null;
  target_type: AttachmentTarget;
  target_id: UUID;
}

export async function uploadFile(file: File, target: UploadTarget): Promise<boolean> {
  const check = checkFile(file);
  if (!check.ok) {
    toast.error(check.reason);
    return false;
  }
  if (!(await sniffMatches(file, check.mime))) {
    toast.error(`„${file.name}“ ist keine gültige ${check.mime === 'application/pdf' ? 'PDF' : 'Bild'}-Datei.`);
    return false;
  }
  if (navigator.onLine === false) {
    toast.error('Keine Internetverbindung – die Datei wurde nicht hochgeladen.');
    return false;
  }
  const id = uuid();
  const path = buildStoragePath(target.module_id, id, file.name);
  const { error: upErr } = await sb().storage.from(config.storageBucket).upload(path, file, {
    contentType: check.mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (upErr) {
    toast.error(describeError(upErr));
    return false;
  }
  const payload = {
    id,
    ...target,
    storage_path: path,
    original_filename: file.name.slice(0, 255),
    mime_type: check.mime,
    file_size: file.size,
    deleted_at: null,
  };
  const t = nowIso();
  const res = await createRow('attachments', payload, { ...payload, version: 0, uploaded_at: t, updated_at: t, changed_by: actor() } as Attachment);
  return report(res, `„${file.name}“ hochgeladen`);
}

export async function deleteAttachment(id: UUID) {
  const ok = report(await updateRow('attachments', id, { deleted_at: nowIso() }));
  if (ok) toast.success('Datei in den Papierkorb verschoben', { label: 'Rückgängig', run: () => void restoreAttachment(id) });
  return ok;
}

export async function restoreAttachment(id: UUID) {
  return report(await updateRow('attachments', id, { deleted_at: null }), 'Datei wiederhergestellt');
}

// ---------------------------------------------------------------------
// Gemeinsame Einstellungen
// ---------------------------------------------------------------------

export async function setSetting(key: SettingKey, value: unknown) {
  const current = useData.getState().app_settings[key];
  const t = nowIso();
  const res = await write({
    table: 'app_settings',
    key,
    optimistic: current ? { ...current, value } : { key, value, version: 0, updated_at: t, changed_by: actor() },
    run: async () => {
      const { data, error } = await sb().from('app_settings').upsert({ key, value, changed_by: actor() }, { onConflict: 'key' }).select().single();
      if (error) throw error;
      return data as RowByTable['app_settings'];
    },
  });
  return report(res, 'Gespeichert');
}
