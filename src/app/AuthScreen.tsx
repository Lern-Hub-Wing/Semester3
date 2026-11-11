import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, KeyRound, LogOut, Mail, ShieldAlert } from 'lucide-react';
import { EASE_EMPH, EASE_OUT } from '../lib/motion';
import { LogoMark } from '../components/Logo';
import { Ambient } from '../components/layout/Ambient';
import { Landscape } from '../components/landscape/Landscape';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Switch } from '../components/ui/Switch';
import {
  describeAuthError, loadProviders, resendConfirmation, sendPasswordReset, signInWithPassword, signInWithProvider, signOut, signUp, updatePassword,
  useAccount, type AuthProviders,
} from './account';
import { getRemember } from './authStorage';
import { passwordProblem } from './api';

/** Gemeinsamer Rahmen der Konto-Seiten: Berglandschaft, Logo, Glaskarte. */
export function AuthFrame({ title, subtitle, children, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-[max(env(safe-area-inset-top),28px)]">
      <Ambient />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] overflow-hidden [mask-image:linear-gradient(180deg,#000_40%,transparent)]"
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 1.4, ease: EASE_OUT }}
      >
        <Landscape />
      </motion.div>
      <div className={`relative z-10 flex w-full flex-col items-center ${wide ? 'max-w-xl' : 'max-w-[420px]'}`}>
        <motion.div
          className="mb-5 flex items-center gap-3"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.5, ease: EASE_OUT }}
        >
          <LogoMark size={44} />
          <span className="title text-[21px]">StudySpace</span>
        </motion.div>
        <motion.h1
          className="display text-center text-[30px] md:text-[40px]"
          initial={reduce ? false : { opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE_EMPH }}
        >
          {title}
        </motion.h1>
        {subtitle && (
          // Gleiche lesbare Glas-Pille wie das Datum auf der bisherigen Startseite
          <p className="mt-2.5 max-w-sm rounded-[18px] bg-[color-mix(in_srgb,var(--ss-bg)_62%,transparent)] px-3.5 py-1.5 text-center text-[14px] font-medium leading-snug text-ink backdrop-blur-md">
            {subtitle}
          </p>
        )}
        <motion.div
          className="glass mt-6 w-full rounded-[28px] p-5 md:p-6"
          initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 170, damping: 22, delay: reduce ? 0 : 0.18 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const color = tone === 'error' ? 'var(--ss-danger)' : tone === 'success' ? 'var(--ss-success, #2FA58B)' : 'var(--ss-accent)';
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className="rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug"
      style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color: tone === 'error' ? color : undefined }}
    >
      {children}
    </p>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.08-1.92 3.25-4.74 3.25-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.17a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.35c1.62 0 3.07.56 4.21 1.65l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.17 7.06l3.66 2.84C6.7 7.3 9.13 5.35 12 5.35Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden fill="currentColor">
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76a4.27 4.27 0 0 0-3.6 2.19c-1.54 2.67-.39 6.62 1.1 8.79.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14a9.4 9.4 0 0 0 1.2-2.47 3.83 3.83 0 0 1-2.26-3.55ZM14.2 6.12c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.55 1.31-.56.64-1.05 1.68-.92 2.67.97.08 1.97-.49 2.57-1.2Z" />
    </svg>
  );
}

type Mode = 'signin' | 'signup' | 'reset' | 'check-mail';

/** Anmelden, Registrieren und „Passwort vergessen“. */
export function AuthScreen() {
  const urlError = useAccount((s) => s.error);
  const invite = useAccount((s) => s.pendingInvite);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [remember, setRememberState] = useState(getRemember());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(urlError);
  const [info, setInfo] = useState<string | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    void loadProviders().then(setProviders);
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') void run('email', () => signInWithPassword(email, password, remember));
    else if (mode === 'signup') {
      const problem = passwordProblem(password);
      if (problem) return setError(problem);
      if (!name.trim()) return setError('Bitte gib deinen Namen ein.');
      void run('email', async () => {
        const { needsConfirmation } = await signUp(email, password, name, remember);
        if (needsConfirmation) setMode('check-mail');
      });
    } else if (mode === 'reset')
      void run('email', async () => {
        await sendPasswordReset(email);
        setInfo('Falls ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt.');
      });
  };

  // Ohne Antwort der Supabase-Einstellungen (z. B. offline) werden beide Wege angeboten
  const showGoogle = providers ? providers.google : true;
  const showApple = providers ? providers.apple : true;
  const canSignUp = !providers?.signupDisabled;

  if (mode === 'check-mail')
    return (
      <AuthFrame title="Fast geschafft" subtitle={<>Wir haben dir eine E-Mail an <strong>{email}</strong> geschickt.</>}>
        <div className="flex flex-col gap-4" data-testid="auth-check-mail">
          <div className="flex items-start gap-3 text-[14px] text-muted">
            <Mail className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <p>Öffne den Link in der E-Mail, um dein Konto zu bestätigen. Danach bist du automatisch angemeldet.</p>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {info && <Notice tone="success">{info}</Notice>}
          <Button
            loading={busy === 'resend'}
            onClick={() =>
              void run('resend', async () => {
                await resendConfirmation(email);
                setInfo('E-Mail erneut gesendet.');
              })
            }
          >
            E-Mail erneut senden
          </Button>
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setMode('signin')}>
            Zur Anmeldung
          </Button>
        </div>
      </AuthFrame>
    );

  const title = mode === 'signup' ? 'Konto erstellen' : mode === 'reset' ? 'Passwort vergessen' : 'Willkommen zurück';
  const subtitle = invite
    ? 'Melde dich an oder erstelle ein kostenloses Konto, um der Lerngruppe beizutreten.'
    : mode === 'reset'
      ? 'Gib deine E-Mail-Adresse ein. Du bekommst einen Link, um ein neues Passwort festzulegen.'
      : 'Gemeinsam lernen – mit Lernplan, Hausaufgaben und Fokus.';

  return (
    <AuthFrame title={title} subtitle={subtitle}>
      <form className="flex flex-col gap-3.5" onSubmit={submit} data-testid={`auth-${mode}`} noValidate>
        {mode !== 'reset' && (showGoogle || showApple) && (
          <>
            <div className="flex flex-col gap-2.5">
              {showApple && (
                <Button size="lg" className="w-full" loading={busy === 'apple'} icon={<AppleIcon />} onClick={() => void run('apple', () => signInWithProvider('apple', remember))}>
                  Mit Apple fortfahren
                </Button>
              )}
              {showGoogle && (
                <Button size="lg" className="w-full" loading={busy === 'google'} icon={<GoogleIcon />} onClick={() => void run('google', () => signInWithProvider('google', remember))}>
                  Mit Google fortfahren
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-faint" aria-hidden>
              <span className="h-px flex-1 bg-line" /> oder <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <AnimatePresence initial={false}>
          {mode === 'signup' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <TextField label="Dein Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" required />
            </motion.div>
          )}
        </AnimatePresence>
        <TextField label="E-Mail" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'reset' && (
          <TextField
            label="Passwort"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode === 'signup' ? 'Mindestens 10 Zeichen mit Buchstaben und Ziffern.' : undefined}
            required
          />
        )}
        {mode !== 'reset' && (
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="remember" className="text-[14px] font-medium">
              Angemeldet bleiben
            </label>
            <Switch id="remember" checked={remember} onChange={setRememberState} label="Angemeldet bleiben" />
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === 'email'} disabled={!email.trim() || (mode !== 'reset' && !password)}>
          {mode === 'signup' ? 'Konto erstellen' : mode === 'reset' ? 'Link senden' : 'Anmelden'}
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[13.5px]">
          {mode === 'signin' ? (
            <>
              <button type="button" className="min-h-11 font-medium text-muted hover:text-ink" onClick={() => (setMode('reset'), setError(null))}>
                Passwort vergessen?
              </button>
              {canSignUp && (
                <button type="button" className="min-h-11 font-semibold text-accent" onClick={() => (setMode('signup'), setError(null))} data-testid="auth-to-signup">
                  Neues Konto
                </button>
              )}
            </>
          ) : (
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted hover:text-ink" onClick={() => (setMode('signin'), setError(null), setInfo(null))}>
              <ArrowLeft className="size-4" aria-hidden /> {mode === 'signup' ? 'Ich habe schon ein Konto' : 'Zur Anmeldung'}
            </button>
          )}
        </div>
        {mode === 'signup' && (
          <p className="text-center text-[12px] leading-snug text-faint">Mit der Registrierung legst du ein kostenloses Konto an. Plus ist optional.</p>
        )}
      </form>
    </AuthFrame>
  );
}

/** Nach dem Link „Passwort vergessen“: neues Passwort festlegen. */
export function RecoveryScreen() {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== repeat) return setError('Die Passwörter stimmen nicht überein.');
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Neues Passwort" subtitle="Lege ein neues Passwort für dein Konto fest.">
      <form className="flex flex-col gap-3.5" onSubmit={(e) => void submit(e)} data-testid="auth-recovery">
        <TextField label="Neues Passwort" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mindestens 10 Zeichen mit Buchstaben und Ziffern." />
        <TextField label="Passwort wiederholen" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={busy} icon={<KeyRound className="size-4" />} disabled={!password || !repeat}>
          Passwort speichern
        </Button>
      </form>
    </AuthFrame>
  );
}

/** Gesperrtes Konto oder widerrufene Sitzung. */
export function BlockedScreen({ revoked }: { revoked?: boolean }) {
  return (
    <AuthFrame
      title={revoked ? 'Bitte neu anmelden' : 'Konto gesperrt'}
      subtitle={revoked ? 'Deine Sitzung wurde beendet. Melde dich erneut an.' : 'Dieses Konto wurde gesperrt. Bei Fragen wende dich an den Support.'}
    >
      <div className="flex flex-col gap-3" data-testid="auth-blocked">
        {!revoked && (
          <div className="flex items-start gap-3 text-[14px] text-muted">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <p>Solange die Sperre besteht, sind keine Lerngruppen-Daten erreichbar.</p>
          </div>
        )}
        <Button variant="primary" size="lg" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
          {revoked ? 'Neu anmelden' : 'Abmelden'}
        </Button>
      </div>
    </AuthFrame>
  );
}

/** Kurzer Ladezustand beim Start. */
export function Splash() {
  return (
    <div className="relative grid min-h-dvh place-items-center" aria-busy="true" aria-label="StudySpace wird geladen">
      <Ambient />
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
        <LogoMark size={56} animate />
      </motion.div>
    </div>
  );
}
