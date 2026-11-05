import { describe, expect, it } from 'vitest';
import {
  addDaysISO, addMonthsISO, diffDaysISO, instantToZoned, isValidISODate, isoWeekNumber, monthGrid,
  relativeDayLabel, startOfWeekISO, todayISO, weekdayIndex, zonedToInstant,
} from '../lib/time';

describe('Zeitzone Europe/Berlin', () => {
  it('rechnet Ortszeit im Winter (MEZ) korrekt um', () => {
    expect(zonedToInstant('2027-01-06', '14:00').toISOString()).toBe('2027-01-06T13:00:00.000Z');
  });
  it('rechnet Ortszeit im Sommer (MESZ) korrekt um', () => {
    expect(zonedToInstant('2026-07-01', '14:00').toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });
  it('berücksichtigt die Zeitumstellung', () => {
    // 29.03.2026: 02:00 → 03:00. 01:30 MEZ und 03:30 MESZ liegen 1 Stunde auseinander.
    const a = zonedToInstant('2026-03-29', '01:30').getTime();
    const b = zonedToInstant('2026-03-29', '03:30').getTime();
    expect(b - a).toBe(60 * 60 * 1000);
  });
  it('wandelt Zeitpunkte für Formulare zurück', () => {
    expect(instantToZoned('2027-01-08T07:30:00Z')).toEqual({ date: '2027-01-08', time: '08:30' });
  });
  it('bestimmt "heute" in Berlin', () => {
    expect(todayISO(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
    expect(todayISO(new Date('2026-11-05T22:59:00Z'))).toBe('2026-11-05');
  });
});

describe('Kalenderrechnung', () => {
  it('addiert Tage und Monate', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(diffDaysISO('2026-12-24', '2027-01-06')).toBe(13);
  });
  it('Wochen beginnen am Montag', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0); // Montag
    expect(startOfWeekISO('2026-11-08')).toBe('2026-11-02');
    expect(isoWeekNumber('2027-01-06')).toBe(1);
    expect(isoWeekNumber('2026-12-31')).toBe(53);
  });
  it('erzeugt ein 6-Wochen-Monatsraster', () => {
    const grid = monthGrid('2026-11-15');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-10-26');
    expect(grid).toContain('2026-11-30');
  });
  it('validiert Datumsangaben', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-1-01')).toBe(false);
  });
  it('liefert relative Bezeichnungen', () => {
    expect(relativeDayLabel('2026-11-05', '2026-11-05')).toBe('Heute');
    expect(relativeDayLabel('2026-11-04', '2026-11-05')).toBe('Gestern');
    expect(relativeDayLabel('2026-11-08', '2026-11-05')).toBe('In 3 Tagen');
  });
});
