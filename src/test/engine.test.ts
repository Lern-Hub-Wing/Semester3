import { beforeEach, describe, expect, it } from 'vitest';
import { useData, emptyTables } from '../store/data';
import { __resetEngine, applyServerRows, replaceTable, write } from '../store/engine';
import { ConflictError } from '../lib/errors';
import { done } from './fixtures';

const key = 't1:A';
const state = () => useData.getState().task_completions;

beforeEach(() => {
  __resetEngine();
  useData.setState({ ...emptyTables(), phase: 'ready' });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Versionsabgleich', () => {
  it('verwirft ältere und doppelte Ereignisse', () => {
    applyServerRows('task_completions', [done('t1', 'A', true, 3)]);
    applyServerRows('task_completions', [done('t1', 'A', false, 2)]); // verspätet
    expect(state()[key].is_completed).toBe(true);
    applyServerRows('task_completions', [done('t1', 'A', true, 3)]); // doppelt
    expect(state()[key].version).toBe(3);
    applyServerRows('task_completions', [done('t1', 'A', false, 4)]);
    expect(state()[key].is_completed).toBe(false);
  });

  it('Resync behält neuere lokale Zeilen', () => {
    applyServerRows('task_completions', [done('t1', 'A', true, 5)]);
    replaceTable('task_completions', [done('t1', 'A', false, 4), done('t2', 'B', true, 1)]);
    expect(state()[key].version).toBe(5);
    expect(state()['t2:B'].is_completed).toBe(true);
  });

  it('gleichzeitige Änderungen verschiedener Aufgaben bleiben beide erhalten', () => {
    applyServerRows('task_completions', [done('t1', 'A', true, 1)]);
    applyServerRows('task_completions', [done('t2', 'B', true, 1)]);
    expect(Object.keys(state()).sort()).toEqual(['t1:A', 't2:B']);
  });
});

describe('optimistische Schreibvorgänge', () => {
  it('zeigt den Wert sofort und übernimmt die Serverantwort', async () => {
    const d = deferred<ReturnType<typeof done>>();
    const p = write({ table: 'task_completions', key, optimistic: done('t1', 'A', true, 0), run: () => d.promise });
    expect(state()[key].is_completed).toBe(true);
    // Altes Realtime-Ereignis während des Speicherns darf nichts überschreiben
    applyServerRows('task_completions', [done('t1', 'A', false, 1)]);
    expect(state()[key].is_completed).toBe(true);
    d.resolve(done('t1', 'A', true, 2));
    const res = await p;
    expect(res.ok).toBe(true);
    expect(state()[key]).toMatchObject({ is_completed: true, version: 2 });
  });

  it('springt bei Fehlern auf den gespeicherten Stand zurück', async () => {
    applyServerRows('task_completions', [done('t1', 'A', false, 1)]);
    const res = await write({
      table: 'task_completions',
      key,
      optimistic: done('t1', 'A', true, 1),
      run: () => Promise.reject(new Error('Failed to fetch')),
    });
    expect(res.ok).toBe(false);
    expect(state()[key].is_completed).toBe(false);
  });

  it('entfernt fehlgeschlagene neue Zeilen wieder', async () => {
    await write({ table: 'task_completions', key, optimistic: done('t1', 'A', true, 0), run: () => Promise.reject(new Error('x')) });
    expect(state()[key]).toBeUndefined();
  });

  it('führt Schreibvorgänge pro Zeile nacheinander aus; der letzte Klick gewinnt', async () => {
    const order: string[] = [];
    const d1 = deferred<ReturnType<typeof done>>();
    const p1 = write({ table: 'task_completions', key, optimistic: done('t1', 'A', true, 0), run: () => (order.push('1'), d1.promise) });
    const p2 = write({
      table: 'task_completions',
      key,
      optimistic: done('t1', 'A', false, 0),
      run: async () => (order.push('2'), done('t1', 'A', false, 3)),
    });
    await Promise.resolve();
    expect(order).toEqual(['1']);
    expect(state()[key].is_completed).toBe(false);
    d1.resolve(done('t1', 'A', true, 2));
    await Promise.all([p1, p2]);
    expect(order).toEqual(['1', '2']);
    expect(state()[key]).toMatchObject({ is_completed: false, version: 3 });
  });

  it('lädt bei einem Konflikt den aktuellen Stand statt zu überschreiben', async () => {
    applyServerRows('task_completions', [done('t1', 'A', false, 1)]);
    const res = await write({
      table: 'task_completions',
      key,
      optimistic: done('t1', 'A', true, 1),
      run: () => Promise.reject(new ConflictError()),
      refetch: async () => done('t1', 'A', false, 7),
    });
    expect(res).toMatchObject({ ok: false, conflict: true });
    expect(state()[key].version).toBe(7);
  });
});
