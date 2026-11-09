import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive, ArrowDown, Bell, BellRing, ChevronRight, ArrowUp, CircleDot, Download, History, Info, Monitor, Moon, Music2, Palette, Plus, RotateCcw, ShieldAlert, Sun, Trash2, Upload, UserMinus,
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
import { Card, IconTile } from '../components/ui/Card';
import { NotificationSettings } from './NotificationSettings';
import { initPush, usePush } from '../store/push';
import { useMusic } from '../store/music';
import { Button, IconButton } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Switch } from '../components/ui/Switch';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { ColorPicker } from '../components/ui/ColorPicker';
import { AddMemberDialog, MemberColorEditor } from './Team';
import { ModuleEditor } from './Modules';
import { StatusPill } from '../components/layout/StatusPill';

export function Settings({ section }: { section?: 'benachrichtigungen' }) {
  if (section === 'benachrichtigungen') return <NotificationSettings />;
  return (
    <div>
      <PageHeader title="Einstellungen" />
      <div className="grid grid-cols-1 gap-[var(--gap-grid)] lg:grid-cols-2">
        <NotificationsSummary />
        <MusicSummary />
        <Appearance />
        <General />
        <People />
        <ModulesSection />
        <DataSection />
      </div>
    </div>
  );
}

/** Einstieg zu den Benachrichtigungen mit aktuellem Status */
function NotificationsSummary() {
  const phase = usePush((s) => s.phase);
  useEffect(() => {
    void initPush();
  }, []);
  const label: Record<string, string> = {
    loading: 'Status wird geprüft …',
    on: 'Aktiviert auf diesem Gerät',
    off: 'Noch nicht aktiviert',
    working: 'Wird eingerichtet …',
    denied: 'Vom Gerät blockiert',
    'needs-install': 'Zuerst zum Home-Bildschirm hinzufügen',
    unsupported: 'Von diesem Browser nicht unterstützt',
    'not-configured': 'Server noch nicht eingerichtet',
  };
  return (
    <Link to="/einstellungen/benachrichtigungen" className="glass mat-hero lift group flex items-center gap-4 rounded-[var(--radius-card)] p-5 md:p-6">
      <IconTile tint={phase === 'on' ? 'var(--ss-success)' : 'var(--ss-accent)'} size={48}>
        {phase === 'on' ? <BellRing /> : <Bell />}
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="title block text-[17px]">Benachrichtigungen</span>
        <span className="block text-[13.5px] text-muted">{label[phase]} · Erinnerungen, Ruhezeiten, Testnachricht</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** Einstieg zur gemeinsamen Musik-Bibliothek (YouTube-Links für alle) */
function MusicSummary() {
  const available = useMusic((s) => s.available);
  const count = useMusic((s) => Object.values(s.tracks).filter((t) => !t.deleted_at).length);
  const status = available === false ? 'Noch nicht eingerichtet' : count === 1 ? '1 Titel' : `${count} Titel`;
  return (
    <Link to="/musik" className="glass mat-hero lift group flex items-center gap-4 rounded-[var(--radius-card)] p-5 md:p-6" data-testid="settings-music">
      <IconTile size={48}>
        <Music2 />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="title block text-[17px]">Musik-Bibliothek</span>
        <span className="block text-[13.5px] text-muted">{status} · YouTube-Links hinzufügen, für alle sichtbar</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function Section({ title, icon, children, hint, className = '' }: { title: string; icon: ReactNode; children: ReactNode; hint?: string; className?: string }) {
  return (
    <Card className={`p-5 md:p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-3">
        <IconTile>{icon}</IconTile>
        <div>
          <h2 className="title">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line py-3.5 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Appearance() {
  const prefs = usePrefs();
  return (
    <Section title="Erscheinungsbild" icon={<Palette />} hint="Wird nur auf diesem Gerät gespeichert.">
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
      <Row label="Kompakte Darstellung" hint="Kleinere Abstände und Schrift.">
        <Switch label="Kompakte Darstellung" checked={prefs.compact} onChange={(compact) => prefs.set({ compact })} />
      </Row>
      <Row label="Klänge" hint="Leise Töne beim Antippen, Auswählen und Abhaken. Auf dem iPhone gilt der Stummschalter.">
        <Switch label="Klänge" checked={prefs.sounds} onChange={(sounds) => prefs.set({ sounds })} />
      </Row>
      {/* Nur anzeigen, wo das Gerät wirklich vibrieren kann (z. B. Android). iOS Safari unterstützt die Vibration API nicht. */}
      {isHapticsSupported() && (
        <Row label="Haptisches Feedback" hint="Kurze, dezente Vibration bei wichtigen Aktionen.">
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
  const move = (i: number, dir: -1 | 1) => {
    const ids = members.map((m) => m.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorderMembers(ids);
  };
  return (
    <Section title="Personen" icon={<CircleDot />} hint="Interne IDs bleiben bei Umbenennen und Farbänderungen gleich.">
      <ul className="flex flex-col gap-2">
        {members.map((m, i) => (
          <li key={m.id} className={`flex items-center gap-2 rounded-2xl border border-line p-2 ${m.is_active ? '' : 'opacity-60'}`}>
            <button type="button" onClick={() => setColorFor(m)} aria-label={`Farbe von ${m.name} ändern`} className="rounded-full">
              <Avatar name={m.name} color={m.color} size={36} dimmed={!m.is_active} />
            </button>
            <MemberNameInput member={m} />
            <IconButton label="Nach oben" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="size-4" />
            </IconButton>
            <IconButton label="Nach unten" size="sm" disabled={i === members.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="size-4" />
            </IconButton>
            {m.is_active ? (
              <IconButton label={`${m.name} deaktivieren`} size="sm" onClick={() => void setMemberActive(m.id, false)}>
                <UserMinus className="size-4" />
              </IconButton>
            ) : (
              <IconButton label={`${m.name} wiederherstellen`} size="sm" onClick={() => void setMemberActive(m.id, true)}>
                <RotateCcw className="size-4" />
              </IconButton>
            )}
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
    </Section>
  );
}

function MemberNameInput({ member }: { member: Member }) {
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
      }}
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
    <Section title="Module" icon={<Archive />} hint="Fachfarben kennzeichnen Lerninhalte, Personenfarben die Lernenden.">
      <ul className="flex flex-col gap-2">
        {modules.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2 rounded-2xl border border-line p-2">
            <button type="button" aria-label={`Farbe von ${m.name} ändern`} onClick={() => setColorFor(m)} className="size-9 shrink-0 rounded-xl" style={{ background: m.color }} />
            <button type="button" onClick={() => setEditing(m)} className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium hover:underline">
              {m.name}
            </button>
            <IconButton label="Nach oben" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="size-4" />
            </IconButton>
            <IconButton label="Nach unten" size="sm" disabled={i === modules.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="size-4" />
            </IconButton>
            <IconButton label={`${m.name} archivieren`} size="sm" onClick={() => void archiveModule(m.id)}>
              <Archive className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          Modul hinzufügen
        </Button>
        <Link to="/pruefungen" className="inline-flex h-11 items-center rounded-2xl px-4 text-sm font-medium text-accent hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]">
          Prüfungen verwalten
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
    <Section title="Daten & Sicherheit" icon={<ShieldAlert />} className="lg:col-span-2">
      <div className="grid gap-3 md:grid-cols-4">
        <ActionTile icon={<Download />} title="Datenexport" text="Vollständige JSON-Sicherung aller Lernplandaten und Haken." onClick={() => void doExport()} busy={busy} />
        <ActionTile icon={<Upload />} title="Datenimport" text="Export einspielen – wird vorher geprüft und muss bestätigt werden." onClick={() => fileRef.current?.click()} />
        <ActionLink icon={<Trash2 />} title="Papierkorb" text="Gelöschte Inhalte ansehen und wiederherstellen." to="/papierkorb" />
        <ActionLink icon={<History />} title="Änderungsverlauf" text="Wer hat wann was geändert (nicht verifiziert)." to="/verlauf" />
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

function ActionLink({ icon, title, text, to }: { icon: ReactNode; title: string; text: string; to: string }) {
  return (
    <Link to={to} className="lift flex flex-col gap-2 rounded-2xl border border-line p-4">
      <span className="text-accent [&>svg]:size-5">{icon}</span>
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted">{text}</span>
    </Link>
  );
}

