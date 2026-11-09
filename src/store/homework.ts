import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { uuid } from '../lib/uuid';
import { describeError } from '../lib/errors';
import { hwKey, type Homework, type HomeworkCompletion, type HomeworkPart, type Priority } from '../lib/homework';
import type { ISODate, UUID } from '../lib/types';
import { getActiveMemberId } from './session';
import { toast } from './toast';

/**
 * Hausaufgaben (Migration 005) – eigener Store, getrennt vom Kern-Sync.
 * Fehlen die Tabellen, bleibt `available === false` und die Funktion ist
 * in der App ausgeblendet; alles andere läuft unverändert weiter.
 * Live-Sync über denselben Realtime-Kanal (siehe store/sync.ts).
 */

export const HOMEWORK_TABLES = ['homework', 'homework_parts', 'homework_completions'] as const;
type HwTable = (typeof HOMEWORK_TABLES)[number];

interface HomeworkState {
  /** null = noch nicht geprüft · false = Tabellen fehlen · true = aktiv */
  available: boolean | null;
  homework: Record<UUID, Homework>;
  parts: Record<UUID, HomeworkPart>;
  completions: Record<string, HomeworkCompletion>;
}

export const useHomework = create<HomeworkState>(() => ({ available: null, homework: {}, parts: {}, completions: {} }));

const sb = () => getSupabase();
const nowIso = () => new Date().toISOString();

export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(e?.message ?? '');
}

async function fetchAll<T>(table: HwTable, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from(table).select('*').order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

let loading: Promise<void> | null = null;

/** Lädt alle Hausaufgaben (tolerant, falls die Tabellen fehlen). */
export function loadHomework(): Promise<void> {
  if (!config.isConfigured) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const [hw, parts, comps] = await Promise.all([
        fetchAll<Homework>('homework', 'id'),
        fetchAll<HomeworkPart>('homework_parts', 'id'),
        fetchAll<HomeworkCompletion>('homework_completions', 'target_id'),
      ]);
      useHomework.setState({
        available: true,
        homework: Object.fromEntries(hw.map((r) => [r.id, r])),
        parts: Object.fromEntries(parts.map((r) => [r.id, r])),
        completions: Object.fromEntries(comps.map((r) => [hwKey(r.target_id, r.member_id), r])),
      });
    } catch (err) {
      if (isMissingTable(err)) useHomework.setState({ available: false });
      // Andere Fehler (offline): bisherigen Stand behalten
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Realtime-Ereignis aus dem gemeinsamen Kanal übernehmen (neuere Version gewinnt). */
export function applyHomeworkChange(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', row: Record<string, unknown>) {
  if (!(HOMEWORK_TABLES as readonly string[]).includes(table) || type === 'DELETE') return;
  useHomework.setState((s) => {
    if (table === 'homework') {
      const r = row as unknown as Homework;
      if (s.homework[r.id] && s.homework[r.id]!.version > r.version) return s;
      return { ...s, available: true, homework: { ...s.homework, [r.id]: r } };
    }
    if (table === 'homework_parts') {
      const r = row as unknown as HomeworkPart;
      if (s.parts[r.id] && s.parts[r.id]!.version > r.version) return s;
      return { ...s, parts: { ...s.parts, [r.id]: r } };
    }
    const r = row as unknown as HomeworkCompletion;
    const key = hwKey(r.target_id, r.member_id);
    if (s.completions[key] && s.completions[key]!.version > r.version) return s;
    return { ...s, completions: { ...s.completions, [key]: r } };
  });
}

// ---------------------------------------------------------------------
// Schreiben (optimistisch, bei Fehler zurück auf den alten Stand)
// ---------------------------------------------------------------------

export interface HomeworkDraft {
  module_id: UUID;
  title: string;
  description: string | null;
  due_date: ISODate;
  earliest_start: ISODate | null;
  priority: Priority;
  effort_minutes: number | null;
  unit_count: number | null;
  subtasks: { id?: UUID; title: string }[];
  /** Geplante Arbeitseinheiten (bereits bestätigte Vorschau) */
  units: { date: ISODate; title: string }[];
}

function fail(err: unknown, what: string) {
  toast.error(`${what}: ${describeError(err)}`);
}

function stamp<T extends object>(row: T): T & { version: number; created_at: string; updated_at: string; changed_by: UUID | null } {
  const t = nowIso();
  return { ...row, version: 0, created_at: t, updated_at: t, changed_by: getActiveMemberId() };
}

export async function createHomework(d: HomeworkDraft): Promise<UUID | null> {
  const id = uuid();
  const hwRow = {
    id,
    module_id: d.module_id,
    title: d.title.trim(),
    description: d.description?.trim() || null,
    due_date: d.due_date,
    earliest_start: d.earliest_start,
    priority: d.priority,
    effort_minutes: d.effort_minutes,
    unit_count: d.units.length || d.unit_count,
    deleted_at: null,
    changed_by: getActiveMemberId(),
  };
  const partRows = [
    ...d.subtasks.filter((s) => s.title.trim()).map((s, i) => ({ id: uuid(), homework_id: id, kind: 'subtask' as const, title: s.title.trim().slice(0, 200), planned_date: null, sort_order: i, deleted_at: null, changed_by: getActiveMemberId() })),
    ...d.units.map((u, i) => ({ id: uuid(), homework_id: id, kind: 'unit' as const, title: u.title, planned_date: u.date, sort_order: 1000 + i, deleted_at: null, changed_by: getActiveMemberId() })),
  ];
  const prev = useHomework.getState();
  useHomework.setState({
    homework: { ...prev.homework, [id]: stamp(hwRow) as Homework },
    parts: { ...prev.parts, ...Object.fromEntries(partRows.map((p) => [p.id, stamp(p) as HomeworkPart])) },
  });
  try {
    const { error } = await sb().from('homework').insert(hwRow);
    if (error) throw error;
    if (partRows.length) {
      const { error: e2 } = await sb().from('homework_parts').insert(partRows);
      if (e2) throw e2;
    }
    toast.success('Hausaufgabe angelegt');
    void loadHomework();
    return id;
  } catch (err) {
    useHomework.setState({ homework: prev.homework, parts: prev.parts });
    fail(err, 'Hausaufgabe konnte nicht gespeichert werden');
    return null;
  }
}

type HwPatch = Partial<Pick<Homework, 'module_id' | 'title' | 'description' | 'due_date' | 'earliest_start' | 'priority' | 'effort_minutes' | 'unit_count' | 'deleted_at'>>;

export async function updateHomework(id: UUID, patch: HwPatch): Promise<boolean> {
  const prev = useHomework.getState().homework[id];
  if (!prev) return false;
  useHomework.setState((s) => ({ homework: { ...s.homework, [id]: { ...prev, ...patch } } }));
  try {
    const { data, error } = await sb().from('homework').update({ ...patch, changed_by: getActiveMemberId() }).eq('id', id).select().single();
    if (error) throw error;
    useHomework.setState((s) => ({ homework: { ...s.homework, [id]: data as Homework } }));
    return true;
  } catch (err) {
    useHomework.setState((s) => ({ homework: { ...s.homework, [id]: prev } }));
    fail(err, 'Änderung nicht gespeichert');
    return false;
  }
}

/** Mehrere Teile auf einmal ändern bzw. anlegen (z. B. bestätigte Neuplanung). */
export async function saveParts(
  homeworkId: UUID,
  changes: { update?: { id: UUID; patch: Partial<Pick<HomeworkPart, 'title' | 'planned_date' | 'deleted_at' | 'sort_order'>> }[]; insert?: { kind: 'subtask' | 'unit'; title: string; planned_date: ISODate | null; sort_order: number }[] },
): Promise<boolean> {
  const before = useHomework.getState().parts;
  const next = { ...before };
  for (const u of changes.update ?? []) if (next[u.id]) next[u.id] = { ...next[u.id]!, ...u.patch };
  const inserts = (changes.insert ?? []).map((p) => ({ id: uuid(), homework_id: homeworkId, ...p, title: p.title.trim().slice(0, 200), deleted_at: null, changed_by: getActiveMemberId() }));
  for (const p of inserts) next[p.id] = stamp(p) as HomeworkPart;
  useHomework.setState({ parts: next });
  try {
    for (const u of changes.update ?? []) {
      const { error } = await sb().from('homework_parts').update({ ...u.patch, changed_by: getActiveMemberId() }).eq('id', u.id);
      if (error) throw error;
    }
    if (inserts.length) {
      const { error } = await sb().from('homework_parts').insert(inserts);
      if (error) throw error;
    }
    void loadHomework();
    return true;
  } catch (err) {
    useHomework.setState({ parts: before });
    fail(err, 'Änderung nicht gespeichert');
    return false;
  }
}

export async function setHomeworkDone(homeworkId: UUID, targetId: UUID, memberId: UUID, done: boolean): Promise<boolean> {
  const key = hwKey(targetId, memberId);
  const prev = useHomework.getState().completions[key];
  const optimistic = { ...(prev ?? stamp({ target_id: targetId, homework_id: homeworkId, member_id: memberId, completed_at: null })), is_completed: done, completed_at: done ? nowIso() : null } as HomeworkCompletion;
  useHomework.setState((s) => ({ completions: { ...s.completions, [key]: optimistic } }));
  try {
    const { data, error } = await sb()
      .from('homework_completions')
      .upsert({ target_id: targetId, homework_id: homeworkId, member_id: memberId, is_completed: done, changed_by: getActiveMemberId() }, { onConflict: 'target_id,member_id' })
      .select()
      .single();
    if (error) throw error;
    useHomework.setState((s) => ({ completions: { ...s.completions, [key]: data as HomeworkCompletion } }));
    return true;
  } catch (err) {
    useHomework.setState((s) => {
      const c = { ...s.completions };
      if (prev) c[key] = prev;
      else delete c[key];
      return { completions: c };
    });
    fail(err, 'Status nicht gespeichert');
    return false;
  }
}

export async function trashHomework(id: UUID) {
  const ok = await updateHomework(id, { deleted_at: nowIso() });
  if (ok) toast.success('Hausaufgabe in den Papierkorb verschoben', { label: 'Rückgängig', run: () => void updateHomework(id, { deleted_at: null }) });
  return ok;
}
