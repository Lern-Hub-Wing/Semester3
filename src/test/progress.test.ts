import { describe, expect, it } from 'vitest';
import {
  activeHomeworkItems, activeTaskViews, groupRatio, homeworkCredit, memberRatio, overdueFor, ratio, remainingForGroup, scopeForModule, scopeGroupRatio, scopeMemberRatio, taskGroupStatus,
  type DoneLookup, type ProgressScope,
} from '../lib/progress';
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

describe('Hausaufgaben im Fortschritt', () => {
  // 4 Lernplan-Aufgaben (t1–t4) + 3 Hausaufgaben: ohne Teile, mit 4 Einheiten, im archivierten Fach
  const hw = {
    h1: { id: 'h1', module_id: 'controlling', deleted_at: null },
    h2: { id: 'h2', module_id: 'controlling', deleted_at: null },
    hArch: { id: 'hArch', module_id: 'archiv', deleted_at: null },
    hDel: { id: 'hDel', module_id: 'controlling', deleted_at: '2026-11-03T00:00:00Z' },
  };
  const parts: Record<string, { id: string; homework_id: string; deleted_at: string | null }> = {
    ...Object.fromEntries(['u1', 'u2', 'u3', 'u4'].map((id) => [id, { id, homework_id: 'h2', deleted_at: null }])),
    uDel: { id: 'uDel', homework_id: 'h2', deleted_at: '2026-11-03T00:00:00Z' },
  };
  const items = activeHomeworkItems(hw, parts, modules);
  const scope: ProgressScope = { tasks: views, homework: items };
  const hwDone = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, { is_completed: true }]));
  const lookup = (taskRows: ReturnType<typeof done>[], hwKeys: string[]): DoneLookup => ({ tasks: completions(...taskRows), homework: hwDone(...hwKeys) });

  it('zählt nur aktive Hausaufgaben – jede als genau einen Posten, Teile nie zusätzlich', () => {
    expect(items.map((i) => i.id)).toEqual(['h1', 'h2']);
    expect(items.find((i) => i.id === 'h2')!.partIds.sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
    // 4 Aufgaben + 2 Hausaufgaben = 6 Posten (nicht 4 + 1 + 4)
    expect(scopeMemberRatio(scope, 'A', lookup([], [])).total).toBe(6);
  });

  it('abgehakte Hausaufgabe erhöht den persönlichen Fortschritt sofort', () => {
    expect(scopeMemberRatio(scope, 'A', lookup([done('t1', 'A')], []))).toMatchObject({ done: 1, total: 6, pct: 16 });
    expect(scopeMemberRatio(scope, 'A', lookup([done('t1', 'A')], ['h1:A']))).toMatchObject({ done: 2, total: 6, pct: 33 });
  });

  it('Arbeitseinheiten zählen anteilig; „done“ bleibt die Zahl vollständig erledigter Posten', () => {
    expect(homeworkCredit(items[1], 'A', hwDone('u1:A', 'u2:A'))).toBe(0.5);
    // 0,5 von 6 Posten = 8 %
    expect(scopeMemberRatio(scope, 'A', lookup([], ['u1:A', 'u2:A']))).toMatchObject({ done: 0, total: 6, pct: 8 });
    // alle vier Einheiten = Hausaufgabe erledigt, auch ohne Haken an der Hausaufgabe selbst
    expect(scopeMemberRatio(scope, 'A', lookup([], ['u1:A', 'u2:A', 'u3:A', 'u4:A']))).toMatchObject({ done: 1, pct: 16 });
  });

  it('keine Doppelzählung: Hausaufgabe UND ihre Einheiten abgehakt zählt genau 1', () => {
    expect(homeworkCredit(items[1], 'A', hwDone('h2:A', 'u1:A', 'u2:A', 'u3:A', 'u4:A'))).toBe(1);
    expect(scopeMemberRatio(scope, 'A', lookup([], ['h2:A', 'u1:A', 'u2:A', 'u3:A', 'u4:A'])).done).toBe(1);
  });

  it('gelöschte Teile und fremde Haken zählen nicht', () => {
    expect(homeworkCredit(items[1], 'A', hwDone('uDel:A', 'u1:B'))).toBe(0);
  });

  it('100 % nur, wenn wirklich alles erledigt ist (auch Hausaufgaben)', () => {
    const allTasks = ['t1', 't2', 't3', 't4'].map((t) => done(t, 'A'));
    expect(scopeMemberRatio(scope, 'A', lookup(allTasks, ['h1:A', 'u1:A', 'u2:A', 'u3:A'])).pct).toBe(95);
    expect(scopeMemberRatio(scope, 'A', lookup(allTasks, ['h1:A', 'h2:A'])).pct).toBe(100);
  });

  it('Gruppenfortschritt: alle Personen × alle Posten, Hausaufgaben eingeschlossen', () => {
    // A: 2 Aufgaben + h1 = 3; B: halbe h2 = 0,5 → 3,5 von 12 = 29 %
    const r = scopeGroupRatio(scope, ['A', 'B'], lookup([done('t1', 'A'), done('t2', 'A')], ['h1:A', 'u1:B', 'u2:B']));
    expect(r).toMatchObject({ done: 3, total: 12, pct: 29 });
  });

  it('Ausschnitt je Fach enthält die Hausaufgaben dieses Fachs', () => {
    expect(scopeForModule(scope, 'controlling').homework).toHaveLength(2);
    expect(scopeForModule(scope, 'anderes')).toEqual({ tasks: [], homework: [] });
  });

  it('ohne Hausaufgaben identisch zur bisherigen Berechnung', () => {
    const c = [done('t1', 'A'), done('t2', 'A'), done('t1', 'B')];
    const plain: ProgressScope = { tasks: views, homework: [] };
    expect(scopeMemberRatio(plain, 'A', lookup(c, []))).toEqual(memberRatio(views, 'A', completions(...c)));
    expect(scopeGroupRatio(plain, members, lookup(c, []))).toEqual(groupRatio(views, members, completions(...c)));
  });
});
