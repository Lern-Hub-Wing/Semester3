import { create } from 'zustand';

/**
 * Aktives Lernprofil. Dies ist eine reine Auswahl und KEINE Anmeldung.
 * Gespeichert in sessionStorage: Neuladen behält die Auswahl, ein neuer
 * Start (neuer Tab, App neu geöffnet) zeigt wieder die Personenauswahl.
 */
const KEY = 'studyspace.activeMember';

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

interface SessionState {
  activeMemberId: string | null;
  select: (id: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  activeMemberId: typeof window === 'undefined' ? null : read(),
  select: (id) => {
    try {
      if (id) sessionStorage.setItem(KEY, id);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* privater Modus – Auswahl gilt dann nur bis zum Neuladen */
    }
    set({ activeMemberId: id });
  },
}));

export const getActiveMemberId = () => useSession.getState().activeMemberId;
