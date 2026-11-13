import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Crown, KeyRound, LogOut, RefreshCw, Share2, Trash2, UserMinus } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { toast } from '../store/toast';
import { resync } from '../store/sync';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Avatar } from '../components/ui/Avatar';
import { Row, Section } from '../components/ui/SettingsCard';
import { api, daysLeft, formatCode, GROUP_LIMITS, isValidCode, myPlanLabel, normalizeCode, passwordProblem, PLAN_NAMES, plusLabel, type GroupMember, type Usage } from './api';
import { PlanCheckout } from './PlanCheckout';
import { startTour } from './Tour';
import { Link } from '../lib/router';
import { describeAuthError, inviteLink, refreshMe, reloadIntoGroup, signOut, updatePassword, useAccount } from './account';

const sb = () => getSupabase();

/** Führt eine Aktion aus und meldet Fehler verständlich. */
function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(describeError(err));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, run };
}

/** Bestätigung mit Eingabe – nutzt den gemeinsamen ConfirmDialog. */
function ConfirmTyped({
  open, onClose, title, text, expected, label, action, onConfirm, busy,
}: {
  open: boolean; onClose: () => void; title: string; text: ReactNode; expected: string; label: string; action: string; onConfirm: (typed: string) => void; busy?: boolean;
}) {
  return (
    <ConfirmDialog open={open} onClose={onClose} title={title} confirmLabel={action} onConfirm={onConfirm} typed={expected} typedLabel={label} busy={busy} testId="confirm-typed">
      {text}
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------
// Konto
// ---------------------------------------------------------------------

export function AccountSection() {
  const me = useAccount((s) => s.me);
  const session = useAccount((s) => s.session);
  const user = session?.user;
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider ?? 'email'];
  const hasPassword = providers.includes('email');
  const [name, setName] = useState(me?.display_name ?? '');
  const [pw, setPw] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { busy, run } = useAction();
  const providerNames = providers.map((p) => (p === 'email' ? 'E-Mail & Passwort' : p === 'google' ? 'Google' : p === 'apple' ? 'Apple' : p)).join(', ');

  const saveName = () =>
    void run(
      'name',
      async () => {
        await api.setDisplayName(sb(), name.trim());
        await refreshMe();
        await resync();
      },
      'Name gespeichert',
    );

  return (
    <div className="flex flex-col gap-5" data-testid="account-section">
      <Section hint="Dein Name ist für alle in deinen Lerngruppen sichtbar.">
        <Row label="Name">
          <div className="flex items-center gap-2">
            <input className="field w-full sm:w-56" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" />
            <Button size="sm" variant="primary" loading={busy === 'name'} disabled={!name.trim() || name.trim() === me?.display_name} onClick={saveName}>
              Sichern
            </Button>
          </div>
        </Row>
        <Row label="E-Mail">
          <span className="text-[14px] text-muted [overflow-wrap:anywhere]" data-testid="account-email">
            {user?.email ?? '–'}
          </span>
        </Row>
        <Row label="Anmeldung über">
          <span className="text-[14px] text-muted">{providerNames}</span>
        </Row>
      </Section>

      <Section>
        {hasPassword && (
          <Row label="Passwort" hint="Ändern, ohne dich abzumelden.">
            <Button size="sm" icon={<KeyRound className="size-4" />} onClick={() => (setPw(''), setPwOpen(true))}>
              Passwort ändern
            </Button>
          </Row>
        )}
        <Row label="Abmelden" hint="Auf diesem Gerät.">
          <Button size="sm" icon={<LogOut className="size-4" />} onClick={() => void signOut()} data-testid="sign-out">
            Abmelden
          </Button>
        </Row>
        <Row label="Überall abmelden" hint="Beendet die Anmeldung auf allen Geräten.">
          <Button size="sm" onClick={() => void signOut('global')}>
            Alle Geräte
          </Button>
        </Row>
      </Section>

      <Section hint="Eigene Lerngruppen ohne weitere Mitglieder werden mitgelöscht; sonst übernimmt das am längsten dabei gewesene Mitglied.">
        <Row label="Konto löschen" hint="Entfernt dein Konto endgültig.">
          <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)} disabled={me?.is_admin}>
            Konto löschen
          </Button>
        </Row>
      </Section>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Passwort ändern"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              loading={busy === 'pw'}
              disabled={!!passwordProblem(pw)}
              onClick={() =>
                void (async () => {
                  setPwOpen(false);
                  try {
                    await updatePassword(pw);
                    toast.success('Passwort geändert');
                  } catch (err) {
                    toast.error(describeAuthError(err));
                  }
                })()
              }
            >
              Speichern
            </Button>
          </>
        }
      >
        <TextField label="Neues Passwort" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={passwordProblem(pw) ?? 'Passt.'} />
      </Modal>

      <ConfirmTyped
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Konto endgültig löschen?"
        text="Dein Konto und deine Anmeldung werden gelöscht. In Gruppen bleibt dein bisheriger Fortschritt anonym als „Ehemaliges Mitglied“ erhalten. Das lässt sich nicht rückgängig machen."
        expected={user?.email ?? ''}
        label="Zur Bestätigung deine E-Mail-Adresse"
        action="Endgültig löschen"
        busy={busy === 'delete'}
        onConfirm={(typed) =>
          void run('delete', async () => {
            await api.deleteAccount(sb(), typed);
            await signOut();
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Lerngruppe
// ---------------------------------------------------------------------

export function GroupSection() {
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id) ?? null;
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [rename, setRename] = useState(group?.name ?? '');
  const [code, setCode] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete' | 'regenerate' | { remove: GroupMember }>(null);
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    if (!group) return;
    try {
      const [m, u] = await Promise.all([api.groupMembers(sb(), group.id), api.usage(sb())]);
      setMembers(m);
      setUsage(u);
    } catch (err) {
      toast.error(describeError(err));
    }
  }, [group]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!me || !group) return null;
  const owner = group.is_owner;
  const solo = group.kind === 'solo';
  const hasSolo = me.groups.some((g) => g.kind === 'solo');
  const link = group.invite_code ? inviteLink(group.invite_code) : null;
  const others = me.groups.filter((g) => g.id !== group.id);

  const copy = async () => {
    if (!link || !group.invite_code) return;
    try {
      await navigator.clipboard.writeText(`${link}\nCode: ${formatCode(group.invite_code)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Kopieren nicht möglich – bitte den Code abschreiben.');
    }
  };
  const share = () => {
    if (!link || !group.invite_code) return;
    void navigator.share?.({ title: `Lerngruppe „${group.name}“`, text: `Tritt meiner Lerngruppe in StudySpace bei – Code ${formatCode(group.invite_code)}`, url: link }).catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-5" data-testid="group-section">
      <Section hint={solo ? 'Dein persönlicher Lernbereich – nur du siehst ihn.' : owner ? 'Du verwaltest diese Gruppe.' : 'Lernplan, Prüfungen und Hausaufgaben teilt ihr; Fortschritt und Lernzeit bleiben persönlich.'}>
        <Row label={solo ? 'Lernbereich' : 'Gruppe'}>
          {owner ? (
            <div className="flex items-center gap-2">
              <input className="field w-full sm:w-56" value={rename} maxLength={60} onChange={(e) => setRename(e.target.value)} aria-label="Gruppenname" />
              <Button
                size="sm"
                variant="primary"
                loading={busy === 'rename'}
                disabled={!rename.trim() || rename.trim() === group.name}
                onClick={() => void run('rename', async () => (await api.renameGroup(sb(), group.id, rename.trim()), await refreshMe()), 'Gruppe umbenannt')}
              >
                Sichern
              </Button>
            </div>
          ) : (
            <span className="text-[14px] font-medium">{group.name}</span>
          )}
        </Row>
        <Row label="Zugang">
          <span className={`inline-flex items-center gap-1.5 text-[14px] ${group.has_plus ? 'text-accent' : 'text-muted'}`} data-testid="group-plus">
            <Crown className="size-4" aria-hidden /> {plusLabel(group)}
          </span>
        </Row>
      </Section>

      {!solo && owner && link && group.invite_code && (
        <Section hint="Mit Link oder Code treten andere kostenlos bei – höchstens 8 Personen inklusive dir.">
          <div className="flex flex-col gap-3" data-testid="invite-card">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Einladungscode</p>
              <p className="num select-all font-mono text-[28px] font-semibold tracking-[0.16em]" data-testid="invite-code">
                {formatCode(group.invite_code)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void copy()}>
                {copied ? 'Kopiert' : 'Link kopieren'}
              </Button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <Button size="sm" icon={<Share2 className="size-4" />} onClick={share}>
                  Teilen
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => setConfirm('regenerate')}>
                Neuer Code
              </Button>
            </div>
          </div>
        </Section>
      )}

      {!solo && (
      <Section hint={`${members.length} von ${GROUP_LIMITS.members} Plätzen belegt.`}>
        <ul className="flex flex-col" data-testid="group-members">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
              <Avatar name={m.name} color={m.color} size={32} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
                {m.name}
                {m.user_id === me.user_id && <span className="text-muted"> (du)</span>}
              </span>
              {m.role === 'owner' ? (
                <span className="text-[12px] font-semibold text-accent">Inhaber</span>
              ) : (
                owner && (
                  <Button size="sm" variant="ghost" icon={<UserMinus className="size-4" />} onClick={() => setConfirm({ remove: m })} aria-label={`${m.name} entfernen`}>
                    Entfernen
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      </Section>
      )}

      {usage && (
        <Section hint="Grenzen je Lerngruppe. Gelöschte Einträge zählen nicht und werden nach 30 Tagen endgültig entfernt.">
          <UsageRow label="Aktive Hausaufgaben" value={usage.homework} max={usage.homework_max} />
          <UsageRow label="Aktive Lernplaneinträge" value={usage.study_entries} max={usage.study_entries_max} />
          <UsageRow label="Mitglieder" value={usage.members} max={usage.members_max} />
          <Row label="Dokumente" inline>
            <span className="text-[13.5px] text-muted">keine Uploads</span>
          </Row>
        </Section>
      )}

      <Section>
        {others.map((g) => (
          <Row key={g.id} label={g.kind === 'solo' ? 'Mein Lernbereich' : g.name} hint={g.kind === 'solo' ? `alleine · ${plusLabel(g)}` : `${g.members}/8 · ${plusLabel(g)}`} inline>
            <Button size="sm" loading={busy === `switch-${g.id}`} onClick={() => void run(`switch-${g.id}`, async () => (await api.switchGroup(sb(), g.id), reloadIntoGroup()))}>
              Wechseln
            </Button>
          </Row>
        ))}
        <Row label="Weiterer Gruppe beitreten" hint="Mit einem Einladungscode – kostenlos.">
          <div className="flex items-center gap-2">
            <input className="field w-full font-mono tracking-[0.12em] sm:w-40" value={code} placeholder="ABCD-2345" onChange={(e) => setCode(formatCode(e.target.value))} aria-label="Einladungscode" />
            <Button
              size="sm"
              disabled={!isValidCode(normalizeCode(code))}
              loading={busy === 'join'}
              onClick={() => void run('join', async () => (await api.joinGroup(sb(), normalizeCode(code)), reloadIntoGroup()))}
            >
              Beitreten
            </Button>
          </div>
        </Row>
        {!hasSolo && (me.level || !me.trial_used) && (
          <Row label="Eigener Lernbereich" hint={me.level ? 'Alleine lernen – in deinem Tarif enthalten.' : '14 Tage kostenlos alleine lernen.'} inline>
            <Button
              size="sm"
              loading={busy === 'solo'}
              onClick={() => void run('solo', async () => (await (me.level ? api.openSolo(sb()) : api.startTrial(sb())), reloadIntoGroup()))}
              data-testid="open-solo"
            >
              {me.level ? 'Öffnen' : 'Testen'}
            </Button>
          </Row>
        )}
        {!me.has_plus && (
          <Row label="Eigene Lerngruppe" hint="Mit dem Gruppenpass lernst du mit bis zu sieben Freunden." inline>
            <Link to="/einstellungen/plus" className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium glass mat-interactive">
              Gruppenpass
            </Link>
          </Row>
        )}
        {me.has_plus && (
          <Row label="Neue Gruppe erstellen" hint="Mit deinem Gruppenpass.">
            <div className="flex items-center gap-2">
              <input className="field w-full sm:w-44" value={newGroup} maxLength={60} placeholder="Name" onChange={(e) => setNewGroup(e.target.value)} aria-label="Name der neuen Gruppe" />
              <Button size="sm" disabled={!newGroup.trim()} loading={busy === 'create'} onClick={() => void run('create', async () => (await api.createGroup(sb(), newGroup.trim()), reloadIntoGroup()))}>
                Erstellen
              </Button>
            </div>
          </Row>
        )}
      </Section>

      <Section>
        {owner ? (
          <Row label={solo ? 'Lernbereich löschen' : 'Gruppe löschen'} hint={solo ? 'Löscht deinen Lernplan, Prüfungen, Hausaufgaben und Haken endgültig.' : 'Löscht Lernplan, Prüfungen, Hausaufgaben und alle Haken dieser Gruppe endgültig.'}>
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('delete')}>
              Gruppe löschen
            </Button>
          </Row>
        ) : (
          <Row label="Gruppe verlassen" hint="Dein Fortschritt bleibt als Verlauf in der Gruppe; du siehst die Inhalte danach nicht mehr.">
            <Button size="sm" variant="danger" icon={<LogOut className="size-4" />} onClick={() => setConfirm('leave')} data-testid="leave-group">
              Verlassen
            </Button>
          </Row>
        )}
      </Section>

      <Modal
        open={confirm === 'leave' || confirm === 'regenerate' || (typeof confirm === 'object' && confirm !== null)}
        onClose={() => setConfirm(null)}
        title={confirm === 'leave' ? 'Gruppe verlassen?' : confirm === 'regenerate' ? 'Neuen Code erzeugen?' : 'Mitglied entfernen?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Abbrechen
            </Button>
            <Button
              variant={confirm === 'regenerate' ? 'primary' : 'danger'}
              loading={!!busy}
              onClick={() => {
                const c = confirm;
                if (c === 'leave') void run('leave', async () => (await api.leaveGroup(sb(), group.id), reloadIntoGroup()));
                else if (c === 'regenerate') void run('regen', async () => (await api.regenerateInvite(sb(), group.id), await refreshMe()), 'Neuer Code erstellt').then(() => setConfirm(null));
                else if (c && typeof c === 'object')
                  void run('remove', async () => (await api.removeMember(sb(), group.id, c.remove.user_id), await load(), await refreshMe()), `${c.remove.name} entfernt`).then(() => setConfirm(null));
              }}
            >
              {confirm === 'leave' ? 'Verlassen' : confirm === 'regenerate' ? 'Neuer Code' : 'Entfernen'}
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">
          {confirm === 'leave'
            ? 'Du kannst später mit einem neuen Einladungscode wieder beitreten.'
            : confirm === 'regenerate'
              ? 'Der bisherige Code und Link funktionieren danach nicht mehr. Bereits beigetretene Mitglieder bleiben.'
              : typeof confirm === 'object' && confirm
                ? `${confirm.remove.name} sieht die Inhalte der Gruppe danach nicht mehr. Bisherige Haken bleiben als Verlauf erhalten.`
                : null}
        </p>
      </Modal>

      <ConfirmTyped
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Gruppe endgültig löschen?"
        text={<>Alle Inhalte von „{group.name}“ werden für alle Mitglieder gelöscht. Das lässt sich nicht rückgängig machen.</>}
        expected={group.name}
        label="Zur Bestätigung den Gruppennamen eingeben"
        action="Gruppe löschen"
        busy={busy === 'delete'}
        onConfirm={(typed) => void run('delete', async () => (await api.deleteGroup(sb(), group.id, typed), reloadIntoGroup()))}
      />
    </div>
  );
}

function UsageRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-medium">{label}</span>
        <span className={`num ${pct >= 90 ? 'text-danger' : 'text-muted'}`}>
          {value} / {max}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ss-text)_8%,transparent)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--ss-accent)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tarif & Abo
// ---------------------------------------------------------------------

export function PlusSection() {
  const me = useAccount((s) => s.me);
  const [tier, setTier] = useState<'solo' | 'group'>(me?.level === 'solo' || !me?.level ? 'solo' : 'group');
  const [cancelOpen, setCancelOpen] = useState(false);
  const { busy, run } = useAction();
  if (!me) return null;
  const group = me.groups.find((g) => g.id === me.active_group_id);
  const trialDays = me.plan === 'trial' ? daysLeft(me.plan_until) : null;
  const until = me.plan_until ? new Date(me.plan_until).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const isBeta = me.plan_source === 'beta';

  return (
    <div className="flex flex-col gap-5" data-testid="plus-section">
      <Section hint="Zugänge schaltet nur der Server frei – nie allein die App.">
        <Row label="Dein Tarif" inline>
          <span className={`inline-flex items-center gap-1.5 text-[14px] font-medium ${me.level ? 'text-accent' : ''}`} data-testid="own-plan">
            {me.level && <Crown className="size-4" aria-hidden />}
            {myPlanLabel(me)}
          </span>
        </Row>
        {me.plan && me.plan !== 'trial' && (
          <Row label={me.auto_renew ? 'Verlängert sich am' : 'Läuft bis'} inline>
            <span className="text-[14px] text-muted">{until ?? 'unbegrenzt'}</span>
          </Row>
        )}
        {trialDays !== null && (
          <Row label="Testphase" hint="Danach bleibt alles sichtbar; zum Bearbeiten Solo oder Gruppe wählen." inline>
            <span className="num text-[14px] text-muted">noch {trialDays} {trialDays === 1 ? 'Tag' : 'Tage'}</span>
          </Row>
        )}
        {group && group.kind === 'team' && !group.is_owner && (
          <Row label={`Gruppe „${group.name}“`} hint="Der Gruppenpass wird von der Person bezahlt, die die Gruppe verwaltet." inline>
            <span className="text-[14px] text-muted">{plusLabel(group)}</span>
          </Row>
        )}
        {isBeta && me.auto_renew && me.plan_id && (
          <Row label="Abo kündigen" hint="Der Zugang läuft bis zum Ende des Zeitraums weiter." inline>
            <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)} data-testid="plan-cancel">
              Kündigen
            </Button>
          </Row>
        )}
      </Section>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="list-group-title !mb-0">{me.level ? 'Verlängern oder wechseln' : 'Tarif wählen'}</h3>
        </div>
        <div className="grid grid-cols-2 gap-2.5" role="tablist" aria-label="Tarif">
          {(['solo', 'group'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tier === t}
              onClick={() => setTier(t)}
              data-testid={`tier-${t}`}
              className={`rounded-[18px] border p-3 text-left transition-colors ${tier === t ? 'border-[var(--ss-accent)] bg-[color-mix(in_srgb,var(--ss-accent)_10%,transparent)]' : 'border-line'}`}
            >
              <p className="text-[14px] font-semibold">{t === 'solo' ? 'Solo' : 'Gruppe'}</p>
              <p className="text-[12px] text-muted">{t === 'solo' ? 'ab 2,49 € / Monat' : 'ab 4,99 € / Monat · bis 8 Personen'}</p>
            </button>
          ))}
        </div>
        <div className="settings-card mt-3">
          <PlanCheckout key={tier} tier={tier} onDone={(r) => (r.group_id || tier === 'group' ? reloadIntoGroup() : undefined)} />
        </div>
        <p className="list-group-footer">
          Monatstarife verlängern sich monatlich, solange nicht gekündigt wird. Semesterpässe enden nach sechs Monaten automatisch.
          {tier === 'group' && ' Nach dem Kauf erstellst du unter „Lerngruppe“ deine Gruppe.'}
        </p>
      </div>

      <Section hint="Läuft der Zugang ab, bleibt alles sichtbar. Neue Einträge und Änderungen sind dann erst nach einer Verlängerung wieder möglich; Haken setzen und Fokuszeiten funktionieren weiter.">
        <Row label="Mitglieder je Gruppe" inline>
          <span className="num text-[14px] text-muted">{GROUP_LIMITS.members}</span>
        </Row>
        <Row label="Aktive Hausaufgaben" inline>
          <span className="num text-[14px] text-muted">{GROUP_LIMITS.homework}</span>
        </Row>
        <Row label="Aktive Lernplaneinträge" inline>
          <span className="num text-[14px] text-muted">{GROUP_LIMITS.studyEntries}</span>
        </Row>
        <Row label="Dokumente" inline>
          <span className="text-[14px] text-muted">keine Uploads</span>
        </Row>
      </Section>

      <Section>
        <Row label="Einführung" hint="Die kurze Tour durch StudySpace noch einmal ansehen." inline>
          <Button size="sm" onClick={() => startTour()} data-testid="replay-tour">
            Ansehen
          </Button>
        </Row>
      </Section>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`${PLAN_NAMES[me.plan ?? ''] ?? 'Abo'} kündigen?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Behalten
            </Button>
            <Button
              variant="danger"
              loading={busy === 'cancel'}
              onClick={() => void run('cancel', async () => (await api.betaCancel(sb(), me.plan_id!), await refreshMe(), setCancelOpen(false)), 'Gekündigt – läuft bis zum Ende des Zeitraums')}
            >
              Kündigen
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">Du behältst den Zugang bis {until}. Danach bleibt alles sichtbar, nur Bearbeiten ist gesperrt.</p>
      </Modal>
    </div>
  );
}
