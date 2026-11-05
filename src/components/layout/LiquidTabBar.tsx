import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link, navigate, useLocation } from '../../lib/router';
import { useUI } from '../../store/ui';
import { MOBILE_NAV, isActive } from './nav';

const PAD = 6; // Innenabstand der Leiste (px)
const DRAG_THRESHOLD = 8; // ab dieser Strecke gilt eine Bewegung als Wischen

/**
 * Schwebende Tab-Leiste im Liquid-Glass-Stil (Smartphone).
 *
 * Bedienung wie bei Apple: Antippen wechselt den Tab. Alternativ den Finger
 * auf die Leiste legen und seitlich ziehen – die gläserne Linse folgt dem
 * Finger, beim Loslassen öffnet sich der Tab darunter.
 */
export function LiquidTabBar() {
  const { path } = useLocation();
  const setUI = useUI((s) => s.set);
  const moreOpen = useUI((s) => s.moreOpen);
  const reduce = useReducedMotion();
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ x: number; index: number } | null>(null);
  const gesture = useRef<{ startX: number; pointerId: number; dragging: boolean } | null>(null);
  const suppressNextClick = useRef(false);

  const count = MOBILE_NAV.length;
  const routeIndex = MOBILE_NAV.findIndex((item) => item.to !== '#mehr' && isActive(path, item.to));
  // Seiten aus „Mehr“ (Prüfungen, Materialien, …) heben den Mehr-Tab hervor
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
  const indexAt = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    const x = clientX - rect.left - PAD;
    return Math.max(0, Math.min(count - 1, Math.floor(x / tabWidth)));
  };
  const lensXFor = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    const x = clientX - rect.left - PAD - tabWidth / 2;
    return Math.max(0, Math.min(tabWidth * (count - 1), x));
  };

  const openTab = (index: number) => {
    const item = MOBILE_NAV[index];
    if (item.to === '#mehr') setUI({ moreOpen: true });
    else {
      setUI({ moreOpen: false });
      navigate(item.to);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { startX: e.clientX, pointerId: e.pointerId, dragging: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || !tabWidth) return;
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return;
      g.dragging = true;
      // Erst beim Wischen festhalten – so funktionieren normale Taps unverändert
      barRef.current?.setPointerCapture(e.pointerId);
    }
    const index = indexAt(e.clientX);
    setDrag((prev) => {
      if (prev && prev.index !== index) navigator.vibrate?.(6);
      return { x: lensXFor(e.clientX), index };
    });
  };

  const endGesture = (e: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (!g.dragging) return;
    const index = drag?.index ?? indexAt(e.clientX);
    setDrag(null);
    if (!cancelled) openTab(index);
    // Den Klick, den der Browser nach dem Loslassen noch auslöst, verwerfen
    suppressNextClick.current = true;
    setTimeout(() => (suppressNextClick.current = false), 400);
  };

  const lensIndex = drag?.index ?? activeIndex;
  const restX = tabWidth * activeIndex;

  return (
    <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] md:hidden">
      <div
        ref={barRef}
        className="liquid-bar no-native-drag relative mx-auto flex max-w-md touch-none select-none items-stretch rounded-[28px] p-1.5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e)}
        onPointerCancel={(e) => endGesture(e, true)}
        onClickCapture={(e) => {
          if (suppressNextClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {/* Gläserne Linse für den aktiven bzw. gerade berührten Tab */}
        {tabWidth > 0 && (
          <motion.span
            aria-hidden
            className={`liquid-lens pointer-events-none absolute inset-y-1.5 left-1.5 rounded-[22px] ${drag ? 'is-dragging' : ''}`}
            style={{ width: tabWidth }}
            initial={false}
            animate={{ x: drag ? drag.x : restX, scale: drag && !reduce ? 1.12 : 1 }}
            transition={
              reduce
                ? { duration: 0 }
                : drag
                  ? { x: { type: 'spring', stiffness: 1100, damping: 60, mass: 0.6 }, scale: { type: 'spring', stiffness: 500, damping: 28 } }
                  : { type: 'spring', stiffness: 420, damping: 34 }
            }
          />
        )}
        {MOBILE_NAV.map((item, i) => {
          const more = item.to === '#mehr';
          const highlighted = i === lensIndex;
          const current = i === activeIndex && !drag;
          const content = (
            <motion.span
              className="relative flex flex-col items-center gap-0.5"
              animate={{ scale: drag && highlighted && !reduce ? 1.08 : 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <item.icon className="size-[22px]" strokeWidth={highlighted ? 2 : 1.7} aria-hidden />
              <span className="text-[10.5px] font-medium">{item.label}</span>
            </motion.span>
          );
          const cls = `relative z-[1] flex min-h-[54px] flex-1 flex-col items-center justify-center rounded-[22px] transition-colors duration-200 ${
            highlighted ? 'text-ink' : 'text-muted'
          }`;
          return more ? (
            <button key={item.to} type="button" className={cls} onClick={() => setUI({ moreOpen: true })} aria-haspopup="dialog" aria-expanded={moreOpen}>
              {content}
            </button>
          ) : (
            <Link key={item.to} to={item.to} className={cls} aria-current={current ? 'page' : undefined} draggable={false}>
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
