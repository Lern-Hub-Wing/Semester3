import { describe, expect, it } from 'vitest';
import { greetingFor } from '../lib/time';

const berlin = (time: string) => new Date(`2026-11-19T${time}:00+01:00`);

describe('Begrüßung nach Tageszeit (Berlin)', () => {
  it.each([
    ['04:59', 'Gute Nacht'],
    ['05:00', 'Guten Morgen'],
    ['10:59', 'Guten Morgen'],
    ['11:00', 'Guten Mittag'],
    ['13:59', 'Guten Mittag'],
    ['14:00', 'Guten Tag'],
    ['18:00', 'Guten Abend'],
    ['21:59', 'Guten Abend'],
    ['22:00', 'Gute Nacht'],
  ])('%s → %s', (t, g) => expect(greetingFor(berlin(t))).toBe(g));
});
