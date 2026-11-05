import { useEffect } from 'react';

/** Tastenkürzel, z. B. "mod+k" (Cmd auf macOS, sonst Strg). */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop();
    const needMod = parts.includes('mod');
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (needMod && !(e.metaKey || e.ctrlKey)) return;
      if (!needMod) {
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
      }
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler]);
}
