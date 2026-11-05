/**
 * Vollbild, Bildschirm-Wachhalten und Querformat – jeweils nur, wo der
 * Browser es wirklich anbietet. Fehler werden still abgefangen: Der
 * Lernmodus funktioniert auch ohne diese Funktionen.
 */

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export function fullscreenSupported(): boolean {
  const d = document as FsDocument;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as FsDocument;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Muss direkt aus einer Benutzeraktion (Klick/Tipp) aufgerufen werden. */
export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  // Querformat sperren (nur Android im Vollbild)
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* nicht unterstützt */
  }
  return true;
}

export async function exitFullscreen(): Promise<void> {
  const d = document as FsDocument;
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
  } catch {
    /* egal */
  }
  try {
    if (d.fullscreenElement) await d.exitFullscreen();
    else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
  } catch {
    /* egal */
  }
}

export function isIPhone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}
