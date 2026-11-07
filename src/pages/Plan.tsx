import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlarmClock, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, GraduationCap, List, Plus } from 'lucide-react';
import type { Exam, ISODate, Member, StudyEntry } from '../lib/types';
import { groupBy, isDone, memberRatio, type TaskView } from '../lib/progress';
import {
  addDaysISO, addMonthsISO, formatISODate, formatTime, instantToZoned, isSameMonth, isValidISODate, isoWeekNumber, monthGrid, weekDays,
} from '../lib/time';
import { setQuery, useLocation } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMembers, useModules, useTaskViews } from '../store/derived';
import { moveEntry } from '../store/actions';
import { useUI } from '../store/ui';
import { useToday } from '../hooks/useToday';
import { useIsMobile } from '../hooks/useMediaQuery';
import { PageHeader } from '../components/layout/AppShell';
import { SemesterTimeline, TimelineLegend } from '../components/SemesterTimeline';
import { EntryCard } from '../components/EntryCard';
import { Button, IconButton } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/Progress';

type View = 'tag' | 'woche' | 'monat' | 'liste' | 'timeline';
type Status = 'alle' | 'offen' | 'erledigt' | 'ueberfaellig';

const VIEWS: { value: View; label: ReactNode }[] = [
  { value: 'tag', label: 'Tag' },
  { value: 'woche', label: 'Woche' },
  { value: 'monat', label: 'Monat' },
  { value: 'liste', label: 'Liste' },
  {
    value: 'timeline',
    label: (
      <>
        <CalendarRange className="size-4" aria-hidden />
        <span className="sr-only lg:not-sr-only">Timeline</span>
      </>
    ),
  },
];

interface DayInfo {
  date: ISODate;
  entries: StudyEntry[];
  views: TaskView[];
  exams: Exam[];
  done: boolean;
  overdue: boolean;
  pct: number | null;
}

/** Gemeinsamer Lernkalender. Eine Änderung gilt für alle. */
export function Plan({ me }: { me: Member }) {
  const { query } = useLocation();
  const today = useToday();
  const mobile = useIsMobile();
  const view = (['tag', 'woche', 'monat', 'liste', 'timeline'].includes(query.get('ansicht') ?? '') ? query.get('ansicht') : mobile ? 'woche' : 'monat') as View;
  const date = isValidISODate(query.get('datum') ?? '') ? query.get('datum')! : today;
  const moduleFilter = query.get('modul');
  const status = (['offen', 'erledigt', 'ueberfaellig'].includes(query.get('status') ?? '') ? query.get('status') : 'alle') as Status;

  const allViews = useTaskViews();
  const entriesMap = useData((s) => s.study_entries);
  const modulesMap = useData((s) => s.modules);
  const examsMap = useData((s) => s.exams);
  const completions = useData((s) => s.task_completions);
  const members = useActiveMembers();
  const modules = useModules();
  const openEditor = useUI((s) => s.openEntryEditor);

  // Aufgaben nach Filter (Status bezieht sich auf das aktive Profil)
  const views = useMemo(
    () =>
      allViews.filter((v) => {
        if (moduleFilter && v.module.id !== moduleFilter) return false;
        const d = isDone(completions, v.task.id, me.id);
        if (status === 'offen') return !d;
        if (status === 'erledigt') return d;
        if (status === 'ueberfaellig') return !d && v.date < today;
        return true;
      }),
    [allViews, moduleFilter, status, completions, me.id, today],
  );

  const entries = useMemo(
    () =>
      Object.values(entriesMap)
        .filter((e) => !e.deleted_at && !modulesMap[e.module_id]?.archived_at && (!moduleFilter || e.module_id === moduleFilter))
        .sort((a, b) => a.study_date.localeCompare(b.study_date) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [entriesMap, modulesMap, moduleFilter],
  );

  const examsByDate = useMemo(() => {
    const map = new Map<string, Exam[]>();
    for (const e of Object.values(examsMap)) {
      if (e.deleted_at || (moduleFilter && e.module_id !== moduleFilter)) continue;
      const d = instantToZoned(e.starts_at, e.timezone).date;
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return map;
  }, [examsMap, moduleFilter]);

  const viewsByDate = useMemo(() => groupBy(views, (v) => v.date), [views]);
  const allByDate = useMemo(() => groupBy(allViews.filter((v) => !moduleFilter || v.module.id === moduleFilter), (v) => v.date), [allViews, moduleFilter]);
  const entriesByDate = useMemo(() => groupBy(entries, (e) => e.study_date), [entries]);

  const dayInfo = (d: ISODate): DayInfo => {
    const dayAll = allByDate.get(d) ?? [];
    const r = memberRatio(dayAll, me.id, completions);
    const filteredViews = viewsByDate.get(d) ?? [];
    const entryIds = new Set(filteredViews.map((v) => v.entry.id));
    const dayEntries = (entriesByDate.get(d) ?? []).filter((e) => status === 'alle' || entryIds.has(e.id));
    return {
      date: d,
      entries: dayEntries,
      views: filteredViews,
      exams: examsByDate.get(d) ?? [],
      done: r.pct === 100,
      overdue: d < today && r.total > 0 && r.pct !== 100,
      pct: r.pct,
    };
  };

  const step = (dir: -1 | 1) => {
    const next = view === 'monat' ? addMonthsISO(date, dir) : view === 'woche' ? addDaysISO(date, dir * 7) : addDaysISO(date, dir);
    setQuery({ datum: next });
  };

  const label =
    view === 'monat'
      ? formatISODate(date, { month: 'long', year: 'numeric' })
      : view === 'woche'
        ? `KW ${isoWeekNumber(date)} · ${formatISODate(weekDays(date)[0], { day: 'numeric', month: 'short' })} – ${formatISODate(weekDays(date)[6], { day: 'numeric', month: 'short' })}`
        : view === 'tag'
          ? formatISODate(date, { weekday: 'long', day: 'numeric', month: 'long' })
          : 'Alle Lerntage';

  const onDropDate = (target: ISODate) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/studyspace-entry');
    const entry = id ? entriesMap[id] : undefined;
    if (entry && entry.study_date !== target) void moveEntry(id, target);
  };

  return (
    <div>
      <PageHeader
        title="Lernplan"
        subtitle="Gemeinsamer Kalender – Änderungen gelten für alle."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: view === 'tag' ? date : date < today ? today : date })}>
            Neuer Lerntag
          </Button>
        }
      />

      <div className="glass mat-nav z-10 mb-4 flex flex-col gap-3 rounded-[26px] p-2.5 md:sticky md:top-[68px] md:flex-row md:flex-wrap md:items-center">
        <Segmented label="Ansicht" value={view} onChange={(v) => setQuery({ ansicht: v })} options={VIEWS} size={mobile ? 'sm' : 'md'} dense={mobile} className="w-full md:w-auto" />
        {view !== 'liste' && view !== 'timeline' && (
          <div className="flex min-w-0 items-center gap-1 md:flex-1">
            <IconButton label="Zurück" size="sm" onClick={() => step(-1)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <IconButton label="Weiter" size="sm" onClick={() => step(1)}>
              <ChevronRight className="size-5" />
            </IconButton>
            <span className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold capitalize tracking-tight">{label}</span>
            <Button size="sm" variant="ghost" onClick={() => setQuery({ datum: today })}>
              Heute
            </Button>
          </div>
        )}
        {view === 'timeline' && <p className="px-2 text-[13px] text-muted md:flex-1">Alle Module auf einen Blick: Lernphasen, Fortschritt und Prüfungen.</p>}
        <div className={`grid grid-cols-2 gap-1.5 md:w-full xl:ml-auto xl:flex xl:w-auto xl:items-center ${view === 'timeline' ? 'hidden' : ''}`}>
          <select
            aria-label="Nach Modul filtern"
            className="field !h-9 !min-h-9 !rounded-xl !py-0 text-[13px] xl:!w-auto xl:max-w-[220px]"
            value={moduleFilter ?? ''}
            onChange={(e) => setQuery({ modul: e.target.value || null })}
          >
            <option value="">Alle Module</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Nach Status filtern"
            className="field !h-9 !min-h-9 !rounded-xl !py-0 text-[13px] xl:!w-auto"
            value={status}
            onChange={(e) => setQuery({ status: e.target.value === 'alle' ? null : e.target.value })}
          >
            <option value="alle">Alle Aufgaben</option>
            <option value="offen">Offen</option>
            <option value="erledigt">Erledigt</option>
            <option value="ueberfaellig">Überfällig</option>
          </select>
        </div>
      </div>

      {view === 'timeline' && (
        <section className="card rounded-[var(--radius-card)] p-4 md:p-6">
          <SemesterTimeline />
          <div className="mt-5 border-t border-line pt-4">
            <TimelineLegend />
          </div>
        </section>
      )}
      {view === 'monat' && (mobile ? <MonthMobile date={date} today={today} info={dayInfo} me={me} members={members} /> : <MonthGrid date={date} today={today} info={dayInfo} onDrop={onDropDate} />)}
      {view === 'woche' && (mobile ? <WeekMobile date={date} today={today} info={dayInfo} /> : <WeekGrid date={date} today={today} info={dayInfo} onDrop={onDropDate} />)}
      {view === 'tag' && <DayView info={dayInfo(date)} me={me} members={members} views={views} />}
      {view === 'liste' && <ListView entries={entries} views={views} status={status} me={me} members={members} today={today} />}
    </div>
  );
}

// ---------------------------------------------------------------------

function useModuleColor() {
  const modules = useData((s) => s.modules);
  return (id: string) => modules[id]?.color ?? '#AFC5F5';
}

function DayBadges({ info }: { info: DayInfo }) {
  if (info.done) return <Check className="size-3.5 text-success" aria-label="alles erledigt" />;
  if (info.overdue) return <AlarmClock className="size-3.5 text-warn" aria-label="überfällig" />;
  return null;
}

function ExamPill({ exam, small }: { exam: Exam; small?: boolean }) {
  const modules = useData((s) => s.modules);
  const m = modules[exam.module_id];
  return (
    <span
      className={`flex min-w-0 items-center gap-1 rounded-lg border-[1.5px] border-dashed font-semibold ${small ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-1 text-xs'}`}
      style={{ borderColor: m?.color, color: 'var(--ss-text)', background: `color-mix(in srgb, ${m?.color} 14%, transparent)` }}
      title={`Prüfung: ${m?.name}`}
    >
      <GraduationCap className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        Prüfung {formatTime(exam.starts_at, exam.timezone)} · {m?.name}
      </span>
    </span>
  );
}

function EntryChip({ entry, info }: { entry: StudyEntry; info: DayInfo }) {
  const color = useModuleColor()(entry.module_id);
  const openEditor = useUI((s) => s.openEntryEditor);
  const n = info.views.filter((v) => v.entry.id === entry.id).length;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/studyspace-entry', entry.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        openEditor({ entryId: entry.id });
      }}
      className="flex w-full min-w-0 cursor-grab items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[11.5px] font-medium transition-colors active:cursor-grabbing"
      style={{ background: `color-mix(in srgb, ${color} 24%, transparent)` }}
      title={`${entry.title} – ziehen zum Verschieben`}
    >
      <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{entry.title}</span>
      {n > 0 && <span className="num ml-auto shrink-0 text-[10px] text-muted">{n}</span>}
    </button>
  );
}

function MonthGrid({ date, today, info, onDrop }: { date: ISODate; today: ISODate; info: (d: ISODate) => DayInfo; onDrop: (d: ISODate) => (e: DragEvent) => void }) {
  const days = monthGrid(date);
  const [over, setOver] = useState<string | null>(null);
  const openEditor = useUI((s) => s.openEntryEditor);
  return (
    <div className="card overflow-hidden rounded-[var(--radius-card)]">
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <div key={d} className="py-2.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const di = info(d);
          const inMonth = isSameMonth(d, date);
          const isToday = d === today;
          return (
            <div
              key={d}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={() => setOver((o) => (o === d ? null : o))}
              onDrop={(e) => {
                setOver(null);
                onDrop(d)(e);
              }}
              className={`group relative flex min-h-[124px] flex-col gap-1 border-line p-1.5 transition-colors ${i % 7 !== 6 ? 'border-r' : ''} ${i < 35 ? 'border-b' : ''} ${
                inMonth ? '' : 'bg-[color-mix(in_srgb,var(--ss-text)_3%,transparent)]'
              } ${over === d ? 'bg-[color-mix(in_srgb,var(--ss-accent)_12%,transparent)]' : ''}`}
            >
              <div className="flex items-center gap-1 px-0.5">
                <button
                  type="button"
                  onClick={() => setQuery({ ansicht: 'tag', datum: d })}
                  className={`num grid size-7 place-items-center rounded-full text-[13px] font-semibold ${isToday ? 'bg-ink text-canvas' : inMonth ? '' : 'text-faint'}`}
                  aria-label={`${formatISODate(d, { weekday: 'long', day: 'numeric', month: 'long' })} öffnen`}
                >
                  {Number(d.slice(8))}
                </button>
                <DayBadges info={di} />
                <button
                  type="button"
                  onClick={() => openEditor({ date: d })}
                  className="ml-auto grid size-6 place-items-center rounded-lg text-muted opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)] focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Lerntag am ${formatISODate(d)} anlegen`}
                >
                  <Plus className="size-4" />
                </button>
              </div>
              {di.exams.map((e) => (
                <ExamPill key={e.id} exam={e} small />
              ))}
              {di.entries.slice(0, 3).map((e) => (
                <EntryChip key={e.id} entry={e} info={di} />
              ))}
              {di.entries.length > 3 && (
                <button type="button" onClick={() => setQuery({ ansicht: 'tag', datum: d })} className="px-1.5 text-left text-[11px] font-medium text-muted">
                  +{di.entries.length - 3} weitere
                </button>
              )}
              {di.pct !== null && !di.done && di.pct > 0 && (
                <div className="mt-auto px-0.5 pb-0.5">
                  <ProgressBar ratio={{ done: 0, total: 1, pct: di.pct }} color="var(--ss-accent)" height={3} label="Tagesfortschritt" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthMobile({ date, today, info, me, members }: { date: ISODate; today: ISODate; info: (d: ISODate) => DayInfo; me: Member; members: Member[] }) {
  const days = monthGrid(date);
  const color = useModuleColor();
  const selected = info(date);
  const allViews = useTaskViews();
  return (
    <div className="flex flex-col gap-4">
      <div className="card rounded-[var(--radius-card)] p-2">
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
          {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((d) => {
            const di = info(d);
            const isSel = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setQuery({ datum: d })}
                aria-label={formatISODate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
                aria-pressed={isSel}
                className={`relative mx-auto flex h-12 w-full max-w-[46px] flex-col items-center justify-center gap-1 rounded-2xl ${isSel ? 'bg-ink text-canvas' : ''} ${
                  !isSameMonth(d, date) ? 'opacity-35' : ''
                }`}
              >
                <span className={`num text-[15px] font-semibold ${d === today && !isSel ? 'text-accent' : ''}`}>{Number(d.slice(8))}</span>
                <span className="flex h-1.5 gap-0.5">
                  {di.exams.length > 0 && <span className="size-1.5 rounded-sm border border-current" />}
                  {[...new Set(di.entries.map((e) => e.module_id))].slice(0, 3).map((m) => (
                    <span key={m} className="size-1.5 rounded-full" style={{ background: color(m) }} />
                  ))}
                </span>
                {di.done && <Check className="absolute right-0.5 top-0.5 size-3 text-success" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      <DayView info={selected} me={me} members={members} views={allViews} compactHeader />
    </div>
  );
}

function WeekGrid({ date, today, info, onDrop }: { date: ISODate; today: ISODate; info: (d: ISODate) => DayInfo; onDrop: (d: ISODate) => (e: DragEvent) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const openEditor = useUI((s) => s.openEntryEditor);
  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays(date).map((d) => {
        const di = info(d);
        return (
          <div
            key={d}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(d);
            }}
            onDragLeave={() => setOver((o) => (o === d ? null : o))}
            onDrop={(e) => {
              setOver(null);
              onDrop(d)(e);
            }}
            className={`card flex min-h-[420px] flex-col gap-1.5 rounded-[20px] p-2 transition-colors ${over === d ? '!border-accent' : ''} ${d === today ? 'ring-2 ring-[color-mix(in_srgb,var(--ss-accent)_40%,transparent)]' : ''}`}
          >
            <button type="button" onClick={() => setQuery({ ansicht: 'tag', datum: d })} className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-left hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]">
              <span className="text-[11px] font-semibold uppercase text-muted">{formatISODate(d, { weekday: 'short' })}</span>
              <span className="num text-lg font-semibold">{Number(d.slice(8))}</span>
              <span className="ml-auto">
                <DayBadges info={di} />
              </span>
            </button>
            {di.pct !== null && <ProgressBar ratio={{ done: 0, total: 1, pct: di.pct }} color="var(--ss-accent)" height={3} label="Tagesfortschritt" />}
            {di.exams.map((e) => (
              <ExamPill key={e.id} exam={e} small />
            ))}
            {di.entries.map((e) => (
              <EntryChip key={e.id} entry={e} info={di} />
            ))}
            <button type="button" onClick={() => openEditor({ date: d })} className="mt-auto flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-muted hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]">
              <Plus className="size-3.5" aria-hidden /> Lerntag
            </button>
          </div>
        );
      })}
    </div>
  );
}

function WeekMobile({ date, today, info }: { date: ISODate; today: ISODate; info: (d: ISODate) => DayInfo }) {
  const color = useModuleColor();
  const modules = useData((s) => s.modules);
  return (
    <ul className="flex flex-col gap-2.5">
      {weekDays(date).map((d, i) => {
        const di = info(d);
        const isToday = d === today;
        return (
          <motion.li key={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <button
              type="button"
              onClick={() => setQuery({ ansicht: 'tag', datum: d })}
              className={`card flex w-full items-center gap-3 rounded-[20px] p-3.5 text-left active:scale-[0.99] ${isToday ? 'ring-2 ring-[color-mix(in_srgb,var(--ss-accent)_45%,transparent)]' : ''}`}
            >
              <span className={`grid w-12 shrink-0 place-items-center rounded-2xl py-1.5 ${isToday ? 'bg-ink text-canvas' : 'lens'}`}>
                <span className="text-[11px] font-semibold uppercase opacity-70">{formatISODate(d, { weekday: 'short' })}</span>
                <span className="num text-xl font-semibold leading-tight">{Number(d.slice(8))}</span>
              </span>
              <span className="min-w-0 flex-1">
                {di.exams.length > 0 && (
                  <span className="mb-1 flex flex-wrap gap-1">
                    {di.exams.map((e) => (
                      <ExamPill key={e.id} exam={e} small />
                    ))}
                  </span>
                )}
                {di.entries.length === 0 ? (
                  <span className="text-sm text-faint">Nichts geplant</span>
                ) : (
                  <span className="flex flex-col gap-0.5">
                    {di.entries.slice(0, 3).map((e) => (
                      <span key={e.id} className="flex items-center gap-1.5 text-sm">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: color(e.module_id) }} aria-hidden />
                        <span className="truncate font-medium">{e.title}</span>
                        <span className="truncate text-xs text-muted">{modules[e.module_id]?.name}</span>
                      </span>
                    ))}
                    {di.entries.length > 3 && <span className="text-xs text-muted">+{di.entries.length - 3} weitere</span>}
                  </span>
                )}
                {di.pct !== null && (
                  <span className="mt-2 flex items-center gap-2">
                    <ProgressBar ratio={{ done: 0, total: 1, pct: di.pct }} color="var(--ss-accent)" height={4} label="Tagesfortschritt" />
                    <span className="num shrink-0 text-xs font-semibold">{di.pct}%</span>
                  </span>
                )}
              </span>
              <span className="shrink-0">
                <DayBadges info={di} />
              </span>
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}

function DayView({ info, me, members, views, compactHeader }: { info: DayInfo; me: Member; members: Member[]; views: TaskView[]; compactHeader?: boolean }) {
  const openEditor = useUI((s) => s.openEntryEditor);
  return (
    <div className="flex flex-col gap-3">
      {compactHeader && (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[17px] font-semibold capitalize tracking-tight">{formatISODate(info.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: info.date })}>
            Lerntag
          </Button>
        </div>
      )}
      {info.exams.map((e) => (
        <ExamPill key={e.id} exam={e} />
      ))}
      {info.overdue && (
        <p className="flex items-center gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--ss-warn)_12%,transparent)] px-4 py-2.5 text-sm">
          <AlarmClock className="size-4 text-warn" aria-hidden /> Dieser Lerntag ist vorbei und noch nicht vollständig erledigt.
        </p>
      )}
      {info.entries.length === 0 ? (
        <div className="card rounded-[var(--radius-card)]">
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title="Für diesen Tag ist nichts geplant"
            text="Lege einen Lerntag mit Thema und Unteraufgaben an."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: info.date })}>
                Lerntag anlegen
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {info.entries.map((e) => (
            <EntryCard key={e.id} entry={e} views={views} member={me} members={members} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListView({ entries, views, status, me, members, today }: { entries: StudyEntry[]; views: TaskView[]; status: Status; me: Member; members: Member[]; today: ISODate }) {
  const [showPast, setShowPast] = useState(status === 'ueberfaellig' || status === 'erledigt');
  const entryIds = new Set(views.map((v) => v.entry.id));
  const visible = entries.filter((e) => (status === 'alle' || entryIds.has(e.id)) && (showPast || e.study_date >= today || status !== 'alle'));
  const byDate = groupBy(visible, (e) => e.study_date);
  const hiddenPast = status === 'alle' && !showPast ? entries.filter((e) => e.study_date < today).length : 0;
  return (
    <div className="flex flex-col gap-6">
      {hiddenPast > 0 && (
        <Button variant="ghost" size="sm" className="self-start" icon={<List className="size-4" />} onClick={() => setShowPast(true)}>
          {hiddenPast} vergangene Lerntage einblenden
        </Button>
      )}
      {visible.length === 0 && (
        <div className="card rounded-[var(--radius-card)]">
          <EmptyState icon={<List className="size-6" />} title="Keine passenden Lerntage" text="Passe die Filter an oder lege einen neuen Lerntag an." />
        </div>
      )}
      {[...byDate.entries()].map(([d, list]) => (
        <section key={d}>
          <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[15px] font-semibold capitalize">
            {formatISODate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
            {d === today && <span className="text-xs font-semibold normal-case text-accent">Heute</span>}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((e) => (
              <EntryCard key={e.id} entry={e} views={views} member={me} members={members} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
