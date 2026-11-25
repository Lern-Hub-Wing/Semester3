import { pause as pauseFocus } from '../lib/focus';
import { pauseStopwatch, resumeStopwatch } from '../lib/stopwatch';
import { focusActions, useFocus } from './focus';
import { useStopwatch } from './stopwatch';
import { toast } from './toast';

/**
 * Automatische Pause: Wer StudySpace verlässt (anderer Tab, andere App,
 * Handy gesperrt) oder die Timer-Ansicht schließt, lernt in dem Moment nicht –
 * also darf die Lernzeit auch nicht weiterlaufen. Kurze Unterbrechungen
 * (unter 8 s, z. B. Benachrichtigung angetippt) laufen nahtlos weiter.
 * Abschaltbar in den Einstellungen (Uhr & Fokus).
 */
export const AUTO_RESUME_MS = 8000;

/** Pausiert, was gerade läuft. Gibt zurück, was pausiert wurde. */
export function pauseRunning(at = Date.now()): { focus: boolean; stopwatch: boolean } {
  const f = useFocus.getState();
  const sw = useStopwatch.getState();
  const focus = f.timer.endsAt !== null;
  const stopwatch = !!sw.state && sw.state.runningSince !== null;
  if (focus) f.setTimer(pauseFocus(f.timer, at));
  if (stopwatch) sw.set(pauseStopwatch(sw.state!, at));
  return { focus, stopwatch };
}

function resume(what: { focus: boolean; stopwatch: boolean }) {
  if (what.focus) focusActions.start();
  const sw = useStopwatch.getState();
  if (what.stopwatch && sw.state) sw.set(resumeStopwatch(sw.state, Date.now()));
}

let installed = false;
let hiddenAt: number | null = null;
let paused: { focus: boolean; stopwatch: boolean } | null = null;

export function installAutoPause() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const onHide = () => {
    if (!useFocus.getState().settings.autoPause || hiddenAt !== null) return;
    hiddenAt = Date.now();
    const p = pauseRunning(hiddenAt);
    paused = p.focus || p.stopwatch ? p : null;
  };
  const onShow = () => {
    if (hiddenAt === null) return;
    const away = Date.now() - hiddenAt;
    const what = paused;
    hiddenAt = null;
    paused = null;
    if (!what) return;
    if (away < AUTO_RESUME_MS) return resume(what);
    toast.info(`${what.stopwatch && !what.focus ? 'Zähler' : 'Timer'} pausiert, weil du StudySpace verlassen hast – die Lernzeit stimmt.`, { label: 'Fortsetzen', run: () => resume(what) });
  };
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? onHide() : onShow()));
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
}

/** Beim Schließen der Timer-Ansicht (Fokus oder Hausaufgaben-Zähler) */
export function pauseOnLeave(kind: 'focus' | 'stopwatch') {
  if (!useFocus.getState().settings.autoPause) return;
  const p = pauseRunning();
  if (kind === 'focus' && p.focus) toast.info('Timer pausiert – du hast den Fokus verlassen.', { label: 'Fortsetzen', run: () => focusActions.start() });
  if (kind === 'stopwatch' && p.stopwatch) toast.info('Zähler pausiert – weiter geht es mit „Weiter“ an der Hausaufgabe.');
}
