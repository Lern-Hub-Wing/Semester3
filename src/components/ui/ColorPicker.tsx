import { useEffect, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Check } from 'lucide-react';
import { PASTEL_PALETTE, isHexColor, normalizeHex, readableTextOn } from '../../lib/colors';

interface Props {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

/** Pastellpalette + freier Farbwähler + Hex-Eingabe. */
export function ColorPicker({ value, onChange, label = 'Farbe' }: Props) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">Harmonierende Pastellfarben</p>
        <div className="grid grid-cols-9 gap-2" role="radiogroup" aria-label={label}>
          {PASTEL_PALETTE.map((c) => {
            const active = c.toUpperCase() === value.toUpperCase();
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`Farbe ${c}`}
                onClick={() => onChange(c)}
                className="grid aspect-square place-items-center rounded-full transition-transform duration-200 hover:scale-110 active:scale-95"
                style={{ background: c, boxShadow: active ? `0 0 0 2px var(--ss-card), 0 0 0 4px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}
              >
                {active && <Check className="size-4" style={{ color: readableTextOn(c) }} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ss-colorful">
        <HexColorPicker color={isHexColor(value) ? value : '#AFC5F5'} onChange={(c) => onChange(normalizeHex(c))} />
      </div>
      <div className="flex items-center gap-3">
        <span className="size-11 shrink-0 rounded-2xl border border-line" style={{ background: isHexColor(hex) ? hex : 'transparent' }} aria-hidden />
        <label className="flex-1">
          <span className="sr-only">Hex-Farbwert</span>
          <input
            className="field num uppercase"
            value={hex}
            maxLength={7}
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
              setHex(v.toUpperCase());
              if (isHexColor(v)) onChange(normalizeHex(v));
            }}
            aria-invalid={!isHexColor(hex)}
          />
        </label>
      </div>
      <style>{`
        .ss-colorful .react-colorful { width: 100%; height: 170px; }
        .ss-colorful .react-colorful__saturation { border-radius: 16px 16px 0 0; border-bottom: none; }
        .ss-colorful .react-colorful__hue { height: 22px; border-radius: 0 0 16px 16px; }
        .ss-colorful .react-colorful__pointer { width: 24px; height: 24px; border-width: 3px; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
      `}</style>
    </div>
  );
}
