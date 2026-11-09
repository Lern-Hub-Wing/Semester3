import { useMemo } from 'react';
import { CalendarClock, NotebookPen, Plus } from 'lucide-react';
import type { Member } from '../../lib/types';
import { dueLabel, hwKey } from '../../lib/homework';
import { Link } from '../../lib/router';
import { useHomework, setHomeworkDone } from '../../store/homework';
import { openHomeworkEditor } from '../../store/ui';
import { useData } from '../../store/data';
import { useToday } from '../../hooks/useToday';
import { Card, CardHeader } from '../ui/Card';
import { TaskCheckbox } from '../ui/TaskCheckbox';
import { IconButton } from '../ui/Button';

/** Dashboard: nächste offene Hausaufgaben und heutige Arbeitseinheiten. Ohne Migration 005 unsichtbar. */
export function HomeworkDashCard({ me, className = '' }: { me: Member; className?: string }) {
  const available = useHomework((s) => s.available);
  const homework = useHomework((s) => s.homework);
  const parts = useHomework((s) => s.parts);
  const completions = useHomework((s) => s.completions);
  const modules = useData((s) => s.modules);
  const today = useToday();

  const { next, todayUnits, openCount } = useMemo(() => {
    const done = (id: string) => completions[hwKey(id, me.id)]?.is_completed === true;
    const open = Object.values(homework)
      .filter((h) => !h.deleted_at && !done(h.id))
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || b.priority - a.priority);
    const openIds = new Set(open.map((h) => h.id));
    const units = Object.values(parts).filter((p) => p.kind === 'unit' && !p.deleted_at && p.planned_date === today && openIds.has(p.homework_id) && !done(p.id));
    return { next: open.slice(0, 4), todayUnits: units, openCount: open.length };
  }, [homework, parts, completions, me.id, today]);

  if (!available) return null;

  return (
    <Card className={`flex h-full flex-col p-5 md:p-6 ${className}`} data-testid="homework-card">
      <CardHeader
        title={
          <Link to="/hausaufgaben" className="hover:underline">
            Hausaufgaben
          </Link>
        }
        icon={<NotebookPen />}
        action={
          <IconButton label="Neue Hausaufgabe" size="sm" variant="glass" onClick={() => openHomeworkEditor()}>
            <Plus className="size-4" />
          </IconButton>
        }
      />
      {next.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <NotebookPen className="size-7 text-faint" aria-hidden />
          <p className="text-[14px] font-medium">Alles abgegeben</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {todayUnits.map((u) => {
            const hw = homework[u.homework_id]!;
            return (
              <li key={u.id} className="flex items-center gap-3 rounded-[16px] bg-[color-mix(in_srgb,var(--ss-accent)_8%,transparent)] px-2.5 py-2">
                <TaskCheckbox size={22} checked={false} color={me.color} label={`${hw.title}: ${u.title} erledigt`} onChange={(v) => void setHomeworkDone(hw.id, u.id, me.id, v)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{hw.title}</span>
                  <span className="block truncate text-[12px] text-muted">Heute · {u.title}</span>
                </span>
              </li>
            );
          })}
          {next.map((h) => {
            const m = modules[h.module_id];
            const overdue = h.due_date < today;
            return (
              <li key={h.id} className="flex items-center gap-3 rounded-[16px] px-2.5 py-2">
                <TaskCheckbox size={22} checked={false} color={me.color} label={`${h.title} erledigt`} onChange={(v) => void setHomeworkDone(h.id, h.id, me.id, v)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: m?.color }} aria-hidden />
                    <span className="truncate text-[14px] font-medium">{h.title}</span>
                  </span>
                  <span className={`mt-0.5 flex items-center gap-1 text-[12px] ${overdue ? 'font-medium text-danger' : h.due_date <= today ? 'text-warn' : 'text-muted'}`}>
                    <CalendarClock className="size-3" aria-hidden />
                    {dueLabel(h.due_date, today)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {openCount > next.length && (
        <Link to="/hausaufgaben" className="mt-2 text-sm font-medium text-accent">
          Alle {openCount} anzeigen
        </Link>
      )}
    </Card>
  );
}
