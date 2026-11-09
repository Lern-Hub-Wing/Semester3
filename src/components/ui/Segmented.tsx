import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SegmentedControl } from 'glisse';
import { haptic } from '../../lib/haptics';

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

/**
 * Segmented Control auf Basis von Glisse: der Daumen gleitet federnd,
 * lässt sich ziehen und hebt sich beim Halten als Linse an.
 * Die Breite wird gemessen, damit alle Segmente den Platz gleichmäßig füllen.
 */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', dense, accent, className = '' }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<number | null>(null);
  const full = /\bw-full\b/.test(className);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (full) {
        setTab(Math.max(40, el.clientWidth / options.length));
        return;
      }
      // Natürliche Breite: breitestes Label + Innenabstand
      const labels = [...el.querySelectorAll<HTMLElement>('.lg-tab-labels:not(.lg-tab-lensed) .lg-tab .ss-seg-label')];
      const widest = labels.reduce((m, l) => Math.max(m, l.scrollWidth), 0);
      const pad = size === 'sm' ? (dense ? 18 : 24) : 30;
      const max = el.parentElement ? el.parentElement.clientWidth / options.length : Infinity;
      setTab(Math.min(max, Math.max(size === 'sm' ? 48 : 60, widest + pad)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    ro.observe(el);
    return () => ro.disconnect();
  }, [options.length, full, size, dense]);

  const items = options.map((o) => ({
    value: o.value,
    label: (
      <span className="ss-seg-label inline-flex items-center gap-1.5 whitespace-nowrap">
        {o.icon}
        {o.label}
      </span>
    ),
  }));

  return (
    <div ref={ref} className={`ss-seg ${accent ? 'ss-seg-accent' : ''} ${size === 'sm' ? 'ss-seg-sm' : ''} ${full ? 'flex' : 'inline-flex'} ${className}`} style={tab ? ({ '--ss-seg-w': `${tab}px` } as React.CSSProperties) : undefined}>
      <SegmentedControl
        aria-label={label}
        items={items}
        value={value}
        onValueChange={(v) => {
          if (v !== value) haptic('select');
          onChange(v as T);
        }}
      />
    </div>
  );
}
