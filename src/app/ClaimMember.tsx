import { useEffect, useState } from 'react';
import { UserRoundCheck } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { api, type ClaimableMember } from './api';
import { reloadIntoGroup, useAccount } from './account';

const dismissKey = (gid: string) => `studyspace.app.claim.dismissed.${gid}`;

/**
 * „Wer bist du?“ – nach dem Beitritt zu einer Lerngruppe, die von der
 * bisherigen Seite umgezogen ist: Wer seinen Namen wählt, bekommt seine
 * bisherigen Haken, Hausaufgaben-Haken und Lernzeiten.
 */
export function ClaimMemberDialog() {
  const me = useAccount((s) => s.me);
  const gid = me?.active_group_id ?? '';
  const [list, setList] = useState<ClaimableMember[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!gid && localStorage.getItem(dismissKey(gid)) === '1';
    } catch {
      return false;
    }
  });
  const wanted = !!me && (me.claimable ?? 0) > 0 && !dismissed;

  useEffect(() => {
    if (!wanted) return;
    void api
      .claimableMembers(getSupabase())
      .then(setList)
      .catch(() => setList([]));
  }, [wanted, gid]);

  const close = () => {
    try {
      localStorage.setItem(dismissKey(gid), '1');
    } catch {
      /* egal */
    }
    setDismissed(true);
  };

  const claim = async (m: ClaimableMember) => {
    setBusy(m.id);
    setError(null);
    try {
      await api.claimMember(getSupabase(), m.id);
      close();
      // Neu laden: eigenes Profil, Haken und Lernzeiten kommen jetzt von der übernommenen Person
      reloadIntoGroup();
    } catch (err) {
      setError(describeError(err));
      setBusy(null);
    }
  };

  if (!wanted || !list || list.length === 0) return null;
  return (
    <Modal open onClose={close} title="Wer bist du?" description="Diese Lerngruppe ist von der bisherigen StudySpace-Seite umgezogen. Wähle deinen Namen – dann bekommst du deine bisherigen Haken und Lernzeiten.">
      <div className="flex flex-col gap-2" data-testid="claim-dialog">
        {list.map((m) => (
          <Button key={m.id} className="w-full justify-start" size="lg" loading={busy === m.id} disabled={!!busy} onClick={() => void claim(m)} data-testid="claim-member">
            <Avatar name={m.name} color={m.color} size={30} flat />
            <span className="ml-1">{m.name}</span>
          </Button>
        ))}
        {error && (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="mt-2 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink" onClick={close}>
          <UserRoundCheck className="size-4" aria-hidden /> Ich bin neu in der Gruppe
        </button>
      </div>
    </Modal>
  );
}
