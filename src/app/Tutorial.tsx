import type { Me } from './api';

/**
 * Platz für eine spätere Einführung (Tutorial) nach der ersten Anmeldung.
 * Noch nicht aktiv: TUTORIAL_ENABLED bleibt aus, bis es Inhalte gibt.
 * Der Merker liegt je Konto im Gerät; später kann er in `profiles` wandern.
 */
export const TUTORIAL_ENABLED = false;
const key = (uid: string) => `studyspace.app.tutorial.${uid}`;

export function shouldShowTutorial(me: Pick<Me, 'user_id'>): boolean {
  if (!TUTORIAL_ENABLED) return false;
  try {
    return localStorage.getItem(key(me.user_id)) !== 'done';
  } catch {
    return false;
  }
}

export function markTutorialDone(me: Pick<Me, 'user_id'>) {
  try {
    localStorage.setItem(key(me.user_id), 'done');
  } catch {
    /* ignorieren */
  }
}

/** Wird von AppGate eingebunden; zeigt derzeit nichts. */
export function TutorialSlot({ me }: { me: Me }) {
  if (!shouldShowTutorial(me)) return null;
  return null;
}
