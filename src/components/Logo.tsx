import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { DEFAULT_MEMBER_COLORS } from '../lib/colors';
import { EASE_EMPH } from '../lib/motion';

interface MarkProps {
  size?: number;
  colors?: string[];
  /**
   * Startanimation: Die vier Bögen (die Gruppe) fliegen aus verschiedenen
   * Richtungen heran, rasten zu einem Kreis ein, der Kern erscheint und ein
   * Lichtreflex läuft einmal über das Zeichen.
   */
  animate?: boolean;
  /** Verzögerung der Startanimation in Sekunden */
  delay?: number;
}

/** StudySpace-Zeichen: vier Bögen (die Gruppe) bilden gemeinsam einen vollen Kreis. */
export function LogoMark({ size = 40, colors = DEFAULT_MEMBER_COLORS, animate = false, delay = 0 }: MarkProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const c = colors.length >= 4 ? colors.slice(0, 4) : DEFAULT_MEMBER_COLORS;
  const r = 15;
  const len = 2 * Math.PI * r;
  const seg = len / 4;
  const play = animate && !reduce;
  // Herkunftsrichtungen der Bögen (oben links, oben rechts, unten rechts, unten links)
  const from = [
    { x: -14, y: -12, rotate: -70 },
    { x: 14, y: -14, rotate: 60 },
    { x: 14, y: 14, rotate: -50 },
    { x: -14, y: 12, rotate: 80 },
  ];

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={`${uid}-core`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#dfe6f7" stopOpacity="0.7" />
        </radialGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <circle cx="20" cy="20" r="18.5" />
        </clipPath>
      </defs>
      <g transform="rotate(-90 20 20)">
        {c.map((color, i) => (
          <motion.circle
            key={i}
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray={`${seg - 8.4} ${len - seg + 8.4}`}
            strokeDashoffset={-i * seg - 4.2}
            style={{ transformOrigin: '20px 20px' }}
            initial={play ? { opacity: 0, x: from[i].x, y: from[i].y, rotate: from[i].rotate, scale: 0.4 } : false}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            transition={play ? { type: 'spring', stiffness: 170, damping: 15, mass: 0.8, delay: delay + i * 0.07 } : undefined}
          />
        ))}
      </g>
      <motion.circle
        cx="20"
        cy="20"
        r="5.2"
        fill={`url(#${uid}-core)`}
        style={{ transformOrigin: '20px 20px' }}
        initial={play ? { scale: 0, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={play ? { type: 'spring', stiffness: 380, damping: 14, delay: delay + 0.42 } : undefined}
      />
      {play && (
        <g clipPath={`url(#${uid}-clip)`} style={{ mixBlendMode: 'soft-light' }}>
          <motion.rect
            x="-20"
            y="-6"
            width="16"
            height="52"
            fill={`url(#${uid}-sweep)`}
            transform="rotate(20 20 20)"
            initial={{ x: -20 }}
            animate={{ x: 70 }}
            transition={{ duration: 0.75, ease: EASE_EMPH, delay: delay + 0.62 }}
          />
        </g>
      )}
    </svg>
  );
}

export function Logo({ name = 'StudySpace' }: { name?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={32} />
      <span className="title text-[17px]">{name}</span>
    </span>
  );
}
