import { describe, expect, it } from 'vitest';
import { daysLeft, extractInviteCode, formatCode, isValidCode, myPlanLabel, normalizeCode, OFFERS, passwordProblem, plusLabel, GROUP_LIMITS, TIERS } from '../app/api';

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
    expect(TIERS.map((p) => p.price)).toEqual(['0 €', '2,49 €', '4,99 €']);
    expect(Object.values(OFFERS).map((o) => o.cents)).toEqual([249, 1199, 499, 2499]);
    expect(GROUP_LIMITS).toEqual({ members: 8, homework: 50, studyEntries: 100, documents: 0 });
  });
  it('Plus-Anzeige', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(plusLabel({ has_plus: false, plus_until: null }, now)).toBe('Kein Gruppenpass');
    expect(plusLabel({ has_plus: false, plus_until: null, kind: 'solo' }, now)).toBe('Nur lesen');
    expect(plusLabel({ has_plus: true, plus_until: null }, now)).toBe('Gruppenpass aktiv');
    expect(plusLabel({ has_plus: true, plus_until: '2026-11-14T12:00:00Z' }, now)).toBe('Gruppenpass endet in 3 Tagen');
    expect(plusLabel({ has_plus: true, plus_until: '2027-03-01T12:00:00Z', kind: 'solo' }, now)).toMatch(/^Zugang bis 1\. März 2027$/);
    expect(daysLeft('2026-11-12T13:00:00Z', now)).toBe(2);
    expect(myPlanLabel({ plan: 'trial', plan_until: '2026-11-25T12:00:00Z', trial_used: true, level: 'solo' }, now)).toBe('Testphase · noch 14 Tage');
    expect(myPlanLabel({ plan: null, plan_until: null, trial_used: true, level: null }, now)).toBe('Testphase beendet');
    expect(myPlanLabel({ plan: 'group_semester', plan_until: null, trial_used: false, level: 'group' }, now)).toBe('Gruppe · 6 Monate');
  });
  it('Passwortregeln', () => {
    expect(passwordProblem('kurz1')).not.toBeNull();
    expect(passwordProblem('nurbuchstaben')).not.toBeNull();
    expect(passwordProblem('sicheresPasswort1')).toBeNull();
  });
});
