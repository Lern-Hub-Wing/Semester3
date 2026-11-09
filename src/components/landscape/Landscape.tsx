import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { peakGeometry, type ImgGeo } from './geometry';

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
export function PeakStage({
  pop,
  className = '',
  hidden = false,
  arriving = false,
  children,
  ...rest
}: { pop: number; className?: string; hidden?: boolean; arriving?: boolean; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, 'hidden'>) {
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

  // Bildlage: Gipfel knapp unter der Oberkante des erweiterten Rahmens, waagerecht mittig
  const geo: ImgGeo | null = box ? peakGeometry(box.w, box.h, pop) : null;

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
    <div className={`peak-stage relative ${arriving ? 'peak-stage--arrive' : ''}`} style={{ marginTop: pop, visibility: hidden ? 'hidden' : undefined }}>
      <section ref={ref} {...rest} data-pop={pop} className={`photo-stage ${className}`}>
        <div className="landscape" aria-hidden>
          {img('mountains', -pop)}
        </div>
        {children}
      </section>
      {/* Gipfel über dem Fensterrand (2 px Überlappung verdecken die Kante) */}
      <div className="peak-pop" aria-hidden style={{ top: -pop, height: pop + 2, ['--rise' as string]: `${pop + 2}px` }}>
        {img('mountains-peak', 0)}
      </div>
    </div>
  );
}
