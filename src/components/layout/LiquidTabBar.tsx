import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { spring } from '../../lib/motion';
import { Link, useLocation } from '../../lib/router';
import { haptic } from '../../lib/haptics';
import { useUI } from '../../store/ui';
import { MOBILE_NAV, isActive } from './nav';

const PAD = 6; // Innenabstand der Leiste (px), passend zu p-1.5

/**
 * Schwebende Tab-Leiste im Liquid-Glass-Stil (Smartphone).
 * Bedienung ausschließlich über Antippen (und Tastatur); die gläserne Linse
 * gleitet weich zum gewählten Tab. Seiten aus „Mehr“ heben den Mehr-Tab hervor.
 */
export function LiquidTabBar() {
  const { path } = useLocation();
  const setUI = useUI((s) => s.set);
  const moreOpen = useUI((s) => s.moreOpen);
  const reduce = useReducedMotion();
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const count = MOBILE_NAV.length;
  const routeIndex = MOBILE_NAV.findIndex((item) => item.to !== '#mehr' && isActive(path, item.to));
  const activeIndex = moreOpen || routeIndex === -1 ? count - 1 : routeIndex;

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tabWidth = width > 0 ? (width - PAD * 2) / count : 0;

  // Elastic Tab Morph: Die Linse dehnt sich beim Gleiten und federt zurück
  const [lensScope, animateLens] = useAnimate();
  const prevIndex = useRef(activeIndex);
  useEffect(() => {
    if (prevIndex.current === activeIndex || reduce || !lensScope.current) {
      prevIndex.current = activeIndex;
      return;
    }
    const dist = Math.abs(activeIndex - prevIndex.current);
    prevIndex.current = activeIndex;
    void animateLens(lensScope.current, { scaleX: [1, 1 + Math.min(0.12 + dist * 0.08, 0.4), 1], scaleY: [1, 0.86, 1] }, { duration: 0.5, ease: [0.22, 1, 0.36, 1] });
  }, [activeIndex, reduce, animateLens, lensScope]);

  return (
    <nav aria-label="Hauptnavigation" className="tabbar fixed inset-x-0 bottom-0 z-40 px-3 md:hidden">
      <div ref={barRef} className="glass mat-nav relative mx-auto flex max-w-md items-stretch rounded-[30px] p-1.5">
        {tabWidth > 0 && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-1.5 left-1.5"
            style={{ width: tabWidth }}
            initial={false}
            animate={{ x: tabWidth * activeIndex }}
            transition={reduce ? { duration: 0 } : spring.tab}
          >
            <span ref={lensScope} className="lens absolute inset-0 rounded-[22px]" />
          </motion.span>
        )}
        {MOBILE_NAV.map((item, i) => {
          const more = item.to === '#mehr';
          const active = i === activeIndex;
          const content = (
            <span className="tab-press relative flex flex-col items-center gap-0.5">
              <item.icon className={`size-[22px] transition-transform duration-300 ${active ? '-translate-y-px' : ''}`} strokeWidth={active ? 2.1 : 1.7} aria-hidden />
              <span className={`text-[10.5px] ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
            </span>
          );
          const cls = `relative z-[1] flex min-h-[54px] flex-1 flex-col items-center justify-center rounded-[22px] transition-colors duration-200 ${
            active ? 'text-ink' : 'text-muted'
          }`;
          return more ? (
            <button
              key={item.to}
              type="button"
              className={cls}
              onClick={() => {
                haptic('tap');
                setUI({ moreOpen: true });
              }}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              {content}
            </button>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              className={cls}
              aria-current={i === routeIndex ? 'page' : undefined}
              onClick={() => {
                haptic('tap');
                setUI({ moreOpen: false });
              }}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
