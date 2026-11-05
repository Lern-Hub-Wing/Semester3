import { create } from 'zustand';
import type { RowByTable, TableName } from '../lib/types';

export type TableState = { [K in TableName]: Record<string, RowByTable[K]> };

export interface DataState extends TableState {
  /** loading = noch nichts da; ready = Daten vorhanden (ggf. aus dem Cache) */
  phase: 'loading' | 'ready' | 'error';
  /** true, solange nur zwischengespeicherte Daten angezeigt werden */
  fromCache: boolean;
  error: string | null;
  lastSyncAt: number | null;
}

export function emptyTables(): TableState {
  return {
    members: {},
    modules: {},
    module_topics: {},
    exams: {},
    study_entries: {},
    tasks: {},
    task_completions: {},
    attachments: {},
    app_settings: {},
  };
}

export const useData = create<DataState>(() => ({
  ...emptyTables(),
  phase: 'loading',
  fromCache: false,
  error: null,
  lastSyncAt: null,
}));

export interface SyncStatus {
  /** Anzahl laufender Speichervorgänge */
  inflight: number;
  lastSavedAt: number | null;
  lastError: string | null;
  online: boolean;
  realtime: 'connecting' | 'live' | 'down';
}

export const useSyncStatus = create<SyncStatus>(() => ({
  inflight: 0,
  lastSavedAt: null,
  lastError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  realtime: 'connecting',
}));
