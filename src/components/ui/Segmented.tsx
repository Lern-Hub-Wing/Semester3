import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../../lib/haptics';
import { spring } from '../../lib/motion';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  size?: 'sm' | 'md';
  /** schmalere Innenabstände (kleine Bildschirme) */
  dense?: boolean;
  /** aktive Option in Akzentfarbe (wie Tabs „Woche / Monat / Semester“) */
  accent?: boolean;
  className?: string;
}

/** iOS-artiger Segmented Control mit gleitender Markierung. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', dense, accent, className = '' }: Props<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-full bg-[var(--ss-track)] p-1 shadow-[inset_0_1px_2px_rgba(16,22,46,0.06)] ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (o.value !== value) haptic('select');
              onChange(o.value);
            }}
            className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors ${
              size === 'sm' ? `h-8 ${dense ? 'px-2' : 'px-3'} text-[13px]` : 'h-9 px-3.5 text-sm'
            } ${active ? (accent ? 'text-white dark:text-[#14152e]' : 'text-ink') : 'text-muted hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className={`absolute inset-0 rounded-full ${accent ? 'btn-primary' : 'lens'}`}
                transition={spring.tab}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
