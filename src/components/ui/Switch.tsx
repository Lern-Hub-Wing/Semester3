import { haptic } from '../../lib/haptics';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

/** Nativ wirkender Schalter mit federndem Knopf (Fluid Toggle). */
export function Switch({ checked, onChange, label, disabled, id }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="ss-switch"
      onClick={() => {
        haptic('toggle');
        onChange(!checked);
      }}
    >
      <span aria-hidden />
    </button>
  );
}
