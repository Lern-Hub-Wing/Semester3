import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { Ambient } from '../components/layout/Ambient';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { adminAuth, adminDb } from './client';

function Frame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <Ambient />
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="mb-5 flex items-center justify-center gap-3">
          <LogoMark size={40} />
          <span className="title text-[20px]">StudySpace Admin</span>
        </div>
        <div className="glass rounded-[28px] p-6">
          <h1 className="title text-[22px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] px-3.5 py-2.5 text-[13.5px] text-danger">
      {children}
    </p>
  );
}

const pwProblem = (pw: string) =>
  pw.length < 14 ? 'Mindestens 14 Zeichen.' : !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) ? 'Groß- und Kleinbuchstaben sowie Ziffern verwenden.' : null;

/** Geschützte Ersteinrichtung: Einrichtungsschlüssel (Server-Secret) + selbst gewähltes Passwort. */
export function SetupScreen({ possible, onDone }: { possible: boolean; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = pwProblem(pw);
    if (p) return setError(p);
    if (pw !== repeat) return setError('Die Passwörter stimmen nicht überein.');
    setBusy(true);
    setError(null);
    try {
      await adminAuth({ action: 'setup', token: token.trim(), password: pw });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!possible)
    return (
      <Frame title="Ersteinrichtung" subtitle="Der Admin-Zugang ist noch nicht eingerichtet.">
        <p className="text-[14px] text-muted" data-testid="admin-setup-locked">
          Lege im Supabase-Projekt der App unter Edge Functions → Secrets einen zufälligen Wert <code>ADMIN_SETUP_TOKEN</code> (mindestens 24 Zeichen) an und lade diese Seite neu.
          Die Anleitung steht in <code>docs/APP.md</code>.
        </p>
      </Frame>
    );
  return (
    <Frame title="Ersteinrichtung" subtitle="Lege das Passwort für den Benutzer „Luke“ fest. Danach ist die Einrichtung dauerhaft gesperrt.">
      <form className="flex flex-col gap-3.5" onSubmit={(e) => void submit(e)} data-testid="admin-setup">
        <TextField label="Einrichtungsschlüssel (ADMIN_SETUP_TOKEN)" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        <TextField label="Neues Passwort" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="Mindestens 14 Zeichen, Groß-/Kleinbuchstaben und Ziffern." />
        <TextField label="Passwort wiederholen" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!token || !pw || !repeat}>
          Admin einrichten
        </Button>
      </form>
    </Frame>
  );
}

export function LoginScreen({ onDone, notice }: { onDone: () => void; notice?: string | null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice ?? null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await adminAuth<{ access_token: string; refresh_token: string }>({ action: 'login', username: username.trim(), password });
      const { error: err } = await adminDb().auth.setSession(s);
      if (err) throw err;
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title="Anmelden" subtitle="Nur für Administratoren.">
      <form className="flex flex-col gap-3.5" onSubmit={(e) => void submit(e)} data-testid="admin-login">
        <TextField label="Benutzername" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <TextField label="Passwort" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!username || !password}>
          Weiter
        </Button>
      </form>
    </Frame>
  );
}

/** Zwei-Faktor: beim ersten Mal einrichten (QR-Code), danach Code eingeben. */
export function MfaScreen({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const db = adminDb();
      const { data, error: err } = await db.auth.mfa.listFactors();
      if (err) return setError(err.message);
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setFactorId(verified.id);
      // Nicht abgeschlossene Einrichtungen entfernen, dann neu beginnen
      for (const f of data.all.filter((x) => x.status !== 'verified')) await db.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: enErr } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `StudySpace Admin ${new Date().toISOString().slice(0, 10)}` });
      if (enErr) return setError(`Zwei-Faktor konnte nicht eingerichtet werden: ${enErr.message}`);
      setFactorId(en.id);
      setEnroll({ qr: en.totp.qr_code, secret: en.totp.secret });
    })();
  }, []);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await adminDb().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (err) return setError('Der Code stimmt nicht. Bitte den aktuellen Code aus der Authenticator-App eingeben.');
    onDone();
  };

  return (
    <Frame
      title="Zwei-Faktor-Anmeldung"
      subtitle={enroll ? 'Scanne den QR-Code mit einer Authenticator-App (z. B. Apple Passwörter, Google Authenticator, 1Password).' : 'Gib den 6-stelligen Code aus deiner Authenticator-App ein.'}
    >
      <form className="flex flex-col gap-3.5" onSubmit={(e) => void verify(e)} data-testid="admin-mfa">
        {enroll && (
          <div className="flex flex-col items-center gap-2">
            <img src={enroll.qr} alt="QR-Code für die Authenticator-App" className="size-44 rounded-2xl bg-white p-2" />
            <p className="text-center text-[12px] text-muted">
              Oder Schlüssel manuell eingeben: <code className="select-all break-all">{enroll.secret}</code>
            </p>
          </div>
        )}
        <TextField label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.replace(/\s/g, '').length < 6 || !factorId} icon={<ShieldCheck className="size-4" />}>
          Bestätigen
        </Button>
        <Button variant="ghost" icon={<KeyRound className="size-4" />} onClick={onCancel}>
          Abmelden
        </Button>
      </form>
    </Frame>
  );
}

export { Frame as AdminFrame };
