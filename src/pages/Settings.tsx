import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive, ArrowDown, Crown, UserRound, Pencil, Bell, BellRing, ArrowLeft, BookOpen, ArrowUp, CircleDot, Download, History, Info, Monitor, Moon, Music2, Palette, Plus, RotateCcw, ShieldAlert, Sun, Trash2, Upload, UserMinus, Users,
} from 'lucide-react';
import type { Member, Module } from '../lib/types';
import { config, LIMITS } from '../lib/config';
import { validateImport, type ValidationResult } from '../lib/backup';
import { Link } from '../lib/router';
import { isHapticsSupported } from '../lib/haptics';
import { useData, useSyncStatus } from '../store/data';
import { useAllMembers, useAppName, useModules } from '../store/derived';
import { usePrefs } from '../store/prefs';
import { reorderMembers, reorderModules, restoreModule, setMemberActive, setSetting, updateMember, updateModule, archiveModule } from '../store/actions';
import { createExport, downloadJson, runImport } from '../store/backup';
import { resync } from '../store/sync';
import { toast } from '../store/toast';
import { useDebouncedCallback } from '../hooks/useDebounced';
import { PageHeader } from '../components/layout/AppShell';
import { ListGroup, ListRow } from '../components/ui/List';
import { ProfileCard } from '../components/layout/ProfileCard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { NotificationSettings } from './NotificationSettings';
import { initPush, usePush } from '../store/push';
import { useMusic } from '../store/music';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Switch } from '../components/ui/Switch';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { Menu } from '../components/ui/Menu';
import { ColorPicker } from '../components/ui/ColorPicker';
import { AddMemberDialog, MemberColorEditor } from './Team';
import { ModuleEditor } from './Modules';
import { StatusPill } from '../components/layout/StatusPill';
import { Row, Section } from '../components/ui/SettingsCard';
import { IS_APP } from '../lib/edition';
import { AccountSection, GroupSection, PlusSection } from '../app/AccountSettings';
import { useAccount } from '../app/account';
import { myPlanLabel } from '../app/api';

const SECTIONS = {
  konto: { title: 'Konto', render: () => <AccountSection /> },
  gruppe: { title: 'Lerngruppe', render: () => <GroupSection /> },
  plus: { title: 'Tarif & Abo', render: () => <PlusSection /> },
  darstellung: { title: 'Darstellung & Bedienung', render: () => <Appearance /> },
  personen: { title: 'Personen', render: () => <People /> },
  faecher: { title: 'Fächer', render: () => <ModulesSection /> },
  daten: { title: 'Sicherung & Import', render: () => <DataSection /> },
  info: { title: 'Über StudySpace', render: () => <General /> },
} as const;
type SectionKey = keyof typeof SECTIONS;
/** Bisherige Seite: ohne Konto/Gruppe/Plus. App: ohne Personen (kommen per Einladung) und ohne Import. */
const AVAILABLE: SectionKey[] = IS_APP ? ['konto', 'gruppe', 'plus', 'darstellung', 'faecher', 'info'] : ['darstellung', 'personen', 'faecher', 'daten', 'info'];
const isSection = (k: string | undefined): k is SectionKey => !!k && (AVAILABLE as string[]).includes(k);

/**
 * Einstellungen: ruhige Übersicht als gruppierte Liste; jede Kategorie ist
 * eine eigene Seite. Auf großen Bildschirmen steht die Liste links und die
 * gewählte Kategorie rechts daneben.
 */
export function Settings({ section }: { section?: string }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  if (section === 'benachrichtigungen' && !IS_APP) return <NotificationSettings />;
  const key = isSection(section) ? section : null;

  if (!wide) {
    if (!key)
      return (
        <div>
          <PageHeader title="Einstellungen" />
          <SettingsNav />
        </div>
      );
    return (
      <div data-testid={`settings-${key}`}>
        <Link to="/einstellungen" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Einstellungen
        </Link>
        <h1 className="display mb-5 text-[28px]">{SECTIONS[key].title}</h1>
        {SECTIONS[key].render()}
      </div>
    );
  }

  const active = key ?? (IS_APP ? 'konto' : 'darstellung');
  return (
    <div>
      <PageHeader title="Einstellungen" />
      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-8">
        <div className="sticky top-[84px]">
          <SettingsNav active={active} />
        </div>
        <div data-testid={`settings-${active}`}>
          <h2 className="title mb-4 text-[22px]">{SECTIONS[active].title}</h2>
          {SECTIONS[active].render()}
        </div>
      </div>
    </div>
  );
}

const PUSH_LABEL: Record<string, string> = {
  loading: '…',
  on: 'An',
  off: 'Aus',
  working: '…',
  denied: 'Blockiert',
  'needs-install': 'Einrichten',
  unsupported: 'Nicht verfügbar',
  'not-configured': 'Nicht verfügbar',
};

/** Übersicht aller Einstellungen als gruppierte Liste mit dem jeweils aktuellen Stand */
function SettingsNav({ active }: { active?: SectionKey }) {
  if (IS_APP) return <AppSettingsNav active={active} />;
  return <SiteSettingsNav active={active} />;
}

/** App: Konto, Lerngruppe und Plus zuerst; keine Push-Anbindung, keine Personenverwaltung. */
function AppSettingsNav({ active }: { active?: SectionKey }) {
  const theme = usePrefs((s) => s.theme);
  const modules = useModules();
  const me = useAccount((s) => s.me);
  const email = useAccount((s) => s.session?.user.email);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const musicAvailable = useMusic((s) => s.available);
  const tracks = useMusic((s) => Object.values(s.tracks).filter((t) => !t.deleted_at).length);
  const row = (k: SectionKey) => ({ to: `/einstellungen/${k}`, active: active === k });
  return (
    <nav aria-label="Einstellungen" className="flex flex-col gap-5" data-testid="settings-nav">
      <ProfileCard />
      <ListGroup title="Konto">
        <ListRow icon={<UserRound />} tint="#6F7BF7" label="Konto" value={email} {...row('konto')} testId="settings-account" />
        <ListRow icon={<Users />} tint="#2FA58B" label={group?.kind === 'solo' ? 'Lernbereich' : 'Lerngruppe'} value={group?.kind === 'solo' ? 'alleine' : group?.name} {...row('gruppe')} testId="settings-group" />
        <ListRow icon={<Crown />} tint="#B57BF0" label="Tarif & Abo" value={me ? myPlanLabel(me) : undefined} {...row('plus')} testId="settings-plus" />
      </ListGroup>
      <ListGroup title="Dieses Gerät">
        <ListRow icon={<Palette />} tint="#7C6FF0" label="Darstellung & Bedienung" value={theme === 'system' ? 'System' : theme === 'dark' ? 'Dunkel' : 'Hell'} {...row('darstellung')} />
      </ListGroup>
      <ListGroup title="Lernen">
        <ListRow icon={<BookOpen />} tint="#3D8BE0" label="Fächer" value={modules.length} {...row('faecher')} />
        <ListRow icon={<Music2 />} tint="#E0559A" label="Musik-Bibliothek" value={musicAvailable === false ? 'nicht verfügbar' : `${tracks} Titel`} to="/musik" testId="settings-music" />
      </ListGroup>
      <ListGroup title="Daten">
        <ListRow icon={<Trash2 />} tint="#E5484D" label="Papierkorb" to="/papierkorb" />
        <ListRow icon={<History />} tint="#7A8499" label="Änderungsverlauf" to="/verlauf" />
      </ListGroup>
      <ListGroup>
        <ListRow icon={<Info />} tint="#8E8E93" label="Über StudySpace" value={config.version} {...row('info')} />
      </ListGroup>
    </nav>
  );
}

function SiteSettingsNav({ active }: { active?: SectionKey }) {
  const phase = usePush((s) => s.phase);
  const theme = usePrefs((s) => s.theme);
  const members = useAllMembers();
  const modules = useModules();
  const musicAvailable = useMusic((s) => s.available);
  const tracks = useMusic((s) => Object.values(s.tracks).filter((t) => !t.deleted_at).length);
  useEffect(() => {
    void initPush();
  }, []);
  const activeMembers = members.filter((m) => m.is_active).length;
  const row = (k: SectionKey) => ({ to: `/einstellungen/${k}`, active: active === k });
  return (
    <nav aria-label="Einstellungen" className="flex flex-col gap-5" data-testid="settings-nav">
      <ProfileCard />
      <ListGroup title="Dieses Gerät">
        <ListRow
          icon={phase === 'on' ? <BellRing /> : <Bell />}
          tint={phase === 'on' ? '#2FA58B' : '#E5484D'}
          label="Benachrichtigungen"
          value={PUSH_LABEL[phase]}
          to="/einstellungen/benachrichtigungen"
          testId="settings-push"
        />
        <ListRow icon={<Palette />} tint="#7C6FF0" label="Darstellung & Bedienung" value={theme === 'system' ? 'System' : theme === 'dark' ? 'Dunkel' : 'Hell'} {...row('darstellung')} />
      </ListGroup>
      <ListGroup title="Lerngruppe">
        <ListRow icon={<Users />} tint="#2FA58B" label="Personen" value={activeMembers} {...row('personen')} />
        <ListRow icon={<BookOpen />} tint="#3D8BE0" label="Fächer" value={modules.length} {...row('faecher')} />
        <ListRow icon={<Music2 />} tint="#E0559A" label="Musik-Bibliothek" value={musicAvailable === false ? 'nicht eingerichtet' : `${tracks} Titel`} to="/musik" testId="settings-music" />
      </ListGroup>
      <ListGroup title="Daten">
        <ListRow icon={<Download />} tint="#F08A24" label="Sicherung & Import" {...row('daten')} />
        <ListRow icon={<Trash2 />} tint="#E5484D" label="Papierkorb" to="/papierkorb" />
        <ListRow icon={<History />} tint="#7A8499" label="Änderungsverlauf" to="/verlauf" />
      </ListGroup>
      <ListGroup>
        <ListRow icon={<Info />} tint="#8E8E93" label="Über StudySpace" value={config.version} {...row('info')} />
      </ListGroup>
    </nav>
  );
}

function Appearance() {
  const prefs = usePrefs();
  return (
    <Section title="Erscheinungsbild" icon={<Palette />} hint="Diese Einstellungen gelten nur für dieses Gerät.">
      <Row label="Darstellung" hint="System übernimmt die Geräteeinstellung.">
        <Segmented
          label="Darstellung"
          value={prefs.theme}
          onChange={(theme) => prefs.set({ theme })}
          options={[
            { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
            { value: 'light', label: 'Hell', icon: <Sun className="size-4" /> },
            { value: 'dark', label: 'Dunkel', icon: <Moon className="size-4" /> },
          ]}
        />
      </Row>
      <Row label="Fortschrittsanzeige">
        <Segmented
          label="Fortschrittsanzeige"
          value={prefs.progressStyle}
          onChange={(progressStyle) => prefs.set({ progressStyle })}
          options={[
            { value: 'ring', label: 'Kreise' },
            { value: 'bar', label: 'Balken' },
          ]}
        />
      </Row>
      <Row label="Animationen" hint="„System“ beachtet „Bewegung reduzieren“ des Geräts.">
        <Segmented
          label="Animationen"
          value={prefs.motion}
          onChange={(motion) => prefs.set({ motion })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'reduced', label: 'Reduziert' },
            { value: 'full', label: 'Voll' },
          ]}
        />
      </Row>
      <Row label="Transparenz" hint="„Einfach“ zeigt Leisten ohne Unschärfe – spart Leistung auf älteren Geräten.">
        <Segmented
          label="Transparenz"
          value={prefs.glass}
          onChange={(glass) => prefs.set({ glass })}
          options={[
            { value: 'auto', label: 'Automatisch' },
            { value: 'reduced', label: 'Einfach' },
          ]}
        />
      </Row>
      <Row inline label="Kompakte Darstellung" hint="Kleinere Abstände und Schrift.">
        <Switch label="Kompakte Darstellung" checked={prefs.compact} onChange={(compact) => prefs.set({ compact })} />
      </Row>
      <Row inline label="Klänge" hint="Leise Töne beim Antippen, Auswählen und Abhaken. Auf dem iPhone gilt der Stummschalter.">
        <Switch label="Klänge" checked={prefs.sounds} onChange={(sounds) => prefs.set({ sounds })} />
      </Row>
      {/* Nur anzeigen, wo das Gerät wirklich vibrieren kann (z. B. Android). iOS Safari unterstützt die Vibration API nicht. */}
      {isHapticsSupported() && (
        <Row inline label="Haptisches Feedback" hint="Kurze, dezente Vibration bei wichtigen Aktionen.">
          <Switch label="Haptisches Feedback" checked={prefs.haptics} onChange={(haptics) => prefs.set({ haptics })} />
        </Row>
      )}
    </Section>
  );
}

function General() {
  const appName = useAppName();
  const [name, setName] = useState(appName);
  const lastSyncAt = useData((s) => s.lastSyncAt);
  const realtime = useSyncStatus((s) => s.realtime);
  const host = (() => {
    try {
      return new URL(config.supabaseUrl).host;
    } catch {
      return '—';
    }
  })();
  return (
    <Section title="Allgemein" icon={<Info />}>
      <Row label="App-Name" hint="Gilt für alle.">
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== appName) void setSetting('app_name', name.trim());
          }}
        >
          <input className="field !min-h-9 min-w-0 flex-1 !py-1.5 sm:!w-44 sm:flex-none" aria-label="App-Name" value={name} maxLength={LIMITS.appName} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" type="submit">
            Speichern
          </Button>
        </form>
      </Row>
      <Row label="Version">
        <span className="num text-sm text-muted">
          {config.version}
          {config.buildTime && ` · ${new Date(config.buildTime).toLocaleDateString('de-DE')}`}
        </span>
      </Row>
      <Row label="Verbindung" hint={`Datenbank: ${host} · Live-Sync: ${realtime === 'live' ? 'aktiv' : realtime === 'connecting' ? 'verbindet' : 'unterbrochen'}`}>
        <div className="flex items-center gap-2">
          <StatusPill />
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => void resync().then(() => toast.success('Daten neu geladen'))}>
            Neu laden
          </Button>
        </div>
      </Row>
      <Row label="Zuletzt synchronisiert">
        <span className="text-sm text-muted">{lastSyncAt ? new Date(lastSyncAt).toLocaleString('de-DE') : '—'}</span>
      </Row>
      <div className="mt-2 rounded-2xl bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] p-4 text-xs leading-relaxed text-muted">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <ShieldAlert className="size-4" aria-hidden /> Öffentlicher Zugriff
        </p>
        StudySpace hat bewusst keine Anmeldung. Jede Person mit dem Link kann alle Inhalte sehen und bearbeiten. Die Profilauswahl ist keine
        Identitätsprüfung – Einträge im Verlauf („von Person X“) sind daher nicht verifiziert. Bitte keine vertraulichen oder sensiblen Dokumente
        speichern. Gelöschte Inhalte landen im Papierkorb und lassen sich wiederherstellen; regelmäßige Exporte schützen zusätzlich.
      </div>
    </Section>
  );
}

function People() {
  const members = useAllMembers();
  const [adding, setAdding] = useState(false);
  const [colorFor, setColorFor] = useState<Member | null>(null);
  const [renaming, setRenaming] = useState<Member | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const ids = members.map((m) => m.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorderMembers(ids);
  };
  return (
    <Section title="Personen" icon={<CircleDot />} hint="Namen, Farben und Reihenfolge gelten für alle. Deaktivierte Personen erscheinen nicht mehr in der Auswahl; ihre Haken bleiben erhalten.">
      <ul className="-my-1 flex flex-col">
        {members.map((m, i) => (
          <li key={m.id} className={`flex min-h-[56px] items-center gap-3 border-t border-line py-2 first:border-t-0 ${m.is_active ? '' : 'opacity-60'}`} data-testid="settings-person">
            <button type="button" onClick={() => setColorFor(m)} aria-label={`Farbe von ${m.name} ändern`} className="shrink-0 rounded-full">
              <Avatar name={m.name} color={m.color} size={38} dimmed={!m.is_active} />
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{m.name}</span>
              <span className="block text-[12.5px] text-muted">{m.is_active ? 'aktiv' : 'deaktiviert'}</span>
            </span>
            <Menu
              label={`Aktionen für ${m.name}`}
              items={[
                { label: 'Umbenennen', icon: <Pencil />, onSelect: () => setRenaming(m) },
                { label: 'Farbe ändern', icon: <Palette />, onSelect: () => setColorFor(m) },
                { label: 'Nach oben', icon: <ArrowUp />, onSelect: () => move(i, -1), hidden: i === 0 },
                { label: 'Nach unten', icon: <ArrowDown />, onSelect: () => move(i, 1), hidden: i === members.length - 1 },
                m.is_active
                  ? { label: 'Deaktivieren', icon: <UserMinus />, danger: true, onSelect: () => void setMemberActive(m.id, false) }
                  : { label: 'Wieder aktivieren', icon: <RotateCcw />, onSelect: () => void setMemberActive(m.id, true) },
              ]}
            />
          </li>
        ))}
      </ul>
      <Button className="mt-3" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
        Person hinzufügen
      </Button>
      <AddMemberDialog open={adding} onClose={() => setAdding(false)} />
      <Modal open={!!colorFor} onClose={() => setColorFor(null)} title={colorFor ? `Farbe von ${colorFor.name}` : ''}>
        {colorFor && <MemberColorEditor member={colorFor} />}
      </Modal>
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Umbenennen" description="Der neue Name gilt für alle; Haken und Verlauf bleiben erhalten.">
        {renaming && <MemberNameInput member={renaming} onDone={() => setRenaming(null)} />}
      </Modal>
    </Section>
  );
}

function MemberNameInput({ member, onDone }: { member: Member; onDone?: () => void }) {
  const [name, setName] = useState(member.name);
  const [lastName, setLastName] = useState(member.name);
  if (member.name !== lastName) {
    setLastName(member.name);
    setName(member.name);
  }
  return (
    <input
      className="field !min-h-9 min-w-0 flex-1 !py-1.5"
      value={name}
      maxLength={LIMITS.memberName}
      aria-label={`Name von ${member.name}`}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        const n = name.trim();
        if (!n) return setName(member.name);
        if (n !== member.name) void updateMember(member.id, { name: n }, member.version);
        onDone?.();
      }}
      data-autofocus
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function ModulesSection() {
  const modules = useModules();
  const all = useModules(true);
  const archived = all.filter((m) => m.archived_at);
  const [editing, setEditing] = useState<Module | 'new' | null>(null);
  const [colorFor, setColorFor] = useState<Module | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const ids = modules.map((m) => m.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorderModules(ids);
  };
  return (
    <Section title="Fächer" icon={<Archive />} hint="Reihenfolge und Farben gelten für alle. Archivierte Fächer zählen nicht zum Fortschritt und lassen sich jederzeit wiederherstellen.">
      <ul className="-my-1 flex flex-col">
        {modules.map((m, i) => (
          <li key={m.id} className="flex min-h-[56px] items-center gap-3 border-t border-line py-2 first:border-t-0" data-testid="settings-subject">
            <button type="button" aria-label={`Farbe von ${m.name} ändern`} onClick={() => setColorFor(m)} className="size-9 shrink-0 rounded-xl" style={{ background: m.color }} />
            <button type="button" onClick={() => setEditing(m)} className="min-w-0 flex-1 text-left text-[15px] font-medium leading-snug">
              {m.name}
            </button>
            <Menu
              label={`Aktionen für ${m.name}`}
              items={[
                { label: 'Bearbeiten', icon: <Pencil />, onSelect: () => setEditing(m) },
                { label: 'Farbe ändern', icon: <Palette />, onSelect: () => setColorFor(m) },
                { label: 'Nach oben', icon: <ArrowUp />, onSelect: () => move(i, -1), hidden: i === 0 },
                { label: 'Nach unten', icon: <ArrowDown />, onSelect: () => move(i, 1), hidden: i === modules.length - 1 },
                { label: 'Archivieren', icon: <Archive />, danger: true, onSelect: () => void archiveModule(m.id) },
              ]}
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          Fach hinzufügen
        </Button>
        <Link to="/faecher" className="inline-flex h-11 items-center rounded-2xl px-4 text-sm font-medium text-accent hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]">
          Prüfungstermine bei den Fächern
        </Link>
      </div>
      {archived.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Archiviert</p>
          <ul className="flex flex-col gap-1.5">
            {archived.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className="size-3 rounded-full" style={{ background: m.color }} aria-hidden />
                <span className="flex-1 truncate text-muted">{m.name}</span>
                <Button size="sm" variant="ghost" onClick={() => void restoreModule(m.id)}>
                  Wiederherstellen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ModuleEditor value={editing} onClose={() => setEditing(null)} />
      <Modal open={!!colorFor} onClose={() => setColorFor(null)} title={colorFor ? `Farbe von ${colorFor.name}` : ''}>
        {colorFor && <ModuleColorEditor module={colorFor} />}
      </Modal>
    </Section>
  );
}

function ModuleColorEditor({ module }: { module: Module }) {
  const [color, setColor] = useState(module.color);
  const save = useDebouncedCallback((c: string) => {
    if (c !== useData.getState().modules[module.id]?.color) void updateModule(module.id, { color: c });
  }, 350);
  return (
    <ColorPicker
      value={color}
      onChange={(c) => {
        setColor(c);
        save(c);
      }}
      label="Fachfarbe"
    />
  );
}

function DataSection() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ValidationResult | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy(true);
    try {
      const data = await createExport();
      downloadJson(data, `studyspace-export-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('Export erstellt');
    } catch {
      toast.error('Export fehlgeschlagen – bitte Verbindung prüfen.');
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast.error('Die Datei ist zu groß (max. 20 MB).');
    try {
      const json = JSON.parse(await file.text());
      setPreview(validateImport(json));
    } catch {
      toast.error('Die Datei ist kein gültiges JSON.');
    }
  };

  return (
    <Section title="Daten & Sicherheit" icon={<ShieldAlert />} hint="Der Export enthält alle Lernplandaten und Haken. Beim Import wird nichts gelöscht – vorhandene Einträge werden nur ergänzt bzw. aktualisiert.">
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionTile icon={<Download />} title="Datenexport" text="JSON-Sicherung aller Lernplandaten und Haken herunterladen." onClick={() => void doExport()} busy={busy} />
        <ActionTile icon={<Upload />} title="Datenimport" text="Sicherung einspielen – wird vorher geprüft und muss bestätigt werden." onClick={() => fileRef.current?.click()} />
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => (void readFile(e.target.files?.[0]), (e.target.value = ''))} />
      <p className="mt-3 text-xs text-muted">
        Hinweis: Der Export enthält keine Dateien selbst – nur deren Metadaten und Speicherorte. Die Dateien liegen weiterhin in Supabase Storage.
      </p>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Import prüfen"
        description="Vorhandene Einträge mit gleicher ID werden aktualisiert, neue angelegt. Es wird nichts gelöscht."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              disabled={!preview?.ok}
              loading={busy}
              onClick={async () => {
                if (!preview) return;
                setBusy(true);
                const res = await runImport(preview, setImportMsg);
                setBusy(false);
                setImportMsg('');
                if (res.ok) {
                  toast.success('Import abgeschlossen');
                  setPreview(null);
                } else toast.error(res.error ?? 'Import fehlgeschlagen');
              }}
            >
              Jetzt importieren
            </Button>
          </>
        }
      >
        {preview && (
          <div className="flex flex-col gap-3 text-sm">
            {preview.ok ? (
              <p className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-success)_14%,transparent)] px-4 py-3">Die Datei ist gültig.</p>
            ) : (
              <div className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] px-4 py-3">
                <p className="mb-1 font-semibold">Die Datei kann nicht importiert werden:</p>
                <ul className="list-disc pl-5 text-xs">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="grid grid-cols-2 gap-1 text-xs text-muted">
              {Object.entries(preview.counts).map(([t, n]) => (
                <li key={t} className="flex justify-between rounded-lg bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] px-3 py-1.5">
                  <span>{TABLE_LABELS[t] ?? t}</span>
                  <span className="num font-semibold text-ink">{n}</span>
                </li>
              ))}
            </ul>
            {importMsg && <p className="text-xs text-muted">{importMsg}</p>}
          </div>
        )}
      </Modal>
    </Section>
  );
}

const TABLE_LABELS: Record<string, string> = {
  members: 'Personen',
  modules: 'Module',
  module_topics: 'Themen',
  exams: 'Prüfungen',
  study_entries: 'Lerntage',
  tasks: 'Aufgaben',
  task_completions: 'Erledigungsstatus',
  attachments: 'Datei-Metadaten',
  app_settings: 'Einstellungen',
};

function ActionTile({ icon, title, text, onClick, busy }: { icon: ReactNode; title: string; text: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="lift flex flex-col gap-2 rounded-2xl border border-line p-4 text-left disabled:opacity-60">
      <span className="text-accent [&>svg]:size-5">{icon}</span>
      <span className="font-medium">{busy ? 'Bitte warten …' : title}</span>
      <span className="text-xs text-muted">{text}</span>
    </button>
  );
}

