import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookOpen, CalendarDays, ChevronRight, Ellipsis, PartyPopper, Plus, Sparkles } from 'lucide-react';
import type { Completion, Member } from '../../lib/types';
import { groupBy, groupRatio, isDone, memberRatio, type Ratio, type TaskView } from '../../lib/progress';
import { getCountdownState, splitDuration } from '../../lib/countdown';
import { formatInstant, formatTime } from '../../lib/time';
import { alpha } from '../../lib/colors';
import { Link } from '../../lib/router';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { useNow } from '../../hooks/useNow';
import { TaskRow } from '../TaskRow';
import { ProgressBar, ProgressRing } from '../ui/Progress';
import { useTaskViews } from '../../store/derived';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

const ease = [0.16, 1, 0.3, 1] as const;

/** Ziffer, die beim Wechsel räumlich wegklappt (Countdown Flip) */
function Flip({ value, className = '' }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={`num relative inline-flex h-[1.1em] items-center justify-center leading-none ${className}`} style={{ perspective: 300 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          style={{ transformOrigin: '50% 50% -0.35em', backfaceVisibility: 'hidden' }}
          initial={reduce ? false : { rotateX: 80, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={reduce ? undefined : { rotateX: -80, opacity: 0 }}
          transition={{ duration: 0.45, ease }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function CardHead({ title, sub, to, action }: { title: string; sub?: string; to?: string; action?: React.ReactNode }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="title block truncate text-[15px]">{title}</span>
        {sub && <span className="block truncate text-[12.5px] text-muted">{sub}</span>}
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

/** „Nächste Prüfung“ – kompakt mit sekundengenauem Countdown */
export function NextExamCard({ className = '', memberId }: { className?: string; memberId?: string }) {
  const now = useNow(1000);
  const views = useTaskViews();
  const completions = useData((s) => s.task_completions);
  const examsMap = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const exams = useMemo(() => Object.values(examsMap), [examsMap]);
  const live = getCountdownState(exams, now);

  if (live.kind === 'none' || live.kind === 'finished') {
    return (
      <section aria-label="Prüfungscountdown" className={`card flex flex-col gap-3 rounded-[24px] p-4 md:p-5 ${className}`}>
        <CardHead title="Nächste Prüfung" to="/pruefungen" />
        <div className="flex flex-1 items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[14px] bg-[color-mix(in_srgb,var(--ss-success)_18%,transparent)] text-success">
            <PartyPopper className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted">{live.kind === 'none' ? 'Noch keine Prüfungen eingetragen.' : 'Alle Prüfungen sind geschafft – stark gemacht!'}</p>
        </div>
      </section>
    );
  }

  const exam = live.exam;
  const module = modules[exam.module_id];
  const color = module?.color ?? '#AFC5F5';
  const running = live.kind === 'running';
  const parts = splitDuration(running ? live.msUntilEnd : live.msUntilStart);
  const units = [
    [String(parts.days), 'Tage'],
    [String(parts.hours).padStart(2, '0'), 'Std.'],
    [String(parts.minutes).padStart(2, '0'), 'Min.'],
    [String(parts.seconds).padStart(2, '0'), 'Sek.'],
  ];
  return (
    <section
      aria-label="Prüfungscountdown"
      className={`card flex flex-col gap-3 rounded-[24px] p-4 md:p-5 ${className}`}
      style={{ '--m-extra': `radial-gradient(80% 90% at 100% 0%, ${alpha(color, 0.2)}, transparent 70%)` } as React.CSSProperties}
    >
      <Link to="/pruefungen" className="group flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[12px]"
          style={{ background: alpha(color, 0.26), boxShadow: `inset 0 0 0 1px ${alpha(color, 0.4)}, inset 0 1px 0 rgba(255,255,255,.35)`, color: `color-mix(in srgb, ${color} 60%, var(--ss-text))` }}
        >
          <BookOpen className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{module?.name ?? 'Prüfung'}</span>
          <span className="block truncate text-[12px] text-muted">
            {running ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full" style={{ background: color }} />
                  <span className="relative inline-flex size-1.5 rounded-full" style={{ background: color }} />
                </span>
                Prüfung läuft
              </span>
            ) : (
              <>Nächste Prüfung · {formatInstant(exam.starts_at, { weekday: 'short', day: 'numeric', month: 'short' }, exam.timezone)} · {formatTime(exam.starts_at, exam.timezone)} Uhr</>
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <div className="my-auto grid grid-cols-4 gap-1 py-1" aria-live="off">
        {units.map(([v, label]) => (
          <div key={label} className="text-center">
            <Flip value={v} className="text-[26px] font-semibold tracking-[-0.03em] md:text-[28px]" />
            <div className="mt-0.5 text-[11px] font-medium text-muted">{label}</div>
          </div>
        ))}
      </div>
      <p className="sr-only">
        {running ? 'Verbleibende Prüfungszeit' : 'Zeit bis zur Prüfung'}: {parts.days} Tage, {parts.hours} Stunden, {parts.minutes} Minuten
      </p>
      {memberId && module && <Preparation moduleId={module.id} color={color} memberId={memberId} views={views} completions={completions} />}
    </section>
  );
}

/** Eigener Vorbereitungsstand im Prüfungsmodul (echte Aufgaben) */
function Preparation({ moduleId, color, memberId, views, completions }: { moduleId: string; color: string; memberId: string; views: TaskView[]; completions: Record<string, Completion> }) {
  const mv = views.filter((v) => v.module.id === moduleId);
  const r = memberRatio(mv, memberId, completions);
  const days = new Set(mv.map((v) => v.date)).size;
  return (
    <div className="mt-auto border-t border-line pt-3">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="text-muted">Deine Vorbereitung</span>
        <span className="num font-semibold">{r.total ? `${r.done} / ${r.total}` : 'noch nichts geplant'}</span>
      </div>
      <ProgressBar ratio={r} color={color} height={6} label="Vorbereitung im Prüfungsmodul" />
      <p className="mt-1.5 text-[11.5px] text-faint">{days ? `${days} ${days === 1 ? 'Lerntag' : 'Lerntage'} im Plan` : 'Plane Lerntage für dieses Modul.'}</p>
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
        <div className="scroll-thin -mx-2 max-h-[300px] overflow-y-auto lg:max-h-[232px]">
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

export function useDashboardRatios(views: TaskView[], me: Member, memberIds: string[]) {
  const completions = useData((s) => s.task_completions);
  return { mine: memberRatio(views, me.id, completions), group: groupRatio(views, memberIds, completions) };
}
