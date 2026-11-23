import { Check, Users } from 'lucide-react';
import type { UUID } from '../../lib/types';
import { useActiveMembers } from '../../store/derived';
import { Avatar } from '../ui/Avatar';

/**
 * „Wer schreibt diese Prüfung?“ (nur bisherige Seite)
 * Leer = alle sehen das Fach. Sonst sehen nur die gewählten Personen das Fach
 * mit Prüfung und Lernplan.
 */
export function ParticipantsPicker({ value, onChange }: { value: UUID[]; onChange: (next: UUID[]) => void }) {
  const members = useActiveMembers();
  const all = value.length === 0;
  const toggle = (id: UUID) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <fieldset className="flex flex-col gap-2" data-testid="participants-picker">
      <legend className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-muted">
        <Users className="size-4" aria-hidden /> Wer schreibt diese Prüfung?
      </legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={all}
          onClick={() => onChange([])}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${all ? 'bg-[var(--ss-text)] text-[var(--ss-card)]' : 'bg-[var(--ss-surface-2)] text-muted hover:text-[var(--ss-text)]'}`}
        >
          {all && <Check className="size-3.5" aria-hidden />} Alle
        </button>
        {members.map((m) => {
          const on = value.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m.id)}
              className={`flex min-h-10 items-center gap-1.5 rounded-full py-1 pl-1 pr-3.5 text-[13px] font-semibold transition ${on ? 'text-[var(--ss-text)]' : 'bg-[var(--ss-surface-2)] text-muted hover:text-[var(--ss-text)]'}`}
              style={on ? { background: `color-mix(in srgb, ${m.color} 38%, var(--ss-surface-2))`, boxShadow: `inset 0 0 0 1.5px ${m.color}` } : undefined}
            >
              <Avatar name={m.name} color={m.color} size={28} flat dimmed={!on} />
              {m.name}
              {on && <Check className="size-3.5" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-muted">
        {all
          ? 'Alle sehen das Fach, die Prüfung und den Lernplan.'
          : 'Nur die gewählten Personen sehen das Fach mit Prüfung und Lernplan – die anderen gar nicht. Hinweis: Die Seite hat keine Anmeldung, das ist eine Anzeige-Regel und kein Passwortschutz.'}
      </p>
    </fieldset>
  );
}

/** Teilnehmende vergleichen (Reihenfolge egal) */
export function sameParticipants(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
