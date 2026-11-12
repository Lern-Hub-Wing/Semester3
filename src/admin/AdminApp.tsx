import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Ban, ChartColumn, Euro, MessageSquare, Crown, History, LogOut, RefreshCw, RotateCcw, Search, ShieldCheck, ShieldOff, Trash2, UserMinus, Users, UsersRound,
} from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { Ambient } from '../components/layout/Ambient';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Segmented } from '../components/ui/Segmented';
import { Toasts } from '../components/ui/Toasts';
import { toast } from '../store/toast';
import { config } from '../lib/config';
import { LoginScreen, MfaScreen, SetupScreen } from './AdminLogin';
import { FinanceSimulator } from './Finance';
import { Switch } from '../components/ui/Switch';
import {
  adminAuth, adminDb, euro, fmtDate, PLAN_LABEL, rpc, SOURCE_LABEL, type AdminGroup, type AdminUser, type Entitlement, type Stats,
} from './client';

type Phase = 'checking' | 'setup' | 'login' | 'mfa' | 'ready' | 'unconfigured';
const IDLE_MS = 30 * 60_000;

export function AdminApp() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [setupPossible, setSetupPossible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!config.isConfigured) return setPhase('unconfigured');
    const db = adminDb();
    const { data } = await db.auth.getSession();
    if (data.session) {
      const who = await rpc<{ is_admin: boolean; ok: boolean }>('admin_whoami').catch(() => null);
      if (!who?.is_admin) {
        await db.auth.signOut();
        setNotice('Dieses Konto hat keinen Admin-Zugang.');
        return setPhase('login');
      }
      return setPhase(who.ok ? 'ready' : 'mfa');
    }
    try {
      const s = await adminAuth<{ setup_done: boolean; setup_possible: boolean }>({ action: 'status' });
      setSetupPossible(s.setup_possible);
      setPhase(s.setup_done ? 'login' : 'setup');
    } catch (err) {
      setNotice((err as Error).message);
      setPhase('login');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const logout = useCallback(async () => {
    await adminDb().auth.signOut();
    setPhase('login');
  }, []);

  // Automatisch abmelden nach 30 Minuten ohne Bedienung
  useEffect(() => {
    if (phase !== 'ready') return;
    let t = setTimeout(() => void logout().then(() => setNotice('Aus Sicherheitsgründen nach 30 Minuten abgemeldet.')), IDLE_MS);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => void logout().then(() => setNotice('Aus Sicherheitsgründen nach 30 Minuten abgemeldet.')), IDLE_MS);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [phase, logout]);

  let body: ReactNode;
  if (phase === 'checking') body = <div className="grid min-h-dvh place-items-center"><LogoMark size={48} animate /></div>;
  else if (phase === 'unconfigured') body = <div className="grid min-h-dvh place-items-center p-6 text-center text-muted">Supabase ist für diese Ausgabe nicht konfiguriert.</div>;
  else if (phase === 'setup') body = <SetupScreen possible={setupPossible} onDone={() => (setNotice('Admin eingerichtet. Bitte jetzt anmelden.'), setPhase('login'))} />;
  else if (phase === 'login') body = <LoginScreen notice={notice} onDone={() => (setNotice(null), void check())} />;
  else if (phase === 'mfa') body = <MfaScreen onDone={() => void check()} onCancel={() => void logout()} />;
  else body = <Dashboard onLogout={() => void logout()} />;
  return (
    <>
      {body}
      <Toasts />
    </>
  );
}

// ---------------------------------------------------------------------

type Tab = 'overview' | 'finance' | 'users' | 'groups' | 'feedback' | 'audit';

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-[max(env(safe-area-inset-top),20px)] md:px-8">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <LogoMark size={34} />
          <div className="mr-auto">
            <p className="title text-[19px] leading-tight">StudySpace Admin</p>
            <p className="text-[12px] text-muted">angemeldet mit Zwei-Faktor</p>
          </div>
          <Button size="sm" icon={<LogOut className="size-4" />} onClick={onLogout}>
            Abmelden
          </Button>
        </header>
        <Segmented
          label="Bereich"
          value={tab}
          onChange={setTab}
          className="mb-6 w-full md:w-auto"
          options={[
            { value: 'overview', label: 'Übersicht', icon: <ChartColumn className="size-4" /> },
            { value: 'finance', label: 'Finanzen', icon: <Euro className="size-4" /> },
            { value: 'users', label: 'Benutzer', icon: <Users className="size-4" /> },
            { value: 'groups', label: 'Gruppen', icon: <UsersRound className="size-4" /> },
            { value: 'feedback', label: 'Feedback', icon: <MessageSquare className="size-4" /> },
            { value: 'audit', label: 'Protokoll', icon: <History className="size-4" /> },
          ]}
        />
        {tab === 'overview' && <Overview />}
        {tab === 'finance' && <FinanceTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'feedback' && <FeedbackTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-[24px] p-4 md:p-5 ${className}`}>{children}</div>;
}

function Stat({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="glass rounded-[20px] p-4" data-testid={testId}>
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="num mt-1 text-[24px] font-semibold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-faint">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-7 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted first:mt-0">{children}</h2>;
}

function Overview() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc<Stats>('admin_stats').then(setS, (e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  if (err) return <Card>Fehler: {err}</Card>;
  if (!s) return <Card>Lädt …</Card>;
  const noPay = !s.payments_connected;
  const max = Math.max(1, ...s.signups_by_day.map((d) => d.count));
  return (
    <div data-testid="admin-overview">
      <SectionTitle>Benutzer</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Benutzer gesamt" value={s.users_total} testId="stat-users" />
        <Stat label="Aktiv (7 Tage)" value={s.users_active_7d} />
        <Stat label="Gerade online" value={`≈ ${s.users_online_approx}`} sub="ungefähr: aktiv in den letzten 5 Min." />
        <Stat label="Neu (7 / 30 Tage)" value={`${s.users_new_7d} / ${s.users_new_30d}`} />
        <Stat label="Free-Nutzer" value={s.users_free} />
        <Stat label="Plus über Gruppe" value={s.users_plus_member} />
        <Stat label="Gesperrt" value={s.users_blocked} />
        <Stat label="Testphasen aktiv" value={s.trials_active} sub={`${s.trials_expired} beendet · ${s.trials_converted} gekauft`} testId="stat-trials" />
      </div>

      <SectionTitle>Gruppen & Tarife</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Lerngruppen" value={s.groups_total} sub={`${s.group_members_total} Mitglieder`} />
        <Stat label="Mit Gruppenpass" value={s.groups_plus} />
        <Stat label="Eigene Lernbereiche" value={s.solo_spaces} />
        <Stat label="Bezahlte Monatsabos" value={s.subscriptions_paid_active} />
        <Stat label="Bezahlte 6-Monats-Pässe" value={s.semester_passes_active} />
        <Stat label="Admin-Freischaltungen" value={s.grants_active} sub="kostenlos – kein Umsatz" testId="stat-grants" />
        <Stat label="Abgelaufen (30 Tage)" value={s.expired_30d} />
        <Stat label="Kündigungen (30 Tage)" value={s.cancellations_30d} />
      </div>

      <SectionTitle>Umsatz</SectionTitle>
      {noPay ? (
        <Card className="text-[14px] text-muted" >
          <p data-testid="revenue-none">
            <strong className="text-ink">Noch kein Zahlungssystem angebunden.</strong> Es werden keine Umsätze, kein MRR und keine Schätzwerte angezeigt. Admin-Freischaltungen zählen nie als Umsatz.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Umsatz gesamt" value={euro(s.revenue_cents_total)} sub="bezahlt abzüglich Erstattungen" />
          <Stat label="Umsatz 30 Tage" value={euro(s.revenue_cents_30d)} />
          <Stat label="MRR" value={euro(s.mrr_cents)} sub="laufende bezahlte Monatsabos" />
        </div>
      )}

      <SectionTitle>Beta-Käufe (simuliert)</SectionTitle>
      <BetaCard s={s} onChanged={load} />

      <SectionTitle>Neue Benutzer pro Tag (30 Tage)</SectionTitle>
      <Card>
        <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Neue Registrierungen pro Tag in den letzten 30 Tagen">
          {s.signups_by_day.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${fmtDate(d.day)}: ${d.count}`}>
              <div
                className="w-full rounded-t-[4px] bg-[var(--ss-accent)] transition-opacity group-hover:opacity-80"
                style={{ height: d.count ? `${Math.max(4, (d.count / max) * 100)}%` : 2, opacity: d.count ? 1 : 0.25 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-faint">
          <span>{fmtDate(s.signups_by_day[0]?.day)}</span>
          <span>heute</span>
        </div>
        <table className="sr-only">
          <caption>Neue Benutzer pro Tag</caption>
          <tbody>
            {s.signups_by_day.map((d) => (
              <tr key={d.day}>
                <td>{fmtDate(d.day)}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Systemstatus</SectionTitle>
      <SystemStatus dbTime={s.db_time} payments={s.payments_connected} onRefresh={load} />
    </div>
  );
}

function SystemStatus({ dbTime, payments, onRefresh }: { dbTime: string; payments: boolean; onRefresh: () => void }) {
  const [auth, setAuth] = useState<{ google: boolean; apple: boolean; email: boolean } | null>(null);
  useEffect(() => {
    fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseKey } })
      .then((r) => r.json())
      .then((x) => setAuth({ google: !!x.external?.google, apple: !!x.external?.apple, email: x.external?.email !== false }))
      .catch(() => setAuth(null));
  }, []);
  const item = (label: string, ok: boolean | null, text: string) => (
    <li className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[14px] first:border-t-0">
      <span>{label}</span>
      <span className={ok === null ? 'text-muted' : ok ? 'text-[#2FA58B]' : 'text-warn'}>{text}</span>
    </li>
  );
  return (
    <Card>
      <ul>
        {item('Datenbank', true, `erreichbar · ${fmtDate(dbTime, true)}`)}
        {item('Anmeldung E-Mail', auth ? auth.email : null, auth ? (auth.email ? 'aktiv' : 'aus') : 'unbekannt')}
        {item('Anmeldung Google', auth ? auth.google : null, auth ? (auth.google ? 'aktiv' : 'nicht eingerichtet') : 'unbekannt')}
        {item('Anmeldung Apple', auth ? auth.apple : null, auth ? (auth.apple ? 'aktiv' : 'nicht eingerichtet') : 'unbekannt')}
        {item('Zahlungen (Stripe / App Stores)', payments, payments ? 'Zahlungen vorhanden' : 'noch nicht angebunden')}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2" icon={<RefreshCw className="size-4" />} onClick={onRefresh}>
        Aktualisieren
      </Button>
    </Card>
  );
}

function BetaCard({ s, onChanged }: { s: Stats; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const plans = ['solo_monthly', 'solo_semester', 'group_monthly', 'group_semester'];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14.5px] font-semibold">Kauf simulieren in der App</p>
          <p className="text-[12.5px] text-muted">Nutzer können Tarife ohne Zahlung „kaufen“. Zählt nie als Umsatz.</p>
        </div>
        <Switch
          checked={s.beta_purchases_enabled}
          disabled={busy}
          label="Beta-Käufe erlauben"
          onChange={(on) => {
            setBusy(true);
            rpc('admin_set_config', { p_key: 'beta_purchases', p_value: on })
              .then(() => (toast.success(on ? 'Beta-Käufe eingeschaltet' : 'Beta-Käufe ausgeschaltet'), onChanged()), (e: Error) => toast.error(e.message))
              .finally(() => setBusy(false));
          }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {plans.map((p) => (
          <div key={p} className="rounded-2xl border border-line p-3">
            <p className="text-[12px] text-muted">{PLAN_LABEL[p]}</p>
            <p className="num text-[20px] font-semibold">{s.beta_by_plan?.[p] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 text-[13px] text-muted sm:grid-cols-3">
        <p>
          Simulierter Betrag gesamt: <strong className="num text-ink">{euro(s.beta_simulated_cents)}</strong>
        </p>
        <p>
          Simulierter MRR: <strong className="num text-ink">{euro(s.beta_mrr_cents)}</strong>
        </p>
        <p>
          Kündigungen (Beta): <strong className="num text-ink">{s.beta_cancellations}</strong>
        </p>
      </div>
    </Card>
  );
}

function FinanceTab() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    rpc<Stats>('admin_stats').then(setS, () => setS(null));
  }, []);
  return <FinanceSimulator stats={s} />;
}

// ---------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------

function useSearch<T>(fn: string) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<T[] | null>(null);
  const [page, setPage] = useState(0);
  const load = useCallback(() => {
    rpc<T[]>(fn, { p_search: q.trim(), p_limit: 50, p_offset: page * 50 }).then(setRows, (e: Error) => toast.error(e.message));
  }, [fn, q, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return { q, setQ: (v: string) => (setQ(v), setPage(0)), rows, load, page, setPage };
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative mb-4 block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input className="field !pl-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

function Pager({ total, page, setPage }: { total: number; page: number; setPage: (p: number) => void }) {
  const pages = Math.ceil(total / 50);
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[13px]">
      <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
        Zurück
      </Button>
      <span className="text-muted">
        Seite {page + 1} / {pages}
      </span>
      <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
        Weiter
      </Button>
    </div>
  );
}

function UsersTab() {
  const { q, setQ, rows, load, page, setPage } = useSearch<AdminUser>('admin_users');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div data-testid="admin-users">
      <SearchBar value={q} onChange={setQ} placeholder="Suche nach E-Mail, Name oder ID" />
      <Card className="!p-0">
        {!rows ? (
          <p className="p-5 text-muted">Lädt …</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-muted">Keine Benutzer gefunden.</p>
        ) : (
          <ul>
            {rows.map((u) => (
              <li key={u.id} className="border-t border-line first:border-t-0">
                <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-[color-mix(in_srgb,var(--ss-text)_4%,transparent)]" onClick={() => setOpen(u.id)}>
                  <span className={`size-2 shrink-0 rounded-full ${u.online ? 'bg-[#2FA58B]' : 'bg-[var(--ss-line)]'}`} title={u.online ? 'vermutlich online' : 'offline'} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{u.email ?? '–'}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {u.display_name ?? 'ohne Namen'} · {u.groups.length ? u.groups.map((g) => g.name).join(', ') : 'keine Gruppe'}
                    </span>
                  </span>
                  <span className="text-[12.5px] text-muted">{PLAN_LABEL[u.plan] ?? u.plan}</span>
                  {u.status === 'blocked' && <span className="rounded-full bg-[color-mix(in_srgb,var(--ss-danger)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-danger">gesperrt</span>}
                  {u.is_admin && <span className="rounded-full bg-[color-mix(in_srgb,var(--ss-accent)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-accent">Admin</span>}
                  <span className="num w-full text-[11.5px] text-faint sm:w-auto">
                    seit {fmtDate(u.created_at)} · zuletzt {fmtDate(u.last_sign_in_at, true)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {rows && rows[0] && <Pager total={rows[0].total} page={page} setPage={setPage} />}
      {open && <UserDetail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

interface UserDetailData {
  id: string;
  email: string;
  display_name: string | null;
  status: 'active' | 'blocked';
  plan: string;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  email_confirmed: boolean;
  providers: string[];
  is_admin: boolean;
  groups: { id: string; name: string; role: string; joined_at: string }[];
  entitlements: Entitlement[];
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2 text-[13.5px] first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="text-right [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

type Confirm = { title: string; text: string; action: string; danger?: boolean; typed?: string; run: (typed: string) => Promise<unknown> };

function ConfirmDialog({ c, onClose }: { c: Confirm | null; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setTyped(''), [c]);
  if (!c) return null;
  const ok = !c.typed || typed.trim().toLowerCase() === c.typed.toLowerCase();
  return (
    <Modal
      open
      onClose={onClose}
      title={c.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant={c.danger ? 'danger' : 'primary'}
            disabled={!ok}
            loading={busy}
            data-testid="admin-confirm"
            onClick={() => {
              setBusy(true);
              c.run(typed.trim())
                .then(() => onClose(), (e: Error) => toast.error(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {c.action}
          </Button>
        </>
      }
    >
      <p className="text-[14px] text-muted">{c.text}</p>
      {c.typed && <TextField className="mt-3" label={`Zur Bestätigung „${c.typed}“ eingeben`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
    </Modal>
  );
}

function GrantForm({ type, target, onDone }: { type: 'user' | 'group'; target: string; onDone: () => void }) {
  const [mode, setMode] = useState<'days' | 'until' | 'unlimited'>('days');
  const [days, setDays] = useState('30');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState<'plus_grant' | 'solo_grant'>('plus_grant');
  const [busy, setBusy] = useState(false);
  const valid = mode === 'unlimited' || (mode === 'days' ? Number(days) >= 1 && Number(days) <= 3660 : !!until && new Date(until) > new Date());
  const submit = () => {
    setBusy(true);
    rpc('admin_grant_plus', {
      p_target_type: type,
      p_target: target,
      p_days: mode === 'days' ? Number(days) : null,
      p_until: mode === 'until' ? new Date(`${until}T23:59:59`).toISOString() : null,
      p_note: note.trim() || null,
      p_plan: type === 'group' ? 'plus_grant' : plan,
    })
      .then(() => (toast.success('Plus freigeschaltet'), onDone()), (e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-3.5" data-testid="grant-form">
      <p className="text-[13px] font-semibold">Kostenlos freischalten {type === 'group' ? '(Gruppenpass für diese Gruppe)' : 'für das Konto'}</p>
      {type === 'user' && (
        <Segmented
          label="Tarif"
          size="sm"
          value={plan}
          onChange={setPlan}
          options={[
            { value: 'plus_grant', label: 'Gruppe' },
            { value: 'solo_grant', label: 'Solo' },
          ]}
        />
      )}
      <Segmented
        label="Dauer"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'days', label: 'Tage' },
          { value: 'until', label: 'Bis Datum' },
          { value: 'unlimited', label: 'Unbegrenzt' },
        ]}
      />
      {mode === 'days' && <TextField label="Anzahl Tage" type="number" min={1} max={3660} value={days} onChange={(e) => setDays(e.target.value)} />}
      {mode === 'until' && <TextField label="Gültig bis einschließlich" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}
      <TextField label="Notiz (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Testkonto, Beta" />
      <Button variant="primary" size="sm" icon={<Crown className="size-4" />} disabled={!valid} loading={busy} onClick={submit}>
        Freischalten
      </Button>
    </div>
  );
}

function Entitlements({ list, onChanged, ask }: { list: Entitlement[]; onChanged: () => void; ask: (c: Confirm) => void }) {
  if (list.length === 0) return <p className="text-[13px] text-muted">Keine Freischaltungen oder Käufe.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((e) => (
        <li key={e.id} className="rounded-2xl border border-line p-3 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{PLAN_LABEL[e.plan] ?? e.plan}</span>
            <span className={e.active ? 'text-[#2FA58B]' : 'text-muted'}>{e.active ? 'aktiv' : e.revoked_at ? 'widerrufen' : 'abgelaufen'}</span>
          </div>
          <p className="text-muted">
            {SOURCE_LABEL[e.source] ?? e.source} · ab {fmtDate(e.starts_at)} · {e.ends_at ? `bis ${fmtDate(e.ends_at)}` : 'unbegrenzt'}
            {e.note ? ` · ${e.note}` : ''}
          </p>
          {e.source === 'admin' && e.active && (
            <div className="mt-2 flex flex-wrap gap-2">
              {e.ends_at && (
                <Button size="sm" onClick={() => void rpc('admin_extend_plus', { p_entitlement: e.id, p_days: 30 }).then(() => (toast.success('Um 30 Tage verlängert'), onChanged()), (x: Error) => toast.error(x.message))}>
                  +30 Tage
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  ask({ title: 'Freischaltung widerrufen?', text: 'Plus endet sofort. Inhalte bleiben erhalten, sind aber nur noch lesbar.', action: 'Widerrufen', danger: true, run: async () => (await rpc('admin_revoke_plus', { p_entitlement: e.id }), onChanged()) })
                }
              >
                Widerrufen
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function UserDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [u, setU] = useState<UserDetailData | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const load = useCallback(() => {
    rpc<UserDetailData>('admin_user_detail', { p_user: id }).then(setU, (e: Error) => toast.error(e.message));
  }, [id]);
  useEffect(load, [load]);
  const changed = () => (load(), onChanged());
  return (
    <Modal open onClose={onClose} title={u?.email ?? 'Benutzer'} wide>
      {!u ? (
        <p className="text-muted">Lädt …</p>
      ) : (
        <div className="flex flex-col gap-5" data-testid="user-detail">
          <div>
            <Info label="Name">{u.display_name ?? '–'}</Info>
            <Info label="Tarif">{PLAN_LABEL[u.plan] ?? u.plan}</Info>
            <Info label="Status">{u.status === 'blocked' ? 'gesperrt' : 'aktiv'}</Info>
            <Info label="E-Mail bestätigt">{u.email_confirmed ? 'ja' : 'nein'}</Info>
            <Info label="Anmeldung über">{u.providers.join(', ') || '–'}</Info>
            <Info label="Registriert">{fmtDate(u.created_at, true)}</Info>
            <Info label="Letzte Anmeldung">{fmtDate(u.last_sign_in_at, true)}</Info>
            <Info label="Zuletzt aktiv (ungefähr)">{fmtDate(u.last_seen_at, true)}</Info>
            <Info label="Gruppen">{u.groups.length ? u.groups.map((g) => `${g.name}${g.role === 'owner' ? ' (Inhaber)' : ''}`).join(', ') : 'keine'}</Info>
            <Info label="ID">
              <code className="text-[12px]">{u.id}</code>
            </Info>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Tarife & Freischaltungen</p>
            <Entitlements list={u.entitlements} onChanged={changed} ask={setConfirm} />
          </div>
          {!u.is_admin && <GrantForm type="user" target={u.id} onDone={changed} />}
          {!u.is_admin && (
            <div className="flex flex-wrap gap-2">
              {u.status === 'active' ? (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Ban className="size-4" />}
                  onClick={() =>
                    setConfirm({ title: 'Konto sperren?', text: 'Alle Sitzungen werden sofort beendet; das Konto sieht keine Daten mehr, bis es entsperrt wird.', action: 'Sperren', danger: true, run: async () => (await rpc('admin_set_user_status', { p_user: u.id, p_status: 'blocked' }), changed()) })
                  }
                >
                  Sperren
                </Button>
              ) : (
                <Button size="sm" icon={<ShieldCheck className="size-4" />} onClick={() => void rpc('admin_set_user_status', { p_user: u.id, p_status: 'active' }).then(() => (toast.success('Entsperrt'), changed()), (e: Error) => toast.error(e.message))}>
                  Entsperren
                </Button>
              )}
              <Button
                size="sm"
                icon={<ShieldOff className="size-4" />}
                onClick={() => setConfirm({ title: 'Alle Sitzungen beenden?', text: 'Das Konto wird auf allen Geräten abgemeldet und muss sich neu anmelden.', action: 'Sitzungen beenden', run: async () => (await rpc('admin_revoke_sessions', { p_user: u.id }), toast.success('Sitzungen beendet'), changed()) })}
              >
                Sitzungen beenden
              </Button>
              <Button
                size="sm"
                icon={<RotateCcw className="size-4" />}
                onClick={() =>
                  setConfirm({
                    title: 'Testkonto zurücksetzen?',
                    text: 'Entfernt das Konto aus allen Gruppen (eigene Gruppen ohne weitere Mitglieder werden gelöscht), widerruft Admin-Freischaltungen und beendet alle Sitzungen. Das Konto selbst bleibt bestehen.',
                    action: 'Zurücksetzen',
                    danger: true,
                    typed: u.email,
                    run: async (t) => (await rpc('admin_reset_user', { p_user: u.id, p_confirm_email: t }), toast.success('Zurückgesetzt'), changed()),
                  })
                }
              >
                Zurücksetzen
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="size-4" />}
                onClick={() =>
                  setConfirm({
                    title: 'Konto endgültig löschen?',
                    text: 'Konto und Anmeldung werden gelöscht. Fortschritt in Gruppen bleibt anonym erhalten. Nicht umkehrbar.',
                    action: 'Endgültig löschen',
                    danger: true,
                    typed: u.email,
                    run: async (t) => (await rpc('admin_delete_user', { p_user: u.id, p_confirm_email: t }), toast.success('Konto gelöscht'), onChanged(), onClose()),
                  })
                }
              >
                Löschen
              </Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog c={confirm} onClose={() => setConfirm(null)} />
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Gruppen
// ---------------------------------------------------------------------

function GroupsTab() {
  const { q, setQ, rows, load, page, setPage } = useSearch<AdminGroup>('admin_groups');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div data-testid="admin-groups">
      <SearchBar value={q} onChange={setQ} placeholder="Suche nach Gruppenname, Inhaber-E-Mail oder ID" />
      <Card className="!p-0">
        {!rows ? (
          <p className="p-5 text-muted">Lädt …</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-muted">Keine Gruppen gefunden.</p>
        ) : (
          <ul>
            {rows.map((g) => (
              <li key={g.id} className="border-t border-line first:border-t-0">
                <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-[color-mix(in_srgb,var(--ss-text)_4%,transparent)]" onClick={() => setOpen(g.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{g.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{g.owner_email ?? 'ohne Inhaber'}</span>
                  </span>
                  <span className="num text-[12.5px] text-muted">{g.members}/8 Mitglieder</span>
                  <span className="num text-[12.5px] text-muted">
                    {g.homework}/50 HA · {g.study_entries}/100 Lerntage
                  </span>
                  <span className={`text-[12.5px] font-medium ${g.has_plus ? 'text-accent' : 'text-muted'}`}>{g.has_plus ? (g.plus_until ? `Plus bis ${fmtDate(g.plus_until)}` : 'Plus') : 'kein Plus'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {rows && rows[0] && <Pager total={rows[0].total} page={page} setPage={setPage} />}
      {open && <GroupDetail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

interface GroupDetailData {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
  has_plus: boolean;
  plus_until: string | null;
  members: { user_id: string; email: string | null; name: string; role: string; joined_at: string }[];
  usage: { homework: number; study_entries: number; exams: number; modules: number };
  entitlements: Entitlement[];
}

function GroupDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [g, setG] = useState<GroupDetailData | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const load = useCallback(() => {
    rpc<GroupDetailData>('admin_group_detail', { p_group: id }).then(setG, (e: Error) => toast.error(e.message));
  }, [id]);
  useEffect(load, [load]);
  const changed = () => (load(), onChanged());
  return (
    <Modal open onClose={onClose} title={g?.name ?? 'Gruppe'} wide>
      {!g ? (
        <p className="text-muted">Lädt …</p>
      ) : (
        <div className="flex flex-col gap-5" data-testid="group-detail">
          <div>
            <Info label="Plus">{g.has_plus ? (g.plus_until ? `bis ${fmtDate(g.plus_until)}` : 'unbegrenzt') : 'kein Plus'}</Info>
            <Info label="Erstellt">{fmtDate(g.created_at, true)}</Info>
            <Info label="Inhalte">
              {g.usage.modules} Fächer · {g.usage.exams} Prüfungen · {g.usage.homework}/50 Hausaufgaben · {g.usage.study_entries}/100 Lerntage
            </Info>
            <Info label="ID">
              <code className="text-[12px]">{g.id}</code>
            </Info>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Mitglieder ({g.members.length}/8)</p>
            <ul>
              {g.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 border-t border-line py-2 text-[13.5px] first:border-t-0">
                  <span className="min-w-0 flex-1 truncate">
                    {m.name} <span className="text-muted">· {m.email ?? '–'}</span>
                  </span>
                  {m.role === 'owner' ? (
                    <span className="text-[12px] font-semibold text-accent">Inhaber</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<UserMinus className="size-4" />}
                      onClick={() => setConfirm({ title: 'Mitglied entfernen?', text: `${m.name} verliert den Zugriff auf diese Gruppe.`, action: 'Entfernen', danger: true, run: async () => (await rpc('admin_remove_member', { p_group: g.id, p_user: m.user_id }), changed()) })}
                    >
                      Entfernen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Freischaltungen der Gruppe</p>
            <Entitlements list={g.entitlements} onChanged={changed} ask={setConfirm} />
          </div>
          <GrantForm type="group" target={g.id} onDone={changed} />
          <div>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() =>
                setConfirm({
                  title: 'Gruppe endgültig löschen?',
                  text: 'Alle Inhalte (Lernplan, Prüfungen, Hausaufgaben, Haken, Lernzeiten) dieser Gruppe werden gelöscht. Nicht umkehrbar.',
                  action: 'Gruppe löschen',
                  danger: true,
                  typed: g.name,
                  run: async (t) => (await rpc('admin_delete_group', { p_group: g.id, p_confirm_name: t }), toast.success('Gruppe gelöscht'), onChanged(), onClose()),
                })
              }
            >
              Gruppe löschen
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog c={confirm} onClose={() => setConfirm(null)} />
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Feedback aus der App
// ---------------------------------------------------------------------

const FEEDBACK_KIND: Record<string, string> = { bug: 'Fehler', idea: 'Idee', question: 'Frage', other: 'Sonstiges' };

function FeedbackTab() {
  type Row = { id: number; created_at: string; category: string; message: string; page: string | null; client: string | null; contact_ok: boolean; status: string; email: string | null; group_name: string | null };
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(() => {
    rpc<Row[]>('admin_feedback', { p_limit: 300 }).then(setRows, (e: Error) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <Card className="!p-0">
      {!rows ? (
        <p className="p-5 text-muted">Lädt …</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-muted">Noch kein Feedback.</p>
      ) : (
        <ul data-testid="admin-feedback">
          {rows.map((r) => (
            <li key={r.id} className={`flex flex-col gap-1.5 border-t border-line px-4 py-3 first:border-t-0 ${r.status === 'done' ? 'opacity-55' : ''}`}>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                <span className="rounded-full bg-[color-mix(in_srgb,var(--ss-accent)_14%,transparent)] px-2 py-0.5 font-semibold text-accent">{FEEDBACK_KIND[r.category] ?? r.category}</span>
                <span className="num">{fmtDate(r.created_at, true)}</span>
                {r.group_name && <span>· {r.group_name}</span>}
                {r.page && <span>· {r.page}</span>}
                <span className="ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void rpc('admin_feedback_status', { p_id: r.id, p_status: r.status === 'done' ? 'new' : 'done' }).then(load, (e: Error) => toast.error(e.message))}
                  >
                    {r.status === 'done' ? 'Wieder offen' : 'Erledigt'}
                  </Button>
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[14px]">{r.message}</p>
              {r.email ? (
                <a className="text-[12.5px] font-medium text-accent" href={`mailto:${r.email}?subject=${encodeURIComponent('Dein Feedback zu StudySpace')}`}>
                  Antworten an {r.email}
                </a>
              ) : (
                <p className="text-[12px] text-faint">Keine Antwort per E-Mail gewünscht.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  'admin.setup': 'Admin eingerichtet',
  'user.block': 'Konto gesperrt',
  'user.unblock': 'Konto entsperrt',
  'user.revoke_sessions': 'Sitzungen beendet',
  'user.reset': 'Konto zurückgesetzt',
  'user.delete': 'Konto gelöscht',
  'group.delete': 'Gruppe gelöscht',
  'group.remove_member': 'Mitglied entfernt',
  'plus.grant': 'Plus freigeschaltet',
  'plus.extend': 'Plus verlängert',
  'plus.revoke': 'Plus widerrufen',
};

function AuditTab() {
  const [rows, setRows] = useState<{ id: number; action: string; target_type: string | null; target_id: string | null; details: unknown; occurred_at: string }[] | null>(null);
  useEffect(() => {
    rpc<typeof rows>('admin_audit_log', { p_limit: 200 }).then(setRows, (e: Error) => toast.error(e.message));
  }, []);
  return (
    <Card className="!p-0" >
      {!rows ? (
        <p className="p-5 text-muted">Lädt …</p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-muted">Noch keine Admin-Aktionen.</p>
      ) : (
        <ul data-testid="admin-audit">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-line px-4 py-2.5 text-[13.5px] first:border-t-0">
              <span className="num w-36 shrink-0 text-[12px] text-muted">{fmtDate(r.occurred_at, true)}</span>
              <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-faint">
                {r.target_type} {r.target_id}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
