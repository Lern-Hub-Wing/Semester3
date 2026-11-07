import { useId } from 'react';
import { LANDSCAPE_H, LANDSCAPE_W, RIDGES, STARS } from './ridges';

/**
 * Ruhige Berglandschaft für den Hero-Bereich (Vektor, gestaffelte Ketten
 * mit Nebelbändern). Alle Farben kommen aus CSS-Variablen (--ls-*), dadurch
 * gibt es eine eigene Fassung für Dunkel (Nacht, Violett) und Hell
 * (Lavendel-Dunst) – ohne Bilddatei, gestochen scharf auf jedem Bildschirm.
 * Nebel driftet extrem langsam (nur transform, abschaltbar per reduzierter Bewegung).
 */
export function Landscape({ className = '' }: { className?: string }) {
  const id = `ls${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const grad = (name: string, top: string, bottom: string) => (
    <linearGradient id={`${id}-${name}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style={{ stopColor: `var(${top})` }} />
      <stop offset="100%" style={{ stopColor: `var(${bottom})` }} />
    </linearGradient>
  );
  const mist = (name: string) => (
    <linearGradient id={`${id}-${name}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style={{ stopColor: 'var(--ls-mist)', stopOpacity: 0 }} />
      <stop offset="55%" style={{ stopColor: 'var(--ls-mist)', stopOpacity: 1 }} />
      <stop offset="100%" style={{ stopColor: 'var(--ls-mist)', stopOpacity: 0 }} />
    </linearGradient>
  );
  return (
    <svg
      className={`landscape ${className}`}
      viewBox={`0 0 ${LANDSCAPE_W} ${LANDSCAPE_H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--ls-sky-1)' }} />
          <stop offset="48%" style={{ stopColor: 'var(--ls-sky-2)' }} />
          <stop offset="78%" style={{ stopColor: 'var(--ls-sky-3)' }} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.64" cy="0.5" r="0.55">
          <stop offset="0%" style={{ stopColor: 'var(--ls-glow)', stopOpacity: 0.9 }} />
          <stop offset="100%" style={{ stopColor: 'var(--ls-glow)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${id}-moon`}>
          <stop offset="0%" style={{ stopColor: 'var(--ls-moon)', stopOpacity: 1 }} />
          <stop offset="18%" style={{ stopColor: 'var(--ls-moon)', stopOpacity: 0.9 }} />
          <stop offset="24%" style={{ stopColor: 'var(--ls-moon)', stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: 'var(--ls-moon)', stopOpacity: 0 }} />
        </radialGradient>
        {grad('far', '--ls-far-1', '--ls-far-2')}
        {grad('mid1', '--ls-mid1-1', '--ls-mid1-2')}
        {grad('mid2', '--ls-mid2-1', '--ls-mid2-2')}
        {grad('near', '--ls-near-1', '--ls-near-2')}
        {mist('mist')}
        {/* Mondlicht auf den Graten: links hell, nach rechts auslaufend */}
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--ls-rim)', stopOpacity: 0.15 }} />
          <stop offset="60%" style={{ stopColor: 'var(--ls-rim)', stopOpacity: 0.9 }} />
          <stop offset="100%" style={{ stopColor: 'var(--ls-rim)', stopOpacity: 0.35 }} />
        </linearGradient>
      </defs>

      <rect width={LANDSCAPE_W} height={LANDSCAPE_H} fill={`url(#${id}-sky)`} />
      <rect width={LANDSCAPE_W} height={LANDSCAPE_H} fill={`url(#${id}-glow)`} />
      <g className="ls-stars">
        {STARS.map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="var(--ls-star)" opacity={o} />
        ))}
      </g>
      <circle cx={1300} cy={105} r={170} fill={`url(#${id}-moon)`} className="ls-moon" />

      <path d={RIDGES.far} fill={`url(#${id}-far)`} />
      <path d={RIDGES.farRim} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1.6} strokeLinejoin="round" opacity={0.8} />
      <g className="ls-mist ls-mist-a">
        <rect x={-200} y={290} width={LANDSCAPE_W + 400} height={170} fill={`url(#${id}-mist)`} opacity={0.75} />
      </g>
      <path d={RIDGES.mid1} fill={`url(#${id}-mid1)`} />
      <path d={RIDGES.mid1Rim} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1.2} strokeLinejoin="round" opacity={0.45} />
      <g className="ls-mist ls-mist-b">
        <rect x={-200} y={380} width={LANDSCAPE_W + 400} height={150} fill={`url(#${id}-mist)`} opacity={0.6} />
      </g>
      <path d={RIDGES.mid2} fill={`url(#${id}-mid2)`} />
      <g className="ls-mist ls-mist-a">
        <rect x={-200} y={470} width={LANDSCAPE_W + 400} height={140} fill={`url(#${id}-mist)`} opacity={0.45} />
      </g>
      <path d={RIDGES.near} fill={`url(#${id}-near)`} />
    </svg>
  );
}
