import { useMemo } from 'react';
import { Check, Flag } from 'lucide-react';
import { homeworkSpanRange, hwKey, layoutSpans, type Homework, type SpanSegment } from '../../lib/homework';
import { formatISODate, todayISO } from '../../lib/time';
import type { ISODate, UUID } from '../../lib/types';
import { useData } from '../../store/data';
import { useHomework } from '../../store/homework';
import { openHomeworkEditor } from '../../store/ui';

/**
 * Hausaufgaben als farbige Zeitraum-Leisten im Kalender: vom Beginn bis zur
 * Abgabe, am Abgabetag mit Fähnchen „Abgabe“. Ohne Migration 005 unsichtbar.
 */

export interface SpanItem {
  id: UUID;
  start: ISODate;
  end: ISODate;
  hw: Homework;
  color: string;
  module: string;
  done: boolean;
}

/** Leistenhöhe + Abstand (px) */
export const SPAN_ROW = 22;

export function useHomeworkSpanItems(memberId: UUID, moduleFilter: string | null): SpanItem[] {
  const available = useHomework((s) => s.available);
  const homework = useHomework((s) => s.homework);
  const completions = useHomework((s) => s.completions);
  const modules = useData((s) => s.modules);
  return useMemo(() => {
    if (!available) return [];
    return Object.values(homework)
      .filter((h) => !h.deleted_at && modules[h.module_id] && !modules[h.module_id].archived_at && (!moduleFilter || h.module_id === moduleFilter))
      .map((h) => {
        const { start, end } = homeworkSpanRange(h, todayISO(new Date(h.created_at)));
        return {
          id: h.id,
          start,
          end,
          hw: h,
          color: modules[h.module_id]?.color ?? '#AFC5F5',
          module: modules[h.module_id]?.name ?? '',
          done: completions[hwKey(h.id, memberId)]?.is_completed === true,
        };
      });
  }, [available, homework, completions, modules, memberId, moduleFilter]);
}

/** Leisten einer Kalenderzeile, absolut positioniert (Container: `position: relative`). */
export function SpanBars({ days, items, top = 0, gap = 0 }: { days: ISODate[]; items: SpanItem[]; top?: number; gap?: number }) {
  const { segments } = layoutSpans(items, days);
  const byId = new Map(items.map((i) => [i.id, i]));
  const n = days.length;
  return (
    <>
      {segments.map((s) => (
        <SpanBar key={s.id} seg={s} item={byId.get(s.id)!} n={n} top={top} gap={gap} />
      ))}
    </>
  );
}

function SpanBar({ seg, item, n, top, gap }: { seg: SpanSegment; item: SpanItem; n: number; top: number; gap: number }) {
  const span = seg.to - seg.from + 1;
  const inset = gap ? 0 : 4;
  const due = formatISODate(item.end, { weekday: 'short', day: 'numeric', month: 'short' });
  const range = `${formatISODate(item.start, { day: 'numeric', month: 'short' })} – ${due}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openHomeworkEditor(item.id);
      }}
      data-testid="hw-bar"
      data-due={seg.dueInRow ? 'true' : undefined}
      className={`hw-bar absolute z-[2] flex h-[18px] items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] font-semibold ${item.done ? 'hw-bar--done' : ''}`}
      style={{
        top: top + seg.lane * SPAN_ROW,
        left: `calc((100% + ${gap}px) * ${seg.from / n} + ${inset}px)`,
        width: `calc((100% + ${gap}px) * ${span / n} - ${gap + inset * 2}px)`,
        ['--hw' as string]: item.color,
        borderTopLeftRadius: seg.continuesBefore ? 2 : 7,
        borderBottomLeftRadius: seg.continuesBefore ? 2 : 7,
        borderTopRightRadius: seg.continuesAfter ? 2 : 7,
        borderBottomRightRadius: seg.continuesAfter ? 2 : 7,
        borderLeftWidth: seg.continuesBefore ? 0 : 3,
      }}
      title={`Hausaufgabe: ${item.hw.title} · ${item.module}\nZeitraum ${range} · Abgabe ${due}${item.done ? ' · erledigt' : ''}`}
      aria-label={`Hausaufgabe ${item.hw.title}, ${item.module}, zu erledigen bis ${due}${item.done ? ', erledigt' : ''}`}
    >
      {item.done && <Check className="size-3 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{item.hw.title}</span>
      {seg.dueInRow && (
        <span className="hw-bar-due flex shrink-0 items-center gap-0.5">
          <Flag className="size-3" aria-hidden />
          {span > 1 ? `Abgabe ${due}` : 'Abgabe'}
        </span>
      )}
    </button>
  );
}

/** Kompakter Wochenstreifen (Handy, Wochenansicht): Wochentage + Leisten. */
export function HomeworkWeekStrip({ days, items, today }: { days: ISODate[]; items: SpanItem[]; today: ISODate }) {
  const { lanes } = layoutSpans(items, days);
  if (lanes === 0) return null;
  return (
    <section className="card rounded-[20px] p-3" aria-label="Hausaufgaben in dieser Woche" data-testid="hw-week-strip">
      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Hausaufgaben</p>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
        {days.map((d) => (
          <span key={d} className={d === today ? 'text-accent' : ''}>
            {formatISODate(d, { weekday: 'narrow' })}
          </span>
        ))}
      </div>
      <div className="relative mt-1.5" style={{ height: lanes * SPAN_ROW }}>
        <SpanBars days={days} items={items} />
      </div>
    </section>
  );
}
