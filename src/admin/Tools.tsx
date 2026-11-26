import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Ban, Copy, FileUp, Mail, Share2, Ticket, UploadCloud } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { toast } from '../store/toast';
import { adminDb, fmtDate, rpc } from './client';
import { sendTestMail } from '../app/mailTest';

/** Adresse der App (Admin liegt unter …/app/admin/) */
export function appBase(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/admin\/?(index\.html)?$/, '');
}

function Card({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={`glass rounded-[20px] p-4 md:p-5 ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}
function Title({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-7 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted first:mt-0">{children}</h2>;
}

/** Teilen: System-Teilen (WhatsApp, AirDrop …), sonst kopieren */
async function share(text: string, url: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'StudySpace', text, url });
      return;
    }
  } catch {
    /* abgebrochen → kopieren */
  }
  await copy(`${text} ${url}`);
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Kopiert');
  } catch {
    toast.error('Kopieren nicht möglich – bitte markieren und kopieren.');
  }
}

// ---------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------
interface CodeRow {
  id: string;
  code: string;
  plan: 'solo_grant' | 'plus_grant';
  days: number | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
  revoked_at: string | null;
  redeemed_by: string[];
  member_name?: string | null;
}

const codeLink = (code: string) => `${appBase()}#/code/${code}`;
const planWord = (c: Pick<CodeRow, 'plan' | 'days'>) => `${c.plan === 'plus_grant' ? 'Gruppe' : 'Solo'}${c.days ? ` für ${c.days} Tage` : ' – Lifetime (ohne Ablauf)'}`;
const codeText = (c: Pick<CodeRow, 'plan' | 'days'>) =>
  `Dein StudySpace-Code: ${planWord(c)}. Einlösen in der App unter Einstellungen → Code einlösen oder direkt über den Link:`;
/** Nachricht für einen persönlichen Umzugs-Code */
const moveText = (name: string, c: Pick<CodeRow, 'plan' | 'days'>) =>
  `Hallo ${name}! StudySpace ist jetzt eine App. Leg dir ein Konto an (z. B. mit Google oder Apple) und löse deinen persönlichen Code ein – dann ist dein ganzer Fortschritt wieder da, und du bekommst ${c.days ? `${planWord(c)}` : 'Lifetime Access'} geschenkt:`;

export function CodesTab() {
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [plan, setPlan] = useState<'plus_grant' | 'solo_grant'>('plus_grant');
  const [days, setDays] = useState('30');
  const [uses, setUses] = useState('1');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<CodeRow[]>([]);
  const load = useCallback(() => {
    rpc<CodeRow[]>('admin_codes', { p_limit: 300 }).then(setRows, (e: Error) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const created = await rpc<CodeRow[]>('admin_create_codes', {
        p_plan: plan,
        p_days: days.trim() ? Number(days) : null,
        p_max_uses: Number(uses) || 1,
        p_count: Number(count) || 1,
        p_expires_at: null,
        p_note: note.trim() || null,
      });
      setFresh(created.map((c) => ({ ...c, redeemed_by: [] })));
      toast.success(created.length === 1 ? 'Code erstellt' : `${created.length} Codes erstellt`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-codes">
      <Title>Neue Codes</Title>
      <Card className="flex flex-col gap-3">
        <Segmented
          label="Tarif"
          value={plan}
          onChange={setPlan}
          options={[
            { value: 'plus_grant', label: 'Gruppe (alle Funktionen)' },
            { value: 'solo_grant', label: 'Solo' },
          ]}
        />
        {/* Schnellwahl der Laufzeit – Feld darunter bleibt frei einstellbar */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Laufzeit-Vorlagen" data-testid="codes-presets">
          {[
            { d: '7', l: '7 Tage' },
            { d: '14', l: '14 Tage' },
            { d: '30', l: '30 Tage' },
            { d: '182', l: '6 Monate' },
            { d: '', l: 'Lifetime' },
          ].map((o) => (
            <button key={o.l} type="button" aria-pressed={days === o.d} onClick={() => setDays(o.d)} className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${days === o.d ? 'bg-[var(--ss-accent)] text-[var(--ss-btn-text)]' : 'bg-[var(--ss-surface-2)] text-muted hover:text-ink'}`}>
              {o.l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <TextField label="Laufzeit (Tage)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 4))} hint="leer = Lifetime (ohne Ablauf)" />
          <TextField label="Einlösungen je Code" inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <TextField label="Anzahl Codes" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <TextField label="Notiz (intern)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Lerngruppe Semester 3" />
        </div>
        <Button variant="primary" icon={<Ticket className="size-4" />} loading={busy} onClick={() => void create()} data-testid="codes-create">
          Codes erstellen
        </Button>
        {fresh.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="codes-fresh">
            {fresh.map((c) => (
              <CodeShare key={c.id} c={c} />
            ))}
          </ul>
        )}
      </Card>

      <Title>Alle Codes</Title>
      <Card>
        {!rows ? (
          <p className="text-[14px] text-muted">Lädt …</p>
        ) : rows.length === 0 ? (
          <p className="text-[14px] text-muted">Noch keine Codes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--ss-line)]" data-testid="codes-list">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                <span className={`num font-mono font-semibold tracking-wider ${c.revoked_at ? 'text-faint line-through' : ''}`}>{c.code}</span>
                <span className="text-muted">
                  {c.plan === 'plus_grant' ? 'Gruppe' : 'Solo'} · {c.days ? `${c.days} Tage` : 'Lifetime'} · {c.uses}/{c.max_uses} eingelöst{c.member_name ? ` · Umzug: ${c.member_name}` : ''}
                </span>
                {c.note && <span className="text-faint">„{c.note}“</span>}
                <span className="ml-auto flex items-center gap-1.5">
                  {!c.revoked_at && c.uses < c.max_uses && (
                    <Button size="sm" icon={<Share2 className="size-4" />} onClick={() => void share(codeText(c), codeLink(c.code))}>
                      Senden
                    </Button>
                  )}
                  {!c.revoked_at && (
                    <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => void rpc('admin_revoke_code', { p_id: c.id }).then(() => (toast.success('Code gesperrt'), load()), (e: Error) => toast.error(e.message))}>
                      Sperren
                    </Button>
                  )}
                </span>
                {c.redeemed_by.length > 0 && <span className="w-full text-[12.5px] text-faint">Eingelöst von: {c.redeemed_by.join(', ')}</span>}
                <span className="w-full text-[12px] text-faint">erstellt {fmtDate(c.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CodeShare({ c }: { c: CodeRow }) {
  const link = codeLink(c.code);
  const text = codeText(c);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ss-surface-2)] px-3 py-2.5">
      <span className="num font-mono text-[17px] font-semibold tracking-[0.18em]">{c.code}</span>
      <span className="ml-auto flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Share2 className="size-4" />} onClick={() => void share(text, link)}>
          Senden
        </Button>
        <Button size="sm" icon={<Mail className="size-4" />} onClick={() => window.open(`mailto:?subject=${encodeURIComponent('Dein StudySpace-Code')}&body=${encodeURIComponent(`${text}\n${link}\n\nCode: ${c.code}`)}`)}>
          E-Mail
        </Button>
        <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => void copy(`${text} ${link}`)}>
          Kopieren
        </Button>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------
// Umzug von der bisherigen Seite
// ---------------------------------------------------------------------
interface MoveFile {
  format: string;
  exported_at?: string;
  tables: Record<string, Record<string, unknown>[]>;
}
interface ImportResult {
  group_id: string;
  invite_code: string;
  counts: Record<string, number>;
  attachments_skipped: number;
}
const LABELS: Record<string, string> = {
  members: 'Personen', modules: 'Fächer', module_topics: 'Themen', exams: 'Prüfungen', study_entries: 'Lerntage', tasks: 'Aufgaben',
  task_completions: 'Haken', homework: 'Hausaufgaben', homework_parts: 'Hausaufgaben-Schritte', homework_completions: 'Hausaufgaben-Haken',
  focus_sessions: 'Lernzeiten', music_tracks: 'Musiktitel', app_settings: 'Einstellungen',
};

export function MoveTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<MoveFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [email, setEmail] = useState('');
  const [member, setMember] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const members = (file?.tables.members ?? []) as { id: string; name: string; is_active?: boolean }[];

  const read = async (f: File) => {
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('Datei zu groß (höchstens 20 MB).');
      const data = JSON.parse(await f.text()) as MoveFile;
      if (!data || !['studyspace-umzug', 'studyspace-export'].includes(data.format) || !data.tables || !Array.isArray(data.tables.members)) throw new Error('Das ist keine Umzugsdatei der StudySpace-Seite.');
      setFile(data);
      setFileName(f.name);
      setResult(null);
      const appName = (data.tables.app_settings ?? []).find((r) => r.key === 'app_name')?.value;
      if (!name && typeof appName === 'string') setName(appName.slice(0, 60));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await rpc<ImportResult>('admin_import_site', { p_data: file, p_owner_email: email.trim(), p_owner_member: member, p_group_name: name.trim() });
      setResult(res);
      toast.success('Lerngruppe übernommen');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = result ? `${appBase()}#/beitreten/${result.invite_code}` : '';
  const ready = !!file && email.includes('@') && !!member && name.trim().length > 0;

  return (
    <div data-testid="admin-move">
      <Title>Lerngruppe von der Seite übernehmen</Title>
      <Card className="flex flex-col gap-3.5">
        <p className="text-[14px] leading-snug text-muted">
          Auf der Seite unter <b>Einstellungen → Umzug in die App</b> die Sicherheitskopie herunterladen und hier hochladen. Alles wird in eine neue Lerngruppe übernommen (Fächer, Prüfungen, Lernplan, Haken, Hausaufgaben, Lernzeiten, Musik, „Wer schreibt?“). Die Datei wird zusätzlich in der App-Datenbank gesichert; dieselbe Datei lässt sich nur einmal übernehmen.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} data-testid="move-file" />
        <Button icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>
          {file ? `Datei: ${fileName}` : 'Umzugsdatei wählen'}
        </Button>
        {file && (
          <>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] md:grid-cols-4" data-testid="move-preview">
              {Object.keys(LABELS).map((k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="text-muted">{LABELS[k]}</span>
                  <span className="num font-semibold">{file.tables[k]?.length ?? 0}</span>
                </li>
              ))}
            </ul>
            {(file.tables.attachments?.length ?? 0) > 0 && <p className="text-[12.5px] text-faint">{file.tables.attachments!.length} hochgeladene Dateien bleiben auf der Seite (die App hat keine Uploads).</p>}
            <TextField label="Name der Lerngruppe" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <TextField label="E-Mail deines App-Kontos (Inhaber)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="Das Konto muss in der App schon registriert sein." />
            <SelectField label="Wer bist du auf der Seite?" value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">Bitte wählen</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.is_active === false ? ' (inaktiv)' : ''}
                </option>
              ))}
            </SelectField>
            <Button variant="primary" icon={<UploadCloud className="size-4" />} loading={busy} disabled={!ready} onClick={() => void run()} data-testid="move-run">
              Jetzt übernehmen
            </Button>
          </>
        )}
      </Card>

      {result && (
        <>
          <Title>Fertig</Title>
          <Card className="flex flex-col gap-3" testId="move-result">
            <p className="text-[14px]">
              Übernommen:{' '}
              {Object.entries(result.counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${n} ${LABELS[k] ?? k}`)
                .join(' · ')}
            </p>
            <p className="text-[14px]">
              Einladungscode: <span className="num font-mono text-[17px] font-semibold tracking-[0.18em]">{result.invite_code.slice(0, 4)}-{result.invite_code.slice(4)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Share2 className="size-4" />} onClick={() => void share('Wir sind mit StudySpace in die App umgezogen! Konto anlegen, dann mit diesem Link beitreten und „Wer bist du?“ wählen:', inviteLink)}>
                Einladung senden
              </Button>
              <Button icon={<Copy className="size-4" />} onClick={() => void copy(inviteLink)}>
                Link kopieren
              </Button>
            </div>
            <p className="text-[12.5px] text-muted">Danach auf der Seite unter Einstellungen → Umzug in die App die Umleitung einschalten.</p>
          </Card>
        </>
      )}

      <MovePeople refreshKey={result?.group_id ?? ''} />
    </div>
  );
}

interface MovePerson {
  id: string;
  name: string;
  color: string;
  email: string | null;
  tasks_done: number;
  focus_minutes: number;
  code: { id: string; code: string; plan: 'plus_grant' | 'solo_grant'; days: number | null } | null;
}

/**
 * Persönliche Umzugs-Codes: je Person EIN Code. Einlösen = Lerngruppe beitreten,
 * eigene Person mit allem Fortschritt übernehmen und Zugang erhalten (Standard: Lifetime, Gruppe).
 */
function MovePeople({ refreshKey }: { refreshKey: string }) {
  const [groups, setGroups] = useState<{ id: string; name: string; open: number }[] | null>(null);
  const [gid, setGid] = useState('');
  const [people, setPeople] = useState<MovePerson[] | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [access, setAccess] = useState<'lifetime' | '30' | '14' | '7'>('lifetime');
  const [welcome, setWelcome] = useState('Danke, dass du StudySpace mit uns testest – dein Feedback macht die App jeden Tag besser!');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rpc<{ id: string; name: string; open: number }[]>('admin_move_groups')
      .then((g) => {
        setGroups(g);
        setGid((cur) => cur || g[0]?.id || '');
      })
      .catch(() => setGroups([]));
  }, [refreshKey]);
  const loadPeople = useCallback(() => {
    if (!gid) return setPeople(null);
    rpc<{ people: MovePerson[] }>('admin_move_people', { p_group: gid })
      .then((r) => {
        setPeople(r.people);
        setPick(r.people.filter((p) => !p.email && !p.code).map((p) => p.id));
      })
      .catch((e: Error) => toast.error(e.message));
  }, [gid]);
  useEffect(loadPeople, [loadPeople]);

  const create = async () => {
    setBusy(true);
    try {
      await rpc('admin_create_move_codes', { p_group: gid, p_members: pick, p_plan: 'plus_grant', p_days: access === 'lifetime' ? null : Number(access), p_welcome: welcome.trim() || null });
      toast.success(pick.length === 1 ? 'Code erstellt' : `${pick.length} Codes erstellt`);
      loadPeople();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!groups || groups.length === 0) return null;
  return (
    <>
      <Title>Persönliche Codes – Fortschritt mitnehmen</Title>
      <Card className="flex flex-col gap-3.5" testId="move-people">
        <p className="text-[14px] leading-snug text-muted">
          Jede Person bekommt einen eigenen Code. Beim Einlösen tritt sie der Lerngruppe bei, ist sofort mit ihrer bisherigen Person verbunden (Haken, Hausaufgaben, Lernzeiten) und bekommt den Zugang freigeschaltet – mit persönlicher Begrüßung.
        </p>
        {groups.length > 1 && (
          <SelectField label="Lerngruppe" value={gid} onChange={(e) => setGid(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.open} offen)
              </option>
            ))}
          </SelectField>
        )}
        {!people ? (
          <p className="text-[14px] text-muted">Lädt …</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {people.map((p) => {
              const linked = !!p.email;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[var(--ss-surface-2)] px-3 py-2.5" data-testid="move-person">
                  <label className={`flex min-w-0 flex-1 items-center gap-3 ${linked ? '' : 'cursor-pointer'}`}>
                    <input type="checkbox" className="size-5 accent-[var(--ss-accent)]" disabled={linked} checked={pick.includes(p.id)} onChange={(e) => setPick(e.target.checked ? [...pick, p.id] : pick.filter((x) => x !== p.id))} aria-label={`Code für ${p.name}`} />
                    <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block text-[12.5px] text-muted">
                        {p.tasks_done} Haken · {Math.round(p.focus_minutes / 6) / 10} h Lernzeit · {linked ? `verbunden mit ${p.email}` : p.code ? 'Code offen' : 'noch ohne Konto'}
                      </span>
                    </span>
                  </label>
                  {!linked && p.code && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="num font-mono text-[15px] font-semibold tracking-[0.16em]" data-testid="move-person-code">{p.code.code}</span>
                      <Button size="sm" icon={<Share2 className="size-4" />} onClick={() => void share(moveText(p.name, p.code!), codeLink(p.code!.code))}>
                        Senden
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => void copy(`${moveText(p.name, p.code!)} ${codeLink(p.code!.code)}`)}>
                        Kopieren
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Segmented
          label="Zugang"
          value={access}
          onChange={setAccess}
          options={[
            { value: 'lifetime', label: 'Lifetime' },
            { value: '30', label: '30 Tage' },
            { value: '14', label: '14 Tage' },
            { value: '7', label: '7 Tage' },
          ]}
        />
        <TextField label="Persönliche Nachricht in der Begrüßung (optional)" value={welcome} maxLength={500} onChange={(e) => setWelcome(e.target.value)} />
        <Button variant="primary" icon={<Ticket className="size-4" />} loading={busy} disabled={pick.length === 0} onClick={() => void create()} data-testid="move-codes-create">
          {pick.length === 0 ? 'Personen wählen' : `${pick.length} ${pick.length === 1 ? 'Code' : 'Codes'} erstellen`}
        </Button>
        <p className="text-[12.5px] text-faint">Ein neuer Code für dieselbe Person ersetzt den alten. Codes funktionieren genau einmal.</p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------
// Impressum
// ---------------------------------------------------------------------
type ImprintForm = { name: string; street: string; city: string; country: string; email: string; phone: string; responsible: string; vat_id: string };
const EMPTY: ImprintForm = { name: '', street: '', city: '', country: '', email: '', phone: '', responsible: '', vat_id: '' };

export function LegalTab() {
  const [f, setF] = useState<ImprintForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    rpc<{ imprint: Partial<ImprintForm> | null }>('app_legal_info')
      .then((r) => setF({ ...EMPTY, ...(r?.imprint ?? {}) }))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  const set = (k: keyof ImprintForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const value = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      await rpc('admin_set_config', { p_key: 'legal_imprint', p_value: value });
      toast.success('Impressum gespeichert');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="admin-legal">
      <Title>Impressum (Anbieter)</Title>
      <Card className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-snug text-muted">
          Diese Angaben erscheinen in der App unter Einstellungen → Rechtliches → Impressum und sind gesetzlich vorgeschrieben (§ 5 DDG). Nutzungsbedingungen, Datenschutz und Widerruf sind als Vorlage in der App hinterlegt – bitte vor dem Start mit Zahlungen rechtlich prüfen lassen.
        </p>
        {!loaded ? (
          <p className="text-[14px] text-muted">Lädt …</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Name / Firma *" value={f.name} maxLength={200} onChange={set('name')} />
            <TextField label="E-Mail *" type="email" value={f.email} maxLength={200} onChange={set('email')} />
            <TextField label="Straße und Hausnummer *" value={f.street} maxLength={200} onChange={set('street')} />
            <TextField label="PLZ und Ort *" value={f.city} maxLength={200} onChange={set('city')} />
            <TextField label="Land" value={f.country} maxLength={200} onChange={set('country')} />
            <TextField label="Telefon" value={f.phone} maxLength={200} onChange={set('phone')} />
            <TextField label="Verantwortlich für den Inhalt" value={f.responsible} maxLength={200} onChange={set('responsible')} hint="leer = wie Name" />
            <TextField label="Umsatzsteuer-ID" value={f.vat_id} maxLength={200} onChange={set('vat_id')} />
          </div>
        )}
        <Button variant="primary" loading={busy} disabled={!f.name.trim() || !f.email.trim() || !f.street.trim() || !f.city.trim()} onClick={() => void save()} data-testid="legal-save">
          Speichern
        </Button>
      </Card>
    </div>
  );
}

/** E-Mail-Versand testen: Beispiel „Dein Anmeldecode“ über das eigene Gmail-Konto (Edge Function app-mail-test) */
export function MailTab() {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    try {
      const sent = await sendTestMail(adminDb(), to);
      setLast(sent);
      toast.success(`Test-E-Mail an ${sent} verschickt`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col">
      <Title>E-Mail testen</Title>
      <Card className="flex flex-col gap-3" testId="admin-mail-test">
        <p className="text-[13.5px] text-muted">
          Verschickt eine Beispiel-E-Mail „Dein Anmeldecode“ im StudySpace-Design – über euer eigenes Gmail-Konto statt über Supabase. Voraussetzung: Die Secrets <code>GMAIL_USER</code> und <code>GMAIL_APP_PASSWORD</code> sind in Supabase eingetragen und die Funktion „app-mail-test“ ist bereitgestellt (docs/APP.md, Abschnitt E-Mail).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField label="An E-Mail-Adresse" type="email" inputMode="email" autoComplete="email" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1" placeholder="name@beispiel.de" />
          <Button variant="primary" icon={<Mail className="size-4" />} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(to.trim())} onClick={() => void send()}>
            Senden
          </Button>
        </div>
        {last && <p className="text-[12.5px] text-muted">Zuletzt verschickt an {last}. Schau auch im Spam-Ordner nach.</p>}
      </Card>
    </div>
  );
}
