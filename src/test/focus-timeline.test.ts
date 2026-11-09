import { describe, expect, it } from 'vitest';
import { elapsedSec, formatClock, formatStudyTime, initialFocusState, isFinished, markFinished, nextPhase, pause, phaseTitle, progressOf, remainingSec, reset, restartSession, sanitizeRhythm, start } from '../lib/focus';
import { rhythmOf, sanitizeSettings } from '../store/focus';
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
    const r = { focus: 50, short: 10, long: 30, rounds: 4 };
    const s = start(initialFocusState(50), t0);
    const br = nextPhase(s, r);
    expect(br.phase).toBe('break');
    expect(br.long).toBe(false);
    expect(br.durationSec).toBe(600);
    expect(br.endsAt).toBeNull();
    const f2 = nextPhase(br, r);
    expect(f2.phase).toBe('focus');
    expect(f2.round).toBe(2);
    expect(remainingSec(reset(s), t0 + 99_999)).toBe(3000);
  });

  it('Pomodoro: lange Pause nach der letzten Runde, danach wieder Runde 1', () => {
    const r = { focus: 25, short: 5, long: 15, rounds: 4 };
    let s = initialFocusState(25);
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(phaseTitle(s, r));
      s = nextPhase(s, r);
    }
    expect(seen).toEqual([
      'Fokus · Runde 1 von 4', 'Kurze Pause', 'Fokus · Runde 2 von 4', 'Kurze Pause', 'Fokus · Runde 3 von 4', 'Kurze Pause', 'Fokus · Runde 4 von 4', 'Lange Pause', 'Fokus · Runde 1 von 4',
    ]);
    // Lange Pause dauert 15 Min.
    let t = initialFocusState(25);
    for (let i = 0; i < 7; i++) t = nextPhase(t, r);
    expect(t.long).toBe(true);
    expect(t.durationSec).toBe(900);
    expect(restartSession(t, r)).toMatchObject({ phase: 'focus', round: 1, durationSec: 1500 });
  });

  it('Pausen zählen nicht als Lernzeit; beendete Phase wartet ohne Auto-Wechsel', () => {
    const s = start(initialFocusState(25), t0);
    const paused = pause(s, t0 + 300_000);
    // 10 Min. Pause vergehen – Lernzeit bleibt 5 Min.
    expect(elapsedSec(paused, t0 + 900_000)).toBe(300);
    const done = markFinished(start(initialFocusState(1), t0));
    expect(remainingSec(done, t0)).toBe(0);
    expect(start(done, t0).endsAt).toBeNull();
  });

  it('prüft Rhythmus und Einstellungen (inkl. alter Version)', () => {
    expect(sanitizeRhythm({ focus: 999, short: -3, long: 'x', rounds: 4.4 })).toEqual({ focus: 180, short: 1, long: 15, rounds: 4 });
    const old = sanitizeSettings({ presetIndex: 1, sound: false });
    expect(old.preset).toBe('intensiv');
    expect(old.sound).toBe(false);
    expect(old.autoStartOnOpen).toBe(false);
    expect(rhythmOf(old)).toEqual({ focus: 50, short: 10, long: 30, rounds: 4 });
    expect(rhythmOf(sanitizeSettings({ preset: 'saved:gibtsnicht' })).focus).toBe(25);
  });

  it('formatiert Uhr und Lernzeit', () => {
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(59)).toBe('00:59');
    expect(formatClock(5400)).toBe('1:30:00');
    expect(formatClock(1500, false)).toBe('25');
    expect(formatClock(30, false)).toBe('1');
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
