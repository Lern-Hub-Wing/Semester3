import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { buildExport, chunk, IMPORT_ORDER, type ExportFile, type ValidationResult } from '../lib/backup';
import { describeError } from '../lib/errors';
import { TABLES, type TableName } from '../lib/types';
import { fetchTable, resync } from './sync';
import { getActiveMemberId } from './session';

/** Erstellt einen vollständigen Export direkt aus der Datenbank (inkl. Papierkorb). */
export async function createExport(): Promise<ExportFile> {
  const results = await Promise.all(TABLES.map((t) => fetchTable(t)));
  const tables = Object.fromEntries(TABLES.map((t, i) => [t, results[i] as unknown as Record<string, unknown>[]])) as Record<
    TableName,
    Record<string, unknown>[]
  >;
  const publicBase = getSupabase().storage.from(config.storageBucket).getPublicUrl('').data.publicUrl;
  return buildExport(tables, { appVersion: config.version, bucket: config.storageBucket, publicBaseUrl: publicBase });
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CONFLICT: Record<TableName, string> = {
  members: 'id',
  modules: 'id',
  module_topics: 'id',
  exams: 'id',
  study_entries: 'id',
  tasks: 'id',
  task_completions: 'task_id,member_id',
  attachments: 'id',
  app_settings: 'key',
};

/**
 * Spielt einen geprüften Import ein. Vorhandene Zeilen mit gleicher ID
 * werden aktualisiert, neue angelegt. Es wird NICHTS gelöscht.
 */
export async function runImport(valid: ValidationResult, onProgress?: (msg: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (!valid.ok) return { ok: false, error: 'Die Datei wurde nicht erfolgreich geprüft.' };
  const sb = getSupabase();
  const actor = getActiveMemberId();
  try {
    for (const table of IMPORT_ORDER) {
      const rows = valid.rows[table];
      if (!rows.length) continue;
      onProgress?.(`Importiere ${table} (${rows.length})…`);
      for (const part of chunk(rows, 400)) {
        const payload = part.map((r) => ({ ...r, changed_by: actor }));
        const { error } =
          table === 'attachments'
            ? await sb.from(table).upsert(payload, { onConflict: CONFLICT[table], ignoreDuplicates: true })
            : await sb.from(table).upsert(payload, { onConflict: CONFLICT[table] });
        if (error) throw error;
      }
    }
    await resync();
    return { ok: true };
  } catch (err) {
    await resync();
    return { ok: false, error: describeError(err) };
  }
}
