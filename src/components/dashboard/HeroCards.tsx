import { CalendarDays, ChevronRight, Ellipsis, Plus, Sparkles } from 'lucide-react';
import type { Member } from '../../lib/types';
import { groupBy, isDone, type Ratio, type TaskView } from '../../lib/progress';
import { useProgress } from '../../store/derived';
import { alpha } from '../../lib/colors';
import { Link } from '../../lib/router';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { TaskRow } from '../TaskRow';
import { ProgressRing } from '../ui/Progress';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

function CardHead({ title, sub, to, action }: { title: string; sub?: string; to?: string; action?: React.ReactNode }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="title block text-[15px] leading-snug">{title}</span>
        {sub && <span className="block text-[12.5px] leading-snug text-muted">{sub}</span>}
      </span>
      {to && <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </>
  );
  return (
    <div className="flex items-center gap-2">
      {to ? (
        <Link to={to} className="group flex min-w-0 flex-1 items-center gap-2">
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{inner}</div>
      )}
      {action}
    </div>
  );
}

/** „Fortschritt“ – eigener Ring, darunter Gruppe; dezenter Farbschein wie in der Vorlage */
export function ProgressCard({ me, mine, group, className = '', ringSize = 116 }: { me: Member; mine: Ratio; group: Ratio; className?: string; ringSize?: number }) {
  return (
    <section
      className={`card relative flex flex-col gap-2 overflow-hidden rounded-[24px] p-4 md:p-5 ${className}`}
      style={{ '--m-extra': `radial-gradient(70% 70% at 100% 100%, ${alpha('#8f7cf6', 0.28)}, transparent 70%)` } as React.CSSProperties}
    >
      <CardHead title="Fortschritt" to="/team" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-1">
        <ProgressRing ratio={mine} color="var(--ss-accent)" size={ringSize} stroke={Math.round(ringSize / 11)} sublabel="Dein Fortschritt" />
        <p className="num text-[12.5px] text-muted">{mine.total ? `${mine.done} / ${mine.total} Aufgaben` : 'Noch keine Aufgaben'}</p>
      </div>
      {group.total > 0 && (
        <div className="flex items-center gap-2 border-t border-line pt-2.5 text-[12px]">
          <span className="size-2 rounded-full" style={{ background: me.color }} aria-hidden />
          <span className="text-muted">Gruppe</span>
          <span className="num ml-auto font-semibold">{group.pct} %</span>
        </div>
      )}
    </section>
  );
}

/** „Heute“ – Aufgaben des Tages (jede Aufgabe genau einmal auf dem Dashboard) */
export function TodayCard({ views, today, me, members, className = '', allEmpty }: { views: TaskView[]; today: string; me: Member; members: Member[]; className?: string; allEmpty: boolean }) {
  const completions = useData((s) => s.task_completions);
  const openEditor = useUI((s) => s.openEntryEditor);
  const open = views.filter((v) => !isDone(completions, v.task.id, me.id)).length;
  const byEntry = groupBy(views, (v) => v.entry.id);
  return (
    <section id="today-card" className={`card flex flex-col gap-2 rounded-[24px] p-4 md:p-5 ${className}`}>
      <CardHead
        title="Heute"
        sub={views.length ? `${views.length} ${views.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${open} offen` : 'Nichts geplant'}
        action={
          <Link to={`/lernplan?ansicht=tag&datum=${today}`} aria-label="Tagesansicht öffnen" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_7%,transparent)] hover:text-ink">
            <Ellipsis className="size-4" />
          </Link>
        }
      />
      {allEmpty ? (
        <EmptyState
          compact
          icon={<Sparkles />}
          title="Dein Lernplan ist noch leer"
          text="Füge dein erstes Thema hinzu – mit Unteraufgaben, die jede Person für sich abhaken kann."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: today })}>
              Ersten Lerntag anlegen
            </Button>
          }
        />
      ) : views.length === 0 ? (
        <EmptyState compact icon={<CalendarDays />} title="Heute ist nichts geplant" text="Gönn dir eine Pause – oder plane schnell etwas ein." />
      ) : (
        <div className="scroll-thin scroll-fade -mx-2 max-h-[300px] overflow-y-auto pb-3 lg:max-h-[232px]">
          {[...byEntry.values()].map((list) => {
            const { entry, module } = list[0];
            return (
              <div key={entry.id} className="mb-1">
                <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[11.5px] font-medium text-muted">
                  <span className="size-1.5 rounded-full" style={{ background: module.color }} aria-hidden />
                  <span className="truncate">
                    {entry.title} · {module.name}
                  </span>
                </p>
                <ul>
                  {list.map((v) => (
                    <TaskRow key={v.task.id} task={v.task} member={me} members={members} dense />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Gesamtfortschritt (Lernplan + Hausaufgaben) für das Dashboard */
export function useDashboardRatios(me: Member, memberIds: string[]) {
  const progress = useProgress();
  return { mine: progress.member(me.id), group: progress.group(memberIds) };
}
