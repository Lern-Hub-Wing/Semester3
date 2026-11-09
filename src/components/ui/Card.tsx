import type { HTMLAttributes, ReactNode } from 'react';

type Material = 'card' | 'hero' | 'float';

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** @deprecated Karten sind immer Glas; bleibt aus Kompatibilität erhalten */
  glass?: boolean;
  lift?: boolean;
  material?: Material;
}

/**
 * Karte aus „Card Glass“: ruhig, gut lesbar, mit Lichtkante.
 * `material="hero"` für besonders wichtige Flächen (Prisma-Kante, Lichtimpuls).
 */
export function Card({ glass: _glass, lift, material = 'card', className = '', children, ...rest }: Props) {
  void _glass;
  const mat = material === 'hero' ? 'glass mat-hero' : material === 'float' ? 'glass mat-float' : 'card';
  return (
    <div className={`${mat} ${lift ? 'lift' : ''} rounded-[var(--radius-card)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, subtitle, tint }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode; tint?: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon && <IconTile tint={tint}>{icon}</IconTile>}
      <div className="min-w-0 flex-1">
        <h3 className="title text-[15.5px] leading-snug [overflow-wrap:anywhere]">{title}</h3>
        {subtitle && <p className="text-[13px] leading-snug text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Kleine gläserne Kachel für Symbole – optional in einer Akzentfarbe getönt. */
export function IconTile({ children, tint, size = 36 }: { children: ReactNode; tint?: string; size?: number }) {
  const c = tint ?? 'var(--ss-accent)';
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-[12px] [&>svg]:size-[18px]"
      style={{
        width: size,
        height: size,
        color: `color-mix(in srgb, ${c} 70%, var(--ss-text))`,
        background: `linear-gradient(145deg, color-mix(in srgb, ${c} 26%, transparent), color-mix(in srgb, ${c} 10%, transparent))`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, white 45%, transparent), inset 0 0 0 1px color-mix(in srgb, ${c} 22%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** Kleine farbige Markierung für Module (mit Text, damit Farbe nicht alleiniges Merkmal ist). */
export function ModuleChip({ name, color, small }: { name: string; color: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-medium ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
      style={{
        background: `color-mix(in srgb, ${color} 24%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
        color: 'var(--ss-text)',
      }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
