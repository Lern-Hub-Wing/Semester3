/** Merkt sich die zuletzt besuchte Seite, damit „Fokus schließen“ dorthin zurückführt. */
const KEY = 'studyspace.focus.return';

export function rememberReturnPath(path: string) {
  if (path.startsWith('/fokus')) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* egal */
  }
}

export function returnPath(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '/';
  } catch {
    return '/';
  }
}
