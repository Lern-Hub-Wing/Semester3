import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Coffee, Maximize2, Music, Music2, Pause, Play, RotateCcw, SlidersHorizontal, Square, Timer } from 'lucide-react';
import { FOCUS_PRESETS, formatClock, isRunning, progressOf, remainingSec } from '../lib/focus';
import { unlockAudio } from '../lib/chime';
import { haptic } from '../lib/haptics';
import { enterFullscreen } from '../lib/fullscreen';
import { navigate } from '../lib/router';
import { spring } from '../lib/motion';
import { useNow } from '../hooks/useNow';
import { useIsMobile } from '../hooks/useMediaQuery';
import { currentPreset, focusActions, useFocus } from '../store/focus';
import { useCurrentMember, useModules } from '../store/derived';
import { useData } from '../store/data';

/** Live-Zustand des Timers (aktualisiert 4× pro Sekunde, solange er läuft) */
export function useFocusLive() {
  const timer = useFocus((s) => s.timer);
  const running = isRunning(timer);
  const now = useNow(running ? 250 : 1000);
  const rest = remainingSec(timer, now);
  return { timer, running, started: running || timer.pausedRemainingSec !== null, rest, progress: progressOf(timer, now), isBreak: timer.phase === 'break' };
}

/** Großer Ring mit Lichtpunkt, der während einer laufenden Session um den Bogen wandert */
export function FocusRing({ size, stroke, children }: { size: number; stroke: number; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const { running, progress, isBreak } = useFocusLive();
  const id = `fr-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pad = Math.ceil(stroke * 4);
  const color = isBreak ? 'var(--ss-success)' : 'var(--ss-accent)';
  const angle = progress * 360;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isBreak ? '#c8f3e2' : 'var(--ss-accent-2)'} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id={`${id}-glow`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={stroke * 0.8} />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ss-track)" strokeWidth={stroke} />
        {progress > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} opacity={running ? 0.55 : 0.3} filter={`url(#${id}-glow)`} />
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
          animate={{ strokeDashoffset: c * (1 - progress) }}
          transition={reduce ? { duration: 0 } : { duration: running ? 0.3 : 0.6, ease: 'linear' }}
        />
        {/* Lichtpunkt am Ende des Bogens – zeigt sofort: die Session läuft */}
        {running && progress > 0.004 && (
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}>
            <circle cx={size - stroke / 2} cy={size / 2} r={stroke * 0.95} fill="white" opacity={0.95} />
            {!reduce && (
              <motion.circle
                cx={size - stroke / 2}
                cy={size / 2}
                r={stroke * 0.95}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                animate={{ r: [stroke * 0.95, stroke * 2.2], opacity: [0.7, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </g>
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Große, laufende Uhr mit gleich breiten Ziffern; jede Sekunde springt sichtbar weiter */
export function FocusDigits({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const { rest } = useFocusLive();
  const text = formatClock(rest);
  return (
    <span className={`num inline-flex font-semibold leading-none tracking-[-0.045em] ${className}`} aria-hidden data-testid="focus-time" data-value={text}>
      {text.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="relative inline-block w-[0.62em] overflow-hidden text-center" style={{ height: '1.05em' }}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch + i}
                className="absolute inset-0"
                initial={reduce ? false : { y: '-70%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduce ? undefined : { y: '70%', opacity: 0 }}
                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : (
          <span key={i} className="inline-block w-[0.3em] text-center opacity-70">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

export function FocusStatusChip() {
  const { running, started, isBreak } = useFocusLive();
  const label = isBreak ? (running ? 'Pause läuft' : 'Pause') : running ? 'Fokus läuft' : started ? 'Pausiert' : 'Bereit';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold ${running ? 'lens text-ink' : 'bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)] text-muted'}`} data-testid="focus-status">
      <span className="relative flex size-2">
        {running && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-70" style={{ background: isBreak ? 'var(--ss-success)' : 'var(--ss-accent)' }} />}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: running ? (isBreak ? 'var(--ss-success)' : 'var(--ss-accent)') : 'var(--ss-text-3)' }} />
      </span>
      {label}
    </span>
  );
}

function RoundButton({ label, onClick, disabled, children, active }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; active?: boolean }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      whileTap={{ scale: 0.88 }}
      transition={spring.micro}
      onClick={onClick}
      className={`glass mat-interactive grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40 ${active ? 'text-accent' : 'text-ink'}`}
    >
      {children}
    </motion.button>
  );
}

/** Steuerung: Signalton · Zurücksetzen · Start/Pause · Beenden · Einstellungen */
export function FocusControlBar({ onSettings, big = true }: { onSettings?: () => void; big?: boolean }) {
  const me = useCurrentMember();
  const sound = useFocus((s) => s.settings.sound);
  const setSettings = useFocus((s) => s.setSettings);
  const { running, started, timer } = useFocusLive();
  return (
    <div className="flex items-center justify-center gap-3">
      <RoundButton label={sound ? 'Signalton aus' : 'Signalton an'} active={sound} onClick={() => setSettings({ sound: !sound })}>
        {sound ? <Music2 className="size-[18px]" /> : <Music className="size-[18px] opacity-60" />}
      </RoundButton>
      <RoundButton label="Zurücksetzen" disabled={!started} onClick={() => focusActions.reset()}>
        <RotateCcw className="size-[18px]" />
      </RoundButton>
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
        className={`btn-primary grid ${big ? 'size-16' : 'size-13'} shrink-0 place-items-center rounded-full`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={running ? 'p' : 's'} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring.micro}>
            {running ? <Pause className="size-6" fill="currentColor" /> : <Play className="ml-0.5 size-6" fill="currentColor" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <RoundButton label="Fokus beenden und Zeit speichern" disabled={!started || timer.phase !== 'focus' || !me} onClick={() => me && void focusActions.finishEarly(me.id)}>
        <Square className="size-4" />
      </RoundButton>
      {onSettings && (
        <RoundButton label="Fokus-Einstellungen" onClick={onSettings}>
          <SlidersHorizontal className="size-[18px]" />
        </RoundButton>
      )}
    </div>
  );
}

function FocusSettings() {
  const presetIndex = useFocus((s) => s.settings.presetIndex);
  const timer = useFocus((s) => s.timer);
  const modules = useModules();
  const locked = isRunning(timer);
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Fokus-Rhythmus" className="flex flex-wrap gap-2">
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
      <select className="field !min-h-10 !py-2" value={timer.moduleId ?? ''} onChange={(e) => focusActions.setModule(e.target.value || null)} aria-label="Modul für diese Fokusphase">
        <option value="">Kein bestimmtes Modul</option>
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Fokus starten und direkt in die Vollbild-Ansicht wechseln (aus einem Klick heraus) */
export function openFocusFullscreen() {
  haptic('select');
  unlockAudio();
  void enterFullscreen();
  navigate('/fokus/vollbild');
}

/**
 * Breites Fokus-Panel (Querformat): links der Ring, rechts großer Countdown,
 * Live-Fortschritt, Session-Infos und Steuerung.
 */
export function FocusPanel({ compact = false, stage = false }: { compact?: boolean; stage?: boolean }) {
  const { running, rest, progress, timer, isBreak } = useFocusLive();
  const modules = useData((s) => s.modules);
  const [showSettings, setShowSettings] = useState(false);
  const mobile = useIsMobile();
  const preset = currentPreset();
  const elapsed = Math.max(0, timer.durationSec - rest);
  const module = timer.moduleId ? modules[timer.moduleId] : null;
  const endsAtLabel = timer.endsAt ? new Date(timer.endsAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings) return;
    const close = (e: PointerEvent) => !panelRef.current?.contains(e.target as Node) && setShowSettings(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showSettings]);

  return (
    <div ref={panelRef} className={`relative flex flex-col items-center justify-center gap-5 sm:flex-row sm:items-center ${stage ? 'sm:gap-14' : 'sm:gap-8'}`} data-testid="focus-panel">
      <div className="glass shrink-0 rounded-full p-2.5">
      <FocusRing size={compact ? 150 : stage ? (mobile ? 184 : 236) : 200} stroke={compact ? 9 : stage && mobile ? 10 : 12}>
        <div>
          {isBreak ? <Coffee className="mx-auto size-6 text-success" aria-hidden /> : <Timer className="mx-auto size-6 text-accent" aria-hidden />}
          <p className="num mt-1.5 text-[13px] font-semibold text-muted">{Math.round(progress * 100)} %</p>
        </div>
      </FocusRing>
      </div>
      <div className={`flex min-w-0 flex-col items-center gap-3 sm:items-start ${stage ? '' : 'flex-1'}`}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <FocusStatusChip />
          <span className="text-[12.5px] text-muted">
            {isBreak ? `${preset.rest} Min. Pause` : `${preset.focus} Min. Fokus`}
            {module ? ` · ${module.name}` : ''}
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {isBreak ? 'Pause' : 'Fokuszeit'}, noch {Math.ceil(rest / 60)} Minuten{running ? '' : ', angehalten'}
        </p>
        <FocusDigits className={`${compact ? 'text-[56px] md:text-[64px]' : 'text-[76px] md:text-[112px]'}`} />
        <div className={`w-full ${stage ? 'max-w-[460px]' : 'max-w-md'}`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ss-track)]" role="progressbar" aria-label="Fortschritt der Phase" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%`, background: isBreak ? 'var(--ss-success)' : 'linear-gradient(90deg, var(--ss-accent-2), var(--ss-accent))' }} />
          </div>
          <div className="num mt-1.5 flex justify-between text-[11.5px] text-muted">
            <span>{formatClock(elapsed)} vergangen</span>
            <span>{endsAtLabel ? `Ende um ${endsAtLabel}` : `noch ${formatClock(rest)}`}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <FocusControlBar onSettings={() => setShowSettings((v) => !v)} big={!compact} />
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (!isRunning(useFocus.getState().timer)) focusActions.start();
              openFocusFullscreen();
            }}
            aria-label="Fokus im Vollbild"
            title="Fokus im Vollbild"
            className="glass mat-interactive hidden size-11 place-items-center rounded-full sm:grid"
          >
            <Maximize2 className="size-[18px]" />
          </motion.button>
        </div>
        <AnimatePresence initial={false}>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md overflow-hidden"
            >
              <div className="glass mat-float mt-1 rounded-[22px] p-4">
                <p className="mb-3 text-[13px] font-semibold">Rhythmus & Modul</p>
                <FocusSettings />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
