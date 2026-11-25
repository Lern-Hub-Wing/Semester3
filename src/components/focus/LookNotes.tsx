import { AlertTriangle, Link2 } from 'lucide-react';
import type { FocusLook } from '../../lib/focusLook';
import { digitContrast } from '../../lib/clockLook';

/** Hinweis: Das Design gilt für alle Uhren (Fokus, Lernmodus, Hausaufgaben). */
export function SharedLookNote({ dark }: { dark?: boolean }) {
  return (
    <p className={`flex items-start gap-1.5 text-[12px] leading-snug ${dark ? 'text-white/70' : 'text-muted'}`} data-testid="shared-look-note">
      <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      Gilt für alle Uhren: Fokus, Lernmodus und Hausaufgaben-Zähler sehen gleich aus.
    </p>
  );
}

/** Warnt, wenn die Ziffern auf dem gewählten Hintergrund schlecht lesbar sind (< 3 : 1). */
export function ContrastWarning({ look, dark }: { look: Pick<FocusLook, 'background' | 'bgColor' | 'gradient' | 'dim' | 'color'>; dark?: boolean }) {
  const ratio = digitContrast(look);
  if (ratio >= 3) return null;
  return (
    <p role="status" data-testid="contrast-warning" className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium leading-snug ${dark ? 'bg-[#F5C6A5]/20 text-[#FFE3CF]' : 'bg-[color-mix(in_srgb,var(--ss-warn)_18%,transparent)] text-ink'}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      Schwer lesbar: Ziffern und Hintergrund sind sich zu ähnlich (Kontrast {ratio.toFixed(1)} : 1). Wähle eine hellere oder dunklere Farbe.
    </p>
  );
}
