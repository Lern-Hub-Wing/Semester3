import { useEffect, useMemo, useState } from 'react';
import { IS_APP } from '../../lib/edition';
import { ArrowRight, CalendarRange, Plus, RefreshCw, X } from 'lucide-react';
import { distributeUnits, replanUnits, suggestedUnits, unitTitle, workWindow, type Priority, type ReplanChange } from '../../lib/homework';
import { formatISODate, instantToZoned } from '../../lib/time';
import type { ISODate, UUID } from '../../lib/types';
import { useUI } from '../../store/ui';
import { useCurrentMember, useModules, useTaskViews } from '../../store/derived';
import { useData } from '../../store/data';
import { createHomework, saveParts, updateHomework, useHomework } from '../../store/homework';
import { useToday } from '../../hooks/useToday';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SelectField, TextArea, TextField } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { FileDrop, AttachmentList } from '../Attachments';
import { HomeworkCalendar } from './HomeworkCalendar';

/** Belegung je Tag (Lernplan-Aufgaben + andere Hausaufgaben) und Prüfungstage – für die Verteilung */
export function usePlanContext(excludeHomeworkId?: UUID) {
  const views = useTaskViews();
  const exams = useData((s) => s.exams);
  const parts = useHomework((s) => s.parts);
  const homework = useHomework((s) => s.homework);
  return useMemo(() => {
    const load: Record<ISODate, number> = {};
    for (const v of views) load[v.date] = (load[v.date] ?? 0) + 1;
    for (const p of Object.values(parts)) {
      if (p.kind !== 'unit' || !p.planned_date || p.deleted_at || p.homework_id === excludeHomeworkId) continue;
      if (homework[p.homework_id]?.deleted_at) continue;
      load[p.planned_date] = (load[p.planned_date] ?? 0) + 1;
    }
    const examDays = Object.values(exams)
      .filter((e) => !e.deleted_at)
      .map((e) => instantToZoned(e.starts_at).date);
    return { load, examDays };
  }, [views, exams, parts, homework, excludeHomeworkId]);
}

interface FormState {
  title: string;
  moduleId: string;
  due: ISODate;
  description: string;
  subtasks: { id?: UUID; title: string }[];
  removedSubtasks: UUID[];
  effort: string;
  earliest: ISODate | '';
  priority: Priority;
  planUnits: boolean;
  unitCount: number;
  /** Vorschau neuer Einheiten (editierbar) */
  preview: ISODate[];
  previewEdited: boolean;
  /** Bestehende Einheiten (Bearbeiten): id → Datum */
  unitDates: Record<UUID, ISODate>;
}

/** Globaler Editor: neue Hausaufgabe anlegen oder bestehende bearbeiten. */
export function HomeworkEditor() {
  const { open, session, id } = useUI((s) => s.homeworkEditor);
  const close = () => useUI.setState((s) => ({ homeworkEditor: { ...s.homeworkEditor, open: false } }));
  return open ? <EditorBody key={session} id={id} onClose={close} /> : null;
}

function EditorBody({ id, onClose }: { id?: UUID; onClose: () => void }) {
  const today = useToday();
  const me = useCurrentMember();
  const modules = useModules();
  const existing = useHomework((s) => (id ? s.homework[id] : undefined));
  const allParts = useHomework((s) => s.parts);
  const completions = useHomework((s) => s.completions);
  const ctx = usePlanContext(id);
  const parts = useMemo(() => Object.values(allParts).filter((p) => p.homework_id === id && !p.deleted_at).sort((a, b) => a.sort_order - b.sort_order), [allParts, id]);
  const existingUnits = parts.filter((p) => p.kind === 'unit');
  const color = modules.find((m) => m.id === (existing?.module_id ?? ''))?.color ?? 'var(--ss-accent)';

  const [f, setF] = useState<FormState>(() => ({
    title: existing?.title ?? '',
    moduleId: existing?.module_id ?? modules[0]?.id ?? '',
    due: existing?.due_date ?? '',
    description: existing?.description ?? '',
    subtasks: parts.filter((p) => p.kind === 'subtask').map((p) => ({ id: p.id, title: p.title })),
    removedSubtasks: [],
    effort: existing?.effort_minutes ? String(existing.effort_minutes) : '',
    earliest: existing?.earliest_start ?? '',
    priority: existing?.priority ?? 2,
    planUnits: false,
    unitCount: existing?.unit_count ?? 2,
    preview: [],
    previewEdited: false,
    unitDates: Object.fromEntries(existingUnits.map((u) => [u.id, u.planned_date!])),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replan, setReplan] = useState<{ changes: ReplanChange[]; all: boolean } | null>(null);
  const set = (p: Partial<FormState>) => setF((s) => ({ ...s, ...p }));

  const window = useMemo(() => (f.due ? workWindow(today, f.due, f.earliest || null) : null), [today, f.due, f.earliest]);

  // Vorschlag automatisch neu berechnen, solange nicht von Hand angepasst
  useEffect(() => {
    if (!f.planUnits || f.previewEdited || !window) return;
    const dates = distributeUnits({ count: f.unitCount, window, load: ctx.load, examDays: ctx.examDays, priority: f.priority });
    setF((s) => ({ ...s, preview: dates }));
  }, [f.planUnits, f.previewEdited, f.unitCount, f.priority, window, ctx]);

  const effortNum = f.effort ? Math.max(1, Math.min(6000, Math.round(Number(f.effort)))) : null;

  function validate(): string | null {
    if (!f.title.trim()) return 'Bitte einen Titel eingeben.';
    if (!f.moduleId) return 'Bitte ein Modul wählen.';
    if (!f.due) return 'Bitte ein Abgabedatum wählen.';
    if (f.earliest && f.earliest >= f.due) return 'Der früheste Beginn muss vor der Abgabe liegen.';
    if (f.effort && (!Number.isFinite(Number(f.effort)) || Number(f.effort) <= 0)) return 'Aufwand bitte in Minuten angeben.';
    if (f.planUnits && f.preview.some((d) => !d || d >= f.due)) return 'Arbeitseinheiten müssen vor dem Abgabetag liegen.';
    return null;
  }

  async function submit(applyReplan?: ReplanChange[]) {
    const err = validate();
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      if (!id) {
        const newId = await createHomework({
          module_id: f.moduleId,
          title: f.title,
          description: f.description || null,
          due_date: f.due,
          earliest_start: f.earliest || null,
          priority: f.priority,
          effort_minutes: effortNum,
          unit_count: f.planUnits ? f.preview.length : null,
          subtasks: f.subtasks,
          units: f.planUnits ? [...f.preview].sort().map((d, i, arr) => ({ date: d, title: unitTitle(i, arr.length) })) : [],
        });
        if (newId) onClose();
        return;
      }
      // Bearbeiten: Abgabe geändert und Einheiten vorhanden → erst Neuplanung zeigen
      const dueChanged = existing && (existing.due_date !== f.due || (existing.earliest_start ?? '') !== f.earliest);
      if (dueChanged && existingUnits.length > 0 && !applyReplan && window) {
        const completedIds = new Set(existingUnits.filter((u) => Object.values(completions).some((c) => c.target_id === u.id && c.is_completed)).map((u) => u.id));
        const units = existingUnits.map((u) => ({ id: u.id, planned_date: f.unitDates[u.id] ?? u.planned_date }));
        const changes = replanUnits(units, window, { completedIds, all: false, load: ctx.load, examDays: ctx.examDays, priority: f.priority });
        setReplan({ changes, all: false });
        return;
      }
      const ok = await updateHomework(id, {
        title: f.title.trim(),
        module_id: f.moduleId,
        description: f.description.trim() || null,
        due_date: f.due,
        earliest_start: f.earliest || null,
        priority: f.priority,
        effort_minutes: effortNum,
        unit_count: existingUnits.length + (f.planUnits ? f.preview.length : 0) || null,
      });
      if (!ok) return;
      const moved = new Map((applyReplan ?? []).map((c) => [c.id, c.to]));
      const update = [
        ...existingUnits
          .map((u) => ({ id: u.id, date: moved.get(u.id) ?? f.unitDates[u.id] ?? u.planned_date! }))
          .filter((u) => u.date !== existingUnits.find((x) => x.id === u.id)!.planned_date)
          .map((u) => ({ id: u.id, patch: { planned_date: u.date } })),
        ...f.subtasks.filter((s) => s.id && s.title.trim() && s.title.trim() !== parts.find((p) => p.id === s.id)?.title).map((s) => ({ id: s.id!, patch: { title: s.title.trim() } })),
        ...f.removedSubtasks.map((sid) => ({ id: sid, patch: { deleted_at: new Date().toISOString() } })),
      ];
      const maxSort = parts.reduce((m, p) => Math.max(m, p.sort_order), 0);
      const insert = [
        ...f.subtasks.filter((s) => !s.id && s.title.trim()).map((s, i) => ({ kind: 'subtask' as const, title: s.title, planned_date: null, sort_order: maxSort + 1 + i })),
        ...(f.planUnits ? [...f.preview].sort().map((d, i, arr) => ({ kind: 'unit' as const, title: unitTitle(existingUnits.length + i, existingUnits.length + arr.length), planned_date: d, sort_order: maxSort + 100 + i })) : []),
      ];
      if (update.length || insert.length) await saveParts(id, { update, insert });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const footer = replan ? (
    <div className="flex w-full flex-wrap justify-end gap-2">
      <Button variant="ghost" onClick={() => void submit([])} disabled={busy}>
        Termine behalten
      </Button>
      <Button variant="primary" onClick={() => void submit(replan.changes)} loading={busy} data-testid="homework-replan-apply">
        Neue Termine übernehmen
      </Button>
    </div>
  ) : (
    <div className="flex w-full justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>
        Abbrechen
      </Button>
      <Button variant="primary" onClick={() => void submit()} loading={busy} data-testid="homework-save">
        {id ? 'Speichern' : f.planUnits ? 'Anlegen und einplanen' : 'Anlegen'}
      </Button>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={replan ? 'Termine anpassen?' : id ? 'Hausaufgabe bearbeiten' : 'Neue Hausaufgabe'} wide footer={footer}>
      {replan ? (
        <ReplanStep
          replan={replan}
          onChange={setReplan}
          recompute={(all) => {
            if (!window) return;
            const completedIds = new Set(existingUnits.filter((u) => Object.values(completions).some((c) => c.target_id === u.id && c.is_completed)).map((u) => u.id));
            const units = existingUnits.map((u) => ({ id: u.id, planned_date: f.unitDates[u.id] ?? u.planned_date }));
            setReplan({ all, changes: replanUnits(units, window, { completedIds, all, load: ctx.load, examDays: ctx.examDays, priority: f.priority }) });
          }}
          titles={Object.fromEntries(existingUnits.map((u) => [u.id, u.title]))}
          due={f.due}
          window={window}
          today={today}
          examDays={ctx.examDays}
          color={color}
          otherUnits={existingUnits.map((u) => f.unitDates[u.id] ?? u.planned_date!)}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_300px]">
          <form
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextField label="Titel" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required autoFocus={!id} placeholder="z. B. Übungsblatt 4" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Modul" value={f.moduleId} onChange={(e) => set({ moduleId: e.target.value })} required>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </SelectField>
              <TextField label="Abgabe" type="date" value={f.due} min={id ? undefined : today} onChange={(e) => set({ due: e.target.value })} required />
            </div>

            <details className="group rounded-[18px] border border-line px-4 py-3" open={!!id || undefined}>
              <summary className="cursor-pointer select-none text-[14px] font-medium">Weitere Angaben</summary>
              <div className="mt-4 flex flex-col gap-4">
                <TextArea label="Beschreibung" value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={4000} rows={3} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="Frühester Beginn" type="date" value={f.earliest} max={f.due || undefined} onChange={(e) => set({ earliest: e.target.value as ISODate | '' })} />
                  <TextField label="Aufwand (Minuten)" type="number" inputMode="numeric" min={1} max={6000} value={f.effort} onChange={(e) => set({ effort: e.target.value })} />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-muted">Priorität</p>
                  <Segmented
                    label="Priorität"
                    size="sm"
                    value={String(f.priority) as '1' | '2' | '3'}
                    onChange={(v) => set({ priority: Number(v) as Priority })}
                    options={[
                      { value: '1', label: 'Niedrig' },
                      { value: '2', label: 'Normal' },
                      { value: '3', label: 'Hoch' },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-muted">Unteraufgaben</p>
                  <ul className="flex flex-col gap-2">
                    {f.subtasks.map((s, i) => (
                      <li key={s.id ?? `n${i}`} className="flex items-center gap-2">
                        <input
                          className="field !min-h-10 flex-1 !py-2"
                          value={s.title}
                          maxLength={200}
                          aria-label={`Unteraufgabe ${i + 1}`}
                          onChange={(e) => set({ subtasks: f.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                        />
                        <button
                          type="button"
                          aria-label={`Unteraufgabe ${i + 1} entfernen`}
                          className="grid size-10 place-items-center rounded-full text-muted hover:text-ink"
                          onClick={() => set({ subtasks: f.subtasks.filter((_, j) => j !== i), removedSubtasks: s.id ? [...f.removedSubtasks, s.id] : f.removedSubtasks })}
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="ghost" className="mt-1" icon={<Plus className="size-4" />} onClick={() => set({ subtasks: [...f.subtasks, { title: '' }] })}>
                    Unteraufgabe
                  </Button>
                </div>
                {!IS_APP && id && me && (
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-muted">Anhänge</p>
                    <AttachmentList targetType="homework" targetId={id} compact />
                    <FileDrop target={{ module_id: f.moduleId || null, target_type: 'homework', target_id: id }} />
                  </div>
                )}
              </div>
            </details>

            {id && existingUnits.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-medium text-muted">Geplante Arbeitseinheiten</p>
                <ul className="flex flex-col gap-2">
                  {existingUnits.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 text-[14px]">
                      <span className="min-w-0 flex-1 truncate">{u.title}</span>
                      <input type="date" className="field !min-h-10 !w-auto !py-2" value={f.unitDates[u.id] ?? ''} max={f.due ? addDay(f.due, -1) : undefined} aria-label={`Datum ${u.title}`} onChange={(e) => set({ unitDates: { ...f.unitDates, [u.id]: e.target.value } })} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-[18px] border border-line px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[14px] font-medium">
                  <CalendarRange className="size-4 text-accent" aria-hidden />
                  {id && existingUnits.length ? 'Weitere Arbeitseinheiten einplanen' : 'Arbeitseinheiten einplanen'}
                </span>
                <Switch
                  label="Arbeitseinheiten einplanen"
                  checked={f.planUnits}
                  disabled={!window || window.days.length === 0}
                  onChange={(planUnits) => set({ planUnits, previewEdited: false, unitCount: planUnits ? suggestedUnits(effortNum, window?.days.length ?? 1) : f.unitCount })}
                />
              </div>
              {f.planUnits && window && (
                <div className="mt-3 flex flex-col gap-3" data-testid="homework-preview">
                  <div className="flex items-center gap-3 text-[14px]">
                    <span className="flex-1">Anzahl</span>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Eine Einheit weniger" className="grid size-9 place-items-center rounded-full border border-line" onClick={() => set({ unitCount: Math.max(1, f.unitCount - 1), previewEdited: false })}>
                        –
                      </button>
                      <span className="num w-8 text-center font-semibold" data-testid="homework-unit-count">
                        {f.unitCount}
                      </span>
                      <button type="button" aria-label="Eine Einheit mehr" className="grid size-9 place-items-center rounded-full border border-line" onClick={() => set({ unitCount: Math.min(30, f.unitCount + 1), previewEdited: false })}>
                        +
                      </button>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {f.preview.map((d, i) => (
                      <li key={i} className="flex items-center gap-3 text-[14px]">
                        <span className="min-w-0 flex-1 truncate">{unitTitle(i, f.preview.length)}</span>
                        <input
                          type="date"
                          className="field !min-h-10 !w-auto !py-2"
                          value={d}
                          min={window.start}
                          max={window.end}
                          aria-label={`Datum ${unitTitle(i, f.preview.length)}`}
                          onChange={(e) => set({ preview: f.preview.map((x, j) => (j === i ? e.target.value : x)), previewEdited: true })}
                        />
                      </li>
                    ))}
                  </ul>
                  {f.previewEdited && (
                    <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => set({ previewEdited: false })}>
                      Vorschlag neu berechnen
                    </Button>
                  )}
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className="text-[13.5px] font-medium text-danger">
                {error}
              </p>
            )}
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>

          <aside className="min-w-0">
            {window ? (
              <>
                <p className="mb-3 text-[13px] text-muted">
                  {window.days.length > 0
                    ? `${window.days.length} ${window.days.length === 1 ? 'Arbeitstag' : 'Arbeitstage'}: ${formatISODate(window.start, { day: 'numeric', month: 'short' })} – ${formatISODate(window.end, { day: 'numeric', month: 'short' })}`
                    : 'Kein Arbeitstag mehr vor der Abgabe'}
                </p>
                <HomeworkCalendar window={window} due={f.due} today={today} examDays={ctx.examDays} color={color} units={[...(f.planUnits ? f.preview : []), ...Object.values(f.unitDates)]} />
              </>
            ) : (
              <div className="grid h-full min-h-40 place-items-center rounded-[18px] border border-dashed border-line p-4 text-center text-[13px] text-muted">
                <CalendarRange className="mb-2 size-6" aria-hidden />
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

function addDay(d: ISODate, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function ReplanStep({
  replan,
  onChange,
  recompute,
  titles,
  due,
  window,
  today,
  examDays,
  color,
  otherUnits,
}: {
  replan: { changes: ReplanChange[]; all: boolean };
  onChange: (r: { changes: ReplanChange[]; all: boolean }) => void;
  recompute: (all: boolean) => void;
  titles: Record<string, string>;
  due: ISODate;
  window: ReturnType<typeof workWindow> | null;
  today: ISODate;
  examDays: ISODate[];
  color: string;
  otherUnits: ISODate[];
}) {
  const moved = new Map(replan.changes.map((c) => [c.from, c.to]));
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]" data-testid="homework-replan">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-[14px]">
          Neue Abgabe: <strong>{formatISODate(due, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>. Erledigte Einheiten bleiben, wo sie sind.
        </p>
        <label className="flex items-center justify-between gap-3 text-[14px]">
          <span>Alle offenen Einheiten neu verteilen</span>
          <Switch label="Alle offenen Einheiten neu verteilen" checked={replan.all} onChange={recompute} />
        </label>
        {replan.changes.length === 0 ? (
          <p className="text-[14px] text-muted">Alle Einheiten passen weiterhin in den Zeitraum.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {replan.changes.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{titles[c.id]}</span>
                <span className="num text-muted line-through">{c.from ? formatISODate(c.from, { day: 'numeric', month: 'short' }) : '–'}</span>
                <ArrowRight className="size-4 text-muted" aria-hidden />
                <input
                  type="date"
                  className="field !min-h-10 !w-auto !py-2"
                  value={c.to}
                  max={window?.end}
                  aria-label={`Neues Datum ${titles[c.id]}`}
                  onChange={(e) => onChange({ ...replan, changes: replan.changes.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {window && <HomeworkCalendar window={window} due={due} today={today} examDays={examDays} color={color} units={otherUnits.map((d) => moved.get(d) ?? d)} />}
    </div>
  );
}
