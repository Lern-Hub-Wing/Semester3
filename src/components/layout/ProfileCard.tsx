import { useEffect, useMemo } from 'react';
import { ArrowLeftRight, UserRound } from 'lucide-react';
import { IS_APP } from '../../lib/edition';
import { navigate } from '../../lib/router';
import { useAccount } from '../../app/account';
import { formatFocusDuration, teamFocusWeek } from '../../lib/focusWeek';
import { useCurrentMember, useProgress } from '../../store/derived';
import { loadFocusSessions, useFocus } from '../../store/focus';
import { useSession } from '../../store/session';
import { useToday } from '../../hooks/useToday';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';

/**
 * Kopfkarte für „Mehr“ und Einstellungen: wer gerade lernt, mit eigenem
 * Fortschritt (Lernplan + Hausaufgaben) und Lernzeit dieser Woche.
 * Alle Werte stammen aus echten Daten – ohne Fokus-Tabelle entfällt die Lernzeit.
 */
export function ProfileCard({ onSwitch }: { onSwitch?: () => void }) {
  const me = useCurrentMember();
  const select = useSession((s) => s.select);
  const progress = useProgress();
  const sessions = useFocus((s) => s.sessions);
  const focusAvailable = useFocus((s) => s.available);
  const today = useToday();
  const groupName = useAccount((s) => s.me?.groups.find((g) => g.id === s.me?.active_group_id)?.name);
  useEffect(() => {
    void loadFocusSessions();
  }, []);
  const week = useMemo(() => (me ? teamFocusWeek(sessions, [me.id], today).total : 0), [sessions, me, today]);
  if (!me) return null;
  const r = progress.member(me.id);

  return (
    <div className="profile-card p-4" style={{ '--who': me.color } as React.CSSProperties} data-testid="profile-card">
      <div className="flex items-center gap-3">
        <Avatar name={me.name} color={me.color} size={48} ring />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight">{me.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">{IS_APP ? (groupName ?? 'Lerngruppe') : 'lernt gerade'}</p>
        </div>
        {IS_APP ? (
          // App: Konto statt Profilwechsel (das Lernprofil gehört zum Konto)
          <Button
            size="sm"
            icon={<UserRound className="size-4" />}
            onClick={() => {
              onSwitch?.();
              navigate('/einstellungen/konto');
            }}
            data-testid="profile-account"
          >
            Konto
          </Button>
        ) : (
          <Button
            size="sm"
            icon={<ArrowLeftRight className="size-4" />}
            onClick={() => {
              onSwitch?.();
              select(null);
            }}
          >
            Wechseln
          </Button>
        )}
      </div>
      <div className={`mt-3 grid gap-2 ${focusAvailable === false ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div className="profile-stat">
          <p className="text-[11.5px] font-medium text-muted">Fortschritt</p>
          <p className="num text-[17px] font-semibold leading-tight">{r.pct === null ? '–' : `${r.pct} %`}</p>
        </div>
        {focusAvailable !== false && (
          <div className="profile-stat">
            <p className="text-[11.5px] font-medium text-muted">Lernzeit diese Woche</p>
            <p className="num text-[17px] font-semibold leading-tight">{formatFocusDuration(week)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
