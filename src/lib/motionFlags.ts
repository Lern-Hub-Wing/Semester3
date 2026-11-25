/**
 * Zentraler Notschalter für die zusätzlichen Animationen
 * (Schiebe-Übergänge zwischen Unterseiten, Federn beim Antippen von Karten,
 * gestaffeltes Einblenden von Listen, Symbol-Hüpfer in der Navigation).
 *
 * false → alles davon ist sofort aus, für alle Nutzer. Die Grundanimationen
 * (Dialoge, Seiten-Einblenden, Häkchen) bleiben. Jede Person kann sie außerdem
 * in Einstellungen → Darstellung → „Extra-Animationen“ abschalten.
 * Alle zugehörigen Regeln stehen in styles/index.css unter „.extra-motion“.
 */
export const EXTRA_MOTION = true;

/** Gilt gerade die Extra-Bewegung? (Klasse auf <html>, gesetzt in useAppearance) */
export function extraMotionOn(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('extra-motion');
}
