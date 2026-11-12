import { useMemo } from 'react';
import { useData } from './data';
import { useHomework } from './homework';
import type { Homework } from '../lib/homework';

export type TrashKind = 'Hausaufgabe' | 'Aufgabe' | 'Lerntag' | 'Datei' | 'Prüfung' | 'Thema' | 'Modul';

export interface TrashItem {
  id: string;
  kind: TrashKind;
  title: string;
  at: string;
}

/**
 * Inhalt des Papierkorbs – eine Quelle für die Seite und alle Zähler.
 * Aufgaben eines gelöschten Lerntags erscheinen nicht zusätzlich einzeln
 * (sie kommen mit dem Lerntag zurück), damit der Zähler nicht doppelt zählt.
 */
export function collectTrash(d: ReturnType<typeof useData.getState>, homework: Record<string, Homework>): TrashItem[] {
  const out: TrashItem[] = [];
  for (const h of Object.values(homework)) if (h.deleted_at) out.push({ id: h.id, kind: 'Hausaufgabe', title: h.title, at: h.deleted_at });
  for (const t of Object.values(d.tasks)) {
    if (!t.deleted_at) continue;
    if (d.study_entries[t.study_entry_id]?.deleted_at) continue;
    out.push({ id: t.id, kind: 'Aufgabe', title: t.title, at: t.deleted_at });
  }
  for (const e of Object.values(d.study_entries)) if (e.deleted_at) out.push({ id: e.id, kind: 'Lerntag', title: e.title, at: e.deleted_at });
  for (const a of Object.values(d.attachments)) if (a.deleted_at) out.push({ id: a.id, kind: 'Datei', title: a.original_filename, at: a.deleted_at });
  for (const x of Object.values(d.exams)) if (x.deleted_at) out.push({ id: x.id, kind: 'Prüfung', title: d.modules[x.module_id]?.name ?? 'Prüfung', at: x.deleted_at });
  for (const t of Object.values(d.module_topics)) if (t.archived_at) out.push({ id: t.id, kind: 'Thema', title: t.title, at: t.archived_at });
  for (const m of Object.values(d.modules)) if (m.archived_at) out.push({ id: m.id, kind: 'Modul', title: m.name, at: m.archived_at });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function useTrashItems(): TrashItem[] {
  const d = useData();
  const homework = useHomework((s) => s.homework);
  return useMemo(() => collectTrash(d, homework), [d, homework]);
}

export function useTrashCount(): number {
  return useTrashItems().length;
}
