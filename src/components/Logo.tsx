import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE_EMPH } from '../lib/motion';

/**
 * StudySpace-Zeichen: zwei Gipfel mit Schneekappen – „gemeinsam nach oben“.
 * Flach und ruhig gezeichnet (keine Glanz- oder Glüheffekte), damit es auch
 * als App-Symbol klein gut lesbar bleibt. Gleiche Geometrie wie in
 * scripts/generate-icons.mjs.
 */
export const MARK = {
  back: 'M20 36 L31.5 15 L44 36 Z',
  front: 'M4 36 L18.5 10 L33 36 Z',
  snowFront: 'M18.5 10 L23.7 19.4 L21.2 17.9 L18.7 20.6 L16.3 17.6 L13.3 19.4 Z',
  snowBack: 'M31.5 15 L35.4 22.2 L33.5 21 L31.7 22.8 L29.8 20.8 L27.7 21.9 Z',
} as const;

interface MarkProps {
  size?: number;
  /** Startanimation: die Gipfel wachsen von unten herauf */
  animate?: boolean;
  delay?: number;
}

export function LogoMark({ size = 40, animate = false, delay = 0 }: MarkProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const play = animate && !reduce;
  const rise = (i: number) =>
    play
      ? { initial: { y: 14, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { duration: 0.7, delay: delay + i * 0.12, ease: EASE_EMPH } }
      : {};
  return (
    <svg width={size} height={size} viewBox="2 4 44 36" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${uid}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C7C1FF" />
          <stop offset="1" stopColor="#8A82F2" />
        </linearGradient>
        <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8F87F0" />
          <stop offset="1" stopColor="#5D55C9" />
        </linearGradient>
      </defs>
      <motion.g {...rise(0)}>
        <path d={MARK.back} fill={`url(#${uid}-back)`} stroke={`url(#${uid}-back)`} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={MARK.snowBack} fill="#EEECFF" opacity="0.92" />
      </motion.g>
      <motion.g {...rise(1)}>
        <path d={MARK.front} fill={`url(#${uid}-front)`} stroke={`url(#${uid}-front)`} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={MARK.snowFront} fill="#FBFAFF" />
      </motion.g>
    </svg>
  );
}

/** Wortmarke: Zeichen + „Study“ (Textfarbe) „Space“ (Lavendel) */
export function Logo({ name = 'StudySpace', size = 32, className = '' }: { name?: string; size?: number; className?: string }) {
  const split = name === 'StudySpace';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="brand-word" style={{ fontSize: Math.round(size * 0.58) }}>
        {split ? (
          <>
            Study<span className="text-[var(--ss-brand)]">Space</span>
          </>
        ) : (
          name
        )}
      </span>
    </span>
  );
}
