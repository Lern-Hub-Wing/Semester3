import { describe, expect, it } from 'vitest';
import { budgets, fallbackUnits, sanitizeUnits, schedule, studyDays, type PlanInput } from '../lib/aiplan';

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  status: 'studium',
  goal: 'gut',
  dayPart: 'nachmittags',
  weekdays: [1, 2, 3, 4, 5],
  minutesPerDay: 120,
  sessionMinutes: 45,
  start: '2026-11-23', // Montag
  offDays: [],
  methods: [],
  notes: '',
  subjects: [
    { id: 'math', name: 'Mathe', examDate: '2026-12-18', confidence: 2, topics: [{ title: 'Integrale', difficulty: 'schwer' }, { title: 'Reihen', difficulty: 'mittel' }] },
    { id: 'phys', name: 'Physik', examDate: '2026-12-11', confidence: 4, topics: [{ title: 'Optik', difficulty: 'leicht' }] },
  ],
  ...over,
});

describe('KI-Lernplan: Planung', () => {
  it('Lerntage: nur gewählte Wochentage, ohne freie Tage, vor der Prüfung', () => {
    const d = studyDays({ ...base(), offDays: ['2026-11-25'] }, '2026-11-30');
    expect(d.map((x) => x.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-26', '2026-11-27']);
  });

  it('Lernzeit wird nach Schwierigkeit und Unsicherheit verteilt', () => {
    const b = budgets(base());
    expect(b.math).toBeGreaterThan(b.phys);
    // gesamte Kapazität bis zur letzten Prüfung (19 Werktage × 120 Min.) wird verteilt
    expect(b.math + b.phys).toBeCloseTo(19 * 120, -1);
  });

  it('nie am oder nach dem Prüfungstag, Tageskapazität und max. 2 Fächer je Tag', () => {
    const input = base();
    const plan = schedule(input, fallbackUnits(input, budgets(input)));
    for (const day of plan.days) {
      expect(day.items.reduce((a, i) => a + i.minutes, 0)).toBeLessThanOrEqual(input.minutesPerDay + 10);
      expect(new Set(day.items.map((i) => i.subjectId)).size).toBeLessThanOrEqual(2);
      for (const it of day.items) expect(day.date < input.subjects.find((s) => s.id === it.subjectId)!.examDate).toBe(true);
    }
    expect(plan.overflow).toEqual([]);
  });

  it('Wiederholung und Probeklausur kommen zum Schluss, Probeklausur als letzte Einheit', () => {
    const input = base();
    const plan = schedule(input, fallbackUnits(input, budgets(input)));
    const math = plan.days.flatMap((d) => d.items.filter((i) => i.subjectId === 'math').map((i) => ({ ...i, date: d.date })));
    const firstReview = math.findIndex((i) => i.kind === 'review');
    expect(math.slice(0, firstReview).every((i) => i.kind === 'learn' || i.kind === 'practice')).toBe(true);
    expect(math[math.length - 1].kind).toBe('mock_exam');
  });

  it('zu wenig Zeit: Rest wird als „passt nicht“ gemeldet; Grenze für Lerntage greift', () => {
    const tight = base({ minutesPerDay: 30, start: '2026-12-08' });
    const plan = schedule(tight, fallbackUnits(tight, budgets(tight)));
    expect(plan.overflow.length).toBeGreaterThan(0);
    const capped = schedule(base(), fallbackUnits(base(), budgets(base())), { maxEntries: 5 });
    expect(capped.entries).toBeLessThanOrEqual(5);
  });

  it('Antwort der KI wird geprüft: fremde Fächer und kaputte Einheiten fliegen raus', () => {
    const raw = {
      subjects: [
        { subject_id: 'math', units: [{ title: 'Integrale: Substitution', topic: 'Integrale', minutes: 999, kind: 'learn' }, { title: '', minutes: 30, kind: 'learn' }, { title: 'x', minutes: 30, kind: 'party' }] },
        { subject_id: 'hack', units: [{ title: 'X', topic: '', minutes: 30, kind: 'learn' }] },
      ],
    };
    expect(sanitizeUnits(raw, base())).toEqual([{ subjectId: 'math', units: [{ title: 'Integrale: Substitution', topic: 'Integrale', minutes: 180, kind: 'learn' }] }]);
    expect(sanitizeUnits({ nope: 1 }, base())).toBeNull();
  });
});
