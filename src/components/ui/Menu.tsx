import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { PresenceDiv } from './PresenceDiv';
import { EllipsisVertical } from 'lucide-react';
import { IconButton } from './Button';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Kompaktes Aktionsmenü (⋮) mit Tastaturbedienung. */
export function Menu({ items, label = 'Weitere Aktionen', align = 'right' }: { items: MenuItem[]; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
        const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
        btns[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(), 30);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative" onClick={(e) => e.stopPropagation()}>
      <IconButton label={label} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <EllipsisVertical className="size-[18px]" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <PresenceDiv
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={{ duration: 0.16 }}
            className={`glass glass-strong absolute top-10 z-50 min-w-[210px] origin-top-right rounded-2xl p-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`}
          >
            {visible.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 ${
                  item.danger ? 'text-danger' : 'text-ink'
                }`}
              >
                <span className="text-muted [&>svg]:size-4">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </PresenceDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
