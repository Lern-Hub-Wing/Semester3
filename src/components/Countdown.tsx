import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, GraduationCap, MapPin, PartyPopper, Timer } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { useIsMobile } from '../hooks/useMediaQuery';
import { getCountdownState, splitDuration, upcomingExams } from '../lib/countdown';
import { formatDuration, formatInstant, formatTime } from '../lib/time';
import { useData } from '../store/data';
import { Link } from '../lib/router';
import { alpha } from '../lib/colors';
import { IconButton } from './ui/Button';
import type { Exam } from '../lib/types';

const UNITS = [
  { key: 'days', label: 'Tage' },
  { key: 'hours', label: 'Stunden' },
  { key: 'minutes', label: 'Minuten' },
  { key: 'seconds', label: 'Sekunden' },
] as const;

/**
 * Live-Countdown zur nächsten Prüfung. Die Restzeit wird bei jedem Tick
 * aus der aktuellen Uhrzeit und dem gespeicherten Prüfungsbeginn
 * berechnet – auch nach Standby sofort korrekt.
 */
export function Countdown({ compact: compactProp, className = '' }: { compact?: boolean; className?: string }) {
  const mobile = useIsMobile();
  const compact = compactProp ?? mobile;
  const now = useNow(1000);
  const examsMap = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const exams = useMemo(() => Object.values(examsMap), [examsMap]);
  const live = getCountdownState(exams, now);
  const list = upcomingExams(exams, now);
  const [offset, setOffset] = useState(0);
  const index = Math.min(offset, Math.max(0, list.length - 1));

  if (live.kind === 'none') {
    return (
      <Shell className={className} color="#AFC5F5">
        <div className="flex items-center gap-4">
          <GraduationCap className="size-8 text-muted" aria-hidden />
          <div>
            <p className="font-semibold">Noch keine Prüfungen eingetragen</p>
            <Link to="/faecher" className="text-sm font-medium text-accent hover:underline">
              Prüfung hinzufügen
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (live.kind === 'finished') {
    return (
      <Shell className={className} color="#AADCCB">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_srgb,#AADCCB_35%,transparent)]">
            <PartyPopper className="size-7" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Prüfungsphase</p>
            <p className="text-xl font-semibold tracking-tight">Alle Prüfungen sind geschafft</p>
            <p className="text-sm text-muted">Stark gemacht – gemeinsam bis zum Ende.</p>
          </div>
        </div>
      </Shell>
    );
  }

  const exam: Exam = index === 0 ? live.exam : list[index];
  const module = modules[exam.module_id];
  const color = module?.color ?? '#AFC5F5';
  const startMs = Date.parse(exam.starts_at);
  const endMs = Date.parse(exam.ends_at);
  const running = startMs <= now && now < endMs;
  const parts = splitDuration(running ? endMs - now : startMs - now);
  const dateLabel = formatInstant(exam.starts_at, compact ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, exam.timezone);

  return (
    <Shell className={className} color={color}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow flex items-center gap-2">
            {running ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: color }} />
                  <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
                </span>
                Prüfung läuft
              </>
            ) : index === 0 ? (
              'Nächste Prüfung'
            ) : (
              `Prüfung ${index + 1} von ${list.length}`
            )}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={exam.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
              <h2 className={`display mt-1.5 ${compact ? 'text-[24px]' : 'text-[28px] md:text-[38px]'}`}>
                {module?.name ?? 'Prüfung'}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span>
                  {dateLabel} · {formatTime(exam.starts_at, exam.timezone)} Uhr
                </span>
                <span className="inline-flex items-center gap-1">
                  <Timer className="size-3.5" aria-hidden />
                  {formatDuration(endMs - startMs)}
                </span>
                {exam.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden />
                    {exam.location}
                  </span>
                )}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
        {list.length > 1 && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Vorherige Prüfung" size="sm" disabled={index === 0} onClick={() => setOffset(Math.max(0, index - 1))}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <IconButton label="Nächste Prüfung" size="sm" disabled={index >= list.length - 1} onClick={() => setOffset(index + 1)}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        )}
      </div>

      <div className={`mt-5 grid grid-cols-4 ${compact ? 'gap-2' : 'gap-2.5 md:gap-3.5'}`} aria-live="off">
        {UNITS.map((u) => (
          <div
            key={u.key}
            className="lens relative overflow-hidden rounded-[20px] px-1 py-3 text-center md:rounded-[22px] md:py-4"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[color-mix(in_srgb,var(--ss-text)_7%,transparent)]" />
            <Digits value={u.key === 'days' ? parts.days : String(parts[u.key]).padStart(2, '0')} compact={compact} />
            <div className="mt-1 truncate text-[8.5px] font-semibold uppercase tracking-[0.04em] text-muted min-[360px]:text-[10px] min-[360px]:tracking-[0.06em] md:text-[11px] md:tracking-[0.14em]">{u.label}</div>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {running ? 'Verbleibende Prüfungszeit' : 'Zeit bis zur Prüfung'}: {parts.days} Tage, {parts.hours} Stunden, {parts.minutes} Minuten
      </p>

      {running && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--ss-track)]" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${((now - startMs) / (endMs - startMs)) * 100}%`, background: color }} />
        </div>
      )}

      {/* Desktop: die folgenden Prüfungen als kompakte Leiste (Antippen wechselt die Anzeige) */}
      {!compact && list.length > 1 && (
        <div className="no-scrollbar mt-5 hidden gap-2 overflow-x-auto lg:flex" role="list" aria-label="Weitere Prüfungen">
          {list.map((e, i) => {
            if (i === index) return null;
            const m = modules[e.module_id];
            const d = Math.max(0, Math.ceil((Date.parse(e.starts_at) - now) / 86_400_000));
            return (
              <button
                key={e.id}
                type="button"
                role="listitem"
                onClick={() => setOffset(i)}
                className="lens flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3 text-[12px] font-medium transition-transform hover:-translate-y-px"
                title={m?.name}
              >
                <span className="size-2 rounded-full" style={{ background: m?.color, boxShadow: `0 0 8px ${m?.color}` }} aria-hidden />
                <span className="max-w-[150px] truncate">{m?.name ?? 'Prüfung'}</span>
                <span className="num text-muted">{d} T.</span>
              </button>
            );
          })}
        </div>
      )}

      {list.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {list.map((e, i) => (
            <button
              key={e.id}
              type="button"
              tabIndex={-1}
              onClick={() => setOffset(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: i === index ? 18 : 6, background: i === index ? color : 'var(--ss-track)' }}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

function Digits({ value, compact }: { value: number | string; compact?: boolean }) {
  const reduce = useReducedMotion();
  const text = String(value);
  return (
    <div
      className={`num relative flex h-[1.15em] items-center justify-center font-semibold leading-none ${compact ? 'text-[26px] min-[360px]:text-[30px]' : 'text-[38px] md:text-[52px]'}`}
      style={{ perspective: 400, letterSpacing: '-0.04em' }}
    >
      {/* Countdown Flip: die Ziffer klappt räumlich nach unten weg */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          style={{ transformOrigin: '50% 50% -0.4em', backfaceVisibility: 'hidden' }}
          initial={reduce ? false : { rotateX: 75, opacity: 0, y: '-12%' }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          exit={reduce ? undefined : { rotateX: -75, opacity: 0, y: '12%' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Shell({ color, children, className = '' }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <section
      aria-label="Prüfungscountdown"
      className={`glass mat-hero relative flex flex-col justify-center rounded-[30px] p-5 md:p-7 ${className}`}
      style={{ '--m-extra': `radial-gradient(90% 120% at 100% 0%, ${alpha(color, 0.3)}, transparent 60%)` } as React.CSSProperties}
    >
      {/* Dezente, sehr langsam wandernde Lichtfläche in Modulfarbe */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 !z-0 size-96 rounded-full opacity-80 [animation:ss-drift-b_26s_ease-in-out_infinite_alternate]"
        style={{ background: `radial-gradient(circle, ${alpha(color, 0.6)}, transparent 65%)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 !z-0 size-72 rounded-full opacity-50 [animation:ss-drift-a_32s_ease-in-out_infinite_alternate]"
        style={{ background: `radial-gradient(circle, ${alpha(color, 0.35)}, transparent 65%)` }}
      />
      <div className="relative">{children}</div>
    </section>
  );
}
