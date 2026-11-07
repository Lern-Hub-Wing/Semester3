import { alpha } from '../../lib/colors';

/**
 * Aurora-Hintergrund: langsam wandernde Farbfelder, auf denen das Glas
 * sichtbar bricht. Die fünfte Fläche trägt die Farbe des aktiven
 * Lernprofils – sie entfaltet sich beim Personenwechsel weich.
 */
export function Ambient({ color }: { color?: string }) {
  return (
    <div className="ambient" aria-hidden style={color ? ({ '--aurora-me': alpha(color, 0.34) } as React.CSSProperties) : undefined}>
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
