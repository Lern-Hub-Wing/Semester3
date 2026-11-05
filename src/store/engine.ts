/**
 * Synchronisations-Engine
 * -----------------------
 * Regeln (siehe docs/ARCHITEKTUR.md):
 *  1. Die Datenbank ist die einzige Wahrheit. Jede Zeile trägt eine
 *     serverseitig hochgezählte `version`.
 *  2. Eingehende Zeilen (Realtime, Neuladen, Antworten) werden nur
 *     übernommen, wenn ihre Version >= der bekannten Version ist. Doppelte
 *     oder verspätete alte Ereignisse ändern daher nichts.
 *  3. Schreibvorgänge werden pro Zeile hintereinander ausgeführt. Während
 *     ein Schreibvorgang läuft, zeigt die Oberfläche den optimistischen
 *     Wert; Serverzeilen werden im Hintergrund als "bestätigt" gemerkt.
 *  4. Sobald alle Schreibvorgänge einer Zeile fertig sind, wird der
 *     neueste bestätigte Serverstand angezeigt. Ist ein Schreibvorgang
 *     fehlgeschlagen, springt die Oberfläche damit automatisch auf den
 *     echten gespeicherten Zustand zurück – nichts wird fälschlich als
 *     gespeichert dargestellt.
 */
import { useData, useSyncStatus, type TableState } from './data';
import { rowKey, type RowByTable, type TableName } from '../lib/types';
import { ConflictError, OfflineError, describeError } from '../lib/errors';

type AnyRow = RowByTable[TableName];
type Versioned = { version: number };

interface PendingEntry {
  count: number;
  /** neuester bekannter Serverstand (undefined = existiert auf dem Server nicht) */
  confirmed: AnyRow | undefined;
}

const pending = new Map<string, PendingEntry>();
const chains = new Map<string, Promise<unknown>>();

const pk = (table: TableName, key: string) => `${table}|${key}`;

/** Gibt die Zeile mit der höheren Version zurück (bei Gleichstand: incoming). */
export function newerRow<T extends Versioned>(current: T | undefined, incoming: T | undefined): T | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming.version >= current.version ? incoming : current;
}

export function isPending(table: TableName, key: string): boolean {
  return pending.has(pk(table, key));
}

/** Liefert den bestätigten Serverstand (ohne optimistische Änderungen). */
export function confirmedRow<T extends TableName>(table: T, key: string): RowByTable[T] | undefined {
  const p = pending.get(pk(table, key));
  if (p) return p.confirmed as RowByTable[T] | undefined;
  return useData.getState()[table][key] as RowByTable[T] | undefined;
}

/** Übernimmt Serverzeilen (Realtime-Ereignisse oder Antworten). */
export function applyServerRows<T extends TableName>(table: T, rows: RowByTable[T][]): void {
  if (rows.length === 0) return;
  const state = useData.getState();
  const current = state[table] as Record<string, RowByTable[T]>;
  let next: Record<string, RowByTable[T]> | null = null;
  for (const row of rows) {
    const key = rowKey(table, row);
    const p = pending.get(pk(table, key));
    if (p) {
      p.confirmed = newerRow(p.confirmed as RowByTable[T] | undefined, row);
      continue;
    }
    const existing = (next ?? current)[key];
    if (existing && existing.version > row.version) continue; // altes Ereignis verwerfen
    if (existing === row) continue;
    if (!next) next = { ...current };
    next[key] = row;
  }
  if (next) useData.setState({ [table]: next } as Partial<TableState>);
}

/** Entfernt eine Zeile (nur bei manuellen Löschungen direkt in der Datenbank). */
export function applyServerDelete(table: TableName, key: string): void {
  const p = pending.get(pk(table, key));
  if (p) {
    p.confirmed = undefined;
    return;
  }
  const current = useData.getState()[table] as Record<string, AnyRow>;
  if (!(key in current)) return;
  const next = { ...current };
  delete next[key];
  useData.setState({ [table]: next } as Partial<TableState>);
}

/**
 * Vollständiger Abgleich nach (Wieder-)Verbindung. Zeilen, die lokal
 * neuer sind (z. B. Realtime kam schneller als die Abfrage), bleiben.
 */
export function replaceTable<T extends TableName>(table: T, rows: RowByTable[T][]): void {
  const current = useData.getState()[table] as Record<string, RowByTable[T]>;
  const next: Record<string, RowByTable[T]> = {};
  for (const row of rows) {
    const key = rowKey(table, row);
    const p = pending.get(pk(table, key));
    if (p) {
      p.confirmed = newerRow(p.confirmed as RowByTable[T] | undefined, row);
      next[key] = current[key] ?? row;
    } else {
      next[key] = newerRow(current[key], row)!;
    }
  }
  // Optimistisch angelegte Zeilen, die noch gespeichert werden, behalten.
  for (const [key, row] of Object.entries(current)) {
    if (!(key in next) && pending.has(pk(table, key))) next[key] = row;
  }
  useData.setState({ [table]: next } as Partial<TableState>);
}

function setDisplayed(table: TableName, key: string, row: AnyRow | undefined) {
  const current = useData.getState()[table] as Record<string, AnyRow>;
  if (current[key] === row) return;
  const next = { ...current };
  if (row) next[key] = row;
  else delete next[key];
  useData.setState({ [table]: next } as Partial<TableState>);
}

export interface WriteOptions<T extends TableName> {
  table: T;
  key: string;
  /** optimistischer Wert, der sofort angezeigt wird (undefined = keiner) */
  optimistic?: RowByTable[T];
  /** führt den eigentlichen Datenbankaufruf aus und liefert die gespeicherte Zeile */
  run: () => Promise<RowByTable[T] | null>;
  /** wird bei einem Versionskonflikt aufgerufen, um den aktuellen Serverstand zu laden */
  refetch?: () => Promise<RowByTable[T] | null>;
}

export type WriteResult<T extends TableName> = { ok: true; row: RowByTable[T] | null } | { ok: false; error: string; conflict: boolean };

/** Führt einen Schreibvorgang aus (serialisiert pro Zeile, mit Rücksprung bei Fehlern). */
export async function write<T extends TableName>(opts: WriteOptions<T>): Promise<WriteResult<T>> {
  const { table, key } = opts;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const error = new OfflineError().message;
    useSyncStatus.setState({ lastError: error });
    return { ok: false, error, conflict: false };
  }

  const id = pk(table, key);
  const entry: PendingEntry = pending.get(id) ?? { count: 0, confirmed: useData.getState()[table][key] as AnyRow | undefined };
  pending.set(id, entry);
  entry.count++;
  useSyncStatus.setState((s) => ({ inflight: s.inflight + 1 }));
  if (opts.optimistic) setDisplayed(table, key, opts.optimistic);

  const previous = chains.get(id) ?? Promise.resolve();
  const job = previous.then(async (): Promise<WriteResult<T>> => {
    try {
      const row = await opts.run();
      if (row) entry.confirmed = newerRow(entry.confirmed as RowByTable[T] | undefined, row);
      return { ok: true, row };
    } catch (err) {
      const conflict = err instanceof ConflictError;
      if (conflict && opts.refetch) {
        try {
          const latest = await opts.refetch();
          if (latest) entry.confirmed = newerRow(entry.confirmed as RowByTable[T] | undefined, latest);
        } catch {
          /* Abgleich folgt beim nächsten Resync */
        }
      }
      return { ok: false, error: describeError(err), conflict };
    }
  });
  chains.set(id, job.then(() => undefined));

  const result = await job;
  entry.count--;
  if (entry.count === 0) {
    pending.delete(id);
    chains.delete(id);
    setDisplayed(table, key, entry.confirmed);
  }
  useSyncStatus.setState((s) => ({
    inflight: Math.max(0, s.inflight - 1),
    lastSavedAt: result.ok ? Date.now() : s.lastSavedAt,
    lastError: result.ok ? null : result.error,
  }));
  return result;
}

/** Nur für Tests */
export function __resetEngine() {
  pending.clear();
  chains.clear();
}
