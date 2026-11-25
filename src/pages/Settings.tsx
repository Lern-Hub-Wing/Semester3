import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EXTRA_MOTION } from '../lib/motionFlags';
import { ACCENTS } from '../lib/accents';
import {
  Archive, ArrowDown, ChartLine, Sparkles, Timer, Clock3, Hand, CloudSun, Crown, Rocket, Scale, Search, Ticket, UserRound, Pencil, Bell, BellRing, ArrowLeft, BookOpen, ArrowUp, CircleDot, Download, History, Info, Monitor, Moon, Music2, Palette, Plus, RotateCcw, ShieldAlert, Sun, Trash2, Upload, UserMinus, Users, LifeBuoy, ShieldCheck,
} from 'lucide-react';
import type { Member, Module } from '../lib/types';
import { config, LIMITS } from '../lib/config';
import { validateImport, type ValidationResult } from '../lib/backup';
import { Link, navigate } from '../lib/router';
import { startStudyMode } from '../lib/studyModeStart';
import { isHapticsSupported } from '../lib/haptics';
import { useData, useSyncStatus } from '../store/data';
import { useAllMembers, useAppName, useModules } from '../store/derived';
import { usePrefs } from '../store/prefs';
import { reorderMembers, reorderModules, restoreModule, setMemberActive, setSetting, updateMember, updateModule, archiveModule } from '../store/actions';
import { createExport, downloadJson, runImport } from '../store/backup';
import { resync } from '../store/sync';
import { toast } from '../store/toast';
import { useDebouncedCallback } from '../hooks/useDebounced';
import { PageHeader, QuickAction } from '../components/layout/AppShell';
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
import { IconTile } from '../components/ui/Card';
import { IS_APP } from '../lib/edition';
import { WeatherSettings } from '../components/weather/WeatherSettings';
import { AccountSection, GroupSection, PlusSection } from '../app/AccountSettings';
import { useAccount } from '../app/account';
import { myPlanLabel } from '../app/api';
import { AREA_TINT, TINT } from '../lib/tints';
import { useTrashCount } from '../store/trash';
import { exportMyData } from '../app/exportData';
import { ClockSettings } from './settings/ClockSettings';
import { useWeather } from '../store/weather';
import { RedeemSection } from '../app/RedeemCode';
import { LegalSection } from '../app/Legal';
import { MoveToAppSection } from './settings/MoveToApp';

const SECTIONS = {
  konto: { title: 'Konto', render: () => <AccountSection /> },
  gruppe: { title: 'Lerngruppe', render: () => <GroupSection /> },
  plus: { title: 'Tarif & Abo', render: () => <PlusSection /> },
  code: { title: 'Code einlösen', render: () => <RedeemSection /> },
  darstellung: { title: 'Darstellung & Bedienung', render: () => <Appearance /> },
  fokus: { title: 'Uhr & Fokus', render: () => <ClockSettings /> },
  wetter: { title: 'Wetter', render: () => <WeatherSettings /> },
  personen: { title: 'Personen', render: () => <People /> },
  faecher: { title: 'Fächer', render: () => <ModulesSection /> },
  daten: { title: IS_APP ? 'Daten exportieren' : 'Sicherung & Import', render: () => (IS_APP ? <AppDataSection /> : <DataSection />) },
  umzug: { title: 'Umzug in die App', render: () => <MoveToAppSection /> },
  rechtliches: { title: 'Rechtliches', render: () => <LegalSection /> },
  info: { title: 'Über StudySpace', render: () => (IS_APP ? <AppGeneral /> : <General />) },
} as const;
type SectionKey = keyof typeof SECTIONS;

/** App: Kopf jeder Einstellungsseite – farbiges Symbol und ein Satz, worum es geht */
const SECTION_META: Record<SectionKey, { icon: ReactNode; tint: string; desc: string }> = {
  konto: { icon: <UserRound />, tint: AREA_TINT.account, desc: 'Name, Anmeldung und Sicherheit deines Kontos.' },
  gruppe: { icon: <Users />, tint: AREA_TINT.group, desc: 'Mitglieder, Einladungen und deine Lernbereiche.' },
  plus: { icon: <Crown />, tint: AREA_TINT.plan_billing, desc: 'Dein Zugang, Laufzeit und was enthalten ist.' },
  code: { icon: <Ticket />, tint: TINT.teal, desc: 'Einladung zu einer Lerngruppe oder Tarif-Code einlösen.' },
  darstellung: { icon: <Palette />, tint: AREA_TINT.appearance, desc: 'Aussehen, Bewegung, Klänge – nur auf diesem Gerät.' },
  fokus: { icon: <Clock3 />, tint: AREA_TINT.focus, desc: 'Ein Design für Fokus, Lernmodus und Hausaufgaben-Zähler.' },
  wetter: { icon: <CloudSun />, tint: TINT.blue, desc: 'Wetter im Hintergrund – nur auf diesem Gerät.' },
  umzug: { icon: <Rocket />, tint: TINT.indigo, desc: 'Lerngruppe mit allen Daten in die App übertragen.' },
  rechtliches: { icon: <Scale />, tint: TINT.gray, desc: 'Nutzungsbedingungen, Datenschutz, Impressum, Widerruf.' },
  personen: { icon: <Users />, tint: AREA_TINT.group, desc: 'Namen, Farben und Reihenfolge – gelten für alle.' },
  faecher: { icon: <BookOpen />, tint: AREA_TINT.subjects, desc: 'Reihenfolge, Farben und Archiv eurer Fächer.' },
  daten: { icon: <Download />, tint: AREA_TINT.export, desc: IS_APP ? 'Alle Inhalte als Datei herunterladen.' : 'Sicherung herunterladen oder einspielen.' },
  info: { icon: <Info />, tint: AREA_TINT.info, desc: 'Version, Verbindung und Datenschutz.' },
};

function AppSectionHeader({ k, as: Tag = 'h1' }: { k: SectionKey; as?: 'h1' | 'h2' }) {
  const m = SECTION_META[k];
  return (
    <header className="mb-5 flex items-center gap-3.5" data-testid="settings-section-header">
      <IconTile tint={m.tint} size={46}>
        {m.icon}
      </IconTile>
      <div className="min-w-0">
        <Tag className={Tag === 'h1' ? 'display text-[26px] leading-tight md:text-[28px]' : 'title text-[22px] leading-tight'}>{SECTIONS[k].title}</Tag>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{m.desc}</p>
      </div>
    </header>
  );
}
/** Bisherige Seite: ohne Konto/Gruppe/Plus. App: ohne Personen (kommen per Einladung) und ohne Import. */
const AVAILABLE: SectionKey[] = IS_APP
  ? ['konto', 'gruppe', 'plus', 'code', 'faecher', 'darstellung', 'fokus', 'wetter', 'daten', 'rechtliches', 'info']
  : ['darstellung', 'fokus', 'wetter', 'personen', 'faecher', 'daten', 'umzug', 'info'];
const isSection = (k: string | undefined): k is SectionKey => !!k && (AVAILABLE as string[]).includes(k);

/**
 * Einstellungen: ruhige Übersicht als gruppierte Liste; jede Kategorie ist
 * eine eigene Seite. Auf großen Bildschirmen steht die Liste links und die
 * gewählte Kategorie rechts daneben.
 */
export function Settings({ section }: { section?: string }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  if (section === 'benachrichtigungen') return <NotificationSettings />;
  const key = isSection(section) ? section : null;

  if (!wide) {
    if (!key)
      return (
        <div>
          <PageHeader title="Einstellungen" />
          <SettingsNav areas />
        </div>
      );
    return (
      <div data-testid={`settings-${key}`}>
        <Link to="/einstellungen" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Einstellungen
        </Link>
        <AppSectionHeader k={key} />
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
        <div key={active} className="unfold" data-testid={`settings-${active}`}>
          <AppSectionHeader k={active} as="h2" />
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

interface NavRow {
  icon: ReactNode;
  tint: string;
  label: string;
  value?: ReactNode;
  to: string;
  active?: boolean;
  testId?: string;
  /** Suchbegriffe (zusätzlich zum Titel) */
  keywords: string;
}
interface NavGroup {
  title?: string;
  rows: NavRow[];
}

/** Übersicht aller Einstellungen als gruppierte Liste mit Suche und dem jeweils aktuellen Stand */
function SettingsNav({ active, areas = false }: { active?: SectionKey; areas?: boolean }) {
  const groups = useNavGroups(active);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q ? groups.map((g) => ({ ...g, rows: g.rows.filter((r) => `${r.label} ${r.keywords}`.toLowerCase().includes(q)) })).filter((g) => g.rows.length > 0) : groups;
  return (
    <nav aria-label="Einstellungen" className="rise-list flex flex-col gap-5" data-testid="settings-nav">
      <ProfileCard />
      {areas && !q && <SettingsAreas />}
      <label className="settings-search relative block">
        <span className="sr-only">Einstellungen durchsuchen</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen, z. B. „dunkel“, „Uhr“, „Wetter“"
          className="h-11 w-full rounded-2xl border border-line bg-[var(--ss-card)] pl-10 pr-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ss-accent)]"
          data-testid="settings-search"
          enterKeyHint="search"
        />
      </label>
      {filtered.map((g, i) => (
        <ListGroup key={g.title ?? i} title={g.title}>
          {g.rows.map((r) => (
            <ListRow key={r.to} icon={r.icon} tint={r.tint} label={r.label} value={r.value} to={r.to} active={r.active} testId={r.testId} />
          ))}
        </ListGroup>
      ))}
      {q && filtered.length === 0 && (
        <p className="px-1 text-[14px] text-muted" data-testid="settings-search-empty">
          Nichts gefunden zu „{query.trim()}“.
        </p>
      )}
    </nav>
  );
}

/**
 * Handy: Der letzte Tab führt direkt hierher (kein „Mehr“-Blatt mehr).
 * Darum stehen ganz oben die Bereiche ohne eigenen Tab – Fokus, Lernmodus, Fächer, Statistik.
 */
function SettingsAreas() {
  const modules = useModules();
  const me = useAccount((s) => s.me);
  const solo = IS_APP && me?.groups.find((g) => g.id === me.active_group_id)?.kind === 'solo';
  return (
    <div className="flex flex-col gap-3" data-testid="settings-areas">
      <div className="grid grid-cols-2 gap-2.5">
        <QuickAction icon={<Timer />} tint={AREA_TINT.focus} label="Fokus" hint="Timer starten" onClick={() => navigate('/fokus')} testId="more-focus" />
        <QuickAction icon={<Clock3 />} tint={AREA_TINT.studyMode} label="Lernmodus" hint="Uhr im Vollbild" onClick={startStudyMode} testId="more-study" />
      </div>
      <ListGroup title="Bereiche">
        <ListRow icon={<BookOpen />} tint={AREA_TINT.subjects} label="Fächer & Prüfungen" value={modules.length || undefined} to="/faecher" testId="more-subjects" />
        {solo ? (
          <ListRow icon={<Users />} tint={AREA_TINT.team} label="Mit Freunden lernen" sub="Gruppe erstellen oder beitreten" to="/einstellungen/gruppe" testId="more-team" />
        ) : (
          <ListRow icon={<ChartLine />} tint={AREA_TINT.stats} label="Statistiken" to="/analyse" testId="more-stats" />
        )}
        {IS_APP && <ListRow icon={<Sparkles />} tint={AREA_TINT.plan_billing} label="KI-Lernplan" sub="Plan bis zur Prüfung erstellen" to="/ki-lernplan" testId="more-ai" />}
      </ListGroup>
    </div>
  );
}

function useNavGroups(active?: SectionKey): NavGroup[] {
  const phase = usePush((s) => s.phase);
  const theme = usePrefs((s) => s.theme);
  const members = useAllMembers();
  const modules = useModules();
  const musicAvailable = useMusic((s) => s.available);
  const tracks = useMusic((s) => Object.values(s.tracks).filter((t) => !t.deleted_at).length);
  const trashCount = useTrashCount();
  const weatherMode = useWeather((s) => s.mode);
  const me = useAccount((s) => s.me);
  const email = useAccount((s) => s.session?.user.email);
  useEffect(() => {
    void initPush();
  }, []);
  const sec = (k: SectionKey) => ({ to: `/einstellungen/${k}`, active: active === k });
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const solo = group?.kind === 'solo';

  const device: NavRow[] = [
    { icon: phase === 'on' ? <BellRing /> : <Bell />, tint: phase === 'on' ? TINT.teal : AREA_TINT.notifications, label: 'Benachrichtigungen', value: PUSH_LABEL[phase], to: '/einstellungen/benachrichtigungen', testId: 'settings-push', keywords: 'push mitteilung erinnerung ruhezeit' },
    { icon: <Palette />, tint: AREA_TINT.appearance, label: 'Darstellung & Bedienung', value: theme === 'system' ? 'System' : theme === 'dark' ? 'Dunkel' : 'Hell', ...sec('darstellung'), keywords: 'hell dunkel theme design farbe akzent akzentfarbe lila graphit schwarz weiß animation animationen übergänge bewegung transparenz kompakt klänge ton haptik vibration fortschritt' },
    { icon: <Clock3 />, tint: AREA_TINT.focus, label: 'Uhr & Fokus', ...sec('fokus'), testId: 'settings-clock', keywords: 'uhr schrift farbe hintergrund pomodoro timer lernmodus vollbild hausaufgaben zähler design kontrast' },
    { icon: <CloudSun />, tint: TINT.blue, label: 'Wetter', value: weatherMode === 'auto' ? 'Automatisch' : weatherMode === 'off' ? 'Aus' : 'Fest', ...sec('wetter'), keywords: 'regen schnee sonne gewitter standort hintergrund' },
  ];
  const music: NavRow = { icon: <Music2 />, tint: AREA_TINT.music, label: 'Musik-Bibliothek', value: musicAvailable === false ? 'nicht eingerichtet' : `${tracks} Titel`, to: '/musik', testId: 'settings-music', keywords: 'lofi youtube lieder' };
  const subjects: NavRow = { icon: <BookOpen />, tint: AREA_TINT.subjects, label: 'Fächer', value: modules.length, ...sec('faecher'), keywords: 'module reihenfolge farbe archiv' };
  const trash: NavRow = { icon: <Trash2 />, tint: AREA_TINT.trash, label: 'Papierkorb', value: trashCount || undefined, to: '/papierkorb', testId: 'settings-trash', keywords: 'gelöscht wiederherstellen' };
  const history: NavRow = { icon: <History />, tint: AREA_TINT.history, label: 'Änderungsverlauf', to: '/verlauf', keywords: 'aktivität protokoll' };
  const about: NavRow = { icon: <Info />, tint: AREA_TINT.info, label: 'Über StudySpace', value: config.version, ...sec('info'), keywords: 'version verbindung' };

  if (IS_APP)
    return [
      {
        title: 'Konto',
        rows: [
          { icon: <UserRound />, tint: AREA_TINT.account, label: 'Konto', value: email, ...sec('konto'), testId: 'settings-account', keywords: 'name e-mail passwort anmeldung abmelden löschen angemeldet bleiben' },
          { icon: <Users />, tint: AREA_TINT.group, label: solo ? 'Lernbereich & Gruppen' : 'Lerngruppe', value: solo ? undefined : group?.name, ...sec('gruppe'), testId: 'settings-group', keywords: 'mitglieder einladen einladungscode beitreten verlassen' },
          { icon: <Crown />, tint: AREA_TINT.plan_billing, label: 'Tarif & Abo', value: me ? myPlanLabel(me) : undefined, ...sec('plus'), testId: 'settings-plus', keywords: 'solo gruppe kaufen kündigen preis' },
          { icon: <Ticket />, tint: TINT.teal, label: 'Code einlösen', ...sec('code'), testId: 'settings-code', keywords: 'gutschein einladung tarif freischalten' },
        ],
      },
      { title: 'Lernen', rows: [subjects, music] },
      { title: 'Dieses Gerät', rows: device },
      { title: 'Daten', rows: [{ icon: <Download />, tint: AREA_TINT.export, label: 'Daten exportieren', ...sec('daten'), testId: 'settings-export', keywords: 'sicherung download json' }, trash, history] },
      {
        title: 'Hilfe & Rechtliches',
        rows: [
          { icon: <LifeBuoy />, tint: AREA_TINT.help, label: 'Hilfe & Feedback', to: '/hilfe', testId: 'settings-help', keywords: 'support fehler frage' },
          { icon: <Scale />, tint: TINT.gray, label: 'Rechtliches', ...sec('rechtliches'), testId: 'settings-legal', keywords: 'agb nutzungsbedingungen datenschutz impressum widerruf vertrag' },
          about,
        ],
      },
    ];

  const activeMembers = members.filter((m) => m.is_active).length;
  return [
    { title: 'Dieses Gerät', rows: device },
    { title: 'Lerngruppe', rows: [{ icon: <Users />, tint: AREA_TINT.group, label: 'Personen', value: activeMembers, ...sec('personen'), keywords: 'namen farben mitglieder' }, subjects, music] },
    {
      title: 'Daten',
      rows: [
        { icon: <Download />, tint: AREA_TINT.export, label: 'Sicherung & Import', ...sec('daten'), keywords: 'export download json backup' },
        { icon: <Rocket />, tint: TINT.indigo, label: 'Umzug in die App', ...sec('umzug'), testId: 'settings-move', keywords: 'app übertragen konto sicherheitskopie' },
        trash,
        history,
      ],
    },
    { rows: [about] },
  ];
}

function Appearance() {
  const prefs = usePrefs();
  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
    <Section title="Erscheinungsbild" icon={<Palette />} tint={TINT.violet} hint="Diese Einstellungen gelten nur für dieses Gerät.">
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
      <Row stacked label="Design" hint="Lila ist der StudySpace-Klassiker, Graphit die schlichte Schwarz-Weiß-Variante. Nur auf diesem Gerät.">
        <div role="radiogroup" aria-label="Design" className="flex flex-wrap gap-2" data-testid="accent-picker">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={prefs.accent === a.id}
              onClick={() => prefs.set({ accent: a.id })}
              className={`flex min-h-10 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium transition-colors ${prefs.accent === a.id ? 'border-transparent bg-[var(--ss-accent-soft)] text-ink' : 'border-line text-muted hover:text-ink'}`}
            >
              <span className="size-6 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" style={{ background: `linear-gradient(135deg, ${a.swatch[0]} 0 50%, ${a.swatch[1]} 50% 100%)` }} aria-hidden />
              {a.label}
            </button>
          ))}
        </div>
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
      {EXTRA_MOTION && (
        <Row inline label="Extra-Animationen" hint="Sanfte Übergänge zwischen Seiten, Karten und Listen.">
          <Switch label="Extra-Animationen" checked={prefs.extraMotion} onChange={(extraMotion) => prefs.set({ extraMotion })} disabled={prefs.motion === 'reduced'} />
        </Row>
      )}
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
    </Section>
    <Section title="Bedienung" icon={<Hand />} tint={TINT.teal}>
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
    </div>
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
    <Section title="Fächer" icon={<BookOpen />} tint={TINT.violet} hint="Reihenfolge und Farben gelten für alle. Archivierte Fächer zählen nicht zum Fortschritt und lassen sich jederzeit wiederherstellen.">
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

/** App: Info ohne Technik – Konto-Sicherheit statt „öffentlicher Zugriff“. */
function AppGeneral() {
  const lastSyncAt = useData((s) => s.lastSyncAt);
  return (
    <Section title="Version & Verbindung" icon={<Info />} tint={TINT.gray}>
      <Row label="Version">
        <span className="num text-sm text-muted">
          {config.version}
          {config.buildTime && ` · ${new Date(config.buildTime).toLocaleDateString('de-DE')}`}
        </span>
      </Row>
      <Row label="Verbindung" hint={lastSyncAt ? `Zuletzt abgeglichen: ${new Date(lastSyncAt).toLocaleString('de-DE')}` : undefined}>
        <div className="flex items-center gap-2">
          <StatusPill />
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => void resync().then(() => toast.success('Daten neu geladen'))}>
            Neu laden
          </Button>
        </div>
      </Row>
      <div className="mt-2 rounded-2xl bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] p-4 text-xs leading-relaxed text-muted" data-testid="privacy-note">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <ShieldCheck className="size-4" aria-hidden /> Deine Daten
        </p>
        Nur angemeldete Mitglieder deiner Lerngruppe sehen gemeinsame Inhalte – deinen eigenen Lernbereich siehst nur du. Jede Änderung im Verlauf
        stammt von einem echten Konto. Gelöschtes liegt 30 Tage im Papierkorb. Unter „Daten exportieren“ lädst du alles herunter, unter „Konto“
        kannst du dein Konto löschen.
      </div>
    </Section>
  );
}

/** App: Datenexport (kein Import – Inhalte entstehen in der App). */
function AppDataSection() {
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Export" icon={<Download />} tint={TINT.blue} hint="Die Datei enthält alle Inhalte dieser Lerngruppe bzw. deines Lernbereichs, deine Haken und Fokuszeiten sowie deine Kontoangaben – lesbar als JSON.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="export-section">
        <div>
          <p className="text-[14.5px] font-medium">Daten exportieren</p>
          <p className="text-[12.5px] text-muted">Als Sicherung oder zum Mitnehmen.</p>
        </div>
        <Button
          variant="primary"
          icon={<Download className="size-4" />}
          loading={busy}
          data-testid="export-run"
          onClick={() => {
            setBusy(true);
            exportMyData()
              .then(() => toast.success('Export heruntergeladen'))
              .catch(() => toast.error('Export fehlgeschlagen – bitte Verbindung prüfen.'))
              .finally(() => setBusy(false));
          }}
        >
          Herunterladen
        </Button>
      </div>
    </Section>
  );
}
