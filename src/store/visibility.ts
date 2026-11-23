/**
 * Wer schreibt welche Prüfung? (nur bisherige Seite)
 *
 * Ein Fach mit `participants` (Mitglieds-IDs) ist nur für diese Personen
 * sichtbar – samt Prüfungen, Lerntagen, Aufgaben, Haken, Hausaufgaben,
 * Anhängen und Einträgen im Verlauf. Gefiltert wird zentral dort, wo Daten
 * in den Speicher kommen (Laden, Live-Änderungen); eingeschränkte Fächer
 * landen nie im Gerätespeicher (Cache), damit beim nächsten Start niemand
 * sie kurz sieht.
 *
 * Die Seite hat keine Anmeldung: Das ist eine Anzeige-Regel, kein Zugriffsschutz.
 */
import { IS_APP } from '../lib/edition';
import type { RowByTable, TableName, UUID } from '../lib/types';
import { getActiveMemberId } from './session';

type AnyRow = Record<string, unknown>;

/** eingeschränkt = hat Teilnehmende; versteckt = eingeschränkt und die aktive Person gehört nicht dazu */
const restricted = { modules: new Set<string>(), exams: new Set<string>(), entries: new Set<string>(), tasks: new Set<string>(), homework: new Set<string>() };
const hidden = { modules: new Set<string>(), exams: new Set<string>(), entries: new Set<string>(), tasks: new Set<string>(), homework: new Set<string>() };

export const participantsEnabled = !IS_APP;

/** Sieht diese Person das Fach? (null = keine Person gewählt → nur offene Fächer) */
export function canSee(participants: unknown, memberId: string | null = getActiveMemberId()): boolean {
  if (!participantsEnabled) return true;
  if (!Array.isArray(participants) || participants.length === 0) return true;
  return !!memberId && participants.includes(memberId);
}

function noteModule(row: AnyRow) {
  const id = String(row.id);
  const p = row.participants;
  const isRestricted = Array.isArray(p) && p.length > 0;
  set(restricted.modules, id, isRestricted);
  set(hidden.modules, id, isRestricted && !canSee(p));
}
function set(s: Set<string>, id: string, on: boolean) {
  if (on) s.add(id);
  else s.delete(id);
}

/** Merkt sich bei jeder Zeile, ob sie zu einem eingeschränkten/versteckten Fach gehört. Gibt true zurück, wenn sie sichtbar ist. */
function classify(table: string, row: AnyRow): boolean {
  switch (table) {
    case 'modules':
      noteModule(row);
      return !hidden.modules.has(String(row.id));
    case 'exams':
    case 'module_topics': {
      const m = String(row.module_id);
      if (table === 'exams') {
        set(restricted.exams, String(row.id), restricted.modules.has(m));
        set(hidden.exams, String(row.id), hidden.modules.has(m));
      }
      return !hidden.modules.has(m);
    }
    case 'study_entries': {
      const m = String(row.module_id);
      set(restricted.entries, String(row.id), restricted.modules.has(m));
      set(hidden.entries, String(row.id), hidden.modules.has(m));
      return !hidden.modules.has(m);
    }
    case 'tasks': {
      const e = String(row.study_entry_id);
      set(restricted.tasks, String(row.id), restricted.entries.has(e));
      set(hidden.tasks, String(row.id), hidden.entries.has(e));
      return !hidden.entries.has(e);
    }
    case 'task_completions':
      return !hidden.tasks.has(String(row.task_id));
    case 'attachments':
      return !(hidden.modules.has(String(row.module_id)) || hidden.entries.has(String(row.target_id)) || hidden.tasks.has(String(row.target_id)) || hidden.homework.has(String(row.target_id)));
    case 'homework': {
      const m = String(row.module_id);
      set(restricted.homework, String(row.id), restricted.modules.has(m));
      set(hidden.homework, String(row.id), hidden.modules.has(m));
      return !hidden.modules.has(m);
    }
    case 'homework_parts':
    case 'homework_completions':
      return !hidden.homework.has(String(row.homework_id));
    default:
      return true;
  }
}

/** Kompletter Abgleich: alle Mengen neu aufbauen und die Zeilen jeder Tabelle filtern (Reihenfolge: Fächer zuerst). */
export function filterSnapshot<T extends TableName>(tables: T[], results: RowByTable[T][][]): RowByTable[T][][] {
  if (!participantsEnabled) return results;
  for (const s of [...Object.values(restricted), ...Object.values(hidden)]) s.clear();
  const order = ['modules', 'exams', 'module_topics', 'study_entries', 'tasks', 'task_completions', 'attachments'];
  const out: RowByTable[T][][] = results.map(() => []);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : 99);
  const idx = tables.map((t, i) => [t, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [t, i] of idx) out[i] = results[i].filter((r) => classify(t, r as unknown as AnyRow));
  return out;
}

/** Einzelne Zeilen (Live-Änderung, Hausaufgaben-Laden) filtern */
export function filterRows<T extends { [k: string]: unknown }>(table: string, rows: T[]): T[] {
  if (!participantsEnabled) return rows;
  return rows.filter((r) => classify(table, r as AnyRow));
}

/** Ändert eine Live-Änderung an einem Fach die Sichtbarkeit? Dann muss neu geladen werden. */
export function moduleVisibilityChanged(row: AnyRow): boolean {
  if (!participantsEnabled) return false;
  const id = String(row.id);
  const wasHidden = hidden.modules.has(id);
  const wasRestricted = restricted.modules.has(id);
  const p = row.participants;
  const isRestricted = Array.isArray(p) && p.length > 0;
  return wasHidden !== (isRestricted && !canSee(p)) || wasRestricted !== isRestricted;
}

/** Für den Gerätespeicher: eingeschränkte Inhalte nie zwischenspeichern */
export function cacheable(table: TableName, row: AnyRow): boolean {
  if (!participantsEnabled) return true;
  switch (table) {
    case 'modules':
      return !restricted.modules.has(String(row.id));
    case 'exams':
    case 'module_topics':
    case 'study_entries':
      return !restricted.modules.has(String(row.module_id));
    case 'tasks':
      return !restricted.entries.has(String(row.study_entry_id));
    case 'task_completions':
      return !restricted.tasks.has(String(row.task_id));
    case 'attachments':
      return !restricted.modules.has(String(row.module_id));
    default:
      return true;
  }
}

/** Verlauf: Einträge zu versteckten Inhalten ausblenden */
export function activityVisible(row: { entity_type: string; entity_id: string }): boolean {
  if (!participantsEnabled) return true;
  const id = row.entity_id;
  switch (row.entity_type) {
    case 'modules':
      return !hidden.modules.has(id);
    case 'exams':
      return !hidden.exams.has(id);
    case 'study_entries':
      return !hidden.entries.has(id);
    case 'tasks':
      return !hidden.tasks.has(id);
    case 'task_completions':
      return !hidden.tasks.has(id.split(':')[0]);
    case 'homework':
      return !hidden.homework.has(id);
    case 'homework_completions':
    case 'homework_parts':
      return true;
    default:
      return true;
  }
}

export type { UUID };
