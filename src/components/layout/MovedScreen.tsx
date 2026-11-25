import { useEffect, useState } from 'react';
import { ArrowRight, PartyPopper } from 'lucide-react';
import { Ambient } from './Ambient';
import { LogoMark } from '../Logo';
import { Button } from '../ui/Button';

const STAY_KEY = 'studyspace.move.stay';

/** Adresse der App neben der Seite (…/Semester3/app/) */
export function appAddress(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base.endsWith('/') ? base : `${base}/`}app/`;
}

/** Umleitungsziel aus der Einstellung „moved_to_app“ (nur eigene Adresse, sonst null) */
export function movedTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const url = (value as { url?: unknown }).url;
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    // Nur auf die eigene App umleiten – nie auf fremde Seiten
    return u.origin === window.location.origin && u.pathname.endsWith('/app/') ? u.href : appAddress();
  } catch {
    return null;
  }
}

export function stayOnSite(): boolean {
  try {
    return sessionStorage.getItem(STAY_KEY) === '1';
  } catch {
    return false;
  }
}

/** „Wir sind umgezogen“ – leitet nach kurzer Zeit zur App weiter */
export function MovedScreen({ target, onStay }: { target: string; onStay: () => void }) {
  const [left, setLeft] = useState(6);
  useEffect(() => {
    if (left <= 0) {
      window.location.assign(target);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, target]);
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10" data-testid="moved-screen">
      <Ambient />
      <div className="glass glass-strong relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-[30px] p-7 text-center">
        <LogoMark size={52} />
        <PartyPopper className="size-7 text-accent" aria-hidden />
        <h1 className="display text-[26px] leading-tight">Wir sind umgezogen!</h1>
        <p className="text-[15px] leading-snug text-muted">
          StudySpace gibt es jetzt als App mit eigenem Konto – mit allen Fächern, Prüfungen, Hausaufgaben und deinen Haken. Den Einladungscode für die Lerngruppe bekommst du aus der Gruppe.
        </p>
        <Button variant="primary" size="lg" className="w-full" icon={<ArrowRight className="size-5" />} onClick={() => window.location.assign(target)} data-testid="moved-go">
          Zur App {left > 0 ? `(${left})` : ''}
        </Button>
        <button
          type="button"
          className="text-[13px] font-medium text-muted underline underline-offset-2 hover:text-ink"
          onClick={() => {
            try {
              sessionStorage.setItem(STAY_KEY, '1');
            } catch {
              /* egal */
            }
            onStay();
          }}
          data-testid="moved-stay"
        >
          Alte Seite trotzdem öffnen
        </button>
      </div>
    </div>
  );
}
