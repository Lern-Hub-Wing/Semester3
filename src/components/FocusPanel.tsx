import { useId, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatClock, isRunning, isStarted, phaseTitle, progressOf, remainingSec, type FocusState } from '../lib/focus';
import { useNow } from '../hooks/useNow';
import { rhythmOf, useFocus } from '../store/focus';

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
