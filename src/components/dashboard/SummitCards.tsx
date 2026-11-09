import { useEffect, useMemo } from 'react';
import { CalendarPlus, Flame, GraduationCap, Play } from 'lucide-react';
import { getCountdownState, splitDuration } from '../../lib/countdown';
import { formatInstant } from '../../lib/time';
import { formatClock } from '../../lib/focus';
import { addDaysISO, instantToZoned, weekdayIndex } from '../../lib/time';
import { navigate } from '../../lib/router';
import { haptic } from '../../lib/haptics';
import { useNow } from '../../hooks/useNow';
import { useToday } from '../../hooks/useToday';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { loadFocusSessions, useFocus } from '../../store/focus';
import { PeakStage } from '../landscape/Landscape';
import { useFocusLive } from '../FocusPanel';
import type { Member } from '../../lib/types';

/** Fokus-Knopf: zeigt die laufende Zeit, wenn gerade eine Session läuft */
export function FocusButton({ className = '' }: { className?: string }) {
  const { running, started, rest } = useFocusLive();
  const label = running ? `Fokus läuft · ${formatClock(rest)}` : started ? 'Fokus fortsetzen' : 'Fokus starten';
  return (
    <button
      type="button"
      onClick={() => {
        haptic('select');
        navigate('/fokus');
      }}
      className={`btn-primary inline-flex h-12 items-center justify-center gap-2.5 rounded-full px-7 text-[15px] font-semibold ${className}`}
      data-testid="focus-start"
    >
      <Play className="size-4" fill="currentColor" aria-hidden />
      <span className="num">{label}</span>
    </button>
  );
}

/** Panorama-Karte mit Countdown zur nächsten Prüfung */
export function ExamHero({ compact = false }: { compact?: boolean }) {
  const now = useNow(1000);
  const examsMap = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const openEditor = useUI((s) => s.openEntryEditor);
  const today = useToday();
  const exams = useMemo(() => Object.values(examsMap), [examsMap]);
  const live = getCountdownState(exams, now);
  const exam = live.kind === 'upcoming' || live.kind === 'running' ? live.exam : null;
  const parts = live.kind === 'running' ? splitDuration(live.msUntilEnd) : live.kind === 'upcoming' ? splitDuration(live.msUntilStart) : null;
  const units: [string, string, string][] = parts
    ? [
        [String(parts.days), 'Tage', 'Tage'],
        [String(parts.hours).padStart(2, '0'), 'Stunden', 'Std.'],
        [String(parts.minutes).padStart(2, '0'), 'Minuten', 'Min.'],
        [String(parts.seconds).padStart(2, '0'), 'Sekunden', 'Sek.'],
      ]
    : [];

  return (
    <PeakStage
      pop={compact ? 34 : 52}
      aria-label="Prüfungscountdown"
      className={`rounded-[22px] ${compact ? 'px-4 pb-5 pt-12' : 'px-6 pb-8 pt-24 md:pt-28'}`}
      data-testid="dashboard-hero"
    >
      <div className="on-photo flex flex-col items-center text-center">
        <p className={`flex items-center gap-2 font-semibold ${compact ? 'text-[15px]' : 'text-[19px]'}`}>
          <GraduationCap className={compact ? 'size-[18px]' : 'size-5'} aria-hidden />
          {live.kind === 'running' ? 'Prüfung läuft' : 'Nächste Prüfung'}
        </p>
        {parts ? (
          <>
            <div className={`num mt-3 flex items-start justify-center ${compact ? 'gap-1.5' : 'gap-3 md:gap-4'}`} aria-live="off">
              {units.map(([v, long, short], i) => (
                <div key={long} className="flex items-start">
                  {i > 0 && <span className={`font-semibold opacity-70 ${compact ? 'mr-1.5 text-[32px] leading-[1.05]' : 'mr-3 text-[44px] leading-[1.05] md:mr-4 md:text-[60px]'}`}>:</span>}
                  <div className={compact ? 'min-w-[44px]' : 'min-w-[64px] md:min-w-[84px]'}>
                    <div className={`font-semibold tracking-[-0.03em] ${compact ? 'text-[36px] leading-none' : 'text-[48px] leading-none md:text-[64px]'}`}>{v}</div>
                    <div className={`mt-1.5 font-medium text-white/75 ${compact ? 'text-[12px]' : 'text-[14px]'}`}>{compact ? short : long}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className={`mt-4 font-medium text-white/85 ${compact ? 'text-[13px]' : 'text-[15px]'}`}>
              {modules[exam!.module_id]?.name ?? 'Prüfung'} · {formatInstant(exam!.starts_at, { day: 'numeric', month: 'short', year: 'numeric' }, exam!.timezone)}
            </p>
            <p className="sr-only">
              Noch {parts.days} Tage, {parts.hours} Stunden, {parts.minutes} Minuten
            </p>
          </>
        ) : (
          <p className="mt-3 text-[15px] text-white/85">{live.kind === 'finished' ? 'Alle Prüfungen sind geschafft.' : 'Noch keine Prüfung eingetragen.'}</p>
        )}
        {!compact && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <FocusButton />
            <button
              type="button"
              onClick={() => {
                haptic('tap');
                openEditor({ date: today });
              }}
              className="inline-flex h-12 items-center gap-2.5 rounded-full border border-white/25 bg-white/[0.08] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.14]"
            >
              <CalendarPlus className="size-[18px]" aria-hidden />
              Session planen
            </button>
          </div>
        )}
      </div>
    </PeakStage>
  );
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Gelernte Fokuszeit (nur echte Fokusphasen) – heute und je Wochentag */
export function useFocusWeek(memberId: string) {
  const sessions = useFocus((s) => s.sessions);
  const available = useFocus((s) => s.available);
  const today = useToday();
  useEffect(() => {
    void loadFocusSessions();
  }, []);
  return useMemo(() => {
    // Letzte 7 Tage, heute ganz rechts
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6));
    const perDay = new Map(days.map((d) => [d, 0]));
    for (const s of sessions) {
      if (s.member_id !== memberId) continue;
      const d = instantToZoned(s.started_at).date;
      if (perDay.has(d)) perDay.set(d, perDay.get(d)! + s.duration_seconds);
    }
    return { available, today: perDay.get(today) ?? 0, days: days.map((d) => ({ date: d, label: WEEKDAYS[weekdayIndex(d)]!, seconds: perDay.get(d)!, isToday: d === today, future: false })) };
  }, [sessions, available, memberId, today]);
}

export function formatHours(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function FocusStatsCard({ me, className = '' }: { me: Member; className?: string }) {
  const week = useFocusWeek(me.id);
  const max = Math.max(1, ...week.days.map((d) => d.seconds));
  return (
    <section className={`card flex flex-col rounded-[20px] p-5 ${className}`} data-testid="focus-stats" aria-label="Fokus-Statistik">
      <h3 className="title flex items-center gap-2.5 text-[16px]">
        <Flame className="size-[18px] text-accent" aria-hidden />
        Fokus-Statistik
      </h3>
      <div className="mt-5 flex flex-1 items-end justify-between gap-4">
        <div>
          <p className="num whitespace-nowrap text-[30px] font-semibold leading-none tracking-[-0.03em]" data-testid="focus-today" data-seconds={week.today}>
            {week.available === false ? '–' : formatHours(week.today)}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">Heute</p>
        </div>
        <div className="flex h-[112px] items-end gap-2" role="img" aria-label={`Fokuszeit diese Woche: ${week.days.map((d) => `${d.label} ${formatHours(d.seconds)}`).join(', ')}`}>
          {week.days.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <div className="flex h-[92px] w-[16px] items-end">
                <div
                  className="stat-bar w-full"
                  data-today={d.isToday || undefined}
                  style={{ height: Math.max(3, (d.seconds / max) * 92) }}
                />
              </div>
              <span className={`text-[10.5px] ${d.isToday ? 'font-semibold text-ink' : 'text-faint'}`}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
