import { useEffect, useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Coffee, Pause, Play, RotateCcw, Square, Timer } from 'lucide-react';
import { FOCUS_PRESETS, formatClock, isRunning, progressOf, remainingSec } from '../lib/focus';
import { playChime, unlockAudio } from '../lib/chime';
import { haptic } from '../lib/haptics';
import { Link } from '../lib/router';
import { spring } from '../lib/motion';
import { useNow } from '../hooks/useNow';
import { focusActions, tickFocus, useFocus } from '../store/focus';
import { useCurrentMember } from '../store/derived';
import { toast } from '../store/toast';
import { IconButton } from './ui/Button';

/** Großer Fokus-Ring mit Uhr – geometrisch exakt, Fortschritt im Uhrzeigersinn. */
export function FocusDial({ size = 220, stroke = 10 }: { size?: number; stroke?: number }) {
  const reduce = useReducedMotion();
  const timer = useFocus((s) => s.timer);
  const running = isRunning(timer);
  const now = useNow(running ? 250 : 1000);
  const rest = remainingSec(timer, now);
  const p = progressOf(timer, now);
  const id = `fd-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const isBreak = timer.phase === 'break';
  const color = isBreak ? 'var(--ss-success)' : 'var(--ss-accent)';
  const pad = Math.ceil(stroke * 4);
  // Markierungen wie bei einer Uhr (60 Striche, jeder fünfte länger)
  const ticks = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isBreak ? '#bdf0dc' : 'var(--ss-accent-2)'} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id={`${id}-glow`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={stroke * 0.7} />
          </filter>
        </defs>
        {ticks.map((i) => {
          const a = (i / 60) * Math.PI * 2;
          const long = i % 5 === 0;
          const r1 = r - stroke - (long ? 9 : 5);
          const r2 = r - stroke - 2;
          return (
            <line
              key={i}
              x1={size / 2 + r1 * Math.cos(a)}
              y1={size / 2 + r1 * Math.sin(a)}
              x2={size / 2 + r2 * Math.cos(a)}
              y2={size / 2 + r2 * Math.sin(a)}
              stroke="var(--ss-text)"
              strokeOpacity={long ? 0.28 : 0.12}
              strokeWidth={long ? 1.6 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ss-track)" strokeWidth={stroke} />
        {p > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} opacity={0.45} filter={`url(#${id}-glow)`} />
        )}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={reduce ? { duration: 0 } : { duration: running ? 0.3 : 0.6, ease: 'linear' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="num font-semibold leading-none tracking-tight" style={{ fontSize: size * 0.2, letterSpacing: '-0.04em' }} aria-live="off">
            {formatClock(rest)}
          </p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
            {isBreak ? <Coffee className="size-3.5" aria-hidden /> : <Timer className="size-3.5" aria-hidden />}
            {isBreak ? 'Pause' : 'Fokus'}
          </p>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {isBreak ? 'Pause' : 'Fokuszeit'}, noch {Math.ceil(rest / 60)} Minuten{running ? '' : ', angehalten'}
      </span>
    </div>
  );
}

/** Bedienelemente: Start/Pause groß in der Mitte, Zurücksetzen und Beenden daneben. */
export function FocusControls({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const me = useCurrentMember();
  const timer = useFocus((s) => s.timer);
  const running = isRunning(timer);
  const started = running || timer.pausedRemainingSec !== null;
  const big = size === 'lg' ? 'size-16' : 'size-12';
  return (
    <div className="flex items-center justify-center gap-4">
      <IconButton label="Zurücksetzen" variant="glass" size="md" onClick={() => focusActions.reset()} disabled={!started}>
        <RotateCcw className="size-[18px]" />
      </IconButton>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        transition={spring.micro}
        onClick={() => {
          haptic('select');
          unlockAudio();
          if (running) focusActions.pause();
          else focusActions.start();
        }}
        aria-label={running ? 'Fokus pausieren' : started ? 'Fokus fortsetzen' : 'Fokus starten'}
        className={`btn-primary grid ${big} place-items-center rounded-full`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={running ? 'p' : 's'} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring.micro}>
            {running ? <Pause className="size-6" fill="currentColor" /> : <Play className="ml-0.5 size-6" fill="currentColor" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <IconButton
        label="Fokus beenden und Zeit speichern"
        variant="glass"
        size="md"
        disabled={!started || timer.phase !== 'focus' || !me}
        onClick={() => me && void focusActions.finishEarly(me.id)}
      >
        <Square className="size-4" />
      </IconButton>
    </div>
  );
}

export function FocusPresetPicker() {
  const presetIndex = useFocus((s) => s.settings.presetIndex);
  const timer = useFocus((s) => s.timer);
  const locked = isRunning(timer);
  return (
    <div role="radiogroup" aria-label="Fokus-Rhythmus" className="flex justify-center gap-2">
      {FOCUS_PRESETS.map((p, i) => (
        <button
          key={p.label}
          type="button"
          role="radio"
          aria-checked={presetIndex === i}
          disabled={locked && presetIndex !== i}
          onClick={() => focusActions.choosePreset(i)}
          className={`num rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${presetIndex === i ? 'lens text-ink' : 'text-muted hover:text-ink'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Kompakte Karte fürs Dashboard */
export function FocusMini() {
  return (
    <div className="flex flex-col items-center gap-4">
      <FocusDial size={150} stroke={8} />
      <FocusControls size="md" />
      <Link to="/fokus" className="text-[13px] font-medium text-accent">
        Fokus-Bereich öffnen
      </Link>
    </div>
  );
}

/**
 * Läuft unsichtbar im Hintergrund: beendet abgelaufene Phasen, speichert
 * Fokuszeiten, spielt einen Ton und zeigt – falls erlaubt und die App gerade
 * nicht sichtbar ist – eine lokale Systembenachrichtigung.
 */
export function FocusWatcher() {
  const me = useCurrentMember();
  const running = useFocus((s) => s.timer.endsAt !== null);
  const sound = useFocus((s) => s.settings.sound);
  const now = useNow(running ? 1000 : 60_000);
  useEffect(() => {
    if (!running) return;
    void tickFocus(me?.id ?? null, now).then((done) => {
      if (!done) return;
      haptic('success');
      if (sound) playChime();
      const msg = done === 'focus' ? 'Fokuszeit geschafft – Zeit für eine Pause.' : 'Pause vorbei – bereit für die nächste Fokusrunde?';
      toast.success(msg);
      void showLocalNotification(done === 'focus' ? 'Fokuszeit geschafft' : 'Pause vorbei', msg);
    });
  }, [now, running, me?.id, sound]);
  return null;
}

async function showLocalNotification(title: string, body: string) {
  try {
    if (document.visibilityState === 'visible') return;
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.showNotification(title, { body, tag: 'focus-timer', icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, data: { url: '#/fokus' } });
  } catch {
    /* nicht unterstützt */
  }
}
