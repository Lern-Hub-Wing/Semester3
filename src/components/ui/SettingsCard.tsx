import type { ReactNode } from 'react';
import { IS_APP } from '../../lib/edition';
import { IconTile } from './Card';

/**
 * Inhalt einer Kategorie.
 * App: eigene Überschrift mit farbigem Symbol über einer Karte im Stil der
 * übrigen App (wie die Karten im Dashboard); Hinweis darunter.
 * Bisherige Seite: unverändert – nur Karte + Hinweis.
 */
export function Section({
  children,
  hint,
  className = '',
  title,
  icon,
  tint,
  testId,
}: {
  title?: string;
  icon?: ReactNode;
  /** Farbe des Symbols (TINT aus lib/tints) */
  tint?: string;
  children: ReactNode;
  hint?: string;
  className?: string;
  testId?: string;
}) {
  if (!IS_APP) {
    return (
      <div className={className}>
        <div className="settings-card">{children}</div>
        {hint && <p className="list-group-footer">{hint}</p>}
      </div>
    );
  }
  return (
    <section className={className} data-testid={testId}>
      {title && (
        <header className="mb-2.5 flex items-center gap-2.5 px-1">
          {icon && (
            <IconTile tint={tint ?? 'var(--ss-accent)'} size={30}>
              {icon}
            </IconTile>
          )}
          <h3 className="title text-[15.5px]">{title}</h3>
        </header>
      )}
      <div className="card settings-card settings-card--app rounded-[var(--radius-card)]">{children}</div>
      {hint && <p className="list-group-footer">{hint}</p>}
    </section>
  );
}

/**
 * Eine Einstellung. `inline`: Bedienelement (z. B. Schalter) steht auch auf
 * dem Handy rechts neben der Beschriftung, sonst darunter in voller Breite.
 */
export function Row({ label, hint, children, inline, stacked }: { label: string; hint?: string; children: ReactNode; inline?: boolean; /** Bedienelement unter der Beschriftung, volle Breite (z. B. viele Auswahl-Chips) */ stacked?: boolean }) {
  return (
    <div
      className={`settings-row flex gap-2 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 ${inline ? 'flex-row items-center justify-between gap-4' : stacked ? 'flex-col gap-3' : 'flex-col sm:flex-row sm:items-center sm:justify-between'}`}
    >
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
      </div>
      <div className={`settings-row-control ${stacked ? 'min-w-0' : inline ? 'shrink-0' : 'shrink-0 max-sm:w-full'}`}>{children}</div>
    </div>
  );
}
