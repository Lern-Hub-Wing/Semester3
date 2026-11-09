import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { PEAK } from './peak';

/**
 * Berg-Panorama im Alpenglühen (gerendert mit scripts/render-mountains.mjs).
 * Ein Bild für alle Bühnen (Dashboard, Profilwahl, Fokus, Vorschauen):
 * WebP mit JPEG-Rückfall, kleine Variante für Handys. Rein dekorativ.
 *
 * `position` legt fest, welcher Bildteil sichtbar bleibt, wenn der Rahmen
 * schmaler ist als das Bild (Standard: Gipfel mittig).
 */
const base = import.meta.env.BASE_URL;

export function Landscape({ className = '', position = '50% 40%' }: { className?: string; position?: string }) {
  return (
    <picture className={`landscape ${className}`} aria-hidden>
      <source type="image/webp" srcSet={`${base}scenery/mountains-1200.webp 1200w, ${base}scenery/mountains.webp 2000w`} sizes="(max-width: 900px) 100vw, 1400px" />
      <img
        src={`${base}scenery/mountains.jpg`}
        srcSet={`${base}scenery/mountains-1200.jpg 1200w, ${base}scenery/mountains.jpg 2000w`}
        sizes="(max-width: 900px) 100vw, 1400px"
        alt=""
        decoding="async"
        draggable={false}
        style={{ objectPosition: position }}
      />
    </picture>
  );
}

/**
 * Fenster mit Berg-Panorama, aus dem die Bergspitze leicht herausragt.
 *
 * Zwei deckungsgleiche Ebenen: das Panorama im (abgerundeten, beschnittenen)
 * Fenster und darüber die freigestellte Spitze (Himmel durchsichtig), die nur
 * oberhalb des Fensterrands sichtbar ist. Die Bildlage wird aus der Fenster-
 * größe berechnet, damit immer genau der Gipfel `pop` Pixel herausschaut –
 * auf Handy, Tablet und Desktop.
 */
export function PeakStage({ pop, className = '', children, ...rest }: { pop: number; className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bildlage: Gipfel `tip` px unter der Oberkante des erweiterten Rahmens, waagerecht mittig
  let geo: { left: number; top: number; width: number; height: number } | null = null;
  if (box) {
    const tip = 3;
    const total = box.h + pop;
    const scale = Math.max(box.w / PEAK.width, (total - tip) / ((1 - PEAK.y) * PEAK.height));
    const width = PEAK.width * scale;
    const height = PEAK.height * scale;
    const left = Math.min(0, Math.max(box.w - width, box.w / 2 - PEAK.x * width));
    const top = tip - PEAK.y * height; // relativ zur Oberkante des erweiterten Rahmens
    geo = { left, top, width, height };
  }

  const img = (file: 'mountains' | 'mountains-peak', y: number) =>
    geo && (
      <img
        src={`${base}scenery/${file}${file === 'mountains' ? '.jpg' : '.webp'}`}
        srcSet={`${base}scenery/${file}-1200.webp 1200w, ${base}scenery/${file}.webp 2000w`}
        sizes={`${Math.ceil(geo.width)}px`}
        alt=""
        decoding="async"
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ left: geo.left, top: y + geo.top, width: geo.width, height: geo.height }}
      />
    );

  return (
    <div className="peak-stage relative" style={{ marginTop: pop }}>
      <section ref={ref} {...rest} className={`photo-stage ${className}`}>
        <div className="landscape" aria-hidden>
          {img('mountains', -pop)}
        </div>
        {children}
      </section>
      {/* Gipfel über dem Fensterrand (2 px Überlappung verdecken die Kante) */}
      <div className="peak-pop" aria-hidden style={{ top: -pop, height: pop + 2 }}>
        {img('mountains-peak', 0)}
      </div>
    </div>
  );
}
