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
