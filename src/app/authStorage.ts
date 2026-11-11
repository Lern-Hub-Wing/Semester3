/**
 * Speicher für die Anmeldung („angemeldet bleiben“):
 *  – an: Sitzung in localStorage → bleibt nach dem Schließen erhalten
 *  – aus: Sitzung in sessionStorage → endet mit dem Tab/Browser
 * Funktioniert mit supabase-js; in einer späteren Expo-App wird stattdessen
 * SecureStore/AsyncStorage übergeben (gleiche Schnittstelle).
 */
const REMEMBER_KEY = 'studyspace.app.remember';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getRemember(): boolean {
  return safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true);
}

export function setRemember(on: boolean) {
  safe(() => localStorage.setItem(REMEMBER_KEY, on ? '1' : '0'), undefined);
}

export const authStorage = {
  getItem(key: string): string | null {
    return safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null);
  },
  setItem(key: string, value: string) {
    safe(() => {
      const [keep, drop] = getRemember() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(key, value);
      drop.removeItem(key);
    }, undefined);
  },
  removeItem(key: string) {
    safe(() => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }, undefined);
  },
};
