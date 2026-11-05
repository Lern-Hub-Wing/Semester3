import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { TABLES, rowKey, type RowByTable, type TableName } from '../lib/types';
import { describeError } from '../lib/errors';
import { emptyTables, useData, useSyncStatus, type TableState } from './data';
import { applyServerDelete, applyServerRows, confirmedRow, isPending, replaceTable } from './engine';

const CACHE_KEY = 'studyspace.cache.v1';
const PAGE = 1000;

const ORDER: Record<TableName, string[]> = {
  members: ['id'],
  modules: ['id'],
  module_topics: ['id'],
  exams: ['id'],
  study_entries: ['id'],
  tasks: ['id'],
  task_completions: ['task_id', 'member_id'],
  attachments: ['id'],
  app_settings: ['key'],
};

/** Lädt eine komplette Tabelle seitenweise (Supabase liefert max. 1000 Zeilen pro Anfrage). */
export async function fetchTable<T extends TableName>(table: T): Promise<RowByTable[T][]> {
  const sb = getSupabase();
  const out: RowByTable[T][] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*');
    for (const col of ORDER[table]) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as RowByTable[T][]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

let loadPromise: Promise<void> | null = null;

/** Lädt alle Daten aus der Datenbank und gleicht den lokalen Stand ab. */
export function resync(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const results = await Promise.all(TABLES.map((t) => fetchTable(t)));
      TABLES.forEach((t, i) => replaceTable(t, results[i] as RowByTable[typeof t][]));
      useData.setState({ phase: 'ready', fromCache: false, error: null, lastSyncAt: Date.now() });
      saveCacheSoon();
    } catch (err) {
      const message = describeError(err);
      const { phase } = useData.getState();
      // Mit Cache-Daten bleiben wir benutzbar (nur lesend sinnvoll), sonst Fehlerzustand.
      useData.setState({ phase: phase === 'ready' ? 'ready' : 'error', error: message });
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

// ---------------------------------------------------------------------
// Lokaler Cache: zuletzt erfolgreich geladene (bestätigte) Daten
// ---------------------------------------------------------------------

let cacheTimer: ReturnType<typeof setTimeout> | null = null;

function saveCacheSoon() {
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(saveCache, 800);
}

function saveCache() {
  const state = useData.getState();
  if (state.phase !== 'ready' || state.fromCache) return;
  const tables = emptyTables();
  for (const t of TABLES) {
    const src = state[t] as Record<string, RowByTable[typeof t]>;
    const dst: Record<string, RowByTable[typeof t]> = {};
    for (const [key, row] of Object.entries(src)) {
      // Nur bestätigte Werte cachen – nie unbestätigte optimistische Änderungen.
      const value = isPending(t, key) ? confirmedRow(t, key) : row;
      if (value) dst[key] = value;
    }
    (tables as Record<TableName, unknown>)[t] = dst;
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: state.lastSyncAt ?? Date.now(), tables }));
  } catch {
    /* Speicher voll oder nicht verfügbar – Cache ist optional */
  }
}

export function loadCache(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { savedAt: number; tables: Partial<TableState> };
    const tables = emptyTables();
    for (const t of TABLES) {
      const v = parsed.tables?.[t];
      if (v && typeof v === 'object') (tables as Record<TableName, unknown>)[t] = v;
    }
    useData.setState({ ...tables, phase: 'ready', fromCache: true, lastSyncAt: parsed.savedAt ?? null });
    return true;
  } catch {
    return false;
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignorieren */
  }
}

// ---------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------

let channel: RealtimeChannel | null = null;
let started = false;
let hiddenSince: number | null = null;
let wasDisconnected = false;

function handleChange(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  const table = payload.table as TableName;
  if (!TABLES.includes(table)) return;
  if (payload.eventType === 'DELETE') {
    const old = payload.old as unknown as RowByTable[typeof table];
    try {
      applyServerDelete(table, rowKey(table, old));
    } catch {
      /* unvollständige Daten → beim nächsten Resync bereinigt */
    }
  } else {
    applyServerRows(table, [payload.new as unknown as RowByTable[typeof table]]);
  }
  saveCacheSoon();
}

function subscribe() {
  const sb = getSupabase();
  channel = sb
    .channel('studyspace-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, handleChange)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        useSyncStatus.setState({ realtime: 'live' });
        // Nach einer Unterbrechung könnten Ereignisse fehlen → komplett abgleichen.
        if (wasDisconnected) void resync();
        wasDisconnected = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        useSyncStatus.setState({ realtime: 'down' });
        wasDisconnected = true;
      }
    });
}

/** Startet Laden, Realtime und automatische Wiederverbindung (einmalig). */
export function startSync() {
  if (started) return;
  started = true;
  loadCache();
  subscribe();
  void resync();

  // Änderungen am Store regelmäßig cachen
  useData.subscribe(() => saveCacheSoon());

  window.addEventListener('online', () => {
    useSyncStatus.setState({ online: true });
    void resync();
  });
  window.addEventListener('offline', () => useSyncStatus.setState({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
    } else if (hiddenSince && Date.now() - hiddenSince > 15_000) {
      hiddenSince = null;
      // Mobile Browser trennen Websockets im Hintergrund → sicherheitshalber abgleichen
      void resync();
      if (channel && channel.state !== 'joined' && channel.state !== 'joining') {
        void getSupabase().removeChannel(channel);
        wasDisconnected = true;
        subscribe();
      }
    }
  });
}
