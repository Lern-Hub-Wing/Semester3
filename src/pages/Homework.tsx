import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarClock, ChevronDown, Database, Flag, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Member } from '../lib/types';
import { daysUntil, dueLabel, homeworkProgress, hwKey, PRIORITY_LABEL, type Homework as HW, type HomeworkPart } from '../lib/homework';
import { formatISODate } from '../lib/time';
import { useHomework, setHomeworkDone, trashHomework } from '../store/homework';
import { openHomeworkEditor } from '../store/ui';
import { useActiveMembers } from '../store/derived';
import { useData } from '../store/data';
import { useToday } from '../hooks/useToday';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Segmented } from '../components/ui/Segmented';
import { TaskCheckbox } from '../components/ui/TaskCheckbox';
import { Avatar } from '../components/ui/Avatar';
import { Skeleton } from '../components/ui/Skeleton';
import { AttachmentList } from '../components/Attachments';
import { spring } from '../lib/motion';

type Filter = 'offen' | 'erledigt' | 'alle';

/** Hausaufgaben: offen / überfällig / erledigt – Erledigt-Status je Person. */
export function Homework({ me }: { me: Member }) {
  const available = useHomework((s) => s.available);
  const homework = useHomework((s) => s.homework);
  const parts = useHomework((s) => s.parts);
  const completions = useHomework((s) => s.completions);
  const today = useToday();
  const [filter, setFilter] = useState<Filter>('offen');

  const list = useMemo(() => {
    const done = (id: string) => completions[hwKey(id, me.id)]?.is_completed === true;
    return Object.values(homework)
      .filter((h) => !h.deleted_at)
      .map((h) => {
        const ps = Object.values(parts)
          .filter((p) => p.homework_id === h.id && !p.deleted_at)
          .sort((a, b) => a.sort_order - b.sort_order);
        return { hw: h, parts: ps, progress: homeworkProgress(h, ps, done) };
      })
      .sort((a, b) => a.hw.due_date.localeCompare(b.hw.due_date) || b.hw.priority - a.hw.priority);
  }, [homework, parts, completions, me.id]);

  const open = list.filter((x) => !x.progress.done);
  const shown = filter === 'offen' ? open : filter === 'erledigt' ? list.filter((x) => x.progress.done) : list;
  const overdue = shown.filter((x) => !x.progress.done && x.hw.due_date < today);
  const upcoming = shown.filter((x) => !(x.hw.due_date < today && !x.progress.done));

  return (
    <div>
      <PageHeader
        title="Hausaufgaben"
        actions={
          available ? (
            <>
              <Segmented size="sm" label="Filter" value={filter} onChange={setFilter} options={[{ value: 'offen', label: `Offen${open.length ? ` · ${open.length}` : ''}` }, { value: 'erledigt', label: 'Erledigt' }, { value: 'alle', label: 'Alle' }]} />
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openHomeworkEditor()}>
                Neue Hausaufgabe
              </Button>
            </>
          ) : undefined
        }
      />

      {available === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 rounded-[26px]" />
          <Skeleton className="h-28 rounded-[26px]" />
        </div>
      ) : available === false ? (
        <HomeworkSetupHint />
      ) : shown.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<NotebookPen />}
            title={filter === 'erledigt' ? 'Noch nichts erledigt' : 'Keine offenen Hausaufgaben'}
            action={
              filter !== 'erledigt' ? (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openHomeworkEditor()}>
                  Hausaufgabe anlegen
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {overdue.length > 0 && (
            <section aria-label="Überfällig">
              <h2 className="eyebrow mb-3 flex items-center gap-2 !text-danger">
                <Flag className="size-3.5" aria-hidden /> Überfällig
              </h2>
              <ul className="flex flex-col gap-3">
                {overdue.map((x) => (
                  <HomeworkItem key={x.hw.id} hw={x.hw} parts={x.parts} me={me} />
                ))}
              </ul>
            </section>
          )}
          {upcoming.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label="Hausaufgaben">
              <AnimatePresence initial={false}>
                {upcoming.map((x) => (
                  <HomeworkItem key={x.hw.id} hw={x.hw} parts={x.parts} me={me} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function HomeworkSetupHint() {
  return (
    <Card className="flex items-start gap-3 p-5 text-sm" data-testid="homework-setup">
      <Database className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
      <p>
        Hausaufgaben sind noch nicht eingerichtet: In Supabase fehlen die Tabellen dafür. Bitte <code className="rounded bg-[var(--ss-track)] px-1">supabase/migrations/005_homework.sql</code> im SQL Editor ausführen (README, Schritt 13). Alles andere funktioniert weiter wie bisher.
      </p>
    </Card>
  );
}

function HomeworkItem({ hw, parts, me }: { hw: HW; parts: HomeworkPart[]; me: Member }) {
  const reduce = useReducedMotion();
  const today = useToday();
  const modules = useData((s) => s.modules);
  const completions = useHomework((s) => s.completions);
  const members = useActiveMembers();
  const [expanded, setExpanded] = useState(false);
  const module = modules[hw.module_id];
  const color = module?.color ?? 'var(--ss-accent)';
  const isDone = (id: string, memberId = me.id) => completions[hwKey(id, memberId)]?.is_completed === true;
  const progress = homeworkProgress(hw, parts, (id) => isDone(id));
  const overdue = !progress.done && hw.due_date < today;
  const d = daysUntil(hw.due_date, today);
  const subtasks = parts.filter((p) => p.kind === 'subtask');
  const units = parts.filter((p) => p.kind === 'unit').sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''));
  const teamDone = members.filter((m) => isDone(hw.id, m.id));

  return (
    <motion.li layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 0.97 }} transition={spring.comp} data-testid="homework-item" data-done={progress.done || undefined} data-overdue={overdue || undefined}>
      <Card lift className={`overflow-hidden ${overdue ? 'ring-1 ring-[color-mix(in_srgb,var(--ss-danger)_45%,transparent)]' : ''}`}>
        <div className="flex items-start gap-3.5 p-4 md:p-5">
          <div className="pt-0.5">
            <TaskCheckbox checked={progress.done} color={me.color} label={`${hw.title} erledigt`} onChange={(v) => void setHomeworkDone(hw.id, hw.id, me.id, v)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-muted">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <span className="truncate">{module?.name ?? 'Modul'}</span>
              </span>
              {hw.priority === 3 && <span className="rounded-full bg-[color-mix(in_srgb,var(--ss-danger)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-danger">Hohe Priorität</span>}
              {hw.priority === 1 && <span className="rounded-full bg-[var(--ss-track)] px-2 py-0.5 text-[11px]">{PRIORITY_LABEL[1]}</span>}
            </div>
            <p className={`mt-1 text-[16px] font-semibold leading-snug ${progress.done ? 'text-muted line-through decoration-[1.5px]' : ''}`}>{hw.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
              <span className={`inline-flex items-center gap-1.5 font-medium ${overdue ? 'text-danger' : d <= 1 && !progress.done ? 'text-warn' : 'text-muted'}`} data-testid="homework-due">
                <CalendarClock className="size-3.5" aria-hidden />
                {progress.done ? `Abgabe ${formatISODate(hw.due_date, { day: 'numeric', month: 'short' })}` : `${dueLabel(hw.due_date, today)} · ${formatISODate(hw.due_date, { weekday: 'short', day: 'numeric', month: 'short' })}`}
              </span>
              {parts.length > 0 && (
                <span className="num text-muted">
                  {progress.completed}/{progress.total}
                </span>
              )}
              {teamDone.length > 0 && (
                <span className="inline-flex items-center -space-x-1.5" title={`Erledigt: ${teamDone.map((m) => m.name).join(', ')}`} aria-label={`Erledigt von ${teamDone.map((m) => m.name).join(', ')}`}>
                  {teamDone.map((m) => (
                    <Avatar key={m.id} name={m.name} color={m.color} size={20} ring />
                  ))}
                </span>
              )}
            </div>
            {parts.length > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--ss-track)]" role="progressbar" aria-label="Fortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)}>
                <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${progress.ratio * 100}%` }} transition={spring.comp} />
              </div>
            )}
          </div>
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label={expanded ? 'Details ausblenden' : 'Details anzeigen'} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
            <ChevronDown className={`size-5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <div className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
                {hw.description && <p className="whitespace-pre-line text-[14px]">{hw.description}</p>}
                {subtasks.length > 0 && <PartList title="Unteraufgaben" items={subtasks} hw={hw} me={me} isDone={isDone} />}
                {units.length > 0 && <PartList title="Arbeitseinheiten" items={units} hw={hw} me={me} isDone={isDone} withDate />}
                <AttachmentList targetType="homework" targetId={hw.id} compact />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="glass" icon={<Pencil className="size-4" />} onClick={() => openHomeworkEditor(hw.id)}>
                    Bearbeiten
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void trashHomework(hw.id)}>
                    Papierkorb
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.li>
  );
}

function PartList({ title, items, hw, me, isDone, withDate }: { title: string; items: HomeworkPart[]; hw: HW; me: Member; isDone: (id: string) => boolean; withDate?: boolean }) {
  const today = useToday();
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((p) => {
          const done = isDone(hw.id) || isDone(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 text-[14px]">
              <TaskCheckbox size={22} checked={done} color={me.color} label={`${p.title} erledigt`} disabled={isDone(hw.id)} onChange={(v) => void setHomeworkDone(hw.id, p.id, me.id, v)} />
              <span className={`min-w-0 flex-1 ${done ? 'text-muted line-through' : ''}`}>{p.title}</span>
              {withDate && p.planned_date && (
                <span className={`num shrink-0 text-[12.5px] ${p.planned_date === today && !done ? 'font-semibold text-accent' : 'text-muted'}`}>
                  {p.planned_date === today ? 'heute' : formatISODate(p.planned_date, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
