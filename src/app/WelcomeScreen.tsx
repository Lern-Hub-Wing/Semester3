import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, BookOpenCheck, ChevronRight, LogOut, Sparkles, UserPlus, UserRound, Users } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { EASE_EMPH } from '../lib/motion';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { AuthFrame } from './AuthScreen';
import { PlanCheckout } from './PlanCheckout';
import { api, formatCode, isValidCode, normalizeCode } from './api';
import { clearPendingInvite, reloadIntoGroup, signOut, useAccount } from './account';

type Choice = 'menu' | 'join' | 'solo' | 'group';

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] px-3.5 py-2.5 text-[13.5px] text-danger">
      {children}
    </p>
  );
}

/**
 * Erster Start nach der Registrierung (und immer, wenn kein Lernbereich aktiv ist):
 * „Wie möchtest du lernen?“ – beitreten, alleine (14 Tage gratis) oder eigene Gruppe.
 * Bewusst schlicht: erst nach der Wahl erscheinen Preise.
 */
export function WelcomeScreen() {
  const me = useAccount((s) => s.me);
  const invite = useAccount((s) => s.pendingInvite);
  const reduce = useReducedMotion();
  const [choice, setChoice] = useState<Choice>(invite ? 'join' : 'menu');
  const groups = me?.groups ?? [];
  const first = groups.length === 0;

  const options: { id: Exclude<Choice, 'menu'>; icon: ReactNode; tint: string; title: string; text: string }[] = [
    { id: 'join', icon: <UserPlus />, tint: '#2FA58B', title: 'Einer Lerngruppe beitreten', text: 'Du hast einen Einladungscode? Tritt kostenlos deiner Gruppe bei.' },
    {
      id: 'solo',
      icon: <UserRound />,
      tint: '#6F7BF7',
      title: 'Alleine lernen',
      text: me?.trial_used || me?.level ? 'Dein persönlicher Lernbereich mit Lernplan, Prüfungen und Fokus.' : 'Teste 14 Tage kostenlos alle Solo-Funktionen.',
    },
    { id: 'group', icon: <Users />, tint: '#B57BF0', title: 'Eigene Lerngruppe erstellen', text: 'Lerne mit bis zu sieben Freunden. Wähle einen Gruppenpass.' },
  ];

  const title = invite ? 'Einladung annehmen' : first ? 'Willkommen bei StudySpace!' : 'Wie möchtest du lernen?';
  const subtitle = invite ? 'Du wurdest in eine Lerngruppe eingeladen. Der Beitritt ist kostenlos.' : first ? 'Wie möchtest du lernen?' : 'Wähle deinen Lernbereich oder starte etwas Neues.';

  return (
    <AuthFrame title={title} subtitle={subtitle} wide>
      <div data-testid="welcome-screen">
        <AnimatePresence mode="wait" initial={false}>
          {choice === 'menu' ? (
            <motion.div key="menu" className="flex flex-col gap-2.5" exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
              {options.map((o, i) => (
                <motion.button
                  key={o.id}
                  type="button"
                  onClick={() => setChoice(o.id)}
                  data-testid={`welcome-${o.id}`}
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.25 + i * 0.08, ease: EASE_EMPH }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  className="group flex w-full items-center gap-3.5 rounded-[22px] border border-line bg-[color-mix(in_srgb,var(--ss-surface,#fff)_40%,transparent)] p-4 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)]"
                >
                  <span className="list-row-icon !size-11 !rounded-[14px] [&_svg]:!size-[22px]" style={{ '--row-tint': o.tint } as React.CSSProperties} aria-hidden>
                    {o.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-semibold leading-snug">{o.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{o.text}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                </motion.button>
              ))}
              {groups.length > 0 && <ExistingSpaces />}
              <Button variant="ghost" className="mt-1" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
                Abmelden
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key={choice}
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: EASE_EMPH }}
            >
              {!(invite && choice === 'join') && (
                <button type="button" onClick={() => setChoice('menu')} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink" data-testid="welcome-back">
                  <ArrowLeft className="size-4" aria-hidden /> Zurück
                </button>
              )}
              {choice === 'join' && <JoinPanel />}
              {choice === 'solo' && <SoloPanel />}
              {choice === 'group' && <GroupPanel />}
              {invite && choice === 'join' && (
                <Button variant="ghost" className="mt-2 w-full" onClick={() => (clearPendingInvite(), setChoice('menu'))}>
                  Später
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthFrame>
  );
}

function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  return { busy, error, setError, run };
}

/** Bereits vorhandene Lernbereiche/Gruppen (z. B. nach dem Verlassen einer Gruppe). */
function ExistingSpaces() {
  const me = useAccount((s) => s.me);
  const { busy, run } = useRun();
  return (
    <div className="mt-2 border-t border-line pt-3">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Deine Lernbereiche</p>
      <div className="flex flex-col gap-2">
        {me!.groups.map((g) => (
          <Button key={g.id} className="w-full justify-between" disabled={busy} onClick={() => void run(() => api.switchGroup(getSupabase(), g.id))}>
            <span className="truncate">{g.kind === 'solo' ? 'Mein Lernbereich' : g.name}</span>
            <span className="text-[12px] text-muted">{g.kind === 'solo' ? 'alleine' : `${g.members}/8`}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function JoinPanel() {
  const me = useAccount((s) => s.me);
  const invite = useAccount((s) => s.pendingInvite);
  const [code, setCode] = useState(invite ? formatCode(invite) : '');
  const [name, setName] = useState(me?.display_name ?? '');
  const [preview, setPreview] = useState<{ name: string; members: number; has_plus: boolean } | null>(null);
  const { busy, error, setError, run } = useRun();
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCode(clean)) return setError('Der Code hat 8 Zeichen, z. B. ABCD-2345.');
    void run(() => api.joinGroup(getSupabase(), clean, name.trim() || undefined));
  };

  return (
    <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate data-testid="join-panel">
      <TextField
        label="Einladungscode"
        value={code}
        onChange={(e) => setCode(formatCode(e.target.value))}
        placeholder="ABCD-2345"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="[&_input]:font-mono [&_input]:tracking-[0.18em]"
        hint="Den Code oder Link bekommst du von der Person, die die Gruppe erstellt hat."
        data-testid="join-code"
      />
      {preview && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--ss-accent)_10%,transparent)] px-3.5 py-3" data-testid="invite-preview">
          <Users className="size-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 text-[14px]">
            <p className="truncate font-semibold">{preview.name}</p>
            <p className="text-[12.5px] text-muted">
              {preview.members} von 8 Plätzen belegt{!preview.has_plus && ' · Gruppenpass abgelaufen'}
            </p>
          </div>
        </motion.div>
      )}
      <TextField label="Dein Name in der Gruppe" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" />
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!isValidCode(clean)} data-testid="join-submit">
        Kostenlos beitreten
      </Button>
    </form>
  );
}

function SoloPanel() {
  const me = useAccount((s) => s.me);
  const { busy, error, run } = useRun();
  const hasSolo = me?.groups.some((g) => g.kind === 'solo');
  // Schon berechtigt (Testphase läuft, Solo oder Gruppe): direkt öffnen
  if (me?.level) {
    return (
      <div className="flex flex-col gap-3.5" data-testid="solo-panel">
        <p className="text-[14px] text-muted">Dein persönlicher Lernbereich ist freigeschaltet.</p>
        {error && <ErrorText>{error}</ErrorText>}
        <Button variant="primary" size="lg" loading={busy} icon={<BookOpenCheck className="size-4" />} onClick={() => void run(() => api.openSolo(getSupabase()))} data-testid="solo-open">
          Lernbereich öffnen
        </Button>
      </div>
    );
  }
  if (!me?.trial_used) {
    return (
      <div className="flex flex-col gap-4" data-testid="solo-panel">
        <div className="rounded-[22px] bg-[linear-gradient(135deg,color-mix(in_srgb,#6F7BF7_22%,transparent),color-mix(in_srgb,#B57BF0_18%,transparent))] p-4">
          <p className="flex items-center gap-2 text-[15.5px] font-semibold">
            <Sparkles className="size-4.5 text-accent" aria-hidden /> 14 Tage kostenlos
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-muted">
            <li>• Voller Solo-Zugriff: Lernplan, Hausaufgaben, Prüfungen, Fokus, Statistik</li>
            <li>• Keine Zahlungsdaten nötig, endet automatisch</li>
            <li>• Danach bleibt alles sichtbar – bearbeiten kannst du mit Solo weiter</li>
          </ul>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Button variant="primary" size="lg" loading={busy} onClick={() => void run(() => api.startTrial(getSupabase()))} data-testid="trial-start">
          Kostenlos starten
        </Button>
        <details className="group rounded-[18px] border border-line px-3.5 py-2.5">
          <summary className="cursor-pointer list-none text-[13.5px] font-medium text-muted marker:hidden">Lieber gleich Solo wählen?</summary>
          <div className="mt-3">
            <PlanCheckout tier="solo" compact onDone={() => reloadIntoGroup()} />
          </div>
        </details>
      </div>
    );
  }
  // Testphase vorbei: Solo wählen oder Lernbereich nur lesend öffnen
  return (
    <div className="flex flex-col gap-4" data-testid="solo-panel">
      <p className="text-[14px] text-muted">Deine Testphase ist beendet. Mit Solo lernst du ohne Einschränkungen weiter.</p>
      <PlanCheckout tier="solo" onDone={() => reloadIntoGroup()} />
      {hasSolo && (
        <Button variant="ghost" loading={busy} onClick={() => void run(() => api.startTrial(getSupabase()))}>
          Lernbereich nur ansehen
        </Button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function GroupPanel() {
  const me = useAccount((s) => s.me);
  const [name, setName] = useState('');
  const [display, setDisplay] = useState(me?.display_name ?? '');
  const { busy, error, setError, run } = useRun();
  const canCreate = me?.level === 'group';

  if (!canCreate) return <PlanCheckout tier="group" />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Bitte gib der Gruppe einen Namen.');
    void run(() => api.createGroup(getSupabase(), name.trim(), display.trim() || undefined));
  };
  return (
    <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3.5" onSubmit={submit} noValidate data-testid="group-panel">
      <p className="text-[14px] text-muted">Dein Gruppenpass ist aktiv. Wie soll eure Lerngruppe heißen?</p>
      <TextField label="Name der Gruppe" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="z. B. Maschinenbau WS 26" data-testid="group-name" />
      <TextField label="Dein Name in der Gruppe" value={display} onChange={(e) => setDisplay(e.target.value)} maxLength={40} />
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!name.trim()} data-testid="group-create">
        Gruppe erstellen
      </Button>
    </motion.form>
  );
}
