import { useNow } from '../../hooks/useNow';
import { greetingFor } from '../../lib/time';
import { useCurrentMember } from '../../store/derived';

/** „Guten Abend, Luk“ – Tageszeit live (minütlich), Name in der Farbe des Profils */
export function Greeting({ className = '' }: { className?: string }) {
  useNow(60_000);
  const me = useCurrentMember();
  return (
    <p className={className} data-testid="greeting">
      {greetingFor()}
      {me && (
        <>
          ,{' '}
          <span className="font-semibold" style={{ color: `color-mix(in srgb, ${me.color} 62%, var(--ss-text))` }}>
            {me.name}
          </span>
        </>
      )}
    </p>
  );
}
