import { useEffect } from 'react';
import { usePrefs } from '../store/prefs';
import { useMediaQuery } from './useMediaQuery';

/** Wendet Theme, Bewegung und Glaseffekte als Klassen auf <html> an. */
export function useAppearance() {
  const { theme, motion, glass, compact } = usePrefs();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('reduce-motion', motion === 'reduced');
    root.classList.toggle('force-motion', motion === 'full');
    root.classList.toggle('compact', compact);
    // Auf schwachen Geräten Glaseffekte automatisch vereinfachen
    const nav = navigator as Navigator & { deviceMemory?: number };
    const weak = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
    root.classList.toggle('reduce-glass', glass === 'reduced' || weak);
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? (() => {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      document.head.appendChild(m);
      return m;
    })();
    meta.setAttribute('content', dark ? '#0C1018' : '#F6F8FC');
  }, [dark, motion, glass, compact]);

  const reduced = motion === 'reduced' || (motion === 'system' && systemReduced);
  return { dark, reducedMotion: reduced };
}
