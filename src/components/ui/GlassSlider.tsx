import { Slider } from 'glisse';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Angezeigter Wert rechts neben der Beschriftung */
  display?: string;
  /** Beschriftung ausblenden (nur für Screenreader) */
  hideLabel?: boolean;
}

/** Elastischer Glisse-Regler mit Beschriftung und Wertanzeige. */
export function GlassSlider({ label, value, min, max, step = 1, onChange, display, hideLabel }: Props) {
  return (
    <label className="block">
      <span className={`flex items-center justify-between text-[13px] ${hideLabel ? 'sr-only' : ''}`}>
        <span className="font-medium">{label}</span>
        {display && <span className="num text-muted">{display}</span>}
      </span>
      <Slider aria-label={label} className="ss-gslider" value={value} min={min} max={max} step={step} onValueChange={onChange} />
    </label>
  );
}
