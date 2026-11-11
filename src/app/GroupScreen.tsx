import { useEffect, useState, type FormEvent } from 'react';
import { Crown, LogOut, Sparkles, UserPlus, Users } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { AuthFrame } from './AuthScreen';
import { api, formatCode, isValidCode, normalizeCode, PLANS } from './api';
import { clearPendingInvite, reloadIntoGroup, signOut, useAccount } from './account';

/**
 * Ohne aktive Lerngruppe (oder mit offenem Einladungslink): beitreten per
 * Code – kostenlos – oder mit Plus eine eigene Gruppe erstellen.
 */
export function GroupScreen() {
  const me = useAccount((s) => s.me);
  const invite = useAccount((s) => s.pendingInvite);
  const hasPlus = !!me?.has_plus;
  const [tab, setTab] = useState<'join' | 'create'>(invite || !hasPlus ? 'join' : 'create');
  const [code, setCode] = useState(invite ? formatCode(invite) : '');
  const [groupName, setGroupName] = useState('');
  const [name, setName] = useState(me?.display_name ?? '');
  const [preview, setPreview] = useState<{ name: string; members: number; has_plus: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasGroups = (me?.groups.length ?? 0) > 0;

  const clean = normalizeCode(code);
  useEffect(() => {
    setPreview(null);
    if (!isValidCode(clean)) return;
    let alive = true;
    void api
      .inviteInfo(getSupabase(), clean)
      .then((p) => alive && setPreview(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [clean]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      clearPendingInvite();
      reloadIntoGroup();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCode(clean)) return setError('Der Code hat 8 Zeichen, z. B. ABCD-2345.');
    void run(() => api.joinGroup(getSupabase(), clean, name.trim() || undefined));
  };
  const createGroup = (e: FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return setError('Bitte gib der Gruppe einen Namen.');
    void run(() => api.createGroup(getSupabase(), groupName.trim(), name.trim() || undefined));
  };

  return (
    <AuthFrame
      title={invite ? 'Einladung annehmen' : hasGroups ? 'Lerngruppe wählen' : 'Deine Lerngruppe'}
      subtitle={invite ? 'Du wurdest in eine Lerngruppe eingeladen. Der Beitritt ist kostenlos.' : 'Tritt mit einem Einladungscode bei oder erstelle mit Plus deine eigene Gruppe.'}
    >
      <div className="flex flex-col gap-4" data-testid="group-screen">
        {!invite && (
          <Segmented
            label="Beitreten oder erstellen"
            value={tab}
            onChange={(t) => (setTab(t), setError(null))}
            options={[
              { value: 'join', label: 'Beitreten', icon: <UserPlus className="size-4" /> },
              { value: 'create', label: 'Erstellen', icon: <Users className="size-4" /> },
            ]}
            className="w-full"
          />
        )}

        {tab === 'join' ? (
          <form className="flex flex-col gap-3.5" onSubmit={join} noValidate>
            <TextField
              label="Einladungscode"
              value={code}
              onChange={(e) => setCode(formatCode(e.target.value))}
              placeholder="ABCD-2345"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="[&_input]:font-mono [&_input]:tracking-[0.18em]"
              hint="Den Code bekommst du von der Person, die die Gruppe erstellt hat."
              data-testid="join-code"
            />
            {preview && (
              <div className="flex items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--ss-accent)_10%,transparent)] px-3.5 py-3" data-testid="invite-preview">
                <Users className="size-5 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 text-[14px]">
                  <p className="truncate font-semibold">{preview.name}</p>
                  <p className="text-[12.5px] text-muted">
                    {preview.members} von 8 Plätzen belegt{!preview.has_plus && ' · derzeit ohne Plus'}
                  </p>
                </div>
              </div>
            )}
            <TextField label="Dein Name in der Gruppe" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" />
            {error && (
              <p role="alert" className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] px-3.5 py-2.5 text-[13.5px] text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!isValidCode(clean)} data-testid="join-submit">
              Kostenlos beitreten
            </Button>
          </form>
        ) : hasPlus ? (
          <form className="flex flex-col gap-3.5" onSubmit={createGroup} noValidate>
            <TextField label="Name der Gruppe" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60} placeholder="z. B. Maschinenbau WS 26" data-testid="group-name" />
            <TextField label="Dein Name in der Gruppe" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <p className="text-[12.5px] leading-snug text-muted">
              Bis zu 8 Personen inklusive dir. Lernplan, Prüfungen und Hausaufgaben teilt ihr – Fortschritt und Lernzeit bleiben persönlich.
            </p>
            {error && (
              <p role="alert" className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] px-3.5 py-2.5 text-[13.5px] text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!groupName.trim()} data-testid="group-create">
              Gruppe erstellen
            </Button>
          </form>
        ) : (
          <PlusRequired />
        )}

        {hasGroups && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Deine Gruppen</p>
            <div className="flex flex-col gap-2">
              {me!.groups.map((g) => (
                <Button key={g.id} className="w-full justify-between" disabled={busy} onClick={() => void run(() => api.switchGroup(getSupabase(), g.id))}>
                  <span className="truncate">{g.name}</span>
                  <span className="text-[12px] text-muted">{g.members}/8</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        {invite && (
          <Button variant="ghost" onClick={clearPendingInvite}>
            Später
          </Button>
        )}
        <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>
    </AuthFrame>
  );
}

/** Hinweis statt Kaufknopf: Freischaltung erfolgt nur serverseitig. */
export function PlusRequired() {
  const plus = PLANS.filter((p) => p.id !== 'free');
  return (
    <div className="flex flex-col gap-3" data-testid="plus-required">
      <div className="flex items-start gap-3 text-[14px]">
        <Crown className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <p className="text-muted">Eine eigene Lerngruppe erstellen kann man mit Plus. Beitreten ist immer kostenlos.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {plus.map((p) => (
          <div key={p.id} className="rounded-2xl border border-line p-3.5">
            <p className="text-[13px] font-semibold text-muted">{p.name}</p>
            <p className="num text-[22px] font-semibold leading-tight">{p.price}</p>
            <p className="text-[12px] text-muted">{p.period}</p>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-2 text-[12.5px] leading-snug text-faint">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Der Kauf in der App wird gerade vorbereitet. Bis dahin schaltet das StudySpace-Team Plus auf Anfrage frei.
      </p>
    </div>
  );
}
