import { useEffect, useId, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import type { Ratio } from '../../lib/progress';
import { AnimatedNumber } from './AnimatedNumber';

const spring = { type: 'spring', stiffness: 70, damping: 18, mass: 0.9 } as const;
/** Erstes Füllen beim Öffnen: ruhig und gleichmäßig auslaufend */
const fillIn = { duration: 1.35, ease: [0.22, 1, 0.36, 1] } as const;

interface RingProps {
  ratio: Ratio;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

/**
 * Animierter Fortschrittskreis.
 * – Füllt sich beim ersten Sichtbarwerden weich von 0 auf den echten Wert.
 * – Danach gleitet einmal ein dezenter Lichtstrahl über den gefüllten Bogen.
 * – Der Leuchtschein ist eine weiche Ebene, die über den Rand hinaus darf
 *   (kein eckiges Abschneiden).
 * Ohne Aufgaben wird "–" statt 100 % angezeigt.
 */
export function ProgressRing({ ratio, color, size = 96, stroke = 9, label, sublabel, className = '' }: RingProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const gradientId = `ss-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = ratio.pct ?? 0;
  const complete = ratio.pct === 100;
  const shown = inView || reduce ? pct : 0;
  const filled = (c * shown) / 100;

  // Nach dem ersten Füllen (und wenn der Wert steigt) einmal den Lichtstrahl zeigen
  const [sweepKey, setSweepKey] = useState(0);
  const firstFill = useRef(true);
  const lastPct = useRef(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const grew = shown > lastPct.current;
    lastPct.current = shown;
    if (!grew || shown <= 0) return;
    const delay = firstFill.current ? fillIn.duration * 1000 * 0.75 : 500;
    firstFill.current = false;
    const t = setTimeout(() => setSweepKey((k) => k + 1), delay);
    return () => clearTimeout(t);
  }, [shown, inView, reduce]);

  const sweepLen = Math.min(c * 0.16, Math.max(filled * 0.5, 0));
  const center = size / 2;
  const glow = Math.max(4, stroke * 0.7);

  return (
    <div ref={ref} className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`color-mix(in srgb, ${color} 72%, white)`} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--ss-track)" strokeWidth={stroke} />
        {/* Weicher Leuchtschein (unscharfe Kopie des Bogens) */}
        {shown > 0 && (
          <motion.circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - filled, opacity: complete ? 0.75 : 0.42 }}
            transition={reduce ? { duration: 0 } : firstFill.current ? fillIn : spring}
            style={{ filter: `blur(${glow}px)` }}
          />
        )}
        <motion.circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - filled }}
          transition={reduce ? { duration: 0 } : firstFill.current ? fillIn : spring}
        />
        {/* Dezenter Lichtstrahl, der einmal über den gefüllten Bogen gleitet */}
        {sweepKey > 0 && sweepLen > 2 && (
          <motion.circle
            key={sweepKey}
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="white"
            strokeWidth={stroke * 0.55}
            strokeLinecap="round"
            strokeDasharray={`${sweepLen} ${c}`}
            initial={{ strokeDashoffset: 0, opacity: 0 }}
            animate={{ strokeDashoffset: -(filled - sweepLen), opacity: [0, 0.75, 0.75, 0] }}
            transition={{ duration: Math.max(0.9, (filled / c) * 1.6), ease: [0.45, 0, 0.25, 1], opacity: { times: [0, 0.15, 0.8, 1] } }}
            style={{ filter: 'blur(1.5px)', mixBlendMode: 'soft-light' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div className="leading-none">
          {ratio.pct === null ? (
            <span className="text-muted" style={{ fontSize: size * 0.22 }}>–</span>
          ) : (
            <AnimatedNumber value={shown} suffix="%" className="font-semibold tracking-tight" style={{ fontSize: size * 0.22 }} />
          )}
          {label && <div className="mt-1 text-[11px] font-medium text-muted">{label}</div>}
        </div>
      </div>
      <span className="sr-only">
        {sublabel ?? label}: {ratio.pct === null ? 'keine Aufgaben' : `${ratio.pct} Prozent, ${ratio.done} von ${ratio.total} erledigt`}
      </span>
    </div>
  );
}

interface BarProps {
  ratio: Ratio;
  color: string;
  height?: number;
  className?: string;
  label?: string;
}

export function ProgressBar({ ratio, color, height = 8, className = '', label }: BarProps) {
  const reduce = useReducedMotion();
  const pct = ratio.pct ?? 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ratio.pct ?? undefined}
      aria-valuetext={ratio.pct === null ? 'keine Aufgaben' : `${ratio.pct} Prozent`}
      className={`relative w-full overflow-hidden rounded-full ${className}`}
      style={{ height, background: 'var(--ss-track)' }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 75%, white) 0%, ${color} 100%)`,
          boxShadow: `0 0 12px -2px color-mix(in srgb, ${color} 60%, transparent)`,
        }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : spring}
      />
    </div>
  );
}
