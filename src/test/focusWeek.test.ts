import { describe, expect, it } from 'vitest';
import { focusByDay, formatFocusDuration, secondsWithin, teamFocusWeek, weekRange, type FocusSessionLike } from '../lib/focusWeek';

let n = 0;
const s = (member_id: string, started_at: string, ended_at: string, duration_seconds?: number): FocusSessionLike => ({
  id: `s${++n}`,
  member_id,
  started_at,
  ended_at,
  duration_seconds: duration_seconds ?? Math.round((Date.parse(ended_at) - Date.parse(started_at)) / 1000),
});

describe('Fokuszeit je Kalenderwoche (Europe/Berlin)', () => {
  it('Woche läuft von Montag bis Sonntag', () => {
    // Dienstag, 10. Nov. 2026
    expect(weekRange('2026-11-10')).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    // Sonntag gehört noch zur selben Woche, Montag zur nächsten
    expect(weekRange('2026-11-15').from).toBe('2026-11-09');
    expect(weekRange('2026-11-16').from).toBe('2026-11-16');
  });

  it('summiert die gespeicherte Fokuszeit je Person und für die Gruppe', () => {
    const sessions = [
      s('A', '2026-11-09T09:00:00Z', '2026-11-09T09:25:00Z'),
      s('A', '2026-11-10T09:00:00Z', '2026-11-10T09:50:00Z'),
      s('B', '2026-11-11T14:00:00Z', '2026-11-11T14:25:00Z'),
    ];
    const w = teamFocusWeek(sessions, ['A', 'B', 'C'], '2026-11-10');
    expect(w.members.map((m) => m.seconds)).toEqual([75 * 60, 25 * 60, 0]);
    expect(w.total).toBe(100 * 60);
    expect(w.members[0]!.perDay.slice(0, 2)).toEqual([25 * 60, 50 * 60]);
  });

  it('zählt Sitzungen der Vorwoche und der Folgewoche nicht mit', () => {
    const sessions = [
      s('A', '2026-11-08T10:00:00Z', '2026-11-08T10:25:00Z'), // Sonntag davor
      s('A', '2026-11-16T10:00:00Z', '2026-11-16T10:25:00Z'), // Montag danach
    ];
    expect(teamFocusWeek(sessions, ['A'], '2026-11-10').total).toBe(0);
  });

  it('teilt eine Sitzung über Mitternacht auf beide Tage auf', () => {
    // 23:40–00:20 Berliner Zeit (Winterzeit = UTC+1)
    const x = s('A', '2026-11-10T22:40:00Z', '2026-11-10T23:20:00Z');
    const d = focusByDay([x], ['2026-11-10', '2026-11-11']);
    expect(Math.round(d.get('2026-11-10')!)).toBe(20 * 60);
    expect(Math.round(d.get('2026-11-11')!)).toBe(20 * 60);
  });

  it('teilt eine Sitzung über die Wochengrenze (Sonntag → Montag) korrekt', () => {
    // Sonntag 23:30 bis Montag 00:30 Berliner Zeit
    const x = s('A', '2026-11-15T22:30:00Z', '2026-11-15T23:30:00Z');
    expect(teamFocusWeek([x], ['A'], '2026-11-15').total).toBe(30 * 60);
    expect(teamFocusWeek([x], ['A'], '2026-11-16').total).toBe(30 * 60);
  });

  it('Pausen zählen nicht: nur duration_seconds, anteilig verteilt', () => {
    // 60 Minuten Zeitspanne, davon 40 Minuten Fokus, halb vor / halb nach Mitternacht
    const x = s('A', '2026-11-10T22:30:00Z', '2026-11-10T23:30:00Z', 40 * 60);
    const d = focusByDay([x], ['2026-11-10', '2026-11-11']);
    expect(Math.round(d.get('2026-11-10')!)).toBe(20 * 60);
    expect(Math.round(d.get('2026-11-11')!)).toBe(20 * 60);
    expect(Math.round(d.get('2026-11-10')! + d.get('2026-11-11')!)).toBe(40 * 60);
  });

  it('zählt dieselbe Sitzung nie doppelt', () => {
    const x = s('A', '2026-11-10T09:00:00Z', '2026-11-10T09:25:00Z');
    expect(teamFocusWeek([x, { ...x }], ['A'], '2026-11-10').total).toBe(25 * 60);
  });

  it('beachtet die Zeitumstellung (Sommerzeit: Montag beginnt um 22:00 UTC)', () => {
    // Montag, 6. Juli 2026, 00:10–00:35 Berliner Sommerzeit = Sonntag 22:10–22:35 UTC
    const x = s('A', '2026-07-05T22:10:00Z', '2026-07-05T22:35:00Z');
    expect(teamFocusWeek([x], ['A'], '2026-07-06').total).toBe(25 * 60);
    expect(teamFocusWeek([x], ['A'], '2026-07-05').total).toBe(0);
  });

  it('ignoriert unplausible Zeilen (Ende vor Beginn)', () => {
    expect(secondsWithin({ id: 'x', member_id: 'A', started_at: '2026-11-10T10:00:00Z', ended_at: '2026-11-10T09:00:00Z', duration_seconds: 600 }, 0, Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it('formatiert Stunden und Minuten ausgeschrieben', () => {
    expect(formatFocusDuration(8 * 3600 + 25 * 60)).toBe('8 Std. 25 Min.');
    expect(formatFocusDuration(40 * 60)).toBe('40 Min.');
    expect(formatFocusDuration(2 * 3600)).toBe('2 Std.');
    expect(formatFocusDuration(0)).toBe('0 Min.');
  });
});
