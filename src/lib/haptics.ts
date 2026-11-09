/**
 * Dezentes haptisches Feedback über die offizielle Vibration API.
 *
 * – Wird nur ausgelöst, wenn der Browser `navigator.vibrate` wirklich anbietet
 *   (z. B. Chrome auf Android). iOS Safari unterstützt die API nicht – dort
 *   passiert bewusst nichts (keine Tricks); die Bedienung zeigt stattdessen eine
 *   visuelle Rückmeldung (Drück-Animation).
 * – Sehr kurze Impulse, keine langen Muster, nie beim Scrollen.
 * – Abschaltbar in den Einstellungen („Haptisches Feedback“).
 */

import { playUiSound } from './sound';

export type HapticKind = 'tap' | 'select' | 'success' | 'toggle';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 6, // Navigationsbutton, Menü öffnen
  select: 8, // Person auswählen, Einstellung ändern
  toggle: 7, // Checkbox umschalten
  success: [8, 40, 10], // Aufgabe erledigt – zwei sehr kurze Impulse
};

/** Mindestabstand zwischen zwei Impulsen (verhindert „Brummen“ bei schnellen Klicks) */
const MIN_INTERVAL_MS = 60;

let enabled = true;
let lastAt = 0;

export function isHapticsSupported(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return !!nav && typeof (nav as Navigator & { vibrate?: unknown }).vibrate === 'function';
}

export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

/** Löst einen kurzen Impuls aus, falls unterstützt und eingeschaltet. Gibt zurück, ob vibriert wurde. */
export function haptic(kind: HapticKind = 'tap', now: number = Date.now(), nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  // Passender, sehr leiser Klang zur Rückmeldung (eigene Einstellung „Klänge“)
  // (synchron, damit iOS den Ton als Reaktion auf die Berührung zulässt)
  if (typeof window !== 'undefined') playUiSound(kind);
  if (!enabled || !isHapticsSupported(nav)) return false;
  if (now - lastAt < MIN_INTERVAL_MS) return false;
  lastAt = now;
  try {
    return nav!.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}

/** Nur für Tests */
export function __resetHaptics() {
  enabled = true;
  lastAt = 0;
}
