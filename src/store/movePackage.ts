import { getSupabase } from '../lib/supabase';
import { createExport } from './backup';

/** Zusätzliche Tabellen, die der normale Export nicht enthält (für den Umzug in die App) */
const EXTRA: { table: string; order: string[] }[] = [
  { table: 'homework', order: ['id'] },
  { table: 'homework_parts', order: ['id'] },
  { table: 'homework_completions', order: ['target_id', 'member_id'] },
  { table: 'focus_sessions', order: ['id'] },
  { table: 'music_tracks', order: ['id'] },
];

async function fetchAll(table: string, order: string[]): Promise<Record<string, unknown>[] | null> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = getSupabase().from(table).select('*');
    for (const c of order) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + 999);
    if (error) {
      // Tabelle fehlt (Migration nicht eingespielt): einfach weglassen
      if (error.code === 'PGRST205' || error.code === '42P01') return null;
      throw error;
    }
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface MovePackage {
  format: 'studyspace-umzug';
  version: 1;
  exported_at: string;
  app_version: string;
  notes: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Umzugspaket = vollständige Sicherheitskopie der Seite: alle Tabellen
 * inklusive Papierkorb, Hausaufgaben, Lernzeiten, Musik und „Wer schreibt?“.
 * Hochgeladene Dateien sind nicht enthalten (die App hat keine Uploads).
 */
export async function createMovePackage(): Promise<MovePackage> {
  const base = await createExport();
  const tables: Record<string, Record<string, unknown>[]> = { ...base.tables };
  const extra = await Promise.all(EXTRA.map((e) => fetchAll(e.table, e.order)));
  EXTRA.forEach((e, i) => {
    if (extra[i]) tables[e.table] = extra[i]!;
  });
  return {
    format: 'studyspace-umzug',
    version: 1,
    exported_at: base.exported_at,
    app_version: base.app_version,
    notes: 'Sicherheitskopie und Umzugsdatei der StudySpace-Seite. In der App unter Admin → Umzug übernehmen. Hochgeladene Dateien sind nicht enthalten.',
    tables,
  };
}

export const MOVE_LABELS: Record<string, string> = {
  members: 'Personen',
  modules: 'Fächer',
  exams: 'Prüfungen',
  study_entries: 'Lerntage',
  tasks: 'Aufgaben',
  task_completions: 'Haken',
  homework: 'Hausaufgaben',
  focus_sessions: 'Lernzeiten',
  music_tracks: 'Musiktitel',
  attachments: 'Dateien (bleiben auf der Seite)',
};
