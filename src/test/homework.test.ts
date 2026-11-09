import { describe, expect, it } from 'vitest';
import { daysUntil, distributeUnits, dueLabel, homeworkProgress, replanUnits, suggestedUnits, workWindow } from '../lib/homework';

describe('Hausaufgaben – Bearbeitungszeitraum', () => {
  it('endet am Tag VOR der Abgabe – der Abgabetag ist kein Arbeitstag', () => {
    const w = workWindow('2026-12-01', '2026-12-05');
    expect(w.start).toBe('2026-12-01');
    expect(w.end).toBe('2026-12-04');
    expect(w.days).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']);
    expect(w.days).not.toContain('2026-12-05');
  });

  it('beginnt frühestens am angegebenen Starttag', () => {
    const w = workWindow('2026-12-01', '2026-12-10', '2026-12-06');
    expect(w.days).toEqual(['2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09']);
    // Starttag in der Vergangenheit → ab heute
    expect(workWindow('2026-12-01', '2026-12-03', '2026-11-20').start).toBe('2026-12-01');
  });

  it('hat keine Arbeitstage, wenn heute fällig oder überfällig', () => {
    expect(workWindow('2026-12-05', '2026-12-05').days).toEqual([]);
    expect(workWindow('2026-12-06', '2026-12-05').days).toEqual([]);
    // Morgen fällig → nur heute
    expect(workWindow('2026-12-04', '2026-12-05').days).toEqual(['2026-12-04']);
  });

  it('beschreibt die Restzeit', () => {
    expect(daysUntil('2026-12-05', '2026-12-01')).toBe(4);
    expect(dueLabel('2026-12-01', '2026-12-01')).toBe('heute fällig');
    expect(dueLabel('2026-12-02', '2026-12-01')).toBe('morgen fällig');
    expect(dueLabel('2026-11-28', '2026-12-01')).toBe('seit 3 Tagen überfällig');
  });
});

describe('Hausaufgaben – Verteilung', () => {
  const w = workWindow('2026-12-01', '2026-12-15'); // 14 Arbeitstage: 1.–14.12.

  it('verteilt gleichmäßig, nie auf den Abgabetag, mit Puffer vor der Abgabe', () => {
    const d = distributeUnits({ count: 3, window: w, load: {}, examDays: [], priority: 2 });
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    for (const x of d) {
      expect(x >= '2026-12-01' && x <= '2026-12-13').toBe(true); // 14.12. = Puffer
    }
    expect(d).not.toContain('2026-12-15');
  });

  it('meidet volle Tage und Prüfungstage', () => {
    const load = { '2026-12-01': 5, '2026-12-02': 5, '2026-12-03': 5, '2026-12-04': 5 };
    const d = distributeUnits({ count: 2, window: w, load, examDays: ['2026-12-08', '2026-12-09'], priority: 2 });
    expect(d.some((x) => x in load)).toBe(false);
    expect(d).not.toContain('2026-12-08');
    expect(d).not.toContain('2026-12-09');
  });

  it('legt bei sehr kurzem Zeitraum mehrere Einheiten auf einen Tag', () => {
    const short = workWindow('2026-12-04', '2026-12-06'); // 4. und 5.12.
    const d = distributeUnits({ count: 3, window: short, load: {}, examDays: [], priority: 2 });
    expect(d).toHaveLength(3);
    expect(d.every((x) => x === '2026-12-04' || x === '2026-12-05')).toBe(true);
  });

  it('plant nichts ohne Arbeitstage', () => {
    expect(distributeUnits({ count: 2, window: workWindow('2026-12-05', '2026-12-05'), load: {}, examDays: [], priority: 2 })).toEqual([]);
  });

  it('schlägt Einheiten aus dem Aufwand vor (ohne Unteraufgaben zu erfinden)', () => {
    expect(suggestedUnits(150, 10)).toBe(3);
    expect(suggestedUnits(null, 10)).toBe(2);
    expect(suggestedUnits(600, 2)).toBe(2);
  });
});

describe('Hausaufgaben – Neuplanung bei neuem Abgabedatum', () => {
  const units = [
    { id: 'u1', planned_date: '2026-12-03' },
    { id: 'u2', planned_date: '2026-12-08' },
    { id: 'u3', planned_date: '2026-12-09' },
  ];

  it('verschiebt nur Einheiten, die nicht mehr passen; erledigte bleiben', () => {
    const w = workWindow('2026-12-01', '2026-12-08'); // Arbeitstage bis 7.12.
    const changes = replanUnits(units, w, { completedIds: new Set(['u2']), all: false, load: {}, examDays: [], priority: 2 });
    expect(changes.map((c) => c.id)).toEqual(['u3']);
    expect(changes[0]!.to <= '2026-12-07').toBe(true);
    // u2 ist erledigt → wird trotz neuem Termin nicht angefasst
    expect(changes.find((c) => c.id === 'u2')).toBeUndefined();
  });

  it('kann alle offenen Einheiten neu verteilen und behält die IDs', () => {
    const w = workWindow('2026-12-01', '2026-12-20');
    const changes = replanUnits(units, w, { completedIds: new Set(), all: true, load: {}, examDays: [], priority: 2 });
    for (const c of changes) expect(['u1', 'u2', 'u3']).toContain(c.id);
    for (const c of changes) expect(c.to < '2026-12-20').toBe(true);
  });
});

describe('Hausaufgaben – Fortschritt je Person', () => {
  it('zählt Teile; die erledigte Hausaufgabe zählt als komplett', () => {
    const parts = [{ id: 'a' }, { id: 'b' }];
    expect(homeworkProgress({ id: 'h' }, parts, (id) => id === 'a')).toMatchObject({ done: false, completed: 1, total: 2, ratio: 0.5 });
    expect(homeworkProgress({ id: 'h' }, parts, (id) => id === 'h')).toMatchObject({ done: true, completed: 2, ratio: 1 });
    expect(homeworkProgress({ id: 'h' }, [], () => false)).toMatchObject({ completed: 0, total: 1 });
  });
});
