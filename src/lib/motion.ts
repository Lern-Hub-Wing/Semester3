/**
 * Bewegungssprache von StudySpace – eine Quelle für alle JS-Animationen
 * (Motion). Die CSS-Gegenstücke stehen als Variablen in styles/index.css
 * (--dur-*, --ease-*).
 *
 * Hierarchie:
 *  – micro:  alltägliche Interaktionen (Drücken, Umschalten)       schnell, kaum Überschwingen
 *  – comp:   Komponenten (Menüs, Linse der Navigation, Karten)       federnd
 *  – page:   Seitenwechsel, Dialoge                                  weich, räumlich
 *  – moment: große Momente (App-Start, Profilwahl, 100 %)            ausdrucksstark
 */
import type { Transition } from 'motion/react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_EMPH = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const spring = {
  /** Drücken, Haken, Schalter */
  micro: { type: 'spring', stiffness: 620, damping: 34, mass: 0.7 },
  /** Menüs, Popover, Kartenwechsel */
  comp: { type: 'spring', stiffness: 420, damping: 32 },
  /** Aktive Navigation: schießt los und federt zurück (Elastic Tab Morph) */
  tab: { type: 'spring', stiffness: 380, damping: 27, mass: 0.85 },
  /** Dialoge, Sheets */
  page: { type: 'spring', stiffness: 300, damping: 32 },
  /** Fortschritt nach Änderungen */
  value: { type: 'spring', stiffness: 70, damping: 18, mass: 0.9 },
  /** Große Momente – sichtbares Überschwingen */
  moment: { type: 'spring', stiffness: 210, damping: 18, mass: 0.9 },
} as const satisfies Record<string, Transition>;

export const tween = {
  micro: { duration: 0.14, ease: EASE_OUT },
  comp: { duration: 0.26, ease: EASE_OUT },
  page: { duration: 0.42, ease: EASE_EMPH },
  moment: { duration: 0.9, ease: EASE_EMPH },
  /** Erstes Füllen von Fortschrittsanzeigen */
  fill: { duration: 1.35, ease: EASE_OUT },
} as const satisfies Record<string, Transition>;

/** Ausgeschaltete Bewegung (prefers-reduced-motion / Einstellung) */
export const instant: Transition = { duration: 0 };

/** Ermittelt, ob gerade reduzierte Bewegung gilt (außerhalb von React). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  const root = document.documentElement;
  if (root.classList.contains('reduce-motion')) return true;
  if (root.classList.contains('force-motion')) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
