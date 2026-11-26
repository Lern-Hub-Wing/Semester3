import { useEffect } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Crown } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { celebrate } from '../components/Celebration';
import { useDesignChosen } from '../lib/accents';
import { haptic } from '../lib/haptics';
import type { RedeemResult } from './api';

type Move = Extract<RedeemResult, { kind: 'move' }>;
const KEY = 'studyspace.move.welcome';

/** Nach dem Einlösen eines Umzugs-Codes merken – die Begrüßung erscheint nach dem Neuladen. */
export function rememberMoveWelcome(res: Move): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(res));
  } catch {
    /* ohne Speicher: keine Begrüßung, alles andere funktioniert */
  }
}

function take(): Move | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Move;
    return v && v.kind === 'move' ? v : null;
  } catch {
    return null;
  }
}

const useMove = create<{ move: Move | null }>(() => ({ move: typeof window === 'undefined' ? null : take() }));
/** Steht noch eine Begrüßung aus? (Die Einführung wartet so lange.) */
export const useMoveWelcomePending = () => useMove((s) => s.move !== null);

/**
 * Persönliche Begrüßung nach dem Umzug: „Hallo Diana – du hast Lifetime Access vom Team erhalten,
 * dein Fortschritt ist da.“ Ruhig und hochwertig, mit feinem Glanz.
 */
export function MoveWelcome() {
  const move = useMove((s) => s.move);
  const chosen = useDesignChosen();
  const reduce = useReducedMotion();
  const open = !!move && chosen;
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void celebrate('big', ['#8B7BFF', '#C9B8F5', '#f3e3b5']), 450);
    return () => clearTimeout(t);
  }, [open]);
  const close = () => {
    haptic('success');
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* egal */
    }
    useMove.setState({ move: null });
  };
  const lifetime = move?.ends_at === null;
  const access = move ? (move.plan === 'plus_grant' ? 'StudySpace Gruppe' : 'StudySpace Solo') : '';
  const first = move?.member_name.split(/\s+/)[0] ?? '';

  return createPortal(
    <AnimatePresence>
      {open && move && (
        <motion.div key="move-welcome" className="fixed inset-0 z-[86] grid place-items-center overflow-y-auto bg-[var(--scrim)] p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-welcome-title"
            data-testid="move-welcome"
            className="card relative w-full max-w-[440px] overflow-hidden rounded-[28px] p-6 text-center"
            initial={reduce ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 10 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(70%_100%_at_50%_0%,color-mix(in_srgb,var(--ss-accent)_22%,transparent),transparent)]" />
            <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-[var(--ss-accent-soft)] text-accent">
              <Crown className="size-7" aria-hidden />
            </span>
            <p className="eyebrow relative mt-4">Willkommen bei StudySpace</p>
            <h2 id="move-welcome-title" className="title relative mt-1 text-[24px] leading-tight">
              Hallo {first}!
            </h2>
            <p className="relative mt-2 text-[15px] leading-relaxed text-muted">
              {lifetime ? (
                <>
                  Du hast <strong className="font-semibold text-ink">Lifetime Access</strong> zu {access} erhalten – ein Dankeschön vom StudySpace-Team fürs Mittesten.
                </>
              ) : (
                <>
                  Du hast <strong className="font-semibold text-ink">{access}</strong> erhalten – bis {new Date(move.ends_at!).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}.
                </>
              )}
            </p>
            {move.welcome && <p className="relative mx-auto mt-3 max-w-[34ch] rounded-2xl bg-[var(--ss-surface-2)] px-4 py-3 text-[14px] italic leading-relaxed">„{move.welcome}“</p>}
            <ul className="relative mx-auto mt-5 flex max-w-[320px] flex-col gap-2 text-left text-[14px]">
              <li className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0 text-success" aria-hidden /> Du bist in „{move.group_name}“
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0 text-success" aria-hidden />
                {move.tasks_done > 0 ? `Dein Fortschritt ist da – ${move.tasks_done} erledigte ${move.tasks_done === 1 ? 'Aufgabe' : 'Aufgaben'}` : 'Deine Lernzeiten und Haken sind übernommen'}
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0 text-success" aria-hidden /> {lifetime ? 'Für immer freigeschaltet – ohne Abo' : 'Alle Funktionen freigeschaltet'}
              </li>
            </ul>
            <Button variant="primary" size="lg" className="relative mt-6 w-full" onClick={close} data-testid="move-welcome-done">
              Los geht’s
            </Button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
