import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import type { Ratio } from '../../lib/progress';
import { spring, tween } from '../../lib/motion';
import { AnimatedNumber } from './AnimatedNumber';

interface RingProps {
  ratio: Ratio;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  /** Inhalt in der Mitte statt des Prozentwerts (z. B. Avatar) */
  children?: ReactNode;
  showValue?: boolean;
}

/**
 * Animierter Fortschrittskreis – geometrisch exakt (SVG, runde Enden).
 * – Füllt sich beim ersten Sichtbarwerden weich von 0 auf den echten Wert,
 *   die Zahl läuft mit.
 * – Danach gleitet ein Lichtreflex entlang des gefüllten Bogens.
 * – Beim Erreichen von 100 % breitet sich eine Welle aus (Progress Shockwave).
 * – Der Leuchtschein ist ein SVG-Filter mit ausdrücklich festgelegter
 *   Filterfläche (kein eckiges Abschneiden).
 * Ohne Aufgaben wird "–" statt 100 % angezeigt.
 */
export function ProgressRing({ ratio, color, size = 96, stroke = 9, label, sublabel, className = '', children, showValue = true }: RingProps) {
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

  // Lichtreflex nach dem ersten Füllen und wenn der Wert steigt
  const [sweepKey, setSweepKey] = useState(0);
  // Welle beim tatsächlichen Übergang auf 100 % (nicht beim ersten Anzeigen)
  const [waveKey, setWaveKey] = useState(0);
  const firstFill = useRef(true);
  const lastPct = useRef(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const prev = lastPct.current;
    const grew = shown > prev;
    lastPct.current = shown;
    if (!grew || shown <= 0) return;
    const wasFirst = firstFill.current;
    const delay = wasFirst ? tween.fill.duration * 1000 * 0.75 : 450;
    firstFill.current = false;
    const t = setTimeout(() => setSweepKey((k) => k + 1), delay);
    let w: ReturnType<typeof setTimeout> | undefined;
    if (!wasFirst && shown === 100 && prev < 100) w = setTimeout(() => setWaveKey((k) => k + 1), 380);
    return () => {
      clearTimeout(t);
      if (w) clearTimeout(w);
    };
  }, [shown, inView, reduce]);

  const sweepLen = Math.min(c * 0.18, Math.max(filled * 0.5, 0));
  const center = size / 2;
  const glow = Math.max(3, stroke * 0.6);
  /** Rand der Filterfläche: genug Platz für den Weichzeichner (≈ 3 Standardabweichungen) */
  const glowPad = Math.ceil(glow * 4 + stroke);
  const transition = reduce ? { duration: 0 } : firstFill.current ? tween.fill : spring.value;

  return (
    <div ref={ref} className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`color-mix(in srgb, ${color} 62%, white)`} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          {/*
            Leuchtschein als echter SVG-Filter mit AUSDRÜCKLICH festgelegter Filterfläche
            (userSpaceOnUse, deutlich größer als der Kreis). Ein CSS-`filter: blur()` auf
            SVG-Elementen nutzt dagegen eine automatisch berechnete, rechteckige Fläche,
            die mit Grafikkarten-Beschleunigung hart abgeschnitten wird (eckiges Leuchten).
          */}
          <filter id={`${gradientId}-glow`} filterUnits="userSpaceOnUse" x={-glowPad} y={-glowPad} width={size + glowPad * 2} height={size + glowPad * 2} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={glow} />
          </filter>
        </defs>
        {/* Spur: gläserne Rille */}
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
            animate={{ strokeDashoffset: c - filled, opacity: complete ? 0.8 : 0.45 }}
            transition={transition}
            filter={`url(#${gradientId}-glow)`}
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
          transition={transition}
        />
        {/* Lichtreflex, der einmal entlang des gefüllten Bogens gleitet */}
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
            animate={{ strokeDashoffset: -(filled - sweepLen), opacity: [0, 0.85, 0.85, 0] }}
            transition={{ duration: Math.max(0.9, (filled / c) * 1.6), ease: [0.45, 0, 0.25, 1], opacity: { times: [0, 0.15, 0.8, 1] } }}
            style={{ mixBlendMode: 'soft-light' }}
          />
        )}
        {/* Welle bei 100 % */}
        {waveKey > 0 && (
          <motion.circle
            key={`w${waveKey}`}
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke * 0.6}
            style={{ transformOrigin: `${center}px ${center}px` }}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <div className="leading-none">
            {!showValue ? null : ratio.pct === null ? (
              <span className="text-muted" style={{ fontSize: size * 0.22 }}>–</span>
            ) : (
              <AnimatedNumber value={shown} suffix="%" className="font-semibold tracking-tight" style={{ fontSize: size * 0.22, letterSpacing: '-0.03em' }} />
            )}
            {label && <div className="mt-1 text-[11px] font-medium text-muted">{label}</div>}
          </div>
        )}
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

/** Fortschrittsbalken: gläserne Rille, gefüllt mit Verlauf und weichem Leuchten. */
export function ProgressBar({ ratio, color, height = 8, className = '', label }: BarProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const pct = ratio.pct ?? 0;
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ratio.pct ?? undefined}
      aria-valuetext={ratio.pct === null ? 'keine Aufgaben' : `${ratio.pct} Prozent`}
      className={`relative w-full overflow-hidden rounded-full ${className}`}
      style={{ height, background: 'var(--ss-track)', boxShadow: 'inset 0 1px 1px rgba(16,22,46,0.06)' }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, white) 0%, ${color} 100%)`,
          boxShadow: `0 0 12px -2px color-mix(in srgb, ${color} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.45)`,
        }}
        initial={{ width: 0 }}
        animate={{ width: `${inView || reduce ? pct : 0}%` }}
        transition={reduce ? { duration: 0 } : spring.value}
      />
    </div>
  );
}
