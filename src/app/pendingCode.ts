/** Tarif-Code aus einem Link bis nach Anmeldung/Beitritt merken (eigene Datei: keine Ringabhängigkeit) */
const PENDING_KEY = 'studyspace.app.pendingCode';

/** Tarif-Code aus einem Link (#/code/ABCD-2345) bis nach der Anmeldung merken */
export function rememberPromoFromUrl(code: string | null) {
  if (!code) return;
  try {
    sessionStorage.setItem(PENDING_KEY, code);
  } catch {
    /* egal */
  }
}
export function takePendingPromo(): string {
  try {
    const c = sessionStorage.getItem(PENDING_KEY) ?? '';
    sessionStorage.removeItem(PENDING_KEY);
    return c;
  } catch {
    return '';
  }
}

