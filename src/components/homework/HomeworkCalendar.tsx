import { useMemo } from 'react';
import { Flag } from 'lucide-react';
import { addDaysISO, formatISODate, isSameMonth, monthGrid, startOfMonthISO } from '../../lib/time';
import type { WorkWindow } from '../../lib/homework';
import type { ISODate } from '../../lib/types';

/**
 * Kalender des Bearbeitungszeitraums: getönte Arbeitstage, markierte
 * Abgabe (kein Arbeitstag), geplante Einheiten als Punkte, Prüfungen.
 */
export function HomeworkCalendar({ window, due, units, today, examDays = [], color = 'var(--ss-accent)' }: { window: WorkWindow; due: ISODate; units: ISODate[]; today: ISODate; examDays?: ISODate[]; color?: string }) {
  const months = useMemo(() => {
    const first = startOfMonthISO(window.days[0] ?? today);
    const last = startOfMonthISO(due);
    const out: ISODate[] = [];
    for (let m = first; m <= last && out.length < 3; m = startOfMonthISO(addDaysISO(m, 32))) out.push(m);
    return out;
  }, [window.days, today, due]);
  const work = new Set(window.days);
  const unitCount = units.reduce<Record<string, number>>((a, d) => ((a[d] = (a[d] ?? 0) + 1), a), {});
  const exams = new Set(examDays);
  return (
    <div className="flex flex-col gap-4" data-testid="homework-calendar">
      {months.map((m) => (
        <div key={m}>
          <p className="mb-2 text-[13px] font-semibold">{formatISODate(m, { month: 'long', year: 'numeric' })}</p>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted" aria-hidden>
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthGrid(m).map((d) => {
              const inMonth = isSameMonth(d, m);
              const isWork = work.has(d);
              const isDue = d === due;
              const n = unitCount[d] ?? 0;
              const label = `${formatISODate(d, { weekday: 'long', day: 'numeric', month: 'long' })}${isDue ? ', Abgabe' : isWork ? ', Arbeitstag' : ''}${n ? `, ${n} Einheit${n > 1 ? 'en' : ''}` : ''}${exams.has(d) ? ', Prüfung' : ''}`;
              return (
                <span
                  key={d}
                  role="img"
                  aria-label={label}
                  title={label}
                  data-work={isWork || undefined}
                  data-due={isDue || undefined}
                  data-units={n || undefined}
                  className={`relative grid aspect-square place-items-center rounded-[10px] text-[12.5px] ${inMonth ? '' : 'opacity-0'} ${isDue ? 'font-semibold text-white' : isWork ? 'text-ink' : 'text-faint'}`}
                  style={{
                    background: isDue ? 'var(--ss-danger)' : isWork ? `color-mix(in srgb, ${color} 16%, transparent)` : undefined,
                    boxShadow: d === today ? `inset 0 0 0 1.5px ${color}` : undefined,
                  }}
                >
                  {isDue ? <Flag className="size-3.5" aria-hidden /> : <span className="num">{Number(d.slice(8))}</span>}
                  {n > 0 && (
                    <span className="absolute bottom-[3px] left-1/2 flex -translate-x-1/2 gap-[2px]" aria-hidden>
                      {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                        <span key={i} className="size-[5px] rounded-full" style={{ background: color }} />
                      ))}
                    </span>
                  )}
                  {exams.has(d) && <span className="absolute right-[3px] top-[3px] size-[5px] rounded-full bg-[var(--ss-warn)]" aria-hidden />}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[4px]" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }} /> Bearbeitungszeitraum
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-[var(--ss-danger)]" /> Abgabe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-[6px] rounded-full" style={{ background: color }} /> Arbeitseinheit
        </span>
        {examDays.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-[6px] rounded-full bg-[var(--ss-warn)]" /> Prüfung
          </span>
        )}
      </div>
    </div>
  );
}
