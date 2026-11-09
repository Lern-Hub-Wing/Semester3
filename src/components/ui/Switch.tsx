import { Switch as GlisseSwitch } from 'glisse';
import { haptic } from '../../lib/haptics';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

/** Schalter auf Basis von Glisse: Daumen lässt sich ziehen und hebt sich beim Halten als Linse an. */
export function Switch({ checked, onChange, label, disabled, id }: Props) {
  return (
    <GlisseSwitch
      id={id}
      aria-label={label}
      disabled={disabled}
      checked={checked}
      className="ss-gswitch"
      onCheckedChange={(next) => {
        haptic('toggle');
        onChange(next);
      }}
    />
  );
}
