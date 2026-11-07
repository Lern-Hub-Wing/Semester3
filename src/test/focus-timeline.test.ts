import { describe, expect, it } from 'vitest';
import { elapsedSec, formatClock, formatStudyTime, initialFocusState, isFinished, nextPhase, pause, progressOf, remainingSec, reset, start } from '../lib/focus';
import { buildTimeline, dayPosition, phaseSpan } from '../lib/timeline';
import { activeTaskViews } from '../lib/progress';
import { byId, entry, exam as makeExam, member, mod, task } from './fixtures';

describe('Fokus-Timer', () => {
  const t0 = 1_800_000_000_000;

  it('berechnet die Restzeit aus dem Endzeitpunkt (kein Herunterzählen)', () => {
    const s = start(initialFocusState(25), t0);
    expect(remainingSec(s, t0)).toBe(1500);
    expect(remainingSec(s, t0 + 61_000)).toBe(1439);
    // Nach langer Abwesenheit (Handy gesperrt) sofort korrekt
    expect(remainingSec(s, t0 + 3_600_000)).toBe(0);
    expect(isFinished(s, t0 + 1_500_000)).toBe(true);
  });

  it('pausiert und setzt mit der verbleibenden Zeit fort', () => {
    const running = start(initialFocusState(25), t0);
    const paused = pause(running, t0 + 600_000);
    expect(paused.endsAt).toBeNull();
    expect(remainingSec(paused, t0 + 9_999_999)).toBe(900);
    const resumed = start(paused, t0 + 700_000);
    expect(remainingSec(resumed, t0 + 700_000)).toBe(900);
    expect(resumed.startedAt).toBe(t0); // Startzeit der Phase bleibt
    expect(elapsedSec(resumed, t0 + 760_000)).toBe(660);
    expect(progressOf(resumed, t0 + 760_000)).toBeCloseTo(0.44, 2);
  });

  it('wechselt Fokus → Pause → Fokus und setzt zurück', () => {
    const s = start(initialFocusState(50), t0);
    const br = nextPhase(s, 50, 10);
    expect(br.phase).toBe('break');
    expect(br.durationSec).toBe(600);
    expect(br.endsAt).toBeNull();
    expect(nextPhase(br, 50, 10).phase).toBe('focus');
    expect(remainingSec(reset(s), t0 + 99_999)).toBe(3000);
  });

  it('formatiert Uhr und Lernzeit', () => {
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(59)).toBe('00:59');
    expect(formatClock(5400)).toBe('1:30:00');
    expect(formatStudyTime(1500)).toBe('25 Min.');
    expect(formatStudyTime(19_440)).toBe('5,4 Std.');
  });
});

describe('Semester-Timeline', () => {
  const ctrl = mod('ctrl');
  const modules = [mod('werk'), ctrl, mod('konst')];
  const members = [member('a'), member('b'), member('c')];
  const entries = byId(entry('e1', ctrl.id, '2026-12-01'), entry('e2', ctrl.id, '2026-12-15'));
  const tasks = byId(task('t1', 'e1'), task('t2', 'e2'));
  const exam = makeExam('x1', '2027-01-18T13:00:00.000Z', '2027-01-18T14:30:00.000Z', { module_id: ctrl.id });
  const views = activeTaskViews({ modules: byId(...modules), topics: {}, entries, tasks });

  it('baut Lernphasen, Prüfungen und Wochen aus echten Daten', () => {
    const t = buildTimeline({ modules, views, exams: [exam], completions: {}, memberIds: members.map((m) => m.id), today: '2026-11-25' });
    const row = t.rows.find((r) => r.module.id === ctrl.id)!;
    expect(row.phase).toEqual({ from: '2026-12-01', to: '2026-12-15' });
    expect(row.exams[0].date).toBe('2027-01-18');
    expect(row.group.total).toBe(2 * members.length);
    expect(t.start).toBe('2026-11-23'); // Montag der aktuellen Woche
    expect(t.weeks[0].kw).toBe(48);
    expect(t.days % 7).toBe(0);
    expect(dayPosition(t, '2027-01-18')).not.toBeNull();
    const span = phaseSpan(t, '2026-12-01', '2026-12-15')!;
    expect(span.width).toBeCloseTo(15 / t.days, 5);
    // Module ohne Lerntage haben keine Phase (aber ggf. eine Prüfung)
    expect(t.rows.filter((r) => r.module.id !== ctrl.id).every((r) => r.phase === null)).toBe(true);
  });

  it('zeigt ohne Daten mindestens einige Wochen ab heute', () => {
    const t = buildTimeline({ modules, views: [], exams: [], completions: {}, memberIds: [], today: '2026-11-25', minWeeks: 6 });
    expect(t.weeks).toHaveLength(6);
  });
});
