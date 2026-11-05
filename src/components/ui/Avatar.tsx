import { initials, readableTextOn } from '../../lib/colors';

interface Props {
  name: string;
  color: string;
  size?: number;
  className?: string;
  ring?: boolean;
  /** ohne farbigen Schatten – z. B. eingebettet in eine Glasfläche */
  flat?: boolean;
  dimmed?: boolean;
}

/** Farbiger Avatar mit Initialen (Farbe ist nie das einzige Merkmal). */
export function Avatar({ name, color, size = 40, className = '', ring, dimmed, flat }: Props) {
  return (
    <span
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none tracking-tight ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        color: readableTextOn(color),
        background: `radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, ${color} 70%, white) 0%, ${color} 55%, color-mix(in srgb, ${color} 82%, black) 100%)`,
        boxShadow: ring
          ? `0 0 0 3px var(--ss-card), 0 0 0 5px ${color}, 0 10px 24px -10px ${color}`
          : flat
            ? 'inset 0 1px 0 rgba(255,255,255,.45), inset 0 -1px 0 rgba(0,0,0,.06)'
            : `inset 0 1px 0 rgba(255,255,255,.45), 0 6px 16px -8px ${color}`,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {/* Initialen exakt auf der Versalhöhe zentriert (nicht auf der Zeilenhöhe) */}
      <span className="cap-center">{initials(name)}</span>
    </span>
  );
}
