import { useEffect, type ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { useSession } from '../store/session';
import { setCacheKey } from '../store/sync';
import { Link } from '../lib/router';
import { cacheKeyFor, initAccount, refreshMe, signOut, useAccount } from './account';
import { AuthFrame, AuthScreen, BlockedScreen, RecoveryScreen, Splash } from './AuthScreen';
import { Button } from '../components/ui/Button';
import { GroupScreen } from './GroupScreen';
import { TutorialSlot } from './Tutorial';

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
  if (!inGroup || showInvite) return <GroupScreen />;
  return (
    <>
      {children}
      {/* Haken für eine spätere Einführung nach der ersten Anmeldung */}
      <TutorialSlot me={me} />
    </>
  );
}

/** Hinweis, wenn der Plus-Zugang der Gruppe abgelaufen ist (Inhalte nur lesbar). */
export function PlusBanner() {
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  if (!group || group.has_plus) return null;
  return (
    <Link
      to="/einstellungen/plus"
      className="glass mb-4 flex items-center gap-3 rounded-[20px] px-4 py-3 text-[13.5px]"
      data-testid="plus-banner"
    >
      <Crown className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">Plus ist abgelaufen.</strong>{' '}
        <span className="text-muted">
          {group.is_owner ? 'Inhalte bleiben sichtbar, Änderungen sind erst mit Plus wieder möglich.' : 'Inhalte bleiben sichtbar. Die Person, die die Gruppe verwaltet, kann Plus erneuern.'}
        </span>
      </span>
    </Link>
  );
}
