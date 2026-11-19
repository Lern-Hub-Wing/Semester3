import type { ReactNode } from 'react';

/** Inhalt einer Kategorie: Überschrift steht bereits auf der Seite, hier nur Hinweis + Karte. */
export function Section({ children, hint, className = '' }: { title?: string; icon?: ReactNode; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="settings-card">{children}</div>
      {hint && <p className="list-group-footer">{hint}</p>}
    </div>
  );
}

/**
 * Eine Einstellung. `inline`: Bedienelement (z. B. Schalter) steht auch auf
 * dem Handy rechts neben der Beschriftung, sonst darunter in voller Breite.
 */
export function Row({ label, hint, children, inline, stacked }: { label: string; hint?: string; children: ReactNode; inline?: boolean; /** Bedienelement unter der Beschriftung, volle Breite (z. B. viele Auswahl-Chips) */ stacked?: boolean }) {
  return (
    <div
      className={`flex gap-2 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 ${inline ? 'flex-row items-center justify-between gap-4' : stacked ? 'flex-col gap-3' : 'flex-col sm:flex-row sm:items-center sm:justify-between'}`}
    >
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
      </div>
      <div className={stacked ? 'min-w-0' : 'shrink-0'}>{children}</div>
    </div>
  );
}
