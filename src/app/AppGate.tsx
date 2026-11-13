import { useEffect, useState, type ReactNode } from 'react';
import { Eye, X } from 'lucide-react';
import { useSession } from '../store/session';
import { useFlight } from '../store/flight';
import { initPush } from '../store/push';
import { setCacheKey } from '../store/sync';
import { Link } from '../lib/router';
import { cacheKeyFor, initAccount, refreshMe, signOut, useAccount } from './account';
import { AuthFrame, AuthScreen, BlockedScreen, RecoveryScreen, Splash } from './AuthScreen';
import { Button } from '../components/ui/Button';
import { WelcomeScreen } from './WelcomeScreen';
import { TourHost } from './Tour';

/**
 * Tür zur App: erst anmelden, dann Lerngruppe – danach die gewohnte
 * StudySpace-Oberfläche. Das Lernprofil ergibt sich aus dem Konto (keine
 * Profilauswahl mehr). Welche Daten sichtbar sind, entscheidet allein die
 * Datenbank (RLS) – diese Komponente steuert nur die Anzeige.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const phase = useAccount((s) => s.phase);
  const me = useAccount((s) => s.me);
  const invite = useAccount((s) => s.pendingInvite);
  const error = useAccount((s) => s.error);
  const select = useSession((s) => s.select);

  useEffect(() => initAccount(), []);

  const memberId = me?.member_id ?? null;
  const inGroup = !!me && me.session_ok && me.status === 'active' && !!me.active_group_id && !!memberId;
  const alreadyMember = !!invite && !!me && me.groups.some((g) => g.invite_code === invite);
  const showInvite = !!invite && !alreadyMember;

  // Vor dem ersten Laden: Zwischenspeicher dieses Kontos und dieser Gruppe wählen
  if (inGroup) setCacheKey(cacheKeyFor(me));
  useEffect(() => {
    if (inGroup) select(memberId);
  }, [inGroup, memberId, select]);
  // Beim Betreten der Lerngruppe: gleiche Ankunft wie auf der bisherigen Seite (Text blendet ein, Gipfel steigt auf)
  useEffect(() => {
    if (inGroup) useFlight.setState({ arrivedAt: Date.now() });
  }, [inGroup]);
  // Mitteilungen: Abo dieses Geräts mit dem Server abgleichen (nur wenn hier schon eingeschaltet)
  useEffect(() => {
    if (inGroup) void initPush();
  }, [inGroup]);

  if (phase === 'loading') return <Splash />;
  if (phase === 'signedOut') return <AuthScreen />;
  if (phase === 'recovery') return <RecoveryScreen />;
  if (!me && error)
    return (
      <AuthFrame title="Keine Verbindung" subtitle={error}>
        <div className="flex flex-col gap-2.5" data-testid="account-error">
          <Button variant="primary" size="lg" onClick={() => void refreshMe()}>
            Erneut versuchen
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </div>
      </AuthFrame>
    );
  if (!me) return <Splash />;
  if (me.status === 'blocked') return <BlockedScreen />;
  if (!me.session_ok) return <BlockedScreen revoked />;
  if (!inGroup || showInvite) return <WelcomeScreen />;
  return (
    <>
      {children}
      {/* Geführte Einführung beim ersten Besuch (überspringbar) */}
      <TourHost />
    </>
  );
}

/**
 * Ruhiger Hinweis, wenn nur gelesen werden kann (Testphase vorbei oder
 * Gruppenpass abgelaufen). Lässt sich für einen Tag ausblenden – keine
 * ständigen Meldungen.
 */
export function PlusBanner() {
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const key = `studyspace.app.banner.${group?.id ?? ''}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === new Date().toDateString();
    } catch {
      return false;
    }
  });
  if (!group || group.has_plus || hidden) return null;
  const solo = group.kind === 'solo';
  const text = solo
    ? me?.trial_used && !me.plan
      ? 'Deine Testphase ist beendet. Alles bleibt sichtbar – mit Solo kannst du wieder bearbeiten.'
      : 'Dein Solo-Zugang ist abgelaufen. Alles bleibt sichtbar – zum Bearbeiten verlängern.'
    : group.is_owner
      ? 'Der Gruppenpass ist abgelaufen. Inhalte bleiben sichtbar, Änderungen sind nach einer Verlängerung wieder möglich.'
      : 'Der Gruppenpass ist abgelaufen. Inhalte bleiben sichtbar; die Person, die die Gruppe verwaltet, kann ihn verlängern.';
  return (
    <div className="glass mb-4 flex items-center gap-3 rounded-[20px] py-2.5 pl-4 pr-2 text-[13.5px]" data-testid="plus-banner">
      <Eye className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1 leading-snug">
        <strong className="font-semibold">Nur-Lesen-Modus.</strong> <span className="text-muted">{text}</span>
      </span>
      {(solo || group.is_owner) && (
        <Link to="/einstellungen/plus" className="shrink-0 rounded-full bg-[var(--ss-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white">
          {solo ? 'Solo wählen' : 'Verlängern'}
        </Link>
      )}
      <button
        type="button"
        aria-label="Für heute ausblenden"
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
        onClick={() => {
          try {
            localStorage.setItem(key, new Date().toDateString());
          } catch {
            /* ignorieren */
          }
          setHidden(true);
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
