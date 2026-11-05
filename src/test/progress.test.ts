import { describe, expect, it } from 'vitest';
import { activeTaskViews, groupRatio, memberRatio, overdueFor, ratio, remainingForGroup, taskGroupStatus } from '../lib/progress';
import { byId, completions, done, entry, mod, task } from './fixtures';

const modules = byId(mod('controlling'), mod('archiv', { archived_at: '2026-11-02T00:00:00Z' }));
const entries = byId(
  entry('e1', 'controlling', '2026-12-10'),
  entry('e2', 'controlling', '2026-12-11'),
  entry('e-del', 'controlling', '2026-12-11', { deleted_at: '2026-11-03T00:00:00Z' }),
  entry('e-arch', 'archiv', '2026-12-11'),
);
const tasks = byId(
  task('t1', 'e1'), task('t2', 'e1'), task('t3', 'e1'), task('t4', 'e1'),
  task('t-del', 'e1', { deleted_at: '2026-11-03T00:00:00Z' }),
  task('t5', 'e-del'), task('t6', 'e-arch'),
);
const views = activeTaskViews({ modules, topics: {}, entries, tasks });
const members = ['A', 'B', 'C', 'D'];

describe('aktive Aufgaben', () => {
  it('ignoriert gelöschte Aufgaben, gelöschte Lerntage und archivierte Module', () => {
    expect(views.map((v) => v.task.id).sort()).toEqual(['t1', 't2', 't3', 't4']);
  });
});

describe('Fortschritt (Beispiel aus der Anforderung)', () => {
  // A: 4/4, B: 2/4, C: 3/4, D: 0/4
  const c = completions(
    done('t1', 'A'), done('t2', 'A'), done('t3', 'A'), done('t4', 'A'),
    done('t1', 'B'), done('t2', 'B'),
    done('t1', 'C'), done('t2', 'C'), done('t3', 'C'),
    done('t4', 'D', false),
  );

  it('berechnet persönlichen Fortschritt je Person', () => {
    expect(memberRatio(views, 'A', c).pct).toBe(100);
    expect(memberRatio(views, 'B', c).pct).toBe(50);
    expect(memberRatio(views, 'C', c).pct).toBe(75);
    expect(memberRatio(views, 'D', c)).toEqual({ done: 0, total: 4, pct: 0 });
  });

  it('Test G: eine Person mit 100 % ergibt keinen 100 % Gruppenfortschritt', () => {
    const g = groupRatio(views, members, c);
    expect(g).toEqual({ done: 9, total: 16, pct: 56 });
    expect(remainingForGroup(g)).toBe(7);
  });

  it('Test H: erst wenn alle alles erledigt haben, sind es 100 %', () => {
    const all = completions(...members.flatMap((m) => ['t1', 't2', 't3', 't4'].map((t) => done(t, m))));
    expect(groupRatio(views, members, all).pct).toBe(100);
    const almost = { ...all };
    delete almost['t4:D'];
    expect(groupRatio(views, members, almost).pct).toBe(93);
  });

  it('rundet nie auf 100 % auf', () => {
    expect(ratio(999, 1000).pct).toBe(99);
    expect(ratio(1000, 1000).pct).toBe(100);
  });

  it('Test B: ein Haken betrifft nur die eigene Person', () => {
    const one = completions(done('t1', 'A'));
    expect(memberRatio(views, 'A', one).done).toBe(1);
    expect(memberRatio(views, 'B', one).done).toBe(0);
  });

  it('zeigt Gruppenstatus „3 von 4 fertig“', () => {
    const s = taskGroupStatus('t1', members, c);
    expect(s.doneMembers).toEqual(['A', 'B', 'C']);
    expect(s.openMembers).toEqual(['D']);
    expect(s.allDone).toBe(false);
  });
});

describe('Leerzustand', () => {
  it('liefert null statt 100 % ohne Aufgaben', () => {
    expect(memberRatio([], 'A', {}).pct).toBeNull();
    expect(groupRatio([], members, {}).pct).toBeNull();
    expect(groupRatio(views, [], {}).pct).toBeNull();
  });
});

describe('Test F: neues Mitglied', () => {
  it('erhöht die möglichen Erledigungen und behält bestehende Haken', () => {
    const c = completions(...members.flatMap((m) => ['t1', 't2', 't3', 't4'].map((t) => done(t, m))));
    expect(groupRatio(views, members, c).pct).toBe(100);
    const withE = groupRatio(views, [...members, 'E'], c);
    expect(withE).toEqual({ done: 16, total: 20, pct: 80 });
    expect(memberRatio(views, 'E', c).pct).toBe(0);
  });

  it('deaktivierte Personen zählen nicht mit', () => {
    const c = completions(...['A', 'B', 'C'].flatMap((m) => ['t1', 't2', 't3', 't4'].map((t) => done(t, m))));
    expect(groupRatio(views, ['A', 'B', 'C'], c).pct).toBe(100);
  });
});

describe('Test D/E/K: Haken hängen an stabilen IDs', () => {
  const c = completions(done('t1', 'A'));
  it('Titeländerung behält Haken', () => {
    const renamed = { ...tasks, t1: { ...tasks.t1, title: 'Neu', version: 2 } };
    expect(memberRatio(activeTaskViews({ modules, topics: {}, entries, tasks: renamed }), 'A', c).done).toBe(1);
  });
  it('Datumsänderung behält Haken', () => {
    const moved = { ...entries, e1: { ...entries.e1, study_date: '2026-12-20', version: 2 } };
    const v2 = activeTaskViews({ modules, topics: {}, entries: moved, tasks });
    expect(v2.find((v) => v.task.id === 't1')?.date).toBe('2026-12-20');
    expect(memberRatio(v2, 'A', c).done).toBe(1);
  });
  it('Papierkorb + Wiederherstellen behält Haken', () => {
    const deleted = { ...tasks, t1: { ...tasks.t1, deleted_at: '2026-11-04T00:00:00Z' } };
    expect(memberRatio(activeTaskViews({ modules, topics: {}, entries, tasks: deleted }), 'A', c)).toEqual({ done: 0, total: 3, pct: 0 });
    const restored = { ...deleted, t1: { ...deleted.t1, deleted_at: null } };
    expect(memberRatio(activeTaskViews({ modules, topics: {}, entries, tasks: restored }), 'A', c).done).toBe(1);
  });
});

describe('überfällige Aufgaben', () => {
  it('findet offene Aufgaben vergangener Tage', () => {
    const c = completions(done('t1', 'A'));
    expect(overdueFor(views, 'A', c, '2026-12-11').map((v) => v.task.id)).toEqual(['t2', 't3', 't4']);
    expect(overdueFor(views, 'A', c, '2026-12-10')).toEqual([]);
  });
});
