import { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { buildTimeline, dayPosition, phaseSpan } from '../lib/timeline';
import { formatISODate, startOfWeekISO } from '../lib/time';
import { EASE_EMPH } from '../lib/motion';
import { navigate } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMemberIds, useModules, useProgress, useTaskViews } from '../store/derived';
import { useToday } from '../hooks/useToday';

interface Props {
  /** kompakt: weniger Höhe, ohne Legende (Dashboard) */
  compact?: boolean;
  className?: string;
}

/**
 * Semester-Timeline: Lernphasen (erster bis letzter Lerntag) und Prüfungen
 * aller Module auf einer Wochenachse. Die Füllung eines Balkens zeigt den
 * echten Gruppenfortschritt des Moduls.
 */
export function SemesterTimeline({ compact, className = '' }: Props) {
  const reduce = useReducedMotion();
  const modules = useModules();
  const views = useTaskViews();
  const examsMap = useData((s) => s.exams);
  const completions = useData((s) => s.task_completions);
  const memberIds = useActiveMemberIds();
  const progress = useProgress();
  const today = useToday();
  const scroller = useRef<HTMLDivElement>(null);

  const t = useMemo(
    () =>
      buildTimeline({
        modules, views, exams: Object.values(examsMap), completions, memberIds, today, minWeeks: compact ? 6 : 8,
        groupOf: (id) => progress.group(memberIds, progress.forModule(id)),
      }),
    [modules, views, examsMap, completions, memberIds, today, compact, progress],
  );
  const todayPos = dayPosition(t, today);
  const currentWeek = startOfWeekISO(today);
  const weekWidth = compact ? 58 : 68;
  const trackWidth = t.weeks.length * weekWidth;

  // Aktuelle Woche beim Öffnen in den sichtbaren Bereich holen (eine Woche Vorlauf)
  useEffect(() => {
    const el = scroller.current;
    const idx = t.weeks.findIndex((w) => w.start === currentWeek);
    if (!el || idx < 0) return;
    el.scrollLeft = Math.max(0, (idx - 1) * weekWidth);
  }, [t.weeks, currentWeek, weekWidth]);

  if (modules.length === 0) return <p className="py-6 text-center text-sm text-muted">Noch keine Module angelegt.</p>;

  const labelCol = 'w-[118px] sm:w-[200px] lg:w-[230px]';

  return (
    <div className={`min-w-0 ${className}`} data-testid="semester-timeline">
      <div ref={scroller} className="timeline-scroll scroll-thin relative overflow-x-auto overscroll-x-contain pb-2">
        <div className="relative" style={{ minWidth: `calc(${trackWidth}px + 118px)` }}>
          {/* Wochenkopf */}
          <div className="flex">
            <div className={`timeline-sticky sticky left-0 z-[3] shrink-0 ${labelCol}`} aria-hidden />
            <div className="relative flex flex-1" style={{ minWidth: trackWidth }}>
              {t.weeks.map((w) => {
                const current = w.start === currentWeek;
                return (
                  <div key={w.start} className="flex flex-1 flex-col items-center gap-0.5 pb-2" title={`KW ${w.kw} · ab ${formatISODate(w.start, { day: 'numeric', month: 'short' })}`}>
                    <span className={`num rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${current ? 'bg-[var(--ss-accent)] text-white dark:text-[#14152e]' : 'text-ink'}`} data-current={current || undefined}>
                      KW {w.kw}
                    </span>
                    <span className={`num text-[10.5px] ${current ? 'font-medium text-accent' : 'text-muted'}`}>{formatISODate(w.start, { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zeilen: Modulname (bleibt beim Scrollen stehen) + Zeitachse */}
          <ul className="relative">
            {t.rows.map((r, ri) => {
              const span = r.phase ? phaseSpan(t, r.phase.from, r.phase.to) : null;
              const pct = r.group.pct ?? 0;
              return (
                <li key={r.module.id} className="flex min-h-[52px] items-stretch">
                  <div className={`timeline-sticky sticky left-0 z-[2] flex shrink-0 items-center pr-3 ${labelCol}`}>
                    <button type="button" onClick={() => navigate(`/faecher/${r.module.id}`)} className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl py-1.5 text-left">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.module.color, boxShadow: `0 0 8px ${r.module.color}` }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[12.5px] font-medium leading-snug [overflow-wrap:anywhere] group-hover:text-accent sm:text-[13.5px]" title={r.module.name}>{r.module.name}</span>
                        {!compact && <span className="num block text-[11px] text-muted">{r.group.pct === null ? 'keine Aufgaben' : `Gruppe ${r.group.pct} %`}</span>}
                      </span>
                    </button>
                  </div>
                  <div className="relative flex-1" style={{ minWidth: trackWidth }}>
                    {/* Raster */}
                    <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
                      {t.weeks.map((w, i) => (
                        <div key={w.start} className={`flex-1 ${i > 0 ? 'border-l border-dashed border-line' : ''} ${w.start === currentWeek ? 'bg-[color-mix(in_srgb,var(--ss-accent)_8%,transparent)]' : ''}`} />
                      ))}
                    </div>
                    {span && (
                      <motion.button
                        type="button"
                        onClick={() => navigate(`/faecher/${r.module.id}`)}
                        aria-label={`${r.module.name}: Lernphase ${formatISODate(r.phase!.from, { day: 'numeric', month: 'short' })} bis ${formatISODate(r.phase!.to, { day: 'numeric', month: 'short' })}, Gruppenfortschritt ${r.group.pct ?? 0} Prozent`}
                        className="absolute top-1/2 h-[18px] -translate-y-1/2 overflow-hidden rounded-full"
                        style={{
                          left: `${span.left * 100}%`,
                          width: `max(${span.width * 100}%, 18px)`,
                          transformOrigin: 'left center',
                          background: `color-mix(in srgb, ${r.module.color} 26%, transparent)`,
                          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${r.module.color} 45%, transparent), inset 0 1px 0 rgba(255,255,255,.35)`,
                        }}
                        initial={reduce ? false : { scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        transition={{ duration: 0.8, delay: reduce ? 0 : 0.15 + ri * 0.07, ease: EASE_EMPH }}
                      >
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${r.module.color} 70%, white), ${r.module.color})`, boxShadow: `0 0 10px -2px ${r.module.color}` }} />
                      </motion.button>
                    )}
                    {!compact &&
                      r.days.map((d) => {
                        const p = dayPosition(t, d);
                        return p === null ? null : <span key={d} aria-hidden className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ss-text)] opacity-35" style={{ left: `${p * 100}%` }} />;
                      })}
                    {r.exams.map(({ date, exam }) => {
                      const p = dayPosition(t, date);
                      return p === null ? null : (
                        <motion.span
                          key={exam.id}
                          className="absolute top-1/2 grid size-[18px] place-items-center"
                          style={{ left: `calc(${p * 100}% - 9px)`, marginTop: -9 }}
                          title={`Prüfung ${r.module.name} · ${formatISODate(date, { weekday: 'short', day: 'numeric', month: 'short' })}`}
                          initial={reduce ? false : { scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 16, delay: reduce ? 0 : 0.5 + ri * 0.07 }}
                        >
                          <span className="size-[13px] rotate-45 rounded-[3px]" style={{ background: r.module.color, boxShadow: `0 0 0 2px var(--ss-bg), 0 0 0 3.5px ${r.module.color}, 0 4px 12px -2px ${r.module.color}` }} />
                          <span className="sr-only">Prüfung am {formatISODate(date)}</span>
                        </motion.span>
                      );
                    })}
                    {todayPos !== null && (
                      <span className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-[var(--ss-accent)] opacity-80" style={{ left: `${todayPos * 100}%` }} aria-hidden>
                        {ri === 0 && <span className="absolute -left-[4px] -top-[5px] size-[10px] rounded-full bg-[var(--ss-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--ss-accent)_25%,transparent)]" />}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <span className="sr-only">Rauten markieren Prüfungen, Balken die Lernphasen, die Füllung den Gruppenfortschritt.</span>
    </div>
  );
}

/** Legende zur Timeline */
export function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-7 rounded-full bg-[color-mix(in_srgb,var(--ss-accent)_30%,transparent)]" aria-hidden />
        Lernphase (Füllung = Gruppenfortschritt)
      </span>
      <span className="flex items-center gap-2">
        <span className="size-2.5 rotate-45 rounded-[2px] bg-[var(--ss-accent)]" aria-hidden />
        Prüfung
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-[2px] rounded-full bg-[var(--ss-accent)]" aria-hidden />
        Heute
      </span>
    </div>
  );
}
