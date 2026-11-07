import type { ReactNode } from 'react';

export function EmptyState({ icon, title, text, action, compact }: { icon: ReactNode; title: string; text?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'gap-2 py-6' : 'gap-3 py-12'}`}>
      <div className="glass relative grid size-16 place-items-center rounded-[22px] text-accent [&>svg]:size-7">
        {icon}
      </div>
      <div>
        <p className="title text-[17px]">{title}</p>
        {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}
