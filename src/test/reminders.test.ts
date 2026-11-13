import { describe, expect, it } from 'vitest';
import { planNotifications, effectiveMinute, twoHourTarget, type DeviceInfo, type Snapshot } from '../../supabase/functions/_shared/reminders.ts';
import { DEFAULT_PREFS, inQuietHours, normalizePrefs, type PushPrefs } from '../../supabase/functions/_shared/prefs.ts';
import { berlinInstant, berlinParts } from '../../supabase/functions/_shared/berlin.ts';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'aaaaaaaa-0000-4000-8000-000000000002';
const CTRL = 'bbbbbbbb-0000-4000-8000-000000000001';
const MATH = 'bbbbbbbb-0000-4000-8000-000000000002';
const DAY = '2026-12-10'; // Donnerstag

function snapshot(at: Date, extra: Partial<Snapshot> = {}): Snapshot {
  return {
    now: at,
    members: [
      { id: A, name: 'Luk', is_active: true },
      { id: B, name: 'Diana', is_active: true },
    ],
    modules: [
      { id: CTRL, name: 'Controlling', archived_at: null },
      { id: MATH, name: 'Angewandte Mathematik', archived_at: null },
    ],
    exams: [],
    entries: [
      { id: 'e-today', module_id: CTRL, study_date: DAY, deleted_at: null },
      { id: 'e-yesterday', module_id: MATH, study_date: '2026-12-09', deleted_at: null },
    ],
    tasks: [
      { id: 't1', study_entry_id: 'e-today', deleted_at: null },
      { id: 't2', study_entry_id: 'e-today', deleted_at: null },
      { id: 't3', study_entry_id: 'e-today', deleted_at: null },
      { id: 'y1', study_entry_id: 'e-yesterday', deleted_at: null },
      { id: 'y2', study_entry_id: 'e-yesterday', deleted_at: null },
    ],
    completions: [{ task_id: 't1', member_id: A, is_completed: true }],
    activity: [],
    state: {},
    ...extra,
  };
}

function device(over: Partial<DeviceInfo> = {}, prefs: Partial<PushPrefs> = {}): DeviceInfo {
  return { id: 'dev-a', member_id: A, prefs: { ...DEFAULT_PREFS, ...prefs }, plan_cursor: 0, sent: new Set(), lastOverdue: null, ...over };
}

const at = (date: string, time: string) => berlinInstant(date, time);
const kinds = (r: ReturnType<typeof planNotifications>) => r.notifications.map((n) => n.kind);

describe('Zeit in Europe/Berlin', () => {
  it('rechnet Ortszeit inklusive Sommer-/Winterzeit um', () => {
    expect(berlinInstant('2027-01-06', '14:00').toISOString()).toBe('2027-01-06T13:00:00.000Z');
    expect(berlinInstant('2027-07-01', '08:00').toISOString()).toBe('2027-07-01T06:00:00.000Z');
    // Tag der Zeitumstellung (28.3.2027, 2:00 → 3:00)
    expect(berlinInstant('2027-03-28', '08:00').toISOString()).toBe('2027-03-28T06:00:00.000Z');
    expect(berlinParts(new Date('2027-03-28T00:30:00Z')).time).toBe('01:30');
    expect(berlinParts(new Date('2027-03-28T01:30:00Z')).time).toBe('03:30');
  });

  it('erkennt Ruhezeiten, auch über Mitternacht', () => {
    const q = { quietStart: '21:00', quietEnd: '08:00' };
    expect(inQuietHours(22 * 60, q)).toBe(true);
    expect(inQuietHours(7 * 60 + 59, q)).toBe(true);
    expect(inQuietHours(8 * 60, q)).toBe(false);
    expect(inQuietHours(20 * 60 + 59, q)).toBe(false);
    expect(inQuietHours(12 * 60, { quietStart: '12:00', quietEnd: '12:00' })).toBe(false);
  });

  it('verschiebt Erinnerungen aus der Ruhezeit heraus', () => {
    const q = { quietStart: '21:00', quietEnd: '08:00' };
    expect(effectiveMinute(7 * 60, q)).toBe(8 * 60); // Morgenteil → Ende der Ruhezeit
    expect(effectiveMinute(22 * 60, q)).toBe(20 * 60 + 45); // Abendteil → kurz vor Beginn
    expect(effectiveMinute(18 * 60, q)).toBe(18 * 60);
  });

  it('übernimmt nur gültige Einstellungen', () => {
    const p = normalizePrefs({ morning: false, morningTime: '25:00', eveningTime: '19:30', evil: '<script>' });
    expect(p.morning).toBe(false);
    expect(p.morningTime).toBe('08:00');
    expect(p.eveningTime).toBe('19:30');
    expect('evil' in p).toBe(false);
  });
});

describe('A: Morgenübersicht', () => {
  it('kommt um 08:00, wenn heute Aufgaben offen sind – genau einmal', () => {
    const dev = device({}, { overdue: false });
    expect(kinds(planNotifications(snapshot(at(DAY, '07:55')), [dev]))).toEqual([]);
    const r = planNotifications(snapshot(at(DAY, '08:00')), [dev]);
    expect(r.notifications).toHaveLength(1);
    expect(r.notifications[0]).toMatchObject({ kind: 'morning', title: 'Dein Lernplan für heute', dedupeKey: `morning:${DAY}` });
    expect(r.notifications[0].body).toBe('Heute stehen 2 Aufgaben in Controlling an. Du schaffst das!');
    // Zweiter Lauf (Gerät kennt den Schlüssel bereits) → nichts
    expect(kinds(planNotifications(snapshot(at(DAY, '08:05')), [dev]))).toEqual([]);
  });

  it('entfällt, wenn alles erledigt ist oder nichts geplant ist', () => {
    const allDone = snapshot(at(DAY, '08:00'), {
      completions: ['t1', 't2', 't3'].map((t) => ({ task_id: t, member_id: A, is_completed: true })),
    });
    expect(kinds(planNotifications(allDone, [device({}, { overdue: false })]))).toEqual([]);
    const nothing = snapshot(at('2026-12-11', '08:00'), { entries: [], tasks: [] });
    expect(kinds(planNotifications(nothing, [device()]))).toEqual([]);
  });

  it('fasst mehrere Module zusammen', () => {
    const s = snapshot(at(DAY, '08:10'), {
      entries: [...snapshot(new Date()).entries, { id: 'e-math', module_id: MATH, study_date: DAY, deleted_at: null }],
      tasks: [...snapshot(new Date()).tasks, { id: 'm1', study_entry_id: 'e-math', deleted_at: null }],
    });
    const n = planNotifications(s, [device({}, { overdue: false })]).notifications[0];
    expect(n.body).toBe('Heute stehen 3 Aufgaben in Controlling und Angewandte Mathematik an. Du schaffst das!');
  });

  it('beachtet eine Morgenzeit innerhalb der Ruhezeit (wird ans Ende verschoben)', () => {
    const dev = device({}, { morningTime: '07:00', overdue: false });
    expect(kinds(planNotifications(snapshot(at(DAY, '07:00')), [dev]))).toEqual([]);
    expect(kinds(planNotifications(snapshot(at(DAY, '08:00')), [dev]))).toEqual(['morning']);
  });

  it('fasst Morgenübersicht und überfällige Aufgaben zusammen, wenn sie zeitlich zusammenfallen', () => {
    const r = planNotifications(snapshot(at(DAY, '08:00')), [device()]);
    expect(r.notifications).toHaveLength(1);
    expect(r.notifications[0].body).toContain('Außerdem: 2 Aufgaben von gestern warten noch auf dich.');
    expect(r.notifications[0].alsoKeys?.[0].key).toBe(`overdue:${DAY}`);
  });
});

describe('B: Offene Aufgaben am Abend', () => {
  it('erinnert um 18:00 nur, wenn noch etwas offen ist', () => {
    const r = planNotifications(snapshot(at(DAY, '18:00')), [device({ sent: new Set([`overdue:${DAY}`]) })]);
    expect(r.notifications.map((n) => [n.kind, n.body])).toEqual([['evening', 'Du hast heute noch 2 Aufgaben in Controlling offen.']]);
    const done = snapshot(at(DAY, '18:00'), { completions: ['t1', 't2', 't3', 'y1', 'y2'].map((t) => ({ task_id: t, member_id: A, is_completed: true })) });
    expect(kinds(planNotifications(done, [device()]))).toEqual([]);
  });
});

describe('C: Überfällige Aufgaben', () => {
  const noMorning = { morning: false };
  it('erinnert um 09:00 an Aufgaben vom Vortag', () => {
    const r = planNotifications(snapshot(at(DAY, '09:00')), [device({}, noMorning)]);
    expect(r.notifications.map((n) => [n.kind, n.title, n.body])).toEqual([['overdue', 'Da ist noch etwas offen', '2 Aufgaben von gestern warten noch auf dich.']]);
    expect(r.notifications[0].meta).toEqual({ taskIds: ['y1', 'y2'] });
  });

  it('wiederholt dieselben Aufgaben nicht täglich, aber nach 3 Tagen oder bei neuen Fällen', () => {
    const last = { at: at('2026-12-09', '09:00').toISOString(), taskIds: ['y1', 'y2'] };
    expect(kinds(planNotifications(snapshot(at(DAY, '09:00')), [device({ lastOverdue: last }, noMorning)]))).toEqual([]);
    const older = { at: at('2026-12-07', '09:00').toISOString(), taskIds: ['y1', 'y2'] };
    expect(kinds(planNotifications(snapshot(at(DAY, '09:00')), [device({ lastOverdue: older }, noMorning)]))).toEqual(['overdue']);
    const partial = { at: at('2026-12-09', '09:00').toISOString(), taskIds: ['y1'] };
    expect(kinds(planNotifications(snapshot(at(DAY, '09:00')), [device({ lastOverdue: partial }, noMorning)]))).toEqual(['overdue']);
  });
});

describe('D: Prüfungen', () => {
  const exam = (start: Date, id = 'ex-1') => ({ id, module_id: CTRL, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 90 * 60000).toISOString(), deleted_at: null });
  const quiet = { morning: false, evening: false, overdue: false };

  it('erinnert 7, 3 und 1 Tag vorher sowie 2 Stunden vor Beginn', () => {
    const start = at('2027-01-18', '14:00');
    const s = (d: string, t: string) => snapshot(at(d, t), { exams: [exam(start)] });
    const n7 = planNotifications(s('2027-01-11', '17:00'), [device({}, quiet)]).notifications;
    expect(n7.map((n) => n.body)).toEqual(['Noch eine Woche bis Controlling. Schau dir deinen Lernfortschritt an.']);
    const n3 = planNotifications(s('2027-01-15', '17:05'), [device({}, quiet)]).notifications;
    expect(n3[0].body).toBe('Controlling ist in 3 Tagen. Du hast noch 2 offene Lernaufgaben.');
    const n1 = planNotifications(s('2027-01-17', '17:00'), [device({}, quiet)]).notifications;
    expect(n1[0].body).toBe('Morgen um 14:00 Uhr ist deine Controlling Prüfung. Viel Erfolg bei der Vorbereitung!');
    expect(n1[0].urgency).toBe('high');
    const n2h = planNotifications(s('2027-01-18', '12:00'), [device({}, quiet)]).notifications;
    expect(n2h[0].body).toBe('In 2 Stunden beginnt Controlling. Viel Erfolg!');
    // Kein Nachsenden außerhalb des Fensters, keine Erinnerung nach Beginn
    expect(kinds(planNotifications(s('2027-01-11', '22:30'), [device({}, quiet)]))).toEqual([]);
    expect(kinds(planNotifications(s('2027-01-18', '14:30'), [device({}, quiet)]))).toEqual([]);
  });

  it('erzeugt nach einer Terminänderung neue Erinnerungen (neuer Schlüssel)', () => {
    const before = planNotifications(snapshot(at('2027-01-17', '17:00'), { exams: [exam(at('2027-01-18', '14:00'))] }), [device({}, quiet)]).notifications[0];
    const after = planNotifications(snapshot(at('2027-01-17', '17:00'), { exams: [exam(at('2027-01-18', '11:00'))] }), [device({ sent: new Set([before.dedupeKey]) }, quiet)]).notifications[0];
    expect(after.dedupeKey).not.toBe(before.dedupeKey);
    expect(after.body).toContain('11:00 Uhr');
  });

  it('verschiebt die 2-Stunden-Erinnerung bei frühen Prüfungen ans Ende der Ruhezeit', () => {
    const start = at('2027-01-08', '08:30');
    const t = twoHourTarget(start, '2027-01-08', DEFAULT_PREFS);
    expect(t.previousEvening).toBe(false);
    expect(t.at.toISOString()).toBe(at('2027-01-08', '08:00').toISOString());
    const n = planNotifications(snapshot(at('2027-01-08', '08:00'), { exams: [exam(start)] }), [device({}, quiet)]).notifications;
    expect(n[0].body).toBe('In 30 Minuten beginnt Controlling. Viel Erfolg!');
  });

  it('erinnert bei sehr frühen Prüfungen am Vorabend – aber nicht doppelt', () => {
    const start = at('2027-01-08', '08:15');
    const t = twoHourTarget(start, '2027-01-08', DEFAULT_PREFS);
    expect(t.previousEvening).toBe(true);
    expect(t.at.toISOString()).toBe(at('2027-01-07', '20:45').toISOString());
    const s = snapshot(at('2027-01-07', '20:45'), { exams: [exam(start)] });
    const key1d = `exam:ex-1:${start.toISOString()}:1d`;
    expect(kinds(planNotifications(s, [device({ sent: new Set([key1d]) }, quiet)]))).toEqual([]);
  });
});

describe('E: Änderungen am Lernplan', () => {
  const activity = (id: number, actor: string, minutesAgo: number, now: Date, entity = 'tasks', entityId = 't2', action = 'created') => ({
    id,
    occurred_at: new Date(now.getTime() - minutesAgo * 60000).toISOString(),
    actor_member_id: actor,
    entity_type: entity,
    entity_id: entityId,
    action,
  });
  const p = { morning: false, evening: false, overdue: false };

  it('fasst Änderungen anderer nach einer Ruhepause zusammen', () => {
    const now = at(DAY, '15:00');
    const acts = [activity(5, B, 15, now, 'tasks', 't2'), activity(6, B, 12, now, 'tasks', 't3')];
    const r = planNotifications(snapshot(now, { activity: acts }), [device({ plan_cursor: 4 }, p)]);
    expect(r.notifications.map((n) => [n.title, n.body])).toEqual([['Lernplan aktualisiert', 'Für heute wurden 2 neue Aufgaben in Controlling hinzugefügt.']]);
    expect(r.cursors['dev-a']).toBe(6);
  });

  it('wartet, solange noch geändert wird', () => {
    const now = at(DAY, '15:00');
    const r = planNotifications(snapshot(now, { activity: [activity(5, B, 3, now)] }), [device({ plan_cursor: 4 }, p)]);
    expect(r.notifications).toEqual([]);
    expect(r.cursors['dev-a']).toBeUndefined();
  });

  it('meldet eigene Änderungen nicht und liefert neuen Geräten keine Vergangenheit', () => {
    const now = at(DAY, '15:00');
    const own = planNotifications(snapshot(now, { activity: [activity(5, A, 20, now)] }), [device({ plan_cursor: 4 }, p)]);
    expect(own.notifications).toEqual([]);
    expect(own.cursors['dev-a']).toBe(5);
    const fresh = planNotifications(snapshot(now, { activity: [activity(9, B, 20, now)] }), [device({ plan_cursor: null }, p)]);
    expect(fresh.notifications).toEqual([]);
    expect(fresh.cursors['dev-a']).toBe(9);
  });
});

describe('H: Neue Hausaufgaben', () => {
  const hwAct = (id: number, actor: string, minutesAgo: number, now: Date, hwId = 'hw1') => ({
    id,
    occurred_at: new Date(now.getTime() - minutesAgo * 60000).toISOString(),
    actor_member_id: actor,
    entity_type: 'homework',
    entity_id: hwId,
    action: 'created',
  });
  const hw = (id: string, title: string, due: string, module_id = CTRL) => ({ id, module_id, title, due_date: due, deleted_at: null });
  const p = { morning: false, evening: false, overdue: false };

  it('meldet eine neue Hausaufgabe sofort an die anderen – mit Name, Fach und Abgabe', () => {
    const now = at(DAY, '15:00');
    const snap = snapshot(now, { activity: [hwAct(5, A, 1, now)], homework: [hw('hw1', 'Übungsblatt 3', '2026-12-17')] });
    const r = planNotifications(snap, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, p)]);
    expect(r.notifications.map((n) => [n.kind, n.title, n.body, n.url])).toEqual([
      ['homework', 'Luk hat eine Hausaufgabe hinzugefügt', '„Übungsblatt 3“ in Controlling – bis zum Do., 17. Dez.', '#/hausaufgaben'],
    ]);
    expect(r.notifications[0].dedupeKey).toBe('homework:hw1');
    expect(r.cursors['dev-b']).toBe(5);
  });

  it('meldet die eigene Hausaufgabe nicht und nichts doppelt', () => {
    const now = at(DAY, '15:00');
    const snap = snapshot(now, { activity: [hwAct(5, A, 1, now)], homework: [hw('hw1', 'Übungsblatt 3', '2026-12-17')] });
    expect(planNotifications(snap, [device({ plan_cursor: 4 }, p)]).notifications).toEqual([]);
    const again = planNotifications(snap, [device({ id: 'dev-b', member_id: B, plan_cursor: 4, sent: new Set(['homework:hw1']) }, p)]);
    expect(again.notifications).toEqual([]);
  });

  it('fasst mehrere zusammen und lässt sich abschalten', () => {
    const now = at(DAY, '15:00');
    const snap = snapshot(now, {
      activity: [hwAct(5, A, 2, now, 'hw1'), hwAct(6, A, 1, now, 'hw2'), hwAct(7, A, 1, now, 'hw3')],
      homework: [hw('hw1', 'Blatt 1', DAY), hw('hw2', 'Blatt 2', '2026-12-11', MATH), hw('hw3', 'Blatt 3', '2026-12-20')],
    });
    const r = planNotifications(snap, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, p)]);
    expect(r.notifications.map((n) => [n.title, n.body])).toEqual([
      ['Luk hat 3 Hausaufgaben hinzugefügt', '„Blatt 1“ bis heute, „Blatt 2“ bis morgen (Fr., 11. Dez.) und 1 weitere'],
    ]);
    expect(r.notifications[0].alsoKeys?.map((k) => k.key)).toEqual(['homework:hw2', 'homework:hw3']);
    const off = planNotifications(snap, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, { ...p, homework: false })]);
    expect(off.notifications).toEqual([]);
    expect(off.cursors['dev-b']).toBe(7);
  });

  it('wartet die Ruhezeit ab, ohne die Mitteilung zu verlieren', () => {
    const night = at(DAY, '22:30');
    const snap = snapshot(night, { activity: [hwAct(5, A, 1, night), hwAct(6, A, 0, night, 'x')], homework: [hw('hw1', 'Übungsblatt 3', '2026-12-17')] });
    const r = planNotifications(snap, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, p)]);
    expect(r.notifications).toEqual([]);
    expect(r.cursors['dev-b']).toBeUndefined(); // Cursor bleibt vor der Hausaufgabe stehen
    const morning = at('2026-12-11', '08:05');
    const r2 = planNotifications({ ...snap, now: morning }, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, p)]);
    expect(r2.notifications.map((n) => n.kind)).toEqual(['homework']);
    expect(r2.notifications[0].body).toContain('bis zum Do., 17. Dez.');
  });

  it('ignoriert gelöschte oder schon fällige Hausaufgaben und Geräte ohne Vergangenheit', () => {
    const now = at(DAY, '15:00');
    const gone = snapshot(now, { activity: [hwAct(5, A, 1, now)], homework: [{ ...hw('hw1', 'X', '2026-12-17'), deleted_at: now.toISOString() }] });
    expect(planNotifications(gone, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, p)]).notifications).toEqual([]);
    const past = snapshot(now, { activity: [hwAct(5, A, 1, now)], homework: [hw('hw1', 'X', '2026-12-09')] });
    expect(planNotifications(past, [device({ id: 'dev-b', member_id: B, plan_cursor: 4 }, p)]).notifications).toEqual([]);
    const fresh = snapshot(now, { activity: [hwAct(5, A, 1, now)], homework: [hw('hw1', 'X', '2026-12-17')] });
    expect(planNotifications(fresh, [device({ id: 'dev-b', member_id: B, plan_cursor: null }, p)]).notifications).toEqual([]);
  });
});

describe('Hausaufgaben in den Tageserinnerungen', () => {
  // Gruppe arbeitet nur mit Hausaufgaben (keine Lernplan-Aufgaben)
  const hw = (id: string, title: string, due: string) => ({ id, module_id: CTRL, title, due_date: due, deleted_at: null });
  const only = (now: Date, extra: Partial<Snapshot> = {}) =>
    snapshot(now, { entries: [], tasks: [], completions: [], homework: [hw('h1', 'Aufgabe 8', DAY), hw('h2', 'Aufgabe 7 (1+3)', '2026-12-11'), hw('h3', 'Aufgabe 6', '2026-12-08')], ...extra });

  it('Morgens: was heute und morgen abzugeben ist', () => {
    const r = planNotifications(only(at(DAY, '08:00')), [device({}, { overdue: false })]);
    expect(r.notifications.map((n) => [n.kind, n.title, n.body, n.url])).toEqual([
      ['morning', 'Hausaufgaben im Blick', 'Heute Abgabe: „Aufgabe 8“. Morgen Abgabe: „Aufgabe 7 (1+3)“. Du schaffst das!', '#/hausaufgaben'],
    ]);
  });

  it('Abends: Abgabe heute/morgen, nur wenn noch nicht abgehakt', () => {
    const r = planNotifications(only(at(DAY, '18:00')), [device({}, { morning: false, overdue: false })]);
    expect(r.notifications.map((n) => [n.title, n.body])).toEqual([['Heute ist Abgabe', 'Heute noch abzugeben: „Aufgabe 8“. Morgen Abgabe: „Aufgabe 7 (1+3)“.']]);
    const done = only(at(DAY, '18:00'), {
      homeworkCompletions: [
        { target_id: 'h1', member_id: A, is_completed: true },
        { target_id: 'p1', member_id: A, is_completed: true },
      ],
      homeworkParts: [{ id: 'p1', homework_id: 'h2' }],
    });
    // h1 direkt abgehakt, h2 über alle Teile erledigt → nichts mehr offen
    expect(planNotifications(done, [device({}, { morning: false, overdue: false })]).notifications).toEqual([]);
    // andere Person hat noch nichts erledigt
    expect(planNotifications(done, [device({ id: 'dev-b', member_id: B }, { morning: false, overdue: false })]).notifications).toHaveLength(1);
  });

  it('Überfällige Hausaufgaben (höchstens eine Woche zurück) um 09:00', () => {
    const r = planNotifications(only(at(DAY, '09:00')), [device({}, { morning: false })]);
    expect(r.notifications.map((n) => [n.kind, n.body, n.url])).toEqual([['overdue', 'Diese Hausaufgabe ist noch nicht abgehakt: „Aufgabe 6“.', '#/hausaufgaben']]);
    const old = only(at(DAY, '09:00'), { homework: [hw('h9', 'Uralt', '2026-11-20')] });
    expect(planNotifications(old, [device({}, { morning: false })]).notifications).toEqual([]);
  });

  it('Lernplan und Hausaufgaben zusammen in einer Morgennachricht', () => {
    const r = planNotifications(snapshot(at(DAY, '08:00'), { homework: [hw('h1', 'Aufgabe 8', DAY)] }), [device({}, { overdue: false })]);
    expect(r.notifications.map((n) => [n.title, n.body])).toEqual([['Dein Lernplan für heute', 'Heute stehen 2 Aufgaben in Controlling an. Heute Abgabe: „Aufgabe 8“. Du schaffst das!']]);
  });

  it('gelöschte Hausaufgaben und archivierte Fächer zählen nicht', () => {
    const snap = only(at(DAY, '08:00'), { modules: [{ id: CTRL, name: 'Controlling', archived_at: '2026-12-01T00:00:00Z' }] });
    expect(planNotifications(snap, [device({}, { overdue: false })]).notifications).toEqual([]);
  });
});

describe('F/G: Erfolge', () => {
  const allDone = ['t1', 't2', 't3'].flatMap((t) => [A, B].map((m) => ({ task_id: t, member_id: m, is_completed: true })));
  const onlyCtrl = { entries: [snapshot(new Date()).entries[0]], tasks: snapshot(new Date()).tasks.slice(0, 3) };
  const p = { morning: false, evening: false, overdue: false };

  it('meldet 100 % eines Moduls genau einmal beim echten Übergang', () => {
    const now = at(DAY, '16:00');
    // Erster Lauf erfasst nur den Zustand (kein Push beim ersten Öffnen/Synchronisieren)
    const init = planNotifications(snapshot(now, { ...onlyCtrl, completions: allDone }), [device({}, p)]);
    expect(init.notifications).toEqual([]);
    expect(init.state[`group_complete:${CTRL}`]).toMatchObject({ complete: true, transition: false });
    // Übergang von „nicht fertig“ zu „fertig“
    const prev = { [`group_complete:${CTRL}`]: { complete: false, since: now.toISOString(), transition: false } };
    const r = planNotifications(snapshot(now, { ...onlyCtrl, completions: allDone, state: prev }), [device({}, p), device({ id: 'dev-b', member_id: B }, p)]);
    expect(r.notifications.map((n) => [n.deviceId, n.title, n.body])).toEqual([
      ['dev-a', 'Gemeinsam geschafft! 🎉', 'Ihr habt alle Aufgaben in Controlling abgeschlossen. Starkes Team!'],
      ['dev-b', 'Gemeinsam geschafft! 🎉', 'Ihr habt alle Aufgaben in Controlling abgeschlossen. Starkes Team!'],
    ]);
    // Weiterer Lauf mit gespeichertem Zustand und Protokoll → nichts mehr
    const state2 = { ...prev, ...r.state };
    const sent = new Set(r.notifications.filter((n) => n.deviceId === 'dev-a').map((n) => n.dedupeKey));
    expect(planNotifications(snapshot(at(DAY, '16:05'), { ...onlyCtrl, completions: allDone, state: state2 }), [device({ sent }, p)]).notifications).toEqual([]);
  });

  it('hält Erfolgsmeldungen während der Ruhezeit zurück', () => {
    const now = at(DAY, '22:00');
    const prev = { [`group_complete:${CTRL}`]: { complete: false, since: now.toISOString(), transition: false } };
    expect(planNotifications(snapshot(now, { ...onlyCtrl, completions: allDone, state: prev }), [device({}, p)]).notifications).toEqual([]);
  });
});

describe('Allgemein', () => {
  it('Geräte ohne gültiges Profil bekommen keine persönlichen Erinnerungen', () => {
    expect(planNotifications(snapshot(at(DAY, '08:00')), [device({ member_id: null })]).notifications).toEqual([]);
  });

  it('übermittelt die Zahl offener Aufgaben fürs App-Symbol (abschaltbar)', () => {
    const n = planNotifications(snapshot(at(DAY, '08:00')), [device()]).notifications[0];
    expect(n.badge).toBe(4); // 2 heute + 2 überfällig
    expect(planNotifications(snapshot(at(DAY, '08:00')), [device({}, { badge: false })]).notifications[0].badge).toBeNull();
  });

  it('jede Person bekommt ihre eigenen Zahlen', () => {
    const r = planNotifications(snapshot(at(DAY, '18:00')), [device({ sent: new Set([`overdue:${DAY}`]) }), device({ id: 'dev-b', member_id: B, sent: new Set([`overdue:${DAY}`]) })]);
    expect(r.notifications.map((n) => [n.deviceId, n.body])).toEqual([
      ['dev-a', 'Du hast heute noch 2 Aufgaben in Controlling offen.'],
      ['dev-b', 'Du hast heute noch 3 Aufgaben in Controlling offen.'],
    ]);
  });
});
