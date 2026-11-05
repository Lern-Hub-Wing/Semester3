import { describe, expect, it } from 'vitest';
import { getCountdownState, splitDuration, upcomingExams } from '../lib/countdown';
import { exam } from './fixtures';

// Werkstoffkunde 06.01.2027 14:00–15:30 Berlin = 13:00–14:30 UTC
const w = exam('werkstoff', '2027-01-06T13:00:00Z', '2027-01-06T14:30:00Z');
const or = exam('or', '2027-01-08T07:30:00Z', '2027-01-08T09:00:00Z');
const deleted = exam('weg', '2027-01-07T07:30:00Z', '2027-01-07T09:00:00Z', { deleted_at: '2026-11-01T00:00:00Z' });

describe('Test I: Prüfungscountdown', () => {
  it('zeigt die nächste Prüfung mit exakter Restzeit', () => {
    const now = Date.parse('2027-01-05T12:59:30Z');
    const s = getCountdownState([or, w, deleted], now);
    expect(s.kind).toBe('upcoming');
    if (s.kind !== 'upcoming') return;
    expect(s.exam.id).toBe('werkstoff');
    expect(splitDuration(s.msUntilStart)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 30 });
  });

  it('aktualisiert Sekunden korrekt (berechnet, nicht gezählt)', () => {
    const a = getCountdownState([w], Date.parse('2027-01-06T12:59:59.000Z'));
    const b = getCountdownState([w], Date.parse('2027-01-06T12:59:59.999Z'));
    expect(a.kind === 'upcoming' && splitDuration(a.msUntilStart).seconds).toBe(1);
    expect(b.kind === 'upcoming' && splitDuration(b.msUntilStart).seconds).toBe(0);
  });

  it('zeigt „Prüfung läuft“ während der Prüfung', () => {
    const s = getCountdownState([w, or], Date.parse('2027-01-06T13:30:00Z'));
    expect(s.kind).toBe('running');
    if (s.kind === 'running') {
      expect(s.exam.id).toBe('werkstoff');
      expect(splitDuration(s.msUntilEnd)).toEqual({ days: 0, hours: 1, minutes: 0, seconds: 0 });
    }
  });

  it('wechselt nach Prüfungsende automatisch zur nächsten', () => {
    const s = getCountdownState([w, or], Date.parse('2027-01-06T14:30:00Z'));
    expect(s.kind === 'upcoming' && s.exam.id).toBe('or');
  });

  it('zeigt Abschluss, wenn keine Prüfung mehr kommt', () => {
    expect(getCountdownState([w, or], Date.parse('2027-02-01T00:00:00Z')).kind).toBe('finished');
    expect(getCountdownState([], Date.now()).kind).toBe('none');
  });

  it('ignoriert gelöschte Prüfungen', () => {
    expect(upcomingExams([w, or, deleted], Date.parse('2027-01-06T15:00:00Z')).map((e) => e.id)).toEqual(['or']);
  });
});
