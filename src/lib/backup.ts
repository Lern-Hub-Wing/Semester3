/**
 * Datenexport und -import (JSON).
 * Der Export enthält alle Tabellen inkl. Papierkorb, sodass Lernplan,
 * Personen, Module, Aufgaben und Erledigungsstatus wiederhergestellt
 * werden können. Dateien selbst sind NICHT enthalten – nur ihre
 * Metadaten und Speicherpfade (externe Referenzen).
 */
import { isHexColor } from './colors';
import { isValidISODate } from './time';
import { UUID_RE } from './uuid';
import type { TableName } from './types';

export const EXPORT_FORMAT = 'studyspace-export';
export const EXPORT_VERSION = 1;

/** Reihenfolge so, dass Fremdschlüssel beim Import bereits existieren. */
export const IMPORT_ORDER: TableName[] = [
  'members',
  'modules',
  'module_topics',
  'exams',
  'study_entries',
  'tasks',
  'task_completions',
  'attachments',
  'app_settings',
];

/** Spalten, die beim Import geschrieben werden (serverseitige Felder fehlen absichtlich). */
export const IMPORT_COLUMNS: Record<TableName, string[]> = {
  members: ['id', 'name', 'color', 'sort_order', 'is_active'],
  modules: ['id', 'name', 'color', 'description', 'sort_order', 'archived_at'],
  module_topics: ['id', 'module_id', 'title', 'description', 'sort_order', 'archived_at'],
  exams: ['id', 'module_id', 'starts_at', 'ends_at', 'timezone', 'location', 'notes', 'deleted_at'],
  study_entries: ['id', 'module_id', 'topic_id', 'study_date', 'title', 'description', 'sort_order', 'deleted_at'],
  tasks: ['id', 'study_entry_id', 'title', 'description', 'sort_order', 'deleted_at'],
  task_completions: ['task_id', 'member_id', 'is_completed'],
  attachments: ['id', 'module_id', 'target_type', 'target_id', 'storage_path', 'original_filename', 'mime_type', 'file_size', 'deleted_at'],
  app_settings: ['key', 'value'],
};

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  app_version: string;
  notes: string;
  storage: { bucket: string; public_base_url: string | null };
  tables: Record<TableName, Record<string, unknown>[]>;
}

export function buildExport(
  tables: Record<TableName, Record<string, unknown>[]>,
  meta: { appVersion: string; bucket: string; publicBaseUrl: string | null; now?: Date },
): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: (meta.now ?? new Date()).toISOString(),
    app_version: meta.appVersion,
    notes:
      'Dieser Export enthält alle Lernplandaten und Erledigungsstatus. Hochgeladene Dateien sind NICHT enthalten – ' +
      'die Tabelle "attachments" verweist nur auf ihre Speicherorte im Supabase Storage (storage_path).',
    storage: { bucket: meta.bucket, public_base_url: meta.publicBaseUrl },
    tables,
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  counts: Partial<Record<TableName, number>>;
  /** bereinigte Zeilen, nur mit erlaubten Spalten */
  rows: Record<TableName, Record<string, unknown>[]>;
}

type Rule = (v: unknown) => boolean;
const str = (max: number, required = true): Rule => (v) =>
  v === null || v === undefined ? !required : typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
const uuidRule = (required = true): Rule => (v) => (v === null || v === undefined ? !required : typeof v === 'string' && UUID_RE.test(v));
const intRule: Rule = (v) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 100000;
const boolRule: Rule = (v) => typeof v === 'boolean';
const tsRule = (required = false): Rule => (v) => (v === null || v === undefined ? !required : typeof v === 'string' && !Number.isNaN(Date.parse(v)));
const colorRule: Rule = (v) => typeof v === 'string' && isHexColor(v);
const dateRule: Rule = (v) => typeof v === 'string' && isValidISODate(v);

const RULES: Record<TableName, Record<string, Rule>> = {
  members: { id: uuidRule(), name: str(40), color: colorRule, sort_order: intRule, is_active: boolRule },
  modules: { id: uuidRule(), name: str(80), color: colorRule, description: str(2000, false), sort_order: intRule, archived_at: tsRule() },
  module_topics: { id: uuidRule(), module_id: uuidRule(), title: str(120), description: str(2000, false), sort_order: intRule, archived_at: tsRule() },
  exams: {
    id: uuidRule(), module_id: uuidRule(), starts_at: tsRule(true), ends_at: tsRule(true), timezone: str(64),
    location: str(200, false), notes: str(2000, false), deleted_at: tsRule(),
  },
  study_entries: {
    id: uuidRule(), module_id: uuidRule(), topic_id: uuidRule(false), study_date: dateRule, title: str(160),
    description: str(4000, false), sort_order: intRule, deleted_at: tsRule(),
  },
  tasks: { id: uuidRule(), study_entry_id: uuidRule(), title: str(200), description: str(2000, false), sort_order: intRule, deleted_at: tsRule() },
  task_completions: { task_id: uuidRule(), member_id: uuidRule(), is_completed: boolRule },
  attachments: {
    id: uuidRule(), module_id: uuidRule(false),
    target_type: (v) => ['module', 'topic', 'study_entry', 'task'].includes(v as string),
    target_id: uuidRule(), storage_path: str(400),
    original_filename: str(255),
    mime_type: (v) => ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(v as string),
    file_size: (v) => typeof v === 'number' && v > 0 && v <= 52428800,
    deleted_at: tsRule(),
  },
  app_settings: {
    key: (v) => ['app_name', 'group_goal_title', 'motivation_enabled'].includes(v as string),
    value: (v) => v !== undefined && JSON.stringify(v).length <= 4000,
  },
};

const MAX_ROWS = 20000;

/** Prüft eine Exportdatei vollständig, bevor irgendetwas geschrieben wird. */
export function validateImport(input: unknown): ValidationResult {
  const errors: string[] = [];
  const rows = Object.fromEntries(IMPORT_ORDER.map((t) => [t, [] as Record<string, unknown>[]])) as Record<TableName, Record<string, unknown>[]>;
  const counts: Partial<Record<TableName, number>> = {};

  if (!input || typeof input !== 'object') return { ok: false, errors: ['Die Datei enthält kein gültiges JSON-Objekt.'], counts, rows };
  const file = input as Partial<ExportFile>;
  if (file.format !== EXPORT_FORMAT) errors.push('Die Datei ist kein StudySpace-Export.');
  if (typeof file.version !== 'number' || file.version > EXPORT_VERSION) errors.push('Die Exportversion wird nicht unterstützt.');
  if (!file.tables || typeof file.tables !== 'object') {
    errors.push('Die Datei enthält keine Tabellen.');
    return { ok: false, errors, counts, rows };
  }

  let total = 0;
  for (const table of IMPORT_ORDER) {
    const list = (file.tables as Record<string, unknown>)[table];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`Tabelle „${table}“ ist keine Liste.`);
      continue;
    }
    total += list.length;
    const rules = RULES[table];
    list.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        errors.push(`${table}[${index}]: kein Objekt.`);
        return;
      }
      const clean: Record<string, unknown> = {};
      for (const col of IMPORT_COLUMNS[table]) {
        const value = (raw as Record<string, unknown>)[col];
        if (!rules[col](value)) {
          if (errors.length < 25) errors.push(`${table}[${index}].${col}: ungültiger Wert.`);
          return;
        }
        clean[col] = value === undefined ? null : value;
      }
      rows[table].push(clean);
    });
    counts[table] = rows[table].length;
  }
  if (total > MAX_ROWS) errors.push(`Die Datei ist zu groß (${total} Zeilen, maximal ${MAX_ROWS}).`);

  // Referenzen innerhalb der Datei prüfen (fehlende Ziele würden die Datenbank ablehnen).
  const ids = (t: TableName) => new Set(rows[t].map((r) => r.id as string));
  const memberIds = ids('members');
  const moduleIds = ids('modules');
  const topicIds = ids('module_topics');
  const entryIds = ids('study_entries');
  const taskIds = ids('tasks');
  const check = (cond: boolean, msg: string) => {
    if (!cond && errors.length < 25) errors.push(msg);
  };
  rows.module_topics.forEach((r) => check(moduleIds.has(r.module_id as string), `Thema „${r.title}“ verweist auf ein unbekanntes Modul.`));
  rows.exams.forEach((r) => {
    check(moduleIds.has(r.module_id as string), 'Eine Prüfung verweist auf ein unbekanntes Modul.');
    check(Date.parse(r.ends_at as string) > Date.parse(r.starts_at as string), 'Eine Prüfung endet vor ihrem Beginn.');
  });
  rows.study_entries.forEach((r) => {
    check(moduleIds.has(r.module_id as string), `Lerntag „${r.title}“ verweist auf ein unbekanntes Modul.`);
    check(r.topic_id === null || topicIds.has(r.topic_id as string), `Lerntag „${r.title}“ verweist auf ein unbekanntes Thema.`);
  });
  rows.tasks.forEach((r) => check(entryIds.has(r.study_entry_id as string), `Aufgabe „${r.title}“ verweist auf einen unbekannten Lerntag.`));
  rows.task_completions.forEach((r) =>
    check(taskIds.has(r.task_id as string) && memberIds.has(r.member_id as string), 'Ein Erledigungsstatus verweist auf eine unbekannte Aufgabe oder Person.'),
  );
  check(rows.members.some((m) => m.is_active === true) || rows.members.length === 0, 'Mindestens eine Person muss aktiv sein.');

  return { ok: errors.length === 0, errors, counts, rows };
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
