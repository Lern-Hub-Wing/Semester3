import { describe, expect, it } from 'vitest';
import { digitContrast, isLightBackground, legacyStudyLook, splitStudyPatch, withSharedLook } from '../lib/clockLook';
import { DEFAULT_FOCUS_LOOK } from '../lib/focusLook';
import { DEFAULT_STUDY_MODE } from '../lib/studyMode';
import { elapsedOf, formatElapsed, pauseStopwatch, resumeStopwatch, sanitizeStopwatch, startStopwatch, STOPWATCH_MAX_SEC } from '../lib/stopwatch';

describe('Gemeinsames Uhr-Design', () => {
  it('Lernmodus übernimmt Schrift, Farbe und Hintergrund aus dem gemeinsamen Design', () => {
    const look = { ...DEFAULT_FOCUS_LOOK, font: 'mono' as const, color: '#AADCCB', background: 'gradient' as const, dim: 40, blur: 6 };
    const s = withSharedLook(DEFAULT_STUDY_MODE, look);
    expect(s).toMatchObject({ font: 'mono', color: '#AADCCB', background: 'gradient', imageDim: 40, imageBlur: 6, format: DEFAULT_STUDY_MODE.format });
  });

  it('Änderungen im Lernmodus gehen ans gemeinsame Design, eigene Felder bleiben lokal', () => {
    const { look, own } = splitStudyPatch({ color: '#FFFFFF', imageDim: 20, format: 'hm', showDate: false });
    expect(look).toEqual({ color: '#FFFFFF', dim: 20 });
    expect(own).toEqual({ format: 'hm', showDate: false });
  });

  it('übernimmt beim ersten Start einmalig das bisherige Lernmodus-Design (Vorrang)', () => {
    const store = new Map<string, string>([['studyspace.studymode.v1', JSON.stringify({ font: 'serif', color: '#F5C6A5', background: 'solid', imageDim: 10 })], ['studyspace.studymode.image.v1', 'data:image/jpeg;base64,AAA']]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(legacyStudyLook(storage)).toEqual({ font: 'serif', color: '#F5C6A5', background: 'solid', dim: 10 });
    expect(store.get('studyspace.focuslook.image.v1')).toBe('data:image/jpeg;base64,AAA');
    expect(legacyStudyLook(storage)).toBeNull(); // nur einmal
  });

  it('erkennt helle Hintergründe und zu wenig Kontrast', () => {
    expect(isLightBackground({ ...DEFAULT_FOCUS_LOOK, background: 'solid', bgColor: '#FFFFFF' })).toBe(true);
    expect(isLightBackground({ ...DEFAULT_FOCUS_LOOK, background: 'mountains' })).toBe(false);
    expect(digitContrast({ ...DEFAULT_FOCUS_LOOK, background: 'solid', bgColor: '#FFFFFF', color: '#F2F5FA' })).toBeLessThan(3);
    expect(digitContrast({ ...DEFAULT_FOCUS_LOOK, background: 'solid', bgColor: '#0C1018', color: '#F2F5FA' })).toBeGreaterThan(7);
  });
});

describe('Hausaufgaben-Zähler (Stoppuhr)', () => {
  it('zählt hoch, pausiert und läuft weiter – aus Zeitpunkten gerechnet', () => {
    let s = startStopwatch('hw', 'm', 0);
    expect(elapsedOf(s, 90_000)).toBe(90);
    s = pauseStopwatch(s, 90_000);
    expect(elapsedOf(s, 600_000)).toBe(90);
    s = resumeStopwatch(s, 600_000);
    expect(elapsedOf(s, 630_000)).toBe(120);
    expect(elapsedOf(s, 10 * 3600_000)).toBe(STOPWATCH_MAX_SEC);
  });

  it('formatiert MM:SS und ab einer Stunde H:MM:SS', () => {
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });

  it('verwirft ungültige gespeicherte Zustände', () => {
    expect(sanitizeStopwatch(null, 0)).toBeNull();
    expect(sanitizeStopwatch({ homeworkId: 'x', startedAt: 5_000_000 }, 0)).toBeNull();
    expect(sanitizeStopwatch({ homeworkId: 'x', moduleId: 'm', startedAt: 0, runningSince: null, elapsedBeforeSec: 30 }, 1000)).toMatchObject({ elapsedBeforeSec: 30, runningSince: null });
  });
});
