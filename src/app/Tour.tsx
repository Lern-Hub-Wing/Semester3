import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChartLine, Check, GraduationCap, NotebookPen, Search, Sparkles, Timer, UserPlus, UserRound, Users, X,
} from 'lucide-react';
import { navigate } from '../lib/router';
import { getSupabase } from '../lib/supabase';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import { Button } from '../components/ui/Button';
import { LogoMark } from '../components/Logo';
import { api } from './api';
import { useAccount } from './account';

/**
 * Geführte Einführung: Ein Lichtkegel wandert zu den echten Bedienelementen,
 * daneben erklärt eine Karte, was man dort tun kann. Passt sich an Gerät
 * (Seitenleiste oder Tab-Leiste) und Rolle (alleine, Mitglied, Inhaber) an.
 * „Überspringen“ steht immer oben links.
 */

interface TourState {
  open: boolean;
  step: number;
}
const useTour = create<TourState>(() => ({ open: false, step: 0 }));

const localKey = (uid: string) => `studyspace.app.tour.${uid}`;

/** Einführung (erneut) starten – z. B. aus den Einstellungen. */
export function startTour() {
  useUI.getState().set?.({ moreOpen: false, searchOpen: false });
  navigate('/');
  useTour.setState({ open: true, step: 0 });
}

interface Step {
  id: string;
  /** erste sichtbare Übereinstimmung wird hervorgehoben; ohne Ziel: Karte in der Mitte */
  targets?: string[];
  icon: ReactNode;
  title: string;
  text: string;
  /** anderer Text, wenn nur das Ersatzziel (z. B. „Mehr“) sichtbar ist */
  fallbackText?: string;
}

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function findTarget(step: Step): { el: HTMLElement | null; fallback: boolean } {
  for (let i = 0; i < (step.targets?.length ?? 0); i++) {
    const el = [...document.querySelectorAll(step.targets![i])].find(visible) ?? null;
    if (el) return { el: el as HTMLElement, fallback: i > 0 };
  }
  return { el: null, fallback: false };
}

function useSteps(): Step[] {
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const team = group?.kind === 'team';
  const owner = !!group?.is_owner;
  return useMemo(() => {
    const steps: Step[] = [
      {
        id: 'welcome',
        icon: <Sparkles />,
        title: team ? `Willkommen in „${group?.name}“!` : 'Willkommen in deinem Lernbereich!',
        text: 'In einer Minute zeige ich dir, wo du was findest und wie du loslegst. Du kannst jederzeit oben links überspringen.',
      },
      {
        id: 'subjects',
        targets: ['[data-tour="nav-faecher"]', '[data-tour="nav-mehr"]'],
        icon: <BookOpen />,
        title: 'Starte mit deinen Fächern',
        text: 'Lege deine Fächer an und trage die Prüfungstermine ein. Daraus entstehen Countdown und Fortschritt.',
        fallbackText: 'Unter „Mehr“ findest du Fächer & Prüfungen. Lege dort deine Fächer an und trage die Prüfungstermine ein.',
      },
      {
        id: 'hero',
        targets: ['[data-testid="dashboard-hero"]'],
        icon: <GraduationCap />,
        title: 'Deine nächste Prüfung',
        text: 'Hier läuft der Countdown zur nächsten Prüfung. Mit „Fokus starten“ legst du sofort los.',
      },
      {
        id: 'plan',
        targets: ['[data-tour="nav-lernplan"]'],
        icon: <CalendarDays />,
        title: 'Lernplan & Kalender',
        text: team
          ? 'Plane gemeinsame Lerntage mit Aufgaben. Jede Person hakt für sich ab – so sieht jeder seinen eigenen Fortschritt.'
          : 'Plane Lerntage mit Aufgaben und hake sie ab – dein Fortschritt wächst mit jedem Haken.',
      },
      {
        id: 'homework',
        targets: ['[data-tour="nav-hausaufgaben"]'],
        icon: <NotebookPen />,
        title: 'Hausaufgaben',
        text: 'Mit Abgabedatum und Unteraufgaben. Auf Wunsch verteilt StudySpace Arbeitseinheiten bis zum Tag vor der Abgabe.',
      },
      {
        id: 'focus',
        targets: ['[data-tour="nav-fokus"]'],
        icon: <Timer />,
        title: 'Fokus-Modus',
        text: 'Pomodoro im Vollbild, mit Lofi, Regen oder Stille. Nur echte Fokuszeit zählt in deine Lernzeit.',
      },
      team
        ? {
            id: 'team',
            targets: ['[data-tour="nav-team"]', '[data-tour="nav-mehr"]'],
            icon: <Users />,
            title: 'Euer Team',
            text: 'Fortschritt und Lernzeit aller auf einen Blick – motivierend, ohne Druck.',
            fallbackText: 'Unter „Mehr“ → Team seht ihr Fortschritt und Lernzeit aller auf einen Blick.',
          }
        : {
            id: 'stats',
            targets: ['[data-tour="nav-analyse"]', '[data-tour="nav-mehr"]'],
            icon: <ChartLine />,
            title: 'Deine Statistik',
            text: 'Wie viel du gelernt hast, wo du stehst und was als Nächstes ansteht.',
            fallbackText: 'Unter „Mehr“ → Statistiken siehst du, wie viel du gelernt hast und wo du stehst.',
          },
      {
        id: 'search',
        targets: ['[aria-label="Suche öffnen"]'],
        icon: <Search />,
        title: 'Alles schnell finden',
        text: 'Suche Aufgaben, Fächer und Hausaufgaben – am Computer auch mit ⌘K bzw. Strg+K.',
      },
      {
        id: 'profile',
        targets: ['[data-testid="profile-button"]'],
        icon: team && owner ? <UserPlus /> : <UserRound />,
        title: team && owner ? 'Freunde einladen' : 'Konto & Tarif',
        text:
          team && owner
            ? 'Über dein Profil → Lerngruppe findest du Einladungslink und Code. Bis zu sieben Freunde lernen kostenlos mit.'
            : 'Über dein Profil erreichst du Konto, Lernbereich und deinen Tarif – und kannst diese Einführung jederzeit wieder ansehen.',
      },
      {
        id: 'done',
        icon: <Check />,
        title: 'Alles bereit!',
        text: 'Am besten legst du jetzt dein erstes Fach mit Prüfungstermin an – der Rest ergibt sich fast von selbst.',
      },
    ];
    return steps;
  }, [team, owner, group?.name]);
}

const PAD = 8;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bindet die Einführung ein und startet sie beim ersten Besuch automatisch. */
export function TourHost() {
  const me = useAccount((s) => s.me);
  const phase = useData((s) => s.phase);
  const open = useTour((s) => s.open);

  useEffect(() => {
    if (!me || me.tutorial_done || phase !== 'ready') return;
    try {
      if (localStorage.getItem(localKey(me.user_id)) === 'done') return;
    } catch {
      /* ohne Speicher entscheidet nur der Server */
    }
    const t = setTimeout(() => startTour(), 1400);
    return () => clearTimeout(t);
  }, [me, phase]);

  return <AnimatePresence>{open && <TourOverlay key="tour" />}</AnimatePresence>;
}

function finish() {
  const me = useAccount.getState().me;
  useTour.setState({ open: false, step: 0 });
  if (!me) return;
  try {
    localStorage.setItem(localKey(me.user_id), 'done');
  } catch {
    /* ignorieren */
  }
  if (!me.tutorial_done) {
    useAccount.setState({ me: { ...me, tutorial_done: true } });
    void api.tutorialDone(getSupabase()).catch(() => undefined);
  }
}

function TourOverlay() {
  const reduce = useReducedMotion();
  const steps = useSteps();
  const stepIndex = useTour((s) => s.step);
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const cardRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [fallback, setFallback] = useState(false);
  const [vw, setVw] = useState(window.innerWidth);
  const [vh, setVh] = useState(window.innerHeight);
  const [card, setCard] = useState({ w: 340, h: 230 });

  // Schritte ohne sichtbares Ziel (z. B. Suche auf dem Handy) werden übersprungen
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const measure = useCallback(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    if (!step.targets) {
      setRect(null);
      return;
    }
    const { el, fallback: fb } = findTarget(step);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    const b = el.getBoundingClientRect();
    setFallback(fb);
    setRect({ x: b.left - PAD, y: b.top - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2 });
  }, [step, reduce]);

  const go = useCallback(
    (dir: 1 | -1) => {
      let i = stepIndex + dir;
      // Ziel fehlt → weiter in dieselbe Richtung
      while (i > 0 && i < steps.length - 1 && steps[i].targets && !findTarget(steps[i]).el) i += dir;
      if (i >= steps.length) return finish();
      useTour.setState({ step: Math.max(0, i) });
    },
    [stepIndex, steps],
  );

  useLayoutEffect(() => {
    measure();
    const t = setTimeout(measure, 350); // nach Scroll/Animation erneut ausrichten
    return () => clearTimeout(t);
  }, [measure]);

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      cancelAnimationFrame(raf);
    };
  }, [measure]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCard({ w: el.offsetWidth, h: el.offsetHeight });
  }, [stepIndex, fallback, vw]);

  // Position der Karte: rechts neben der Seitenleiste, sonst unter/über dem Ziel
  const M = 12;
  let cx = (vw - card.w) / 2;
  let cy = (vh - card.h) / 2;
  if (rect) {
    const sidebar = rect.x < 140 && rect.w < 300 && vw >= 768;
    if (sidebar) {
      cx = rect.x + rect.w + 16;
      cy = rect.y + rect.h / 2 - card.h / 2;
    } else {
      cx = rect.x + rect.w / 2 - card.w / 2;
      const below = rect.y + rect.h + 14;
      cy = below + card.h + M < vh ? below : rect.y - card.h - 14;
    }
    cx = Math.min(Math.max(M, cx), vw - card.w - M);
    cy = Math.min(Math.max(M + 44, cy), vh - card.h - M);
  }

  const spot = rect ?? { x: vw / 2, y: vh / 2, w: 0, h: 0 };
  const isLast = stepIndex >= steps.length - 1;
  const team = group?.kind === 'team';
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 170, damping: 24 };
  const text = fallback && step.fallbackText ? step.fallbackText : step.text;

  return (
    <motion.div
      className="fixed inset-0 z-[200]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Einführung"
      data-testid="tour"
    >
      {/* Abdunkeln mit Aussparung um das Ziel (Klicks gehen nicht an die App) */}
      <motion.div
        className="pointer-events-none absolute rounded-[18px]"
        initial={false}
        animate={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}
        transition={spring}
        style={{ boxShadow: '0 0 0 200vmax rgba(12, 10, 32, 0.62)' }}
      >
        {rect && !reduce && (
          <motion.span
            className="absolute inset-0 rounded-[18px] ring-2 ring-[var(--ss-accent)]"
            animate={{ opacity: [0.9, 0.35, 0.9], scale: [1, 1.04, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </motion.div>
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Überspringen: immer oben links */}
      <button
        type="button"
        onClick={finish}
        className="glass absolute left-3 top-[max(env(safe-area-inset-top),12px)] z-10 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-ink"
        data-testid="tour-skip"
      >
        <X className="size-4" aria-hidden /> Überspringen
      </button>

      <motion.div
        ref={cardRef}
        key={step.id}
        className="glass mat-float absolute w-[min(360px,calc(100vw-24px))] rounded-[24px] p-5"
        initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1, left: cx, top: cy }}
        transition={reduce ? { duration: 0 } : { opacity: { duration: 0.25 }, y: { type: 'spring', stiffness: 260, damping: 22 }, scale: { duration: 0.25 }, left: spring, top: spring }}
        style={{ left: cx, top: cy }}
        data-testid={`tour-step-${step.id}`}
      >
        <div className="mb-3 flex items-center gap-3">
          <motion.span
            className="grid size-11 shrink-0 place-items-center rounded-[14px] text-white [&_svg]:size-[22px]"
            style={{ background: 'linear-gradient(135deg, #8B7BFF, #5E5CE6)' }}
            initial={reduce ? false : { rotate: -12, scale: 0.6 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.05 }}
            aria-hidden
          >
            {step.id === 'welcome' ? <LogoMark size={26} /> : step.icon}
          </motion.span>
          <h2 className="title text-[18px] leading-tight">{step.title}</h2>
        </div>
        <p className="text-[14px] leading-relaxed text-muted">{text}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1.5" aria-label={`Schritt ${stepIndex + 1} von ${steps.length}`}>
            {steps.map((s, i) => (
              <motion.span
                key={s.id}
                className="h-1.5 rounded-full bg-[var(--ss-accent)]"
                animate={{ width: i === stepIndex ? 18 : 6, opacity: i <= stepIndex ? 1 : 0.25 }}
                transition={{ duration: reduce ? 0 : 0.25 }}
              />
            ))}
          </div>
          {stepIndex > 0 && !isLast && (
            <button type="button" className="grid size-9 place-items-center rounded-full text-muted hover:text-ink" onClick={() => go(-1)} aria-label="Zurück">
              <ArrowLeft className="size-4" aria-hidden />
            </button>
          )}
          {!isLast && (
            <Button size="sm" variant="primary" onClick={() => go(1)} data-testid="tour-next">
              {stepIndex === 0 ? 'Los geht’s' : 'Weiter'} <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        {isLast && (
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" onClick={() => (finish(), navigate('/faecher'))} data-testid="tour-first-subject">
              <BookOpen className="size-4" aria-hidden /> Erstes Fach anlegen
            </Button>
            {team && group?.is_owner && (
              <Button onClick={() => (finish(), navigate('/einstellungen/gruppe'))}>
                <UserPlus className="size-4" aria-hidden /> Freunde einladen
              </Button>
            )}
            <Button variant="ghost" onClick={finish} data-testid="tour-done">
              Selbst umsehen
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
