import { motion, useReducedMotion } from 'motion/react';

interface Props {
  checked: boolean;
  color: string;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: number;
}

/**
 * Checkbox mit elastischer Animation, gezeichnetem Haken und
 * dezentem Farbimpuls in der Personenfarbe.
 */
export function TaskCheckbox({ checked, color, onChange, label, disabled, size = 26 }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      whileTap={reduce ? undefined : { scale: 0.82 }}
      className="relative grid shrink-0 place-items-center rounded-[9px] outline-offset-4 disabled:opacity-50"
      style={{ width: size, height: size, minWidth: size }}
    >
      {/* Vergrößerte Touchfläche (44 px) ohne Layoutänderung */}
      <span aria-hidden className="absolute -inset-[9px]" />
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-[9px]"
        initial={false}
        animate={{
          backgroundColor: checked ? color : 'rgba(0,0,0,0)',
          borderColor: checked ? color : 'var(--ss-text-3)',
          scale: checked && !reduce ? [1, 1.18, 0.96, 1] : 1,
        }}
        transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ borderWidth: 1.75, borderStyle: 'solid', boxShadow: checked ? `0 4px 12px -4px ${color}` : 'none' }}
      />
      {checked && !reduce && (
        <motion.span
          key="pulse"
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[9px]"
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        />
      )}
      <svg viewBox="0 0 24 24" className="relative" width={size * 0.66} height={size * 0.66} aria-hidden>
        <motion.path
          d="M5 12.5l4.2 4.2L19 7"
          fill="none"
          stroke="#1D2533"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.32, delay: checked && !reduce ? 0.08 : 0, ease: 'easeOut' }}
        />
      </svg>
    </motion.button>
  );
}
