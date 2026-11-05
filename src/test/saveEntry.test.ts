import { describe, expect, it } from 'vitest';
import { planTaskChanges } from '../store/actions';
import { byId, task } from './fixtures';

const tasks = byId(
  task('t1', 'e1', { title: 'Anbauverfahren verstehen', sort_order: 1 }),
  task('t2', 'e1', { title: 'Stufenleiterverfahren verstehen', sort_order: 2 }),
  task('t3', 'e1', { title: 'Übungsaufgaben lösen', sort_order: 3 }),
  task('other', 'e2', { title: 'Andere Aufgabe', sort_order: 1 }),
);
let n = 0;
const newId = () => `new-${++n}`;

describe('Lerntag speichern: Aufgaben werden nie versehentlich gelöscht', () => {
  it('Regression CI: Editor ohne geladene Aufgaben löscht keine bestehenden', () => {
    // So sah der Entwurf aus, wenn das Formular die Aufgaben (noch) nicht kannte:
    // eine einzige Aufgabe ohne ID.
    const plan = planTaskChanges('e1', { tasks: [{ title: 'Anbauverfahren sicher beherrschen' }] }, tasks, newId);
    expect(plan.removals).toEqual([]);
    expect(plan.updates.filter((u) => 'deleted_at' in u.patch)).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });

  it('Titeländerung aktualisiert die bestehende Aufgabe (gleiche ID)', () => {
    const plan = planTaskChanges(
      'e1',
      { tasks: [{ id: 't1', title: 'Anbauverfahren sicher beherrschen' }, { id: 't2', title: 'Stufenleiterverfahren verstehen' }, { id: 't3', title: 'Übungsaufgaben lösen' }] },
      tasks,
      newId,
    );
    expect(plan).toEqual({ updates: [{ id: 't1', patch: { title: 'Anbauverfahren sicher beherrschen' } }], inserts: [], removals: [] });
  });

  it('nur ausdrücklich entfernte Aufgaben wandern in den Papierkorb', () => {
    const plan = planTaskChanges('e1', { tasks: [{ id: 't1', title: 'Anbauverfahren verstehen' }], removedTaskIds: ['t2'] }, tasks, newId);
    expect(plan.removals).toEqual(['t2']);
    // t3 fehlt im Entwurf, wurde aber nicht entfernt → bleibt
    expect(plan.removals).not.toContain('t3');
  });

  it('entfernt keine Aufgaben anderer Lerntage', () => {
    const plan = planTaskChanges('e1', { tasks: [], removedTaskIds: ['other'] }, tasks, newId);
    expect(plan.removals).toEqual([]);
  });

  it('ignoriert fremde IDs im Entwurf und leere Titel', () => {
    const plan = planTaskChanges('e1', { tasks: [{ id: 'other', title: 'X' }, { id: 't1', title: '   ' }, { title: '' }] }, tasks, newId);
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });

  it('Umsortieren ändert nur sort_order', () => {
    const plan = planTaskChanges(
      'e1',
      { tasks: [{ id: 't2', title: 'Stufenleiterverfahren verstehen' }, { id: 't1', title: 'Anbauverfahren verstehen' }, { id: 't3', title: 'Übungsaufgaben lösen' }] },
      tasks,
      newId,
    );
    expect(plan.updates).toEqual([
      { id: 't2', patch: { sort_order: 1 } },
      { id: 't1', patch: { sort_order: 2 } },
    ]);
  });
});
