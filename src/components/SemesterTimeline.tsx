import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { buildTimeline, dayPosition, phaseSpan } from '../lib/timeline';
import { formatISODate, startOfWeekISO } from '../lib/time';
import { EASE_EMPH } from '../lib/motion';
import { navigate } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMemberIds, useModules, useTaskViews } from '../store/derived';
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
  const today = useToday();

  const t = useMemo(
    () => buildTimeline({ modules, views, exams: Object.values(examsMap), completions, memberIds, today, minWeeks: compact ? 6 : 8 }),
    [modules, views, examsMap, completions, memberIds, today, compact],
  );
  const todayPos = dayPosition(t, today);
  const currentWeek = startOfWeekISO(today);
  const weekWidth = compact ? 54 : 62;
  const rowH = compact ? 40 : 48;

  if (modules.length === 0) return <p className="py-6 text-center text-sm text-muted">Noch keine Module angelegt.</p>;

  return (
    <div className={`flex min-w-0 ${className}`} data-testid="semester-timeline">
      {/* Modulnamen */}
      <div className="w-[118px] shrink-0 pr-2 sm:w-[190px] sm:pr-3">
        <div className="h-9" aria-hidden />
        <ul>
          {t.rows.map((r) => (
            <li key={r.module.id} style={{ height: rowH }} className="flex items-center">
              <button
                type="button"
                onClick={() => navigate(`/faecher/${r.module.id}`)}
                className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl py-1 text-left"
                title={r.module.name}
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-[9px] text-[11px] font-semibold"
                  style={{ background: `color-mix(in srgb, ${r.module.color} 30%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${r.module.color} 45%, transparent)` }}
                  aria-hidden
                >
                  <span className="size-2.5 rounded-full" style={{ background: r.module.color, boxShadow: `0 0 8px ${r.module.color}` }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium leading-tight group-hover:text-accent sm:text-[13.5px]">{r.module.name}</span>
                  {!compact && <span className="num block text-[11px] text-muted">{r.group.pct === null ? 'keine Aufgaben' : `Gruppe ${r.group.pct} %`}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Zeitachse (auf kleinen Bildschirmen horizontal scrollbar) */}
      <div className="scroll-thin min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1">
        <div className="relative" style={{ width: '100%', minWidth: t.weeks.length * weekWidth }}>
          {/* Wochenkopf */}
          <div className="flex h-9 items-start">
            {t.weeks.map((w) => {
              const current = w.start === currentWeek;
              return (
                <div key={w.start} className="flex flex-1 justify-center">
                  <span
                    className={`num rounded-full px-2.5 py-1 text-[11px] font-semibold ${current ? 'lens text-ink' : 'text-muted'}`}
                    title={`KW ${w.kw} · ab ${formatISODate(w.start, { day: 'numeric', month: 'short' })}`}
                  >
                    KW {w.kw}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Raster */}
          <div className="relative" style={{ height: t.rows.length * rowH }}>
            <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
              {t.weeks.map((w, i) => (
                <div key={w.start} className={`flex-1 ${i > 0 ? 'border-l border-dashed border-line' : ''} ${w.start === currentWeek ? 'bg-[color-mix(in_srgb,var(--ss-accent)_6%,transparent)]' : ''}`} />
              ))}
            </div>

            {t.rows.map((r, ri) => {
              const span = r.phase ? phaseSpan(t, r.phase.from, r.phase.to) : null;
              const pct = r.group.pct ?? 0;
              return (
                <div key={r.module.id} className="absolute inset-x-0" style={{ top: ri * rowH, height: rowH }}>
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
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, color-mix(in srgb, ${r.module.color} 70%, white), ${r.module.color})`,
                          boxShadow: `0 0 10px -2px ${r.module.color}`,
                        }}
                      />
                    </motion.button>
                  )}
                  {/* Lerntage als feine Punkte */}
                  {!compact &&
                    r.days.map((d) => {
                      const p = dayPosition(t, d);
                      return p === null ? null : (
                        <span key={d} aria-hidden className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ss-text)] opacity-35" style={{ left: `${p * 100}%` }} />
                      );
                    })}
                  {/* Prüfung als Raute */}
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
                        <span
                          className="size-[13px] rotate-45 rounded-[3px]"
                          style={{ background: r.module.color, boxShadow: `0 0 0 2px var(--ss-bg), 0 0 0 3.5px ${r.module.color}, 0 4px 12px -2px ${r.module.color}` }}
                        />
                        <span className="sr-only">Prüfung am {formatISODate(date)}</span>
                      </motion.span>
                    );
                  })}
                </div>
              );
            })}

            {/* Heute */}
            {todayPos !== null && (
              <div className="pointer-events-none absolute inset-y-[-6px] w-0" style={{ left: `${todayPos * 100}%` }} aria-hidden>
                <span className="absolute inset-y-0 -left-px w-[2px] rounded-full bg-[var(--ss-accent)] opacity-80" />
                <span className="absolute -left-[5px] -top-[5px] size-[10px] rounded-full bg-[var(--ss-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--ss-accent)_25%,transparent)]" />
              </div>
            )}
          </div>
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
