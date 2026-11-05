import { enterFullscreen } from './fullscreen';
import { haptic } from './haptics';
import { navigate } from './router';

/**
 * Startet den Lernmodus. Direkt aus einem Klick/Tipp aufrufen – Browser
 * erlauben Vollbild nur als unmittelbare Reaktion auf eine Benutzeraktion.
 */
export function startStudyMode() {
  haptic('select');
  void enterFullscreen();
  navigate('/lernmodus');
}
