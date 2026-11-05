import { motion, useReducedMotion } from 'motion/react';
import type { Ratio } from '../../lib/progress';
import { AnimatedNumber } from './AnimatedNumber';

const spring = { type: 'spring', stiffness: 70, damping: 18, mass: 0.9 } as const;

interface RingProps {
  ratio: Ratio;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

/** Animierter Fortschrittskreis. Ohne Aufgaben wird "–" statt 100 % angezeigt. */
export function ProgressRing({ ratio, color, size = 96, stroke = 9, label, sublabel, className = '' }: RingProps) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = ratio.pct ?? 0;
  const complete = ratio.pct === 100;
  return (
    <div className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ss-track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={reduce ? { duration: 0 } : spring}
          style={{ filter: complete ? `drop-shadow(0 0 6px ${color})` : `drop-shadow(0 2px 6px color-mix(in srgb, ${color} 45%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div className="leading-none">
          {ratio.pct === null ? (
            <span className="text-muted" style={{ fontSize: size * 0.22 }}>–</span>
          ) : (
            <AnimatedNumber value={pct} suffix="%" className="font-semibold tracking-tight" style={{ fontSize: size * 0.22 }} />
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
