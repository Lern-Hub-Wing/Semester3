import { describe, expect, it } from 'vitest';
import { planAppHomework, type AppDevice } from '../../supabase/functions/_shared/appPush.ts';
import { DEFAULT_PREFS, type PushPrefs } from '../../supabase/functions/_shared/prefs.ts';
import { berlinInstant } from '../../supabase/functions/_shared/berlin.ts';

const G1 = 'g1';
const G2 = 'g2';
const now = berlinInstant('2026-12-10', '15:00');
const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();

const base = () => ({
  now,
  activity: [{ id: 1, group_id: G1, occurred_at: ago(1), actor_member_id: 'm-luk', entity_id: 'hw1' }],
  homework: [{ id: 'hw1', group_id: G1, module_id: 'mod1', title: 'Übungsblatt 3', due_date: '2026-12-17', deleted_at: null as string | null }],
  memberships: [
    { group_id: G1, user_id: 'u-luk', member_id: 'm-luk' },
    { group_id: G1, user_id: 'u-dia', member_id: 'm-dia' },
  ],
  devices: [] as AppDevice[],
  moduleNames: new Map([['mod1', 'Controlling']]),
  memberNames: new Map([['m-luk', 'Luk'], ['m-dia', 'Diana']]),
  groupNames: new Map([[G1, 'Lerngruppe A'], [G2, 'Mathe-Crew']]),
});
const dev = (id: string, user: string, prefs: Partial<PushPrefs> = {}, created = ago(600)): AppDevice => ({ id, user_id: user, prefs: { ...DEFAULT_PREFS, ...prefs }, created_at: created, sent: new Set() });

describe('App: Mitteilung „neue Hausaufgabe“', () => {
  it('geht an alle anderen Mitglieder – nicht an die Person, die sie eingetragen hat', () => {
    const r = planAppHomework({ ...base(), devices: [dev('d-luk', 'u-luk'), dev('d-dia', 'u-dia'), dev('d-dia2', 'u-dia')] });
    expect(r.map((n) => n.deviceId)).toEqual(['d-dia', 'd-dia2']);
    expect(r[0]).toMatchObject({ title: 'Luk hat eine Hausaufgabe hinzugefügt', body: '„Übungsblatt 3“ in Controlling – bis zum Do., 17. Dez.', url: '#/hausaufgaben', dedupeKey: 'homework:hw1' });
  });

  it('nicht an Fremde, Ausgetretene, abgeschaltete Geräte oder doppelt', () => {
    const sent = dev('d-dia', 'u-dia');
    sent.sent.add('homework:hw1');
    const r = planAppHomework({ ...base(), devices: [dev('d-x', 'u-fremd'), dev('d-off', 'u-dia', { homework: false }), sent] });
    expect(r).toEqual([]);
  });

  it('keine Vergangenheit für neu eingeschaltete Geräte, keine gelöschten oder fälligen Hausaufgaben', () => {
    expect(planAppHomework({ ...base(), devices: [dev('d-dia', 'u-dia', {}, ago(0))] })).toEqual([]);
    const b = base();
    b.homework[0].deleted_at = ago(0);
    expect(planAppHomework({ ...b, devices: [dev('d-dia', 'u-dia')] })).toEqual([]);
    const c = base();
    c.homework[0].due_date = '2026-12-09';
    expect(planAppHomework({ ...c, devices: [dev('d-dia', 'u-dia')] })).toEqual([]);
  });

  it('wartet die Ruhezeit ab und liefert danach nach', () => {
    const night = berlinInstant('2026-12-10', '22:00');
    const b = { ...base(), now: night };
    b.activity[0].occurred_at = new Date(night.getTime() - 60000).toISOString();
    expect(planAppHomework({ ...b, devices: [dev('d-dia', 'u-dia', {}, ago(600))] })).toEqual([]);
    const morning = berlinInstant('2026-12-11', '08:01');
    expect(planAppHomework({ ...b, now: morning, devices: [dev('d-dia', 'u-dia', {}, ago(600))] }).length).toBe(1);
  });

  it('nennt die Gruppe, wenn man in mehreren ist', () => {
    const b = base();
    b.memberships.push({ group_id: G2, user_id: 'u-dia', member_id: 'm-dia2' });
    const r = planAppHomework({ ...b, devices: [dev('d-dia', 'u-dia')] });
    expect(r[0].body).toBe('„Übungsblatt 3“ in Controlling – bis zum Do., 17. Dez. · Lerngruppe A');
  });

  it('fasst mehrere zusammen', () => {
    const b = base();
    b.activity.push({ id: 2, group_id: G1, occurred_at: ago(1), actor_member_id: 'm-luk', entity_id: 'hw2' });
    b.homework.push({ id: 'hw2', group_id: G1, module_id: 'mod1', title: 'Lesen', due_date: '2026-12-11', deleted_at: null });
    const r = planAppHomework({ ...b, devices: [dev('d-dia', 'u-dia')] });
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Luk hat 2 Hausaufgaben hinzugefügt');
    expect(r[0].alsoKeys).toEqual(['homework:hw2']);
  });

  it('ignoriert Hausaufgaben, die nicht zur Gruppe des Ereignisses gehören', () => {
    const b = base();
    b.homework[0].group_id = G2;
    expect(planAppHomework({ ...b, devices: [dev('d-dia', 'u-dia')] })).toEqual([]);
  });
});
