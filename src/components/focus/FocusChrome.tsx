import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { haptic } from '../../lib/haptics';
import { alpha } from '../../lib/colors';
import { loadFocusImage } from '../../lib/focusLook';
import { useFocus } from '../../store/focus';
import { Landscape } from '../landscape/Landscape';

/**
 * Gemeinsame Bausteine der Vollbild-Uhren (Fokus und Hausaufgaben-Zähler):
 * Knöpfe der Steuerleiste und der Hintergrund aus dem gemeinsamen Uhr-Design.
 */
export function BarButton({ label, onClick, disabled, active, children, className = '' }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        haptic('tap');
        onClick();
      }}
      className={`focus-btn grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-35 sm:size-11 ${active ? 'text-white' : 'text-white/80'} ${className}`}
    >
      {children}
    </button>
  );
}

/** Hintergrund nach Wahl: Berge, Polarlicht, Verlauf, Farbe oder eigenes Bild */
export function FocusBackdrop() {
  const look = useFocus((s) => s.look);
  const reduce = useReducedMotion();
  const [image, setImage] = useState(loadFocusImage);
  useEffect(() => {
    const on = () => setImage(loadFocusImage());
    window.addEventListener('studyspace:focus-image', on);
    return () => window.removeEventListener('studyspace:focus-image', on);
  }, []);
  const move = look.motion && !reduce;
  const filter = look.blur ? `blur(${look.blur}px)` : undefined;
  const scale = look.blur ? 'scale(1.06)' : undefined;
  let content: ReactNode;
  if (look.background === 'image' && image) {
    content = <img src={image} alt="" className="absolute inset-0 size-full object-cover" style={{ filter, transform: scale }} />;
  } else if (look.background === 'gradient') {
    const [a, b, cc] = look.gradient;
    content = <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${a}, ${b}, ${cc})` }} />;
  } else if (look.background === 'solid') {
    content = <div className="absolute inset-0" style={{ background: look.bgColor }} />;
  } else if (look.background === 'aurora') {
    content = (
      <div className="absolute inset-0 overflow-hidden" style={{ background: look.bgColor, filter }}>
        {(
          [
            ['#AFC5F5', '-20%', '-30%', 'ss-drift-a', 38],
            ['#CBB8F5', '45%', '-25%', 'ss-drift-b', 46],
            ['#AADCCB', '10%', '40%', 'ss-drift-c', 52],
          ] as const
        ).map(([col, left, top, anim, dur], i) => (
          <span
            key={i}
            aria-hidden
            className="absolute size-[80vmax] rounded-full"
            style={{ left, top, background: `radial-gradient(circle, ${alpha(col, 0.3)}, transparent 62%)`, animation: move ? `${anim} ${dur}s ease-in-out infinite alternate` : undefined }}
          />
        ))}
      </div>
    );
  } else {
    content = (
      <div className={`hero-scene absolute inset-0 ${move ? '' : 'ls-still'}`} style={{ filter, transform: scale }}>
        <Landscape />
      </div>
    );
  }
  return (
    <div className="absolute inset-0" data-testid="focus-bg" data-bg={look.background === 'image' && !image ? 'mountains' : look.background}>
      {content}
      <div className="absolute inset-0" style={{ background: `rgba(6,7,20,${look.dim / 100})` }} />
    </div>
  );
}
