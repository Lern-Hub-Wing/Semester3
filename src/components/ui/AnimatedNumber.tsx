import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/** Zahl, die weich auf den neuen Wert läuft (reine Darstellung des echten Werts). */
export function AnimatedNumber({ value, suffix = '', className = '', style }: { value: number; suffix?: string; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span className={`num ${className}`} style={style}>
      {Math.round(display)}
      {suffix}
    </span>
  );
}
