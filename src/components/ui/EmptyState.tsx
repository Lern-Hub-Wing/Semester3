import type { ReactNode } from 'react';

/**
 * Leerer Zustand – ruhig und hochwertig statt großer Symbol-Kachel.
 * `compact`: eine schlanke Zeile (für Karten), sonst zentriert mit kleinem Symbol.
 */
export function EmptyState({ icon, title, text, action, compact }: { icon: ReactNode; title: string; text?: string; action?: ReactNode; compact?: boolean }) {
  if (compact)
    return (
      <div className="empty-quiet flex flex-col gap-2.5">
        <div className="flex items-center gap-3 rounded-[18px] bg-[color-mix(in_srgb,var(--ss-text)_3.5%,transparent)] px-3.5 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ss-accent-soft)] text-accent [&>svg]:!size-[18px]" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-snug">{title}</p>
            {text && <p className="text-[12.5px] leading-snug text-muted">{text}</p>}
          </div>
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
    );
  return (
    <div className="empty-quiet flex flex-col items-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-[var(--ss-accent-soft)] text-accent [&>svg]:!size-[22px]" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="title text-[16px]">{title}</p>
        {text && <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-snug text-muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}
