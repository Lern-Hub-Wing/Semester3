import { useId, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Coffee, Timer } from 'lucide-react';
import { formatClock, isRunning, isStarted, phaseTitle, progressOf, remainingSec, type FocusState } from '../lib/focus';
import { haptic } from '../lib/haptics';
import { navigate } from '../lib/router';
import { useNow } from '../hooks/useNow';
import { rhythmOf, useFocus } from '../store/focus';
import { useData } from '../store/data';

/** Farben je Phase: Fokus violett, kurze Pause mint, lange Pause blau */
export function phaseColors(timer: Pick<FocusState, 'phase' | 'long'>) {
  if (timer.phase === 'focus') return { main: '#a9a6ff', soft: '#c6b6ff', tint: 'rgba(120,110,255,0.22)' };
  if (timer.long) return { main: '#8cbcff', soft: '#bcd8ff', tint: 'rgba(90,150,255,0.22)' };
  return { main: '#7fd6b6', soft: '#bff0dc', tint: 'rgba(80,200,160,0.2)' };
}

/** Live-Zustand des Timers – tickt nur sekündlich und nur, solange er läuft */
export function useFocusLive() {
  const timer = useFocus((s) => s.timer);
  const settings = useFocus((s) => s.settings);
  const running = isRunning(timer);
  const now = useNow(running ? 1000 : 60_000);
  const rhythm = rhythmOf(settings);
  return {
    timer,
    rhythm,
    running,
    started: isStarted(timer),
    rest: remainingSec(timer, now),
    progress: progressOf(timer, now),
    isBreak: timer.phase === 'break',
    title: phaseTitle(timer, rhythm),
  };
}

/** Fortschrittsring; der Bogen gleitet linear von Sekunde zu Sekunde */
export function FocusRing({
  size,
  stroke,
  color,
  soft,
  glow = true,
  children,
}: {
  size: number;
  stroke: number;
  color: string;
  soft: string;
  glow?: boolean;
  children?: ReactNode;
}) {
  const { running, progress } = useFocusLive();
  const id = `fr-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pad = Math.ceil(stroke * 4);
  const offset = c * (1 - progress);
  const arc: CSSProperties = { transition: running ? 'stroke-dashoffset 1s linear' : 'stroke-dashoffset 0.6s var(--ease-out)' };
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} data-testid="focus-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={soft} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          {/* Filterfläche großzügig (userSpaceOnUse), damit der Schein nie eckig abgeschnitten wird */}
          <filter id={`${id}-glow`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={stroke * 0.8} />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        {glow && progress > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} opacity={running ? 0.5 : 0.28} filter={`url(#${id}-glow)`} style={arc} />
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={arc} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Große Uhr mit gleich breiten Ziffern; jede Ziffer gleitet beim Wechsel weich nach */
export function FocusDigits({ className = '', style, seconds = true, duration = 0.38 }: { className?: string; style?: CSSProperties; seconds?: boolean; duration?: number }) {
  const reduce = useReducedMotion();
  const { rest } = useFocusLive();
  const text = formatClock(rest, seconds);
  const animate = !reduce && duration > 0;
  return (
    <span className={`num inline-flex leading-none ${className}`} style={style} aria-hidden data-testid="focus-time" data-value={formatClock(rest)}>
      {text.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="relative inline-block w-[0.62em] overflow-hidden text-center" style={{ height: '1.08em' }}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch + i}
                className="absolute inset-0"
                initial={animate ? { y: '-60%', opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                exit={animate ? { y: '60%', opacity: 0 } : undefined}
                transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : (
          <span key={i} className="inline-block w-[0.3em] text-center opacity-70">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

/** Kurzer Status als Text (für Karte und Vollbild) */
export function focusStatusLabel(running: boolean, started: boolean, finished: boolean): string {
  if (finished) return 'Phase beendet';
  return running ? 'Läuft' : started ? 'Pausiert' : 'Bereit';
}

/** Fokus öffnen: immer die immersive Vollbildansicht */
export function openFocus() {
  haptic('select');
  navigate('/fokus');
}

/**
 * Dashboard-Karte: zeigt nur den Zustand und öffnet die Fokusansicht.
 * Bewusst ohne eigene Steuerung – alle Bedienelemente liegen im Vollbild.
 */
export function FocusLauncher({ large = false }: { large?: boolean }) {
  const { timer, running, started, rest, progress, isBreak, title } = useFocusLive();
  const modules = useData((s) => s.modules);
  const module = timer.moduleId ? modules[timer.moduleId] : null;
  const c = phaseColors(timer);
  const status = focusStatusLabel(running, started, timer.finished);
  return (
    <button
      type="button"
      onClick={openFocus}
      className="group relative flex w-full items-center gap-5 text-left sm:gap-7"
      aria-label={`Fokus öffnen – ${title}, ${status}, noch ${formatClock(rest)}`}
      data-testid="focus-launcher"
    >
      <span className="glass shrink-0 rounded-full p-1.5 transition-transform duration-300 group-hover:scale-[1.03]">
        <FocusRing size={large ? 156 : 112} stroke={large ? 10 : 8} color={c.main} soft={c.soft} glow={running}>
          {isBreak ? <Coffee className="size-6" style={{ color: c.main }} aria-hidden /> : <Timer className="size-6" style={{ color: c.main }} aria-hidden />}
        </FocusRing>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          <span className="relative flex size-2">
            {running && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: c.main }} />}
            <span className="relative inline-flex size-2 rounded-full" style={{ background: running ? c.main : 'var(--ss-text-3)' }} />
          </span>
          <span data-testid="focus-status">{title}</span>
          <span aria-hidden>·</span>
          <span>{status}</span>
        </span>
        <FocusDigits className={`font-semibold tracking-[-0.045em] ${large ? 'text-[64px] lg:text-[88px]' : 'text-[54px] md:text-[64px]'}`} />
        <span className="flex items-center gap-3">
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--ss-track)]">
            <span className="block h-full rounded-full" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${c.soft}, ${c.main})`, transition: running ? 'width 1s linear' : undefined }} />
          </span>
          {module && <span className="max-w-[40%] truncate text-[12.5px] text-muted">{module.name}</span>}
        </span>
      </span>
      <ArrowUpRight className="size-5 shrink-0 self-start text-muted transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
    </button>
  );
}
