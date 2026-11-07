import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BellRing, Check, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import type { Member } from '../lib/types';
import { pushEnvironment } from '../lib/push';
import { haptic } from '../lib/haptics';
import { spring, EASE_EMPH } from '../lib/motion';
import { navigate } from '../lib/router';
import { enablePush, setPushMember, usePush } from '../store/push';
import { toast } from '../store/toast';
import { LogoMark } from './Logo';
import { Button } from './ui/Button';
import { PresenceContainer } from './ui/PresenceDiv';

export const ONBOARDING_KEY = 'studyspace.push.onboarding';
type Flag = 'done' | 'dismissed' | 'install-shown' | null;

function readFlag(): Flag {
  try {
    return localStorage.getItem(ONBOARDING_KEY) as Flag;
  } catch {
    return 'dismissed';
  }
}
function writeFlag(v: Exclude<Flag, null>) {
  try {
    localStorage.setItem(ONBOARDING_KEY, v);
  } catch {
    /* egal */
  }
}

/** Beispielhafte Benachrichtigung (Illustration – das echte Aussehen bestimmt das Betriebssystem). */
export function NotificationPreview({ title, body, delay = 0, time = 'jetzt' }: { title: string; body: string; delay?: number; time?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -26, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay }}
      className="glass mat-float flex w-full items-start gap-3 rounded-[22px] px-3.5 py-3 text-left"
      aria-label={`Beispiel einer Benachrichtigung: ${title} – ${body}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#0f1424] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        <LogoMark size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-[12px]">
          <span className="font-semibold uppercase tracking-[0.04em] text-muted">StudySpace</span>
          <span className="text-faint">{time}</span>
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold leading-snug">{title}</span>
        <span className="block text-[13.5px] leading-snug text-muted">{body}</span>
      </span>
    </motion.div>
  );
}

/** Animierte Glocke: kurzes, elegantes Schwingen mit Lichtringen */
export function BellHero({ size = 84 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.9, height: size * 1.6 }} aria-hidden>
      {!reduce &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full border border-[color-mix(in_srgb,var(--ss-accent)_45%,transparent)]"
            style={{ width: size, height: size }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.9], opacity: [0.7, 0] }}
            transition={{ duration: 2.2, delay: 0.5 + i * 0.5, repeat: 1, ease: 'easeOut' }}
          />
        ))}
      <motion.span
        className="btn-primary relative grid place-items-center rounded-[28px]"
        style={{ width: size, height: size }}
        initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
      >
        <motion.span
          style={{ transformOrigin: '50% 12%' }}
          animate={reduce ? undefined : { rotate: [0, 18, -14, 10, -6, 3, 0] }}
          transition={{ duration: 1.1, delay: 0.55, ease: 'easeInOut' }}
          className="grid place-items-center"
        >
          <BellRing className="size-10" strokeWidth={1.8} />
        </motion.span>
      </motion.span>
    </div>
  );
}

/** Schritt-für-Schritt: StudySpace auf dem iPhone/iPad zum Home-Bildschirm hinzufügen */
export function InstallSteps() {
  const steps: { icon: ReactNode; text: ReactNode }[] = [
    { icon: <Share className="size-5" />, text: <>In Safari unten (iPad: oben) auf <strong>Teilen</strong> tippen.</> },
    { icon: <PlusSquare className="size-5" />, text: <>„<strong>Zum Home-Bildschirm</strong>“ wählen und <strong>Hinzufügen</strong> antippen.</> },
    { icon: <Smartphone className="size-5" />, text: <>StudySpace über das neue Symbol auf dem Home-Bildschirm öffnen – dort geht es weiter.</> },
  ];
  return (
    <ol className="flex flex-col gap-2.5 text-left">
      {steps.map((s, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.25 + i * 0.1, ease: EASE_EMPH }}
          className="flex items-center gap-3 rounded-[18px] bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)] px-3.5 py-3 text-[14px]"
        >
          <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ss-accent)_18%,transparent)] text-accent">{s.icon}</span>
          <span>{s.text}</span>
        </motion.li>
      ))}
    </ol>
  );
}

type Mode = 'intro' | 'install' | 'success' | 'denied' | 'error';

/**
 * Einführung beim ersten Start auf einem Gerät (nach der Personenwahl).
 * Die Systemberechtigung wird ausschließlich beim Tippen auf
 * „Benachrichtigungen aktivieren“ angefragt – nie automatisch.
 */
export function PushOnboarding({ me }: { me: Member }) {
  const reduce = useReducedMotion();
  const phase = usePush((s) => s.phase);
  const error = usePush((s) => s.error);
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase === 'loading' || mode) return;
    const t = setTimeout(() => {
      const flag = readFlag();
      if (flag === 'done' || flag === 'dismissed') return;
      const env = pushEnvironment();
      if (!env.configured) return;
      if (phase === 'on') return writeFlag('done');
      if (env.needsInstall) {
        if (flag !== 'install-shown') setMode('install');
        return;
      }
      if (!env.supported || env.permission === 'denied') return;
      setMode('intro');
    }, 1100);
    return () => clearTimeout(t);
  }, [phase, mode]);

  const close = (flag: Exclude<Flag, null>) => {
    writeFlag(flag);
    setMode(null);
  };

  const activate = async () => {
    haptic('select');
    setBusy(true);
    const res = await enablePush(me.id);
    setBusy(false);
    if (res.ok) {
      haptic('success');
      writeFlag('done');
      setMode('success');
    } else if (res.reason === 'denied') {
      writeFlag('dismissed');
      setMode('denied');
    } else if (res.reason === 'dismissed') {
      // Systemdialog ohne Entscheidung geschlossen – später in den Einstellungen möglich
      close('dismissed');
    } else setMode('error');
  };

  return createPortal(
    <AnimatePresence>
      {mode && (
        <PresenceContainer className="fixed inset-0 z-[70] flex items-end justify-center p-0 md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)]"
            style={{ backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="push-onboarding-title"
            className="glass mat-float relative w-full max-w-[440px] overflow-hidden rounded-t-[34px] px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-7 text-center md:rounded-[34px] md:pb-7"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 80, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97, transition: { duration: 0.22 } }}
            transition={spring.moment}
          >
            <button
              type="button"
              onClick={() => close(mode === 'install' ? 'install-shown' : mode === 'success' ? 'done' : 'dismissed')}
              aria-label="Schließen"
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_7%,transparent)]"
            >
              <X className="size-5" />
            </button>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="flex flex-col items-center">
                {mode === 'intro' && (
                  <>
                    <BellHero />
                    <h2 id="push-onboarding-title" className="display mt-1 text-[30px]">
                      Bleib auf dem Laufenden.
                    </h2>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                      StudySpace erinnert dich an deine Lernaufgaben, kommende Prüfungen und eure gemeinsamen Erfolge. Damit du nichts Wichtiges verpasst.
                    </p>
                    <div className="mt-5 w-full">
                      <NotificationPreview title="Controlling steht heute an." body="Du hast noch 3 Aufgaben offen. Viel Erfolg beim Lernen!" delay={0.7} />
                      <p className="mt-2 text-[11px] text-faint">Beispiel – das Aussehen bestimmt dein Gerät.</p>
                    </div>
                    <div className="mt-6 flex w-full flex-col gap-2">
                      <Button variant="primary" size="lg" loading={busy} onClick={() => void activate()} className="w-full">
                        Benachrichtigungen aktivieren
                      </Button>
                      <Button variant="ghost" onClick={() => close('dismissed')} className="w-full">
                        Vielleicht später
                      </Button>
                    </div>
                    <p className="mt-3 text-[11.5px] text-faint">Erinnerungen gelten für „{me.name}“ auf diesem Gerät. Jederzeit änderbar in den Einstellungen.</p>
                  </>
                )}

                {mode === 'install' && (
                  <>
                    <BellHero size={72} />
                    <h2 id="push-onboarding-title" className="display mt-1 text-[27px]">
                      Erst auf den Home-Bildschirm
                    </h2>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                      Installiere StudySpace auf deinem Home-Bildschirm, um Benachrichtigungen zu erhalten. Apple erlaubt Mitteilungen nur für Web-Apps, die von dort gestartet werden.
                    </p>
                    <div className="mt-5 w-full">
                      <InstallSteps />
                    </div>
                    <Button variant="primary" size="lg" onClick={() => close('install-shown')} className="mt-6 w-full">
                      Verstanden
                    </Button>
                  </>
                )}

                {mode === 'success' && (
                  <>
                    <motion.span
                      className="grid size-20 place-items-center rounded-full text-white"
                      style={{ background: 'linear-gradient(135deg, #8fdcc0, var(--ss-success))', boxShadow: '0 14px 30px -10px var(--ss-success)' }}
                      initial={reduce ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                    >
                      <Check className="size-10" strokeWidth={2.6} />
                    </motion.span>
                    <h2 id="push-onboarding-title" className="display mt-5 text-[28px]">
                      Alles eingerichtet!
                    </h2>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                      Dieses Gerät erhält ab jetzt Erinnerungen für {me.name}. Uhrzeiten, Ruhezeiten und eine Testnachricht findest du in den Einstellungen.
                    </p>
                    <div className="mt-6 flex w-full flex-col gap-2">
                      <Button variant="primary" size="lg" onClick={() => close('done')} className="w-full">
                        Los geht’s
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          close('done');
                          navigate('/einstellungen/benachrichtigungen');
                        }}
                        className="w-full"
                      >
                        Einstellungen öffnen
                      </Button>
                    </div>
                  </>
                )}

                {(mode === 'denied' || mode === 'error') && (
                  <>
                    <BellHero size={64} />
                    <h2 id="push-onboarding-title" className="display mt-1 text-[26px]">
                      {mode === 'denied' ? 'Benachrichtigungen sind blockiert' : 'Das hat nicht geklappt'}
                    </h2>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                      {mode === 'denied'
                        ? 'Du kannst sie jederzeit in den Systemeinstellungen erlauben. StudySpace fragt nicht erneut von selbst.'
                        : error ?? 'Bitte später in den Einstellungen erneut versuchen.'}
                    </p>
                    <div className="mt-6 flex w-full flex-col gap-2">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => {
                          close('dismissed');
                          navigate('/einstellungen/benachrichtigungen');
                        }}
                        className="w-full"
                      >
                        Zu den Einstellungen
                      </Button>
                      <Button variant="ghost" onClick={() => close('dismissed')} className="w-full">
                        Schließen
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </PresenceContainer>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Personenwechsel auf einem Gerät mit aktiven Benachrichtigungen:
 * ausdrücklich fragen, für wen das Gerät künftig Erinnerungen erhält.
 */
export function PushMemberSwitch({ me, members }: { me: Member; members: Member[] }) {
  const phase = usePush((s) => s.phase);
  const deviceMember = usePush((s) => s.memberId);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pair = `${deviceMember}->${me.id}`;
  const keepKey = `studyspace.push.keep:${pair}`;
  let kept = false;
  try {
    kept = sessionStorage.getItem(keepKey) === '1';
  } catch {
    /* egal */
  }
  const other = members.find((m) => m.id === deviceMember);
  const open = phase === 'on' && !!deviceMember && deviceMember !== me.id && !kept && dismissed !== pair;

  const keep = () => {
    try {
      sessionStorage.setItem(keepKey, '1');
    } catch {
      /* egal */
    }
    setDismissed(pair);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <PresenceContainer className="fixed inset-x-0 bottom-[calc(var(--tabbar-height)+var(--tabbar-gap)+12px)] z-[65] flex justify-center px-4 md:bottom-6">
          <motion.div
            role="alertdialog"
            aria-labelledby="push-switch-title"
            className="glass mat-float w-full max-w-md rounded-[26px] p-4"
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.2 } }}
            transition={spring.moment}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[color-mix(in_srgb,var(--ss-accent)_18%,transparent)] text-accent">
                <BellRing className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p id="push-switch-title" className="text-[14.5px] font-semibold">
                  Erinnerungen für {me.name} erhalten?
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Dieses Gerät erhält bisher Benachrichtigungen für {other?.name ?? 'eine andere Person'}.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={keep}>
                Weiter für {other?.name ?? 'bisherige Person'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await setPushMember(me.id);
                  setBusy(false);
                  if (ok) toast.success(`Dieses Gerät erhält jetzt Erinnerungen für ${me.name}.`);
                  else toast.error('Die Zuordnung konnte nicht geändert werden.');
                }}
              >
                Für {me.name}
              </Button>
            </div>
          </motion.div>
        </PresenceContainer>
      )}
    </AnimatePresence>,
    document.body,
  );
}
