import { useEffect } from 'react';
import { usePrefs } from '../store/prefs';
import { useMediaQuery } from './useMediaQuery';
import { glassFactor } from '../lib/glass';
import { EXTRA_MOTION } from '../lib/motionFlags';

/** Farbe der Statusleiste/Browserleisten = Seitengrund (--ss-canvas in index.css) */
const TOP_LIGHT = '#DCD8F4';
const TOP_DARK = '#14142C';

/** Wendet Theme, Bewegung und Glaseffekte als Klassen auf <html> an. */
export function useAppearance() {
  const { theme, motion, glass, compact, glassClarity, extraMotion } = usePrefs();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const reduced = motion === 'reduced' || (motion === 'system' && systemReduced);
  const extra = EXTRA_MOTION && extraMotion && !reduced;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    // Glisse-Komponenten lesen das Theme aus data-theme
    root.dataset.theme = dark ? 'dark' : 'light';
    root.classList.toggle('reduce-motion', motion === 'reduced');
    root.classList.toggle('force-motion', motion === 'full');
    root.classList.toggle('compact', compact);
    root.classList.toggle('extra-motion', extra);
    root.style.setProperty('--lg-k', String(glassFactor(glassClarity)));
    // Auf schwachen Geräten Glaseffekte automatisch vereinfachen
    const nav = navigator as Navigator & { deviceMemory?: number };
    const weak = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
    root.classList.toggle('reduce-glass', glass === 'reduced' || weak);
    // Android: viele unscharfe Glasflächen ruckeln beim Scrollen → Karten ohne Live-Unschärfe (Leisten bleiben Glas)
    root.classList.toggle('android', /Android/i.test(navigator.userAgent));
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? (() => {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      document.head.appendChild(m);
      return m;
    })();
    meta.setAttribute('content', dark ? TOP_DARK : TOP_LIGHT);
  }, [dark, motion, glass, compact, glassClarity, extra]);

  return { dark, reducedMotion: reduced };
}
