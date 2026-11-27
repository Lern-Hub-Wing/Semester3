/**
 * Umzug der bisherigen Seite in die App: Weiterleitung ohne Zwischenfenster.
 * („Alte Seite“ nur noch über …/Semester3/?bleiben – z. B. um die Umleitung auszuschalten.)
 */
const STAY_KEY = 'studyspace.move.stay';

/** Adresse der App neben der Seite (…/Semester3/app/) */
export function appAddress(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base.endsWith('/') ? base : `${base}/`}app/`;
}

/** Umleitungsziel aus der Einstellung „moved_to_app“ (nur eigene Adresse, sonst null) */
export function movedTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const url = (value as { url?: unknown }).url;
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    // Nur auf die eigene App umleiten – nie auf fremde Seiten
    return u.origin === window.location.origin && u.pathname.endsWith('/app/') ? u.href : appAddress();
  } catch {
    return null;
  }
}

const MOVED_KEY = 'studyspace.moved.to';

/** Auf der alten Seite bleiben (nur über ?bleiben in der Adresse oder nach dem Einschalten der Umleitung in dieser Sitzung) */
export function stayOnSite(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('bleiben')) sessionStorage.setItem(STAY_KEY, '1');
    return sessionStorage.getItem(STAY_KEY) === '1';
  } catch {
    return false;
  }
}

/** Wer die Umleitung gerade selbst einschaltet, bleibt in dieser Sitzung auf der Seite (zum Prüfen/Ausschalten). */
export function stayThisSession(): void {
  try {
    sessionStorage.setItem(STAY_KEY, '1');
  } catch {
    /* egal */
  }
}

/** Umleitungsziel merken: Beim nächsten Besuch geht es sofort weiter, noch bevor die Seite lädt. */
export function rememberMoved(target: string | null): void {
  try {
    if (target) localStorage.setItem(MOVED_KEY, target);
    else localStorage.removeItem(MOVED_KEY);
  } catch {
    /* egal */
  }
}

/** Jetzt zur App – ohne Zwischenfenster */
export function redirectToApp(target: string): void {
  rememberMoved(target);
  window.location.replace(target);
}

/**
 * Vor dem Start der alten Seite (main.tsx): sofort weiterleiten, wenn
 *  – eine Admin-Adresse geöffnet wurde (…/admin) → Admin-Bereich der App,
 *  – die Seite schon einmal als umgezogen erkannt wurde (gemerktes Ziel).
 * Liefert true, wenn weitergeleitet wird.
 */
export function earlyRedirect(): boolean {
  const base = import.meta.env.BASE_URL || '/';
  const rest = window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : '';
  if (/^admin(\/|$)/.test(rest)) {
    window.location.replace(`${appAddress()}admin/`);
    return true;
  }
  if (stayOnSite()) return false;
  try {
    const t = localStorage.getItem(MOVED_KEY);
    if (t && movedTarget({ url: t })) {
      window.location.replace(t);
      return true;
    }
  } catch {
    /* ohne Speicher: normal starten */
  }
  return false;
}
