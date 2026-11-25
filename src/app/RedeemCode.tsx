import { useState, type FormEvent } from 'react';
import { CheckCircle2, Ticket } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { Section } from '../components/ui/SettingsCard';
import { TextField } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { TINT } from '../lib/tints';
import { api, isMissingFunction, PLAN_NAMES, type RedeemResult } from './api';
import { clearPendingInvite, reloadIntoGroup, refreshMe, useAccount } from './account';
import { takePendingPromo } from './pendingCode';
export { takePendingPromo };

/** Formatiert die Eingabe als XXXX-XXXX (ohne verwechselbare Zeichen) */
export function formatAnyCode(input: string): string {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Ein Code-Feld für alles: Einladung zu einer Lerngruppe oder Tarif-Code. */
export function useRedeem() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RedeemResult | null>(null);
  const redeem = async (code: string, displayName?: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      let res: RedeemResult;
      try {
        res = await api.redeemCode(getSupabase(), code, displayName);
      } catch (err) {
        // Ältere Datenbank ohne Code-Funktion: wie bisher nur Einladungen
        if (!isMissingFunction(err)) throw err;
        const gid = await api.joinGroup(getSupabase(), code, displayName);
        res = { kind: 'group', group_id: gid, name: '', claimable: 0 };
      }
      if (res.kind === 'invalid') {
        setError(res.message);
      } else if (res.kind === 'group') {
        clearPendingInvite();
        reloadIntoGroup();
        return res;
      } else {
        setDone(res);
        await refreshMe();
      }
      return res;
    } catch (err) {
      setError(describeError(err));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, redeem, setError };
}

export function RedeemForm({ initial = '', compact }: { initial?: string; compact?: boolean }) {
  const me = useAccount((s) => s.me);
  const [code, setCode] = useState(() => formatAnyCode(initial || takePendingPromo()));
  const { busy, error, done, redeem, setError } = useRedeem();
  const clean = code.replace(/-/g, '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean.length !== 8) return setError('Codes haben 8 Zeichen, z. B. ABCD-2345.');
    void redeem(clean, me?.display_name ?? undefined);
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate data-testid="redeem-form">
      <TextField
        label="Code"
        value={code}
        onChange={(e) => setCode(formatAnyCode(e.target.value))}
        placeholder="ABCD-2345"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        spellCheck={false}
        className="[&_input]:font-mono [&_input]:tracking-[0.18em]"
        hint={compact ? undefined : 'Einladungscode einer Lerngruppe oder Tarif-Code – beides funktioniert hier.'}
        data-testid="redeem-code"
      />
      {error && (
        <p className="text-[13.5px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {done && done.kind === 'plan' && (
        <p className="flex items-start gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--ss-success)_14%,transparent)] px-3.5 py-3 text-[14px]" role="status" data-testid="redeem-success">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <span>
            <strong className="font-semibold">{PLAN_NAMES[done.plan] ?? 'Tarif'} freigeschaltet</strong>
            {done.ends_at ? ` bis ${new Date(done.ends_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}` : ' ohne Ablaufdatum'}.
          </span>
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy} disabled={clean.length !== 8} data-testid="redeem-submit">
        Einlösen
      </Button>
    </form>
  );
}

/** Einstellungen → Code einlösen */
export function RedeemSection() {
  return (
    <Section title="Code einlösen" icon={<Ticket />} tint={TINT.teal} hint="Codes bekommst du von deiner Lerngruppe oder von uns. Groß-/Kleinschreibung und Bindestrich sind egal.">
      <RedeemForm />
    </Section>
  );
}
