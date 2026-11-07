import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlarmClock, ArrowLeft, Bell, BellOff, BellRing, CalendarClock, CircleAlert, CircleCheck, GraduationCap, LoaderCircle, Moon, PartyPopper, RefreshCw, Send, ShieldCheck, Smartphone, Sparkles, Sunrise, Trophy,
} from 'lucide-react';
import type { Member } from '../lib/types';
import { pushEnvironment, type PushPrefs } from '../lib/push';
import { Link } from '../lib/router';
import { spring } from '../lib/motion';
import { formatInstant } from '../lib/time';
import { useNow } from '../hooks/useNow';
import { disablePush, enablePush, initPush, sendTestPush, setPushMember, updatePushPrefs, usePush, type PushPhase } from '../store/push';
import { useActiveMembers, useCurrentMember } from '../store/derived';
import { toast } from '../store/toast';
import { Card, CardHeader, IconTile } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Avatar } from '../components/ui/Avatar';
import { InstallSteps, NotificationPreview } from '../components/PushOnboarding';

export function NotificationSettings() {
  const me = useCurrentMember();
  const phase = usePush((s) => s.phase);
  useEffect(() => {
    void initPush();
  }, []);
  if (!me) return null;
  return (
    <div>
      <Link to="/einstellungen" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Einstellungen
      </Link>
      <div className="mb-6 md:mb-8">
        <p className="eyebrow mb-1.5">Einstellungen</p>
        <h1 className="display text-[32px] md:text-[44px]">Benachrichtigungen</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-muted">Erinnerungen an Lernaufgaben und Prüfungen – direkt auf dem Sperrbildschirm, auch wenn StudySpace geschlossen ist.</p>
      </div>
      <div className="grid grid-cols-1 gap-[var(--gap-grid)] lg:grid-cols-12 [&>*]:min-w-0">
        <div className="flex flex-col gap-[var(--gap-grid)] lg:col-span-7">
          <StatusHero me={me} phase={phase} />
          {phase === 'on' && <Categories />}
          {phase === 'on' && <Times />}
        </div>
        <div className="flex flex-col gap-[var(--gap-grid)] lg:col-span-5">
          <TestCard phase={phase} />
          {phase === 'on' && <DeviceProfile me={me} />}
          <Preview />
          <About />
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<PushPhase, { icon: ReactNode; tint: string; title: string; text: (name: string) => string }> = {
  loading: { icon: <LoaderCircle className="animate-spin" />, tint: 'var(--ss-text-2)', title: 'Status wird geprüft …', text: () => 'Einen Moment.' },
  on: { icon: <BellRing />, tint: 'var(--ss-success)', title: 'Benachrichtigungen sind aktiviert', text: (n) => `Dieses Gerät empfängt Erinnerungen für ${n}.` },
  off: { icon: <BellOff />, tint: 'var(--ss-accent)', title: 'Benachrichtigungen sind deaktiviert', text: () => 'Aktiviere Erinnerungen, damit du keine Prüfungen und Lernaufgaben verpasst.' },
  working: { icon: <LoaderCircle className="animate-spin" />, tint: 'var(--ss-accent)', title: 'Wird eingerichtet …', text: () => 'Bitte bestätige ggf. die Anfrage deines Geräts.' },
  denied: { icon: <BellOff />, tint: 'var(--ss-warn)', title: 'Berechtigung verweigert', text: () => 'Dein Gerät blockiert Benachrichtigungen von StudySpace. So erlaubst du sie wieder:' },
  'needs-install': { icon: <Smartphone />, tint: 'var(--ss-accent)', title: 'Zuerst zum Home-Bildschirm hinzufügen', text: () => 'Auf iPhone und iPad funktionieren Benachrichtigungen nur, wenn StudySpace vom Home-Bildschirm gestartet wird (ab iOS 16.4).' },
  unsupported: { icon: <CircleAlert />, tint: 'var(--ss-warn)', title: 'Nicht unterstützt', text: () => 'Dieser Browser unterstützt keine Web-Push-Benachrichtigungen. Aktuelle Versionen von Safari, Chrome, Edge und Firefox können es.' },
  'not-configured': { icon: <CircleAlert />, tint: 'var(--ss-warn)', title: 'Server noch nicht eingerichtet', text: () => 'Für Push-Benachrichtigungen fehlen noch VAPID-Schlüssel und Edge Functions (README, Schritt 12). Die App funktioniert ansonsten normal.' },
};

function StatusHero({ me, phase }: { me: Member; phase: PushPhase }) {
  const members = useActiveMembers();
  const deviceMember = usePush((s) => s.memberId);
  const error = usePush((s) => s.error);
  const s = STATUS[phase];
  const name = members.find((m) => m.id === deviceMember)?.name ?? me.name;
  const env = pushEnvironment();
  const [confirmOff, setConfirmOff] = useState(false);

  return (
    <Card material="hero" className="p-5 md:p-7" style={{ '--m-extra': `radial-gradient(80% 120% at 0% 0%, color-mix(in srgb, ${s.tint} 22%, transparent), transparent 65%)` } as React.CSSProperties}>
      <div className="flex items-start gap-4">
        <motion.div key={phase} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.moment}>
          <IconTile tint={s.tint} size={52}>
            {s.icon}
          </IconTile>
        </motion.div>
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <h2 className="title text-[20px] md:text-[22px]">{s.title}</h2>
          <p className="mt-1 text-[14.5px] text-muted">{s.text(name)}</p>
        </div>
        {(phase === 'on' || phase === 'off') && (
          <Switch
            label="Benachrichtigungen auf diesem Gerät"
            checked={phase === 'on'}
            onChange={async (v) => {
              if (v) {
                const r = await enablePush(me.id);
                if (r.ok) toast.success('Benachrichtigungen aktiviert.');
              } else setConfirmOff(true);
            }}
          />
        )}
      </div>

      {phase === 'denied' && <DeniedHelp ios={env.ios} />}
      {phase === 'needs-install' && (
        <div className="mt-5">
          <InstallSteps />
        </div>
      )}
      {phase === 'off' && (
        <Button variant="primary" size="lg" icon={<Bell className="size-4" />} className="mt-5 w-full sm:w-auto" onClick={() => void enablePush(me.id)}>
          Benachrichtigungen aktivieren
        </Button>
      )}
      {phase === 'not-configured' && (
        <p className="mt-4 text-[13px] text-faint">Hinweis für die Einrichtung: GitHub-Variable <code>VITE_VAPID_PUBLIC_KEY</code> setzen und neu veröffentlichen.</p>
      )}
      {error && (phase === 'on' || phase === 'off') && (
        <p className="mt-4 flex items-start gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--ss-danger)_10%,transparent)] px-3 py-2 text-[13px] text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <AnimatePresence>
        {confirmOff && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[18px] bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)] p-3 text-[13.5px]">
              <span>Benachrichtigungen auf diesem Gerät ausschalten?</span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    setConfirmOff(false);
                    await disablePush();
                    toast.info('Benachrichtigungen ausgeschaltet.');
                  }}
                >
                  Ausschalten
                </Button>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function DeniedHelp({ ios }: { ios: boolean }) {
  const android = /Android/.test(navigator.userAgent);
  const steps = ios
    ? ['iPhone-Einstellungen öffnen', 'Mitteilungen → StudySpace', '„Mitteilungen erlauben“ einschalten', 'StudySpace neu öffnen']
    : android
      ? ['Lange auf das StudySpace-Symbol tippen → App-Info', 'Benachrichtigungen → erlauben', 'StudySpace neu öffnen']
      : ['Auf das Schloss-Symbol links in der Adressleiste klicken', 'Benachrichtigungen auf „Zulassen“ stellen', 'Seite neu laden'];
  return (
    <div className="mt-4">
      <ol className="flex flex-col gap-1.5 text-[13.5px]">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2.5">
            <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ss-warn)_18%,transparent)] text-[12px] font-semibold text-warn">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <Button size="sm" variant="glass" icon={<RefreshCw className="size-4" />} className="mt-4" onClick={() => location.reload()}>
        Neu prüfen
      </Button>
    </div>
  );
}

function Row({ icon, tint, title, hint, children }: { icon: ReactNode; tint: string; title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-3.5 first:border-t-0 first:pt-1">
      <IconTile tint={tint} size={34}>
        {icon}
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">{title}</p>
        <p className="text-[12.5px] text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Categories() {
  const prefs = usePush((s) => s.prefs);
  const toggle = (key: keyof PushPrefs) => (v: boolean) => void updatePushPrefs({ [key]: v });
  const items: { key: keyof PushPrefs; icon: ReactNode; tint: string; title: string; hint: string }[] = [
    { key: 'morning', icon: <Sunrise />, tint: '#F4B9A0', title: 'Morgendliche Lernübersicht', hint: `Um ${prefs.morningTime} Uhr, wenn heute Aufgaben geplant sind` },
    { key: 'evening', icon: <AlarmClock />, tint: 'var(--ss-accent)', title: 'Offene Aufgaben', hint: `Um ${prefs.eveningTime} Uhr, nur wenn noch etwas offen ist` },
    { key: 'overdue', icon: <CircleAlert />, tint: 'var(--ss-warn)', title: 'Überfällige Aufgaben', hint: `Um ${prefs.overdueTime} Uhr – nicht täglich dieselben` },
    { key: 'exams', icon: <GraduationCap />, tint: '#E8CB9D', title: 'Prüfungserinnerungen', hint: '7, 3 und 1 Tag vorher sowie 2 Stunden vor Beginn' },
    { key: 'planChanges', icon: <CalendarClock />, tint: '#A6DED7', title: 'Änderungen am Lernplan', hint: 'Neue Aufgaben, verschobene Lerntage, Prüfungstermine – gesammelt' },
    { key: 'groupSuccess', icon: <PartyPopper />, tint: '#CBB8F5', title: 'Gemeinsame Erfolge', hint: 'Wenn die Gruppe ein Modul zu 100 % geschafft hat' },
    { key: 'personalSuccess', icon: <Trophy />, tint: '#C3D7AD', title: 'Persönliche Erfolge', hint: 'Wenn du alle Aufgaben eines Moduls erledigt hast' },
    { key: 'badge', icon: <Sparkles />, tint: '#B4D3F2', title: 'Zahl am App-Symbol', hint: 'Offene Aufgaben als Badge (wo unterstützt)' },
  ];
  return (
    <Card className="p-5 md:p-6">
      <CardHeader title="Worüber informiert werden?" subtitle="Gilt für dieses Gerät" icon={<Bell />} />
      <div className="mt-3">
        {items.map((it) => (
          <Row key={it.key} icon={it.icon} tint={it.tint} title={it.title} hint={it.hint}>
            <Switch label={it.title} checked={prefs[it.key] as boolean} onChange={toggle(it.key)} />
          </Row>
        ))}
      </div>
    </Card>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 border-t border-line py-3 text-[14.5px] first:border-t-0 first:pt-1">
      <span>{label}</span>
      <input
        type="time"
        className="field num !w-[118px] !min-h-10 !py-1.5 text-center"
        value={value}
        step={300}
        onChange={(e) => /^\d\d:\d\d$/.test(e.target.value) && onChange(e.target.value)}
        aria-label={label}
      />
    </label>
  );
}

function Times() {
  const prefs = usePush((s) => s.prefs);
  const set = (key: keyof PushPrefs) => (v: string) => void updatePushPrefs({ [key]: v });
  return (
    <Card className="p-5 md:p-6">
      <CardHeader title="Uhrzeiten & Ruhezeit" subtitle="Europe/Berlin, inklusive Zeitumstellung" icon={<Moon />} />
      <div className="mt-3">
        <TimeField label="Morgenübersicht" value={prefs.morningTime} onChange={set('morningTime')} />
        <TimeField label="Erinnerung an Offenes" value={prefs.eveningTime} onChange={set('eveningTime')} />
        <TimeField label="Überfällige Aufgaben" value={prefs.overdueTime} onChange={set('overdueTime')} />
        <TimeField label="Ruhezeit ab" value={prefs.quietStart} onChange={set('quietStart')} />
        <TimeField label="Ruhezeit bis" value={prefs.quietEnd} onChange={set('quietEnd')} />
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        In der Ruhezeit kommen keine normalen Erinnerungen; sie werden auf das Ende der Ruhezeit verschoben bzw. zusammengefasst. Prüfungserinnerungen kommen bei frühen Terminen zum
        letzten erlaubten Zeitpunkt. Push-Dienste garantieren keine minutengenaue Zustellung.
      </p>
    </Card>
  );
}

function TestCard({ phase }: { phase: PushPhase }) {
  const test = usePush((s) => s.test);
  const lastSuccessAt = usePush((s) => s.lastSuccessAt);
  const now = useNow(test.state === 'cooldown' ? 1000 : 60_000);
  const cooling = test.state === 'cooldown' && test.until > now;
  const wait = cooling ? Math.ceil((test.until - now) / 1000) : 0;
  const disabled = phase !== 'on' || test.state === 'sending' || cooling;

  return (
    <Card className="p-5 md:p-6" data-testid="push-test-card">
      <CardHeader title="Benachrichtigungen testen" subtitle="Echter Versand über den Server an dieses Gerät" icon={<Send />} />
      <Button
        variant="primary"
        size="lg"
        className="mt-5 w-full"
        icon={test.state === 'sending' ? undefined : <Send className="size-4" />}
        loading={test.state === 'sending'}
        disabled={disabled}
        onClick={() => void sendTestPush()}
      >
        {cooling ? `Erneut möglich in ${wait} s` : 'Testbenachrichtigung senden'}
      </Button>
      <div className="mt-3 min-h-[44px]" role="status" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={test.state + (phase === 'on' ? '' : phase)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="flex items-start gap-2 text-[13px]">
            {phase !== 'on' ? (
              <span className="text-muted">
                {phase === 'denied' ? 'Berechtigung noch nicht erteilt.' : phase === 'off' ? 'Gerät noch nicht registriert – zuerst Benachrichtigungen aktivieren.' : 'Benachrichtigungen sind noch nicht eingerichtet.'}
              </span>
            ) : test.state === 'accepted' ? (
              <>
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  <strong>Vom Push-Dienst zum Versand angenommen.</strong> <span className="text-muted">Ob sie angekommen ist, siehst du auf deinem Gerät – eine Empfangsbestätigung gibt es bei Web Push nicht. Tipp: App dafür in den Hintergrund legen.</span>
                </span>
              </>
            ) : test.state === 'failed' ? (
              <>
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span className="text-danger">Versand fehlgeschlagen: {test.message}</span>
              </>
            ) : cooling ? (
              <span className="text-muted">Kurze Pause zwischen zwei Tests (max. 10 pro Stunde).</span>
            ) : (
              <span className="flex items-center gap-2 text-muted">
                <CircleCheck className="size-4 text-success" aria-hidden /> Gerät erfolgreich registriert.
                {lastSuccessAt && ` Letzte Zustellung angenommen: ${formatInstant(lastSuccessAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`}
              </span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>
    </Card>
  );
}

function DeviceProfile({ me }: { me: Member }) {
  const members = useActiveMembers();
  const deviceMember = usePush((s) => s.memberId);
  return (
    <Card className="p-5 md:p-6">
      <CardHeader title="Für wen?" subtitle="Dieses Gerät erhält Erinnerungen für:" icon={<Smartphone />} />
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Lernprofil für Erinnerungen">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={deviceMember === m.id}
            onClick={async () => {
              if (deviceMember === m.id) return;
              if (await setPushMember(m.id)) toast.success(`Dieses Gerät erhält jetzt Erinnerungen für ${m.name}.`);
            }}
            className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13.5px] font-medium transition-colors ${deviceMember === m.id ? 'lens' : 'text-muted hover:text-ink'}`}
          >
            <Avatar name={m.name} color={m.color} size={26} />
            {m.name}
            {m.id === me.id && <span className="text-[11px] font-normal text-faint">(aktiv)</span>}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-faint">Mehrere Geräte pro Person sind möglich (z. B. iPhone und iPad).</p>
    </Card>
  );
}

function Preview() {
  return (
    <Card className="p-5 md:p-6">
      <CardHeader title="So sieht es aus" subtitle="Beispiele – das Aussehen bestimmt dein Gerät" icon={<BellRing />} />
      <div className="mt-4 flex flex-col gap-2.5">
        <NotificationPreview title="Dein Lernplan für heute" body="Heute stehen 4 Aufgaben in Thermodynamik an. Du schaffst das!" time="08:00" />
        <NotificationPreview title="Prüfung morgen" body="Morgen um 14:00 Uhr ist deine Werkstoffkunde Prüfung. Viel Erfolg bei der Vorbereitung!" time="17:00" delay={0.12} />
      </div>
    </Card>
  );
}

function About() {
  return (
    <Card className="p-5 md:p-6">
      <CardHeader title="Gut zu wissen" icon={<ShieldCheck />} />
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-muted">
        <li>Es gibt keine Anmeldung: Die Zuordnung „Gerät → Person“ ist eine Gerätepräferenz und keine geprüfte Identität.</li>
        <li>Erinnerungen werden vom Server verschickt – StudySpace muss dafür nicht geöffnet sein.</li>
        <li>Adresse und Schlüssel deines Abos sind öffentlich nicht auslesbar; nur der Server kann damit senden.</li>
        <li>iPhone/iPad: ab iOS/iPadOS 16.4, nur als Web-App vom Home-Bildschirm.</li>
      </ul>
    </Card>
  );
}
