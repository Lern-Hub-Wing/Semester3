import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  lift?: boolean;
}

export function Card({ glass, lift, className = '', children, ...rest }: Props) {
  return (
    <div className={`${glass ? 'glass' : 'card'} ${lift ? 'lift' : ''} rounded-[var(--radius-card)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, subtitle }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted [&>svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Kleine farbige Markierung für Module (mit Text, damit Farbe nicht alleiniges Merkmal ist). */
export function ModuleChip({ name, color, small }: { name: string; color: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-medium ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: `color-mix(in srgb, ${color} 26%, transparent)`, color: 'var(--ss-text)' }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
