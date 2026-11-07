import { describe, expect, it } from 'vitest';
import { nextReminder } from '../lib/nextReminder';
import { DEFAULT_PREFS } from '../../supabase/functions/_shared/prefs.ts';
import { berlinInstant } from '../../supabase/functions/_shared/berlin.ts';
import { byId, completions, done, entry, member, mod, task } from './fixtures';

describe('Vorschau der nächsten Erinnerung (gleiche Logik wie der Server)', () => {
  const base = {
    members: byId(member('a'), member('b')),
    modules: byId(mod('ctrl', { name: 'Controlling' })),
    exams: {},
    entries: byId(entry('e1', 'ctrl', '2026-12-10'), entry('e2', 'ctrl', '2026-12-11')),
    tasks: byId(task('t1', 'e1'), task('t2', 'e1'), task('t3', 'e2')),
    memberId: 'a',
    prefs: DEFAULT_PREFS,
  };

  it('kündigt am Vormittag die 18-Uhr-Erinnerung mit echten Zahlen an', () => {
    const r = nextReminder({ ...base, completions: completions(done('t1', 'a')), now: berlinInstant('2026-12-10', '10:07').getTime() });
    expect(r?.title).toBe('Noch nicht ganz geschafft!');
    expect(r?.body).toBe('Du hast heute noch 1 Aufgabe in Controlling offen.');
    expect(r?.at.toISOString()).toBe(berlinInstant('2026-12-10', '18:00').toISOString());
  });

  it('springt zur Morgenübersicht, wenn heute alles erledigt ist', () => {
    const r = nextReminder({ ...base, completions: completions(done('t1', 'a'), done('t2', 'a')), now: berlinInstant('2026-12-10', '10:00').getTime() });
    expect(r?.title).toBe('Dein Lernplan für heute');
    expect(r?.at.toISOString()).toBe(berlinInstant('2026-12-11', '08:00').toISOString());
  });

  it('meldet nichts, wenn nichts ansteht', () => {
    const r = nextReminder({ ...base, entries: {}, tasks: {}, completions: {}, now: berlinInstant('2026-12-10', '10:00').getTime() });
    expect(r).toBeNull();
  });
});
