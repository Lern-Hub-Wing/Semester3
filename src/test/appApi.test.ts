import { describe, expect, it } from 'vitest';
import { extractInviteCode, formatCode, isValidCode, normalizeCode, passwordProblem, plusLabel, GROUP_LIMITS, PLANS } from '../app/api';

describe('Einladungscodes', () => {
  it('normalisiert Eingaben', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(formatCode('abcd2345')).toBe('ABCD-2345');
  });
  it('lehnt verwechselbare Zeichen ab (0, O, 1, I)', () => {
    expect(isValidCode('ABCD2345')).toBe(true);
    expect(isValidCode('ABCD0345')).toBe(false);
    expect(isValidCode('ABCDI345')).toBe(false);
    expect(isValidCode('ABC')).toBe(false);
  });
  it('liest den Code aus Links und Text', () => {
    expect(extractInviteCode('https://x.github.io/Semester3/app/#/beitreten/KVULNKKE')).toBe('KVULNKKE');
    expect(extractInviteCode('Tritt bei – Code KVUL-NKKE')).toBe('KVULNKKE');
    expect(extractInviteCode('#/lernplan')).toBeNull();
  });
});

describe('Tarife und Grenzen', () => {
  it('Preise wie vorgegeben', () => {
    expect(PLANS.map((p) => p.price)).toEqual(['0 €', '4,99 €', '19,99 €']);
    expect(GROUP_LIMITS).toEqual({ members: 8, homework: 50, studyEntries: 100, documents: 0 });
  });
  it('Plus-Anzeige', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(plusLabel({ has_plus: false, plus_until: null }, now)).toBe('Kein Plus');
    expect(plusLabel({ has_plus: true, plus_until: null }, now)).toBe('Plus aktiv');
    expect(plusLabel({ has_plus: true, plus_until: '2026-11-14T12:00:00Z' }, now)).toBe('Plus endet in 3 Tagen');
    expect(plusLabel({ has_plus: true, plus_until: '2027-03-01T12:00:00Z' }, now)).toMatch(/^Plus bis 1\. März 2027$/);
  });
  it('Passwortregeln', () => {
    expect(passwordProblem('kurz1')).not.toBeNull();
    expect(passwordProblem('nurbuchstaben')).not.toBeNull();
    expect(passwordProblem('sicheresPasswort1')).toBeNull();
  });
});
