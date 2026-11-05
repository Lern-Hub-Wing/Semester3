import { create } from 'zustand';

/**
 * Aktives Lernprofil. Dies ist eine reine Auswahl und KEINE Anmeldung.
 *
 * Bei jedem Öffnen der App erscheint wieder „Wer lernt heute?“:
 *  – Die Auswahl wird bewusst nicht gespeichert (auch nicht beim Neuladen).
 *  – War die App länger als RESUME_PROMPT_MS im Hintergrund (Handy gesperrt,
 *    andere App, Tab lange inaktiv), wird ebenfalls neu gefragt.
 */
export const RESUME_PROMPT_MS = 15 * 60 * 1000;

interface SessionState {
  activeMemberId: string | null;
  select: (id: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  activeMemberId: null,
  select: (id) => set({ activeMemberId: id }),
}));

export const getActiveMemberId = () => useSession.getState().activeMemberId;

let hiddenAt: number | null = null;
let installed = false;

/** Fragt nach längerer Abwesenheit erneut, wer gerade lernt. */
export function installResumePrompt(now: () => number = Date.now) {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = now();
    } else if (hiddenAt !== null) {
      if (now() - hiddenAt >= RESUME_PROMPT_MS) useSession.getState().select(null);
      hiddenAt = null;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  // iOS-PWA aus dem Hintergrund-Cache (bfcache) zurückgeholt
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) useSession.getState().select(null);
  });
}
