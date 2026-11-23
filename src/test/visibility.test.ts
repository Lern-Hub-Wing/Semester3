import { beforeEach, describe, expect, it } from 'vitest';
import { activityVisible, cacheable, canSee, filterRows, filterSnapshot, moduleVisibilityChanged } from '../store/visibility';
import { useSession } from '../store/session';

const LUK = '11111111-1111-4111-8111-000000000001';
const DIANA = '11111111-1111-4111-8111-000000000002';
const CHEM = 'c0000000-0000-4000-8000-000000000001';
const OPEN = 'c0000000-0000-4000-8000-000000000002';

const modules = [
  { id: CHEM, name: 'Chemie', participants: [LUK] },
  { id: OPEN, name: 'Mathe', participants: null },
];
const exams = [
  { id: 'ex-chem', module_id: CHEM },
  { id: 'ex-open', module_id: OPEN },
];
const entries = [
  { id: 'e-chem', module_id: CHEM },
  { id: 'e-open', module_id: OPEN },
];
const tasks = [
  { id: 't-chem', study_entry_id: 'e-chem' },
  { id: 't-open', study_entry_id: 'e-open' },
];
const completions = [
  { task_id: 't-chem', member_id: LUK },
  { task_id: 't-open', member_id: LUK },
];

// Reihenfolge absichtlich durcheinander: Fächer müssen trotzdem zuerst ausgewertet werden
const run = () => filterSnapshot(['task_completions', 'tasks', 'exams', 'study_entries', 'modules'] as any, [completions, tasks, exams, entries, modules] as any) as any[][];

describe('Sichtbarkeit: Wer schreibt die Prüfung?', () => {
  beforeEach(() => useSession.getState().select(null));

  it('canSee: offene Fächer für alle, eingeschränkte nur für Teilnehmende', () => {
    expect(canSee(null, null)).toBe(true);
    expect(canSee([], DIANA)).toBe(true);
    expect(canSee([LUK], LUK)).toBe(true);
    expect(canSee([LUK], DIANA)).toBe(false);
    expect(canSee([LUK], null)).toBe(false);
  });

  it('Luk sieht Chemie samt Prüfung, Lerntagen, Aufgaben und Haken', () => {
    useSession.getState().select(LUK);
    const [c, t, ex, en, m] = run();
    expect(m.map((r) => r.id)).toEqual([CHEM, OPEN]);
    expect(ex).toHaveLength(2);
    expect(en).toHaveLength(2);
    expect(t).toHaveLength(2);
    expect(c).toHaveLength(2);
  });

  it('Diana sieht von Chemie gar nichts', () => {
    useSession.getState().select(DIANA);
    const [c, t, ex, en, m] = run();
    expect(m.map((r) => r.id)).toEqual([OPEN]);
    expect(ex.map((r) => r.id)).toEqual(['ex-open']);
    expect(en.map((r) => r.id)).toEqual(['e-open']);
    expect(t.map((r) => r.id)).toEqual(['t-open']);
    expect(c.map((r) => r.task_id)).toEqual(['t-open']);
    expect(activityVisible({ entity_type: 'exams', entity_id: 'ex-chem' })).toBe(false);
    expect(activityVisible({ entity_type: 'tasks', entity_id: 't-chem' })).toBe(false);
    expect(activityVisible({ entity_type: 'task_completions', entity_id: `t-chem:${LUK}` })).toBe(false);
    expect(activityVisible({ entity_type: 'exams', entity_id: 'ex-open' })).toBe(true);
    // Live-Änderungen werden genauso gefiltert
    expect(filterRows('study_entries', [{ id: 'e-new', module_id: CHEM }])).toEqual([]);
    expect(filterRows('homework', [{ id: 'hw', module_id: CHEM }])).toEqual([]);
    expect(filterRows('homework_parts', [{ id: 'p', homework_id: 'hw' }])).toEqual([]);
  });

  it('ohne gewähltes Profil nur offene Fächer', () => {
    const [, , , , m] = run();
    expect(m.map((r) => r.id)).toEqual([OPEN]);
  });

  it('eingeschränkte Inhalte landen nie im Gerätespeicher – auch nicht für Luk', () => {
    useSession.getState().select(LUK);
    run();
    expect(cacheable('modules', { id: CHEM })).toBe(false);
    expect(cacheable('study_entries', { id: 'e-chem', module_id: CHEM })).toBe(false);
    expect(cacheable('tasks', { id: 't-chem', study_entry_id: 'e-chem' })).toBe(false);
    expect(cacheable('task_completions', { task_id: 't-chem' })).toBe(false);
    expect(cacheable('modules', { id: OPEN })).toBe(true);
    expect(cacheable('tasks', { id: 't-open', study_entry_id: 'e-open' })).toBe(true);
  });

  it('erkennt, wenn sich die Sichtbarkeit eines Fachs ändert (dann neu laden)', () => {
    useSession.getState().select(DIANA);
    run();
    expect(moduleVisibilityChanged({ id: OPEN, participants: null, name: 'Mathe neu' })).toBe(false);
    expect(moduleVisibilityChanged({ id: OPEN, participants: [LUK] })).toBe(true);
    expect(moduleVisibilityChanged({ id: CHEM, participants: null })).toBe(true);
    expect(moduleVisibilityChanged({ id: CHEM, participants: [LUK] })).toBe(false);
  });
});
