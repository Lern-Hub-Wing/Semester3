import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { Link } from '../../lib/router';

/**
 * Gruppierte Liste im Stil moderner Mobil-Apps: Überschrift, abgerundete
 * Gruppe, Zeilen mit Symbol, Titel, optionaler Zusatzinfo und Pfeil.
 * Wird für das „Mehr“-Menü und die Einstellungen verwendet.
 */
export function ListGroup({ title, footer, children, className = '' }: { title?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className} aria-label={title}>
      {title && <h3 className="list-group-title">{title}</h3>}
      <div className="list-group">{children}</div>
      {footer && <p className="list-group-footer">{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  /** Farbe des Symbolhintergrunds (Standard: Akzent) */
  tint?: string;
  label: ReactNode;
  /** zweite Zeile unter dem Titel */
  sub?: ReactNode;
  /** rechtsbündige Angabe (z. B. „6 Fächer“) */
  value?: ReactNode;
  /** eigenes Element rechts (z. B. Schalter) – ersetzt Wert und Pfeil */
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  /** hervorgehoben (z. B. gewählte Kategorie in der Seitenliste) */
  active?: boolean;
  testId?: string;
}

/** Eine Zeile: als Link (`to`), als Knopf (`onClick`) oder als reine Anzeige mit eigenem Bedienelement. */
export function ListRow({ icon, tint, label, sub, value, trailing, to, onClick, danger, active, testId }: RowProps) {
  const body = (
    <>
      {icon && (
        <span className="list-row-icon" style={tint ? ({ '--row-tint': tint } as React.CSSProperties) : undefined} aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-medium leading-snug [overflow-wrap:anywhere] ${danger ? 'text-danger' : ''}`} lang="de" style={{ hyphens: 'auto' }}>
          {label}
        </span>
        {sub && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{sub}</span>}
      </span>
      {trailing ?? (
        <>
          {value !== undefined && <span className="num max-w-[45%] shrink-0 truncate text-right text-[13.5px] text-muted">{value}</span>}
          {(to || onClick) && <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />}
        </>
      )}
    </>
  );
  if (to)
    return (
      <Link to={to} className={`list-row list-row--action ${active ? 'list-row--active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={testId} onClick={() => haptic('tap')}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button
        type="button"
        className="list-row list-row--action"
        data-testid={testId}
        onClick={() => {
          haptic('tap');
          onClick();
        }}
      >
        {body}
      </button>
    );
  return (
    <div className="list-row" data-testid={testId}>
      {body}
    </div>
  );
}
