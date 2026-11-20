import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, Clock3, GraduationCap, Lightbulb, Plus, RotateCcw, ShieldCheck, Sparkles, Target, TriangleAlert, Wand2, X } from 'lucide-react';
import { useData } from '../store/data';
import { useModules } from '../store/derived';
import { createEntriesBulk, type EntryDraft } from '../store/actions';
import { useAccount } from './account';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { navigate, Link } from '../lib/router';
import { addDaysISO, formatISODate, instantToZoned, todayISO } from '../lib/time';
import { budgets, fallbackUnits, KIND_LABEL, sanitizeUnits, schedule, type DayPart, type Difficulty, type Goal, type PlanInput, type Schedule, type Status, type SubjectUnits } from '../lib/aiplan';
import { Card, IconTile } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { GlassSlider } from '../components/ui/GlassSlider';
import { TINT } from '../lib/tints';
import { toast } from '../store/toast';
import type { ISODate, UUID } from '../lib/types';

/**
 * KI-Lernplan: Fragebogen → KI zerlegt Themen in Lerneinheiten → die App
 * verteilt sie auf deine Lerntage bis zur Prüfung → Vorschau → übernehmen.
 */

type Step = 'intro' | 'about' | 'subjects' | 'topics' | 'time' | 'style' | 'working' | 'preview';
const STEPS: Step[] = ['about', 'subjects', 'topics', 'time', 'style'];

interface SubjectDraft {
  id: UUID;
  on: boolean;
  examDate: ISODate | '';
  confidence: number;
  topics: { title: string; difficulty: Difficulty }[];
}
interface Answers {
  status: Status;
  goal: Goal;
  dayPart: DayPart;
  weekdays: number[];
  hoursPerDay: number;
  sessionMinutes: number;
  start: ISODate;
  offDays: ISODate[];
  methods: string[];
  notes: string;
  subjects: Record<UUID, SubjectDraft>;
}

const METHODS = ['Zusammenfassungen', 'Karteikarten', 'Aufgaben rechnen', 'Altklausuren', 'Erklärvideos', 'Mit anderen lernen', 'Laut erklären'];
const WEEKDAYS: [number, string][] = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
const DIFF_NEXT: Record<Difficulty, Difficulty> = { leicht: 'mittel', mittel: 'schwer', schwer: 'leicht' };
const DIFF_STYLE: Record<Difficulty, string> = {
  leicht: 'bg-[color-mix(in_srgb,var(--ss-success)_16%,transparent)] text-[var(--ss-success)]',
  mittel: 'bg-[color-mix(in_srgb,var(--ss-accent)_14%,transparent)] text-accent',
  schwer: 'bg-[color-mix(in_srgb,var(--ss-warn)_18%,transparent)] text-warn',
};

const storeKey = (groupId: string | undefined) => `studyspace.aiplan.${groupId ?? 'none'}`;

function useAnswers(groupId: string | undefined) {
  const modules = useModules();
  const exams = useData((s) => s.exams);
  const topics = useData((s) => s.module_topics);
  const today = todayISO();
  const initial = useMemo<Answers>(() => {
    let saved: Partial<Answers> = {};
    try {
      saved = JSON.parse(localStorage.getItem(storeKey(groupId)) ?? '{}');
    } catch {
      /* egal */
    }
    const subjects: Record<UUID, SubjectDraft> = {};
    for (const m of modules) {
      // nächste Prüfung des Fachs
      const next = Object.values(exams)
        .filter((e) => e.module_id === m.id && !e.deleted_at)
        .map((e) => instantToZoned(e.starts_at).date)
        .filter((d) => d > today)
        .sort()[0];
      const own = Object.values(topics)
        .filter((t) => t.module_id === m.id && !t.archived_at)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({ title: t.title, difficulty: 'mittel' as Difficulty }));
      const prev = saved.subjects?.[m.id];
      subjects[m.id] = {
        id: m.id,
        on: prev?.on ?? !!next,
        examDate: next ?? (prev?.examDate && prev.examDate > today ? prev.examDate : ''),
        confidence: prev?.confidence ?? 3,
        topics: prev?.topics?.length ? prev.topics : own,
      };
    }
    return {
      status: saved.status ?? 'schule',
      goal: saved.goal ?? 'gut',
      dayPart: saved.dayPart ?? 'nachmittags',
      weekdays: saved.weekdays ?? [1, 2, 3, 4, 5],
      hoursPerDay: saved.hoursPerDay ?? 2,
      sessionMinutes: saved.sessionMinutes ?? 45,
      start: saved.start && saved.start >= today ? saved.start : today,
      offDays: (saved.offDays ?? []).filter((d) => d >= today),
      methods: saved.methods ?? [],
      notes: saved.notes ?? '',
      subjects,
    };
  }, [modules, exams, topics, groupId, today]);
  const [answers, setAnswers] = useState<Answers>(initial);
  useEffect(() => {
    try {
      localStorage.setItem(storeKey(groupId), JSON.stringify(answers));
    } catch {
      /* egal */
    }
  }, [answers, groupId]);
  return [answers, setAnswers] as const;
}

function toInput(a: Answers, names: Map<UUID, string>): PlanInput {
  return {
    status: a.status,
    goal: a.goal,
    dayPart: a.dayPart,
    weekdays: a.weekdays,
    minutesPerDay: Math.round(a.hoursPerDay * 60),
    sessionMinutes: a.sessionMinutes,
    start: a.start,
    offDays: a.offDays,
    methods: a.methods,
    notes: a.notes,
    subjects: Object.values(a.subjects)
      .filter((s) => s.on && s.examDate)
      .map((s) => ({ id: s.id, name: names.get(s.id) ?? 'Fach', examDate: s.examDate as ISODate, confidence: s.confidence, topics: s.topics })),
  };
}

interface Result {
  plan: Schedule;
  units: SubjectUnits[];
  ai: boolean;
  summary: string;
  tips: string[];
  note: string | null;
  left: number | null;
}

async function requestAi(input: PlanInput, budget: Record<UUID, number>): Promise<{ summary: string; tips: string[]; units: SubjectUnits[]; left: number | null }> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw Object.assign(new Error('Bitte erneut anmelden.'), { code: 'unauthorized' });
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/app-ai-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey, Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ input, budgets: budget }),
    });
  } catch {
    throw Object.assign(new Error('Keine Verbindung zum Server.'), { code: 'offline' });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Fehler ${res.status}`), { code: res.status === 404 ? 'not_configured' : body.code });
  const units = sanitizeUnits(body, input);
  if (!units) throw Object.assign(new Error('Die Antwort der KI war unvollständig.'), { code: 'invalid' });
  return { summary: String(body.summary ?? '').slice(0, 400), tips: (Array.isArray(body.tips) ? body.tips : []).slice(0, 3).map((t: unknown) => String(t).slice(0, 200)), units, left: typeof body.left === 'number' ? body.left : null };
}

export function AiPlan() {
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const modules = useModules();
  const names = useMemo(() => new Map(modules.map((m) => [m.id, m.name])), [modules]);
  const colors = useMemo(() => new Map(modules.map((m) => [m.id, m.color])), [modules]);
  const activeEntries = useData((s) => Object.values(s.study_entries).filter((e) => !e.deleted_at).length);
  const [answers, setAnswers] = useAnswers(group?.id);
  const [step, setStep] = useState<Step>('intro');
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));
  const setSubject = (id: UUID, patch: Partial<SubjectDraft>) => setAnswers((a) => ({ ...a, subjects: { ...a.subjects, [id]: { ...a.subjects[id], ...patch } } }));

  const input = toInput(answers, names);
  const chosen = Object.values(answers.subjects).filter((s) => s.on);
  const stepIdx = STEPS.indexOf(step);
  const canNext =
    step === 'subjects' ? chosen.length > 0 && chosen.every((s) => s.examDate && s.examDate > answers.start) : step === 'time' ? answers.weekdays.length > 0 && answers.hoursPerDay > 0 : true;

  const generate = async (useAi: boolean) => {
    setStep('working');
    const budget = budgets(input);
    const maxEntries = Math.max(0, 100 - activeEntries);
    let units: SubjectUnits[];
    let ai = false;
    let summary = '';
    let tips: string[] = [];
    let note: string | null = null;
    let left: number | null = null;
    const started = Date.now();
    if (useAi) {
      try {
        const r = await requestAi(input, budget);
        units = r.units;
        ai = true;
        summary = r.summary;
        tips = r.tips;
        left = r.left;
      } catch (err) {
        const code = (err as { code?: string }).code;
        note =
          code === 'not_configured' || code === 'offline'
            ? 'Die KI ist gerade nicht verfügbar – dieser Plan wurde nach festen Lernregeln erstellt.'
            : `${(err as Error).message} Dieser Plan wurde nach festen Lernregeln erstellt.`;
        units = fallbackUnits(input, budget);
      }
    } else units = fallbackUnits(input, budget);
    if (!ai && !summary) summary = 'Je Thema erst Grundlagen, dann Übung; Wiederholungen und eine Probeklausur kurz vor jeder Prüfung.';
    // Kurz innehalten, damit die Animation nicht nur aufblitzt
    const wait = Math.max(0, 1400 - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    setResult({ plan: schedule(input, units, { maxEntries }), units, ai, summary, tips, note, left });
    setStep('preview');
  };

  const apply = async () => {
    if (!result) return;
    const drafts: EntryDraft[] = [];
    for (const day of result.plan.days) {
      const bySubject = new Map<UUID, typeof day.items>();
      for (const it of day.items) bySubject.set(it.subjectId, [...(bySubject.get(it.subjectId) ?? []), it]);
      for (const [subjectId, items] of bySubject) {
        const topicsToday = [...new Set(items.map((i) => i.topic).filter(Boolean))];
        const kinds = [...new Set(items.map((i) => KIND_LABEL[i.kind]))];
        drafts.push({
          module_id: subjectId,
          topic_id: null,
          study_date: day.date,
          title: topicsToday.length ? topicsToday.slice(0, 2).join(' · ') : kinds.join(' & '),
          description: `${result.ai ? 'KI-Lernplan' : 'Lernplan-Assistent'} · ${kinds.join(', ')} · ${answers.dayPart === 'flexibel' ? 'wann es passt' : answers.dayPart}`,
          tasks: items.map((i) => ({ title: `${i.title} (${i.minutes} Min.)` })) as EntryDraft['tasks'],
        });
      }
    }
    setSaving({ done: 0, total: drafts.length });
    const { created, error } = await createEntriesBulk(drafts, (done, total) => setSaving({ done, total }));
    setSaving(null);
    if (error) {
      toast.error(`${created} von ${drafts.length} Lerntagen übernommen. ${error}`);
      if (!created) return;
    } else toast.success(`Dein Lernplan steht: ${created} Lerntage übernommen.`);
    navigate('/lernplan');
  };

  if (!group?.has_plus)
    return (
      <Shell>
        <Card className="p-6 text-center" data-testid="aiplan-locked">
          <IconTile tint={TINT.purple} size={52}>
            <Sparkles />
          </IconTile>
          <h2 className="title mt-4 text-[20px]">Der KI-Lernplan gehört zu Solo und Gruppe</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">In der Testphase und mit einem Zugang erstellst du deinen persönlichen Lernplan in zwei Minuten.</p>
          <Link to="/einstellungen/plus" className="mt-5 inline-flex rounded-full bg-[var(--ss-accent)] px-5 py-2.5 text-[14px] font-semibold text-white">
            Tarife ansehen
          </Link>
        </Card>
      </Shell>
    );

  if (modules.length === 0)
    return (
      <Shell>
        <Card className="p-6 text-center" data-testid="aiplan-no-subjects">
          <IconTile tint={TINT.violet} size={52}>
            <BookOpen />
          </IconTile>
          <h2 className="title mt-4 text-[20px]">Zuerst deine Fächer anlegen</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">Leg deine Fächer und – wenn du sie schon kennst – die Prüfungstermine an. Danach plant der KI-Lernplan alles bis zur Prüfung.</p>
          <Button variant="primary" className="mt-5" icon={<Plus className="size-4" />} onClick={() => navigate('/faecher')}>
            Fächer anlegen
          </Button>
        </Card>
      </Shell>
    );

  return (
    <Shell>
      {STEPS.includes(step) && (
        <div className="mb-5 flex items-center gap-1.5" aria-label={`Schritt ${stepIdx + 1} von ${STEPS.length}`} data-testid="aiplan-progress">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-[var(--ss-accent)]' : 'bg-[color-mix(in_srgb,var(--ss-text)_10%,transparent)]'}`} />
          ))}
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} data-testid={`aiplan-step-${step}`}>
          {step === 'intro' && <Intro onStart={() => setStep('about')} />}
          {step === 'about' && (
            <Question icon={<GraduationCap />} tint={TINT.indigo} title="Wofür lernst du?" text="Danach richten sich Sprache, Methoden und Tempo deines Plans.">
              <Chips
                label="Wofür lernst du?"
                value={answers.status}
                onChange={(status) => set({ status })}
                options={[
                  ['schule', 'Schule'],
                  ['abitur', 'Abitur'],
                  ['ausbildung', 'Ausbildung'],
                  ['studium', 'Studium'],
                ]}
              />
              <p className="mb-2 mt-6 text-[14px] font-medium">Was ist dein Ziel?</p>
              <Chips
                label="Ziel"
                value={answers.goal}
                onChange={(goal) => set({ goal })}
                options={[
                  ['bestehen', 'Sicher bestehen'],
                  ['gut', 'Gute Note'],
                  ['sehr_gut', 'Bestnote'],
                ]}
              />
            </Question>
          )}
          {step === 'subjects' && (
            <Question icon={<CalendarDays />} tint={TINT.violet} title="Welche Prüfungen stehen an?" text="Wähle die Fächer und prüfe den Termin. Wie sicher fühlst du dich schon?">
              <ul className="flex flex-col gap-2.5">
                {modules.map((m) => {
                  const s = answers.subjects[m.id];
                  if (!s) return null;
                  return (
                    <li key={m.id} className={`rounded-[18px] border p-3.5 transition-colors ${s.on ? 'border-[color-mix(in_srgb,var(--ss-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--ss-accent)_6%,transparent)]' : 'border-line'}`}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input type="checkbox" className="size-5 accent-[var(--ss-accent)]" checked={s.on} onChange={(e) => setSubject(m.id, { on: e.target.checked })} />
                        <span className="size-3 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{m.name}</span>
                      </label>
                      {s.on && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block text-[13px] text-muted">
                            Prüfung am
                            <input type="date" className="field mt-1 w-full" min={addDaysISO(answers.start, 1)} value={s.examDate} onChange={(e) => setSubject(m.id, { examDate: e.target.value })} aria-label={`Prüfungstermin ${m.name}`} />
                          </label>
                          <GlassSlider label="So sicher fühle ich mich" value={s.confidence} min={1} max={5} onChange={(confidence) => setSubject(m.id, { confidence })} display={['', 'gar nicht', 'wenig', 'geht so', 'ziemlich', 'sehr'][s.confidence]} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {chosen.some((s) => !s.examDate) && <p className="mt-3 text-[13px] text-warn">Für jedes gewählte Fach brauchen wir einen Termin – bei Abgaben ohne Prüfung einfach den Zieltag.</p>}
            </Question>
          )}
          {step === 'topics' && (
            <Question icon={<Target />} tint={TINT.orange} title="Welche Themen kommen dran?" text="Ein Thema pro Eingabe. Tippe auf ein Thema, um einzustufen: leicht → mittel → schwer.">
              <div className="flex flex-col gap-4">
                {chosen.map((s) => (
                  <TopicEditor key={s.id} name={names.get(s.id) ?? ''} color={colors.get(s.id) ?? 'var(--ss-accent)'} topics={s.topics} onChange={(topics) => setSubject(s.id, { topics })} />
                ))}
              </div>
              <p className="mt-3 text-[12.5px] text-faint">Keine Themen? Kein Problem – dann plant die KI mit dem Fach als Ganzes.</p>
            </Question>
          )}
          {step === 'time' && (
            <Question icon={<Clock3 />} tint={TINT.teal} title="Wann kannst du lernen?" text="Ehrlich bleiben – ein Plan, der zu deinem Alltag passt, hält länger durch.">
              <p className="mb-2 text-[14px] font-medium">An welchen Tagen?</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lerntage">
                {WEEKDAYS.map(([d, l]) => {
                  const on = answers.weekdays.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => set({ weekdays: on ? answers.weekdays.filter((x) => x !== d) : [...answers.weekdays, d] })} className={`grid size-11 place-items-center rounded-full text-[14px] font-semibold transition-colors ${on ? 'bg-[var(--ss-accent)] text-white' : 'bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)] text-muted'}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                <GlassSlider label="Lernzeit pro Tag" value={answers.hoursPerDay} min={0.5} max={8} step={0.5} onChange={(hoursPerDay) => set({ hoursPerDay })} display={`${String(answers.hoursPerDay).replace('.', ',')} Std.`} />
              </div>
              <p className="mb-2 mt-6 text-[14px] font-medium">Wann lernst du am liebsten?</p>
              <Chips
                label="Tageszeit"
                value={answers.dayPart}
                onChange={(dayPart) => set({ dayPart })}
                options={[
                  ['morgens', 'Vormittags'],
                  ['nachmittags', 'Nachmittags'],
                  ['abends', 'Abends'],
                  ['flexibel', 'Flexibel'],
                ]}
              />
              <p className="mb-2 mt-6 text-[14px] font-medium">Wie lang ist eine Lerneinheit?</p>
              <Chips
                label="Einheitenlänge"
                value={String(answers.sessionMinutes)}
                onChange={(v) => set({ sessionMinutes: Number(v) })}
                options={[
                  ['25', '25 Min.'],
                  ['45', '45 Min.'],
                  ['60', '60 Min.'],
                  ['90', '90 Min.'],
                ]}
              />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px] text-muted">
                  Start
                  <input type="date" className="field mt-1 w-full" min={todayISO()} value={answers.start} onChange={(e) => e.target.value && set({ start: e.target.value })} aria-label="Start" />
                </label>
                <label className="block text-[13px] text-muted">
                  Freier Tag hinzufügen (optional)
                  <input type="date" className="field mt-1 w-full" min={answers.start} value="" onChange={(e) => e.target.value && !answers.offDays.includes(e.target.value) && set({ offDays: [...answers.offDays, e.target.value].sort() })} aria-label="Freier Tag" />
                </label>
              </div>
              {answers.offDays.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {answers.offDays.map((d) => (
                    <button key={d} type="button" className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)] px-2.5 py-1 text-[12.5px]" onClick={() => set({ offDays: answers.offDays.filter((x) => x !== d) })} aria-label={`Freien Tag ${formatISODate(d, { day: 'numeric', month: 'short' })} entfernen`}>
                      {formatISODate(d, { weekday: 'short', day: 'numeric', month: 'short' })} <X className="size-3.5" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </Question>
          )}
          {step === 'style' && (
            <Question icon={<Lightbulb />} tint={TINT.pink} title="Wie lernst du am besten?" text="Mehrfachauswahl. Die KI baut deine Lieblingsmethoden in die Einheiten ein.">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Lernmethoden">
                {METHODS.map((m) => {
                  const on = answers.methods.includes(m);
                  return (
                    <button key={m} type="button" aria-pressed={on} onClick={() => set({ methods: on ? answers.methods.filter((x) => x !== m) : [...answers.methods, m] })} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors ${on ? 'bg-[var(--ss-accent)] text-white' : 'bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)] text-muted'}`}>
                      {on && <Check className="size-3.5" aria-hidden />}
                      {m}
                    </button>
                  );
                })}
              </div>
              <label className="mt-6 block text-[14px] font-medium">
                Sonst noch etwas? <span className="font-normal text-faint">(optional)</span>
                <textarea className="field mt-1.5 min-h-24 w-full" maxLength={500} value={answers.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="z. B. „Dienstags habe ich Training“ oder „Kapitel 3 kann ich schon“" />
              </label>
              <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-snug text-faint">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Zur Erstellung gehen nur Fachnamen, Themen, Termine und Lernzeiten an die KI (Claude von Anthropic) – kein Name, keine E-Mail.
              </p>
            </Question>
          )}
          {step === 'working' && <Working />}
          {step === 'preview' && result && (
            <Preview
              result={result}
              names={names}
              colors={colors}
              saving={saving}
              group={group.kind}
              onApply={() => void apply()}
              onBack={() => setStep('time')}
              onRetry={() => void generate(true)}
            />
          )}
        </motion.div>
      </AnimatePresence>
      {STEPS.includes(step) && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(stepIdx === 0 ? 'intro' : STEPS[stepIdx - 1])}>
            Zurück
          </Button>
          {step === 'style' ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="primary" size="lg" icon={<Wand2 className="size-4" />} onClick={() => void generate(true)} data-testid="aiplan-generate">
                Lernplan erstellen
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="lg" icon={<ArrowRight className="size-4" />} disabled={!canNext} onClick={() => setStep(STEPS[stepIdx + 1])} data-testid="aiplan-next">
              Weiter
            </Button>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl" data-testid="aiplan">
      <Link to="/lernplan" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Lernplan
      </Link>
      <div className="mb-6 flex items-center gap-3.5">
        <span className="ai-badge grid size-12 place-items-center rounded-[16px] text-white" aria-hidden>
          <Sparkles className="size-6" />
        </span>
        <div>
          <h1 className="display text-[28px] leading-tight md:text-[34px]">KI-Lernplan</h1>
          <p className="text-[13.5px] text-muted">Dein persönlicher Plan bis zur Prüfung – in zwei Minuten.</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const items: [ReactNode, string, string][] = [
    [<Target key="t" />, 'Themen statt Chaos', 'Die KI zerlegt jedes Fach in machbare Einheiten – Lernen, Üben, Wiederholen.'],
    [<CalendarDays key="c" />, 'Passt in deinen Alltag', 'Nur an deinen Lerntagen, so viele Stunden, wie du willst – nie am Prüfungstag.'],
    [<GraduationCap key="g" />, 'Fit für die Prüfung', 'Wiederholungen und eine Probeklausur kurz vorher sind fest eingeplant.'],
  ];
  return (
    <Card className="p-5 md:p-7">
      <ul className="flex flex-col gap-4">
        {items.map(([icon, title, text]) => (
          <li key={title} className="flex items-start gap-3.5">
            <IconTile tint="var(--ss-accent)" size={38}>
              {icon}
            </IconTile>
            <div>
              <p className="text-[15px] font-semibold">{title}</p>
              <p className="text-[13.5px] leading-snug text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="primary" size="lg" className="mt-6 w-full" icon={<Sparkles className="size-4" />} onClick={onStart} data-testid="aiplan-start">
        Los geht’s – 5 kurze Fragen
      </Button>
      <p className="mt-3 text-center text-[12.5px] text-faint">Du siehst den Plan erst als Vorschau und entscheidest dann, ob er übernommen wird.</p>
    </Card>
  );
}

function Question({ icon, tint, title, text, children }: { icon: ReactNode; tint: string; title: string; text: string; children: ReactNode }) {
  return (
    <Card className="p-5 md:p-7">
      <div className="mb-5 flex items-start gap-3.5">
        <IconTile tint={tint} size={40}>
          {icon}
        </IconTile>
        <div>
          <h2 className="title text-[19px] leading-snug md:text-[21px]">{title}</h2>
          <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{text}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${value === v ? 'bg-[var(--ss-accent)] text-white shadow-[0_6px_18px_-8px_var(--ss-accent)]' : 'bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)] text-muted hover:text-ink'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function TopicEditor({ name, color, topics, onChange }: { name: string; color: string; topics: SubjectDraft['topics']; onChange: (t: SubjectDraft['topics']) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter((p) => p && !topics.some((t) => t.title.toLowerCase() === p.toLowerCase()));
    if (parts.length) onChange([...topics, ...parts.slice(0, 30 - topics.length).map((title) => ({ title: title.slice(0, 120), difficulty: 'mittel' as Difficulty }))]);
    setText('');
  };
  return (
    <div className="rounded-[18px] border border-line p-3.5">
      <p className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold">
        <span className="size-3 rounded-full" style={{ background: color }} aria-hidden />
        {name}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t, i) => (
          <span key={t.title} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-[13px] font-medium ${DIFF_STYLE[t.difficulty]}`}>
            <button type="button" onClick={() => onChange(topics.map((x, j) => (j === i ? { ...x, difficulty: DIFF_NEXT[x.difficulty] } : x)))} aria-label={`${t.title}: ${t.difficulty} – tippen zum Ändern`}>
              {t.title} · {t.difficulty}
            </button>
            <button type="button" className="grid size-6 place-items-center rounded-full hover:bg-black/5" onClick={() => onChange(topics.filter((_, j) => j !== i))} aria-label={`${t.title} entfernen`}>
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="field min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Thema eingeben, z. B. Integralrechnung" aria-label={`Thema für ${name}`} />
        <Button type="submit" icon={<Plus className="size-4" />} disabled={!text.trim()}>
          Hinzufügen
        </Button>
      </form>
    </div>
  );
}

function Working() {
  const reduce = useReducedMotion();
  const lines = ['Themen werden in Einheiten zerlegt …', 'Schwierige Themen bekommen mehr Übung …', 'Wiederholungen werden eingeplant …', 'Alles passt in deine Lerntage …'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % lines.length), 1600);
    return () => clearInterval(id);
  }, [lines.length]);
  return (
    <Card className="grid place-items-center p-10 text-center" data-testid="aiplan-working">
      <motion.span className="ai-badge grid size-20 place-items-center rounded-[26px] text-white" animate={reduce ? undefined : { rotate: [0, 8, -8, 0], scale: [1, 1.06, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} aria-hidden>
        <Sparkles className="size-9" />
      </motion.span>
      <h2 className="title mt-6 text-[20px]">Dein Lernplan entsteht</h2>
      <AnimatePresence mode="wait">
        <motion.p key={i} className="mt-2 text-[14px] text-muted" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} role="status">
          {lines[i]}
        </motion.p>
      </AnimatePresence>
    </Card>
  );
}

function Preview({
  result,
  names,
  colors,
  saving,
  group,
  onApply,
  onBack,
  onRetry,
}: {
  result: Result;
  names: Map<UUID, string>;
  colors: Map<UUID, string>;
  saving: { done: number; total: number } | null;
  group: 'solo' | 'team';
  onApply: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  const { plan } = result;
  const hours = Math.round((plan.totalMinutes / 60) * 10) / 10;
  const units = plan.days.reduce((a, d) => a + d.items.length, 0);
  const [showAll, setShowAll] = useState(false);
  const days = showAll ? plan.days : plan.days.slice(0, 7);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 md:p-6" data-testid="aiplan-summary">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${result.ai ? 'ai-badge text-white' : 'bg-[color-mix(in_srgb,var(--ss-text)_7%,transparent)] text-muted'}`} data-testid="aiplan-source">
            {result.ai ? <Sparkles className="size-3.5" aria-hidden /> : <Wand2 className="size-3.5" aria-hidden />}
            {result.ai ? 'Mit KI erstellt' : 'Nach Lernregeln erstellt'}
          </span>
          {result.left !== null && <span className="text-[12px] text-faint">noch {result.left} KI-Pläne heute</span>}
        </div>
        {result.note && (
          <p className="mt-3 flex items-start gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--ss-warn)_12%,transparent)] px-3 py-2 text-[13px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            {result.note}
          </p>
        )}
        <p className="mt-3 text-[14.5px] leading-relaxed">{result.summary}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            [plan.days.length, 'Lerntage'],
            [units, 'Einheiten'],
            [`${String(hours).replace('.', ',')} h`, 'Lernzeit'],
          ].map(([v, l]) => (
            <div key={l as string} className="rounded-[16px] bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] px-2 py-3">
              <p className="num text-[22px] font-semibold leading-none">{v}</p>
              <p className="mt-1 text-[12px] text-muted">{l}</p>
            </div>
          ))}
        </div>
        {result.tips.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {result.tips.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[13.5px] text-muted">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        )}
        {plan.overflow.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--ss-warn)_12%,transparent)] px-3 py-2 text-[13px]" data-testid="aiplan-overflow">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            {plan.overflow.length} {plan.overflow.length === 1 ? 'Einheit passt' : 'Einheiten passen'} nicht mehr vor die Prüfung. Mehr Zeit pro Tag, weitere Lerntage oder ein früherer Start helfen.
          </p>
        )}
      </Card>

      <Card className="p-4 md:p-5" data-testid="aiplan-days">
        <ul className="flex flex-col">
          {days.map((d) => (
            <li key={d.date} className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
              <p className="mb-1.5 text-[13px] font-semibold text-muted">{formatISODate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <ul className="flex flex-col gap-1.5">
                {d.items.map((it, k) => (
                  <li key={k} className="flex items-start gap-2.5 text-[14px]">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: colors.get(it.subjectId) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{it.title}</span>
                      <span className="block text-[12px] text-faint">
                        {names.get(it.subjectId)} · {KIND_LABEL[it.kind]} · {it.minutes} Min.
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {plan.days.length > 7 && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Weniger anzeigen' : `Alle ${plan.days.length} Lerntage anzeigen`}
          </Button>
        )}
      </Card>

      {group === 'team' && <p className="px-1 text-[12.5px] text-faint">In einer Lerngruppe erscheint der Plan im gemeinsamen Lernplan – für alle sichtbar, abhaken kann jede Person für sich.</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
            Anpassen
          </Button>
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
            Neu erstellen
          </Button>
        </div>
        <Button variant="primary" size="lg" icon={<Check className="size-4" />} loading={!!saving} disabled={plan.days.length === 0} onClick={onApply} data-testid="aiplan-apply">
          {saving ? `${saving.done} / ${saving.total} …` : 'In den Lernplan übernehmen'}
        </Button>
      </div>
    </div>
  );
}
