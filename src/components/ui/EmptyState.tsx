import type { ReactNode } from 'react';

export function EmptyState({ icon, title, text, action, compact }: { icon: ReactNode; title: string; text?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'gap-2 py-6' : 'gap-3 py-12'}`}>
      <div className="relative grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
        <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,var(--ss-sheen),transparent_60%)]" aria-hidden />
        {icon}
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}
