import { describe, expect, it } from 'vitest';
import { liveSessions } from '../lib/liveSession';
import { initialFocusState, start } from '../lib/focus';
import { startStopwatch } from '../lib/stopwatch';

describe('Live-Lernzeit', () => {
  it('laufende Fokusphase zählt sofort mit', () => {
    const t = start(initialFocusState(25), 0);
    const live = liveSessions('m1', t, null, 10 * 60_000);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: 'live-focus', member_id: 'm1', duration_seconds: 600 });
  });

  it('Pause und nicht gestarteter Timer zählen nicht doppelt bzw. gar nicht', () => {
    expect(liveSessions('m1', initialFocusState(25), null, 1000)).toEqual([]);
    const brk = { ...start(initialFocusState(5), 0), phase: 'break' as const };
    expect(liveSessions('m1', brk, null, 60_000)).toEqual([]);
  });

  it('Hausaufgaben-Zähler zählt mit, ohne Profil nichts', () => {
    const sw = startStopwatch('hw', 'mod', 0);
    expect(liveSessions('m1', initialFocusState(25), sw, 90_000)[0]).toMatchObject({ id: 'live-homework', module_id: 'mod', duration_seconds: 90 });
    expect(liveSessions(null, initialFocusState(25), sw, 90_000)).toEqual([]);
  });
});
