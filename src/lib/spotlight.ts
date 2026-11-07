/**
 * Lichtfleck, der dem Mauszeiger über Glasflächen folgt (Spotlight Tracking).
 * Ein einziger, gedrosselter Listener für die ganze App: er setzt nur die
 * CSS-Variablen --mx/--my auf der Glasfläche unter dem Zeiger. Das Material
 * (styles/index.css) zeichnet daraus den Lichtfleck. Nur auf Geräten mit
 * Maus, nie bei reduzierter Bewegung.
 */
let installed = false;

export function installSpotlight() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let last: PointerEvent | null = null;

  const apply = () => {
    frame = 0;
    const e = last;
    if (!e || !fine.matches) return;
    if (document.documentElement.classList.contains('reduce-motion')) return;
    const target = (e.target as Element | null)?.closest?.('.glass, .card') as HTMLElement | null;
    if (!target) return;
    const r = target.getBoundingClientRect();
    target.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
    target.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    },
    { passive: true },
  );
}
