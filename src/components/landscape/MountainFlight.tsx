import { useEffect, useRef } from 'react';
import { endFlight, useFlight } from '../../store/flight';
import { coverGeometry, peakGeometry, type ImgGeo } from './geometry';

const base = import.meta.env.BASE_URL;
const DURATION = 820;
/** sanftes Abbremsen (wie iOS) */
const ease = (t: number) => 1 - Math.pow(1 - t, 3.2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Der Berg aus der Profilwahl bleibt auf dem Bildschirm, wird kleiner und
 * gleitet pixelgenau in das Countdown-Fenster des Dashboards. Das Ziel wird
 * in jedem Bild neu gemessen – bewegt sich das Fenster noch (Einblende-
 * Animation), folgt der Berg einfach mit.
 */
export function MountainFlight() {
  const start = useFlight((s) => s.start);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const shade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!start) return;
    const from = { x: start.x, y: start.y, w: start.w, h: start.h, r: 0 };
    const fromImg = coverGeometry(start.w, start.h);
    let raf = 0;
    let t0 = 0;
    let waited = 0;
    let done = false;

    const apply = (r: { x: number; y: number; w: number; h: number; r: number }, g: ImgGeo, fade: number, shadeA: number) => {
      const b = box.current;
      const i = img.current;
      if (!b || !i) return;
      b.style.transform = `translate(${r.x}px, ${r.y}px)`;
      b.style.width = `${r.w}px`;
      b.style.height = `${r.h}px`;
      b.style.borderRadius = `${r.r}px`;
      // unten weich ausblenden wie in der Profilwahl, am Ziel ganz deckend
      b.style.setProperty('--fade', `${fade}%`);
      i.style.transform = `translate(${g.left}px, ${g.top}px)`;
      i.style.width = `${g.width}px`;
      i.style.height = `${g.height}px`;
      if (shade.current) shade.current.style.opacity = String(shadeA);
    };
    apply(from, fromImg, 40, 0);

    const finish = (arrived: boolean) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      endFlight(arrived);
    };

    const frame = (now: number) => {
      const hero = document.querySelector<HTMLElement>('[data-testid="dashboard-hero"]');
      // Seite schon gewechselt (z. B. gleich auf einen Tab getippt) → Flug sofort beenden
      const onDashboard = ['', '#', '#/'].includes(window.location.hash);
      if (!onDashboard || (t0 && !hero)) return finish(false);
      if (!hero) {
        // Ziel noch nicht da (Seite lädt) – höchstens 2,5 s warten, sonst ausblenden
        if (!waited) waited = now;
        if (now - waited > 2500) return finish(false);
        raf = requestAnimationFrame(frame);
        return;
      }
      if (!t0) t0 = now;
      const t = Math.min(1, (now - t0) / DURATION);
      const e = ease(t);
      const rect = hero.getBoundingClientRect();
      const pop = Number(hero.dataset.pop ?? 0);
      const radius = parseFloat(getComputedStyle(hero).borderTopLeftRadius) || 22;
      const toImg = peakGeometry(rect.width, rect.height, pop);
      apply(
        { x: lerp(from.x, rect.left, e), y: lerp(from.y, rect.top, e), w: lerp(from.w, rect.width, e), h: lerp(from.h, rect.height, e), r: lerp(0, radius, e) },
        {
          left: lerp(fromImg.left, toImg.left, e),
          top: lerp(fromImg.top, toImg.top - pop, e),
          width: lerp(fromImg.width, toImg.width, e),
          height: lerp(fromImg.height, toImg.height, e),
        },
        lerp(40, 100, Math.min(1, e * 1.4)),
        e,
      );
      if (t >= 1) return finish(true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [start]);

  if (!start) return null;
  return (
    <div ref={box} aria-hidden className="mountain-flight pointer-events-none fixed left-0 top-0 z-[25] overflow-hidden" data-testid="mountain-flight">
      <img
        ref={img}
        src={`${base}scenery/mountains.jpg`}
        srcSet={`${base}scenery/mountains-1200.webp 1200w, ${base}scenery/mountains.webp 2000w`}
        sizes="(max-width: 900px) 100vw, 1400px"
        alt=""
        draggable={false}
        className="absolute left-0 top-0 max-w-none origin-top-left select-none"
      />
      {/* Abdunklung des Countdown-Fensters wächst mit, damit der Wechsel unsichtbar bleibt */}
      <div ref={shade} className="photo-shade absolute inset-0" style={{ opacity: 0 }} />
    </div>
  );
}
