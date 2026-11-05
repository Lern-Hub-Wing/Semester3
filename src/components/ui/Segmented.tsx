import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';

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
  className?: string;
}

/** iOS-artiger Segmented Control mit gleitender Markierung. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className = '' }: Props<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-2xl bg-[var(--ss-track)] p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium transition-colors ${
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm'
            } ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_-6px_rgba(0,0,0,0.18)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
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
