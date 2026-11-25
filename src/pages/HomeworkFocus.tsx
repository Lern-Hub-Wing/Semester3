import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, ListChecks, Maximize, Minimize, Pause, Play, SlidersHorizontal, Square, X } from 'lucide-react';
import type { Member } from '../lib/types';
import { CLOCK_FONTS, loadClockFont } from '../lib/studyMode';
import { digitDuration } from '../lib/focusLook';
import { isLightBackground } from '../lib/clockLook';
import { elapsedOf, formatElapsed } from '../lib/stopwatch';
import { MIN_SESSION_SEC } from '../lib/focus';
import { alpha } from '../lib/colors';
import { haptic } from '../lib/haptics';
import { spring } from '../lib/motion';
import { navigate } from '../lib/router';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, wakeLockSupported } from '../lib/fullscreen';
import { returnPath } from '../lib/focusReturn';
import { hwKey } from '../lib/homework';
import { useFocus } from '../store/focus';
import { useData } from '../store/data';
import { setHomeworkDone, useHomework } from '../store/homework';
import { stopwatchActions, useStopwatch } from '../store/stopwatch';
import { useNow } from '../hooks/useNow';
import { pauseOnLeave } from '../store/autoPause';
import { RollingDigits } from '../components/FocusPanel';
import { BarButton, FocusBackdrop } from '../components/focus/FocusChrome';
import { FocusSettingsPanel } from '../components/focus/FocusSettingsPanel';
import { TaskCheckbox } from '../components/ui/TaskCheckbox';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Hausaufgaben-Zähler: Vollbild im gemeinsamen Uhr-Design (wie Fokus und
 * Lernmodus). Die Zeit zählt einfach hoch; beim Beenden wird sie als
 * Lernzeit des Fachs gespeichert und auf Wunsch die Hausaufgabe abgehakt.
 */
export function HomeworkFocus({ homeworkId, me }: { homeworkId: string; me: Member }) {
  const reduce = useReducedMotion();
  const look = useFocus((s) => s.look);
  const hw = useHomework((s) => s.homework[homeworkId]);
  const partsMap = useHomework((s) => s.parts);
  const completions = useHomework((s) => s.completions);
  const module = useData((s) => (hw ? s.modules[hw.module_id] : undefined));
  const sw = useStopwatch((s) => s.state);
  const now = useNow(sw?.runningSince != null ? 250 : 1000);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState<'none' | 'steps' | 'design'>('none');
  const [ask, setAsk] = useState<null | number>(null);
  const [fs, setFs] = useState(isFullscreen);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontDef = CLOCK_FONTS.find((f) => f.id === look.font) ?? CLOCK_FONTS[0]!;
  const light = isLightBackground(look);

  // Zähler für diese Hausaufgabe (läuft er schon, geht er weiter)
  useEffect(() => {
    if (hw) stopwatchActions.open(hw.id, hw.module_id, me.id);
  }, [hw?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadClockFont(look.font);
  }, [look.font]);
  // Zähler schließen → pausieren (Lernzeit zählt nur, solange man hier ist)
  useEffect(() => () => pauseOnLeave('stopwatch'), []);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => setFs(isFullscreen());
    window.addEventListener('resize', on);
    document.addEventListener('fullscreenchange', onFs);
    if (useFocus.getState().settings.fullscreenOnOpen && fullscreenSupported() && !isFullscreen()) void enterFullscreen({ lockLandscape: false });
    return () => {
      window.removeEventListener('resize', on);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const running = !!sw && sw.runningSince !== null && sw.homeworkId === homeworkId;
  const elapsed = sw && sw.homeworkId === homeworkId ? elapsedOf(sw, now) : 0;

  // Bildschirm wach halten, solange gezählt wird
  useEffect(() => {
    if (!running || !wakeLockSupported()) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* nicht erlaubt */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [running]);

  // Bedienelemente nach einer Weile ausblenden (wie im Fokus)
  const poke = () => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (look.autoHide && running && panel === 'none') hideTimer.current = setTimeout(() => setControls(false), look.hideDelay * 1000);
  };
  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [running, panel]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => (hw ? Object.values(partsMap).filter((p) => p.homework_id === hw.id && !p.deleted_at).sort((a, b) => a.sort_order - b.sort_order) : []), [partsMap, hw]);
  const isDone = (id: string) => completions[hwKey(id, me.id)]?.is_completed === true;

  function leave() {
    void exitFullscreen();
    navigate(returnPath().startsWith('/hausaufgaben/fokus') ? '/hausaufgaben' : returnPath());
  }

  async function finish() {
    haptic('select');
    const sec = await stopwatchActions.finish(me.id);
    if (hw && !isDone(hw.id) && sec >= 1) setAsk(sec);
    else leave();
  }

  // Hausaufgabe gelöscht oder nicht (mehr) sichtbar
  if (!hw) {
    return (
      <div className="dark focus-scope fixed inset-0 z-50 grid place-items-center bg-[#0b0c1c] p-8 text-center text-white" data-theme="dark" data-testid="hwfocus-missing">
        <div className="flex flex-col items-center gap-4">
          <p className="text-[17px] font-semibold">Diese Hausaufgabe gibt es nicht mehr.</p>
          <button type="button" className="focus-bar rounded-full px-5 py-2.5 text-[14px] font-semibold" onClick={() => (stopwatchActions.discard(), navigate('/hausaufgaben'))}>
            Zu den Hausaufgaben
          </button>
        </div>
      </div>
    );
  }

  const landscape = vp.w > vp.h;
  const text = formatElapsed(elapsed);
  const chars = text.length * 0.55;
  const k = look.size / 100;
  const fontPx = Math.round(Math.max(48, Math.min(((vp.w * 0.88) / chars) * k, (landscape ? vp.h * 0.42 : vp.h * 0.24) * k)));
  const glow = look.glow && look.glowStrength > 0 ? `drop-shadow(0 0 ${Math.round(4 + look.glowStrength * 0.32)}px ${alpha(look.color, 0.25 + look.glowStrength / 250)})` : undefined;
  const justify = look.position === 'top' ? 'justify-start pt-[18vh]' : look.position === 'bottom' ? 'justify-end pb-[22vh]' : 'justify-center';
  const clock = new Date(now);
  const color = module?.color ?? '#AFC5F5';
  const doneSteps = steps.filter((p) => isDone(hw.id) || isDone(p.id)).length;

  return (
    <div
      className="dark focus-scope fixed inset-0 z-50 overflow-hidden text-[#f2f5fa]"
      data-theme="dark"
      data-light={light ? 'true' : undefined}
      data-testid="hwfocus"
      data-running={running ? 'true' : 'false'}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, input, a, [data-panel]')) return poke();
        if (e.pointerType !== 'mouse' && controls && running && look.autoHide) setControls(false);
        else poke();
      }}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
      style={{ cursor: controls ? 'auto' : 'none', background: '#0b0c1c' }}
    >
      <FocusBackdrop />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(80% 60% at 50% 40%, ${alpha(color, light ? 0.1 : 0.16)}, transparent 70%)` }} />

      <motion.div
        initial={false}
        animate={{ opacity: controls ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.35 }}
        style={{ pointerEvents: controls ? 'auto' : 'none' }}
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)] sm:px-6"
      >
        <BarButton label="Zähler schließen (pausiert)" onClick={leave}>
          <X className="size-[18px]" />
        </BarButton>
        <span className="num rounded-full px-3 py-1 text-[13px] font-semibold text-white/80" data-testid="hwfocus-clock" aria-label="Uhrzeit">
          {pad(clock.getHours())}:{pad(clock.getMinutes())}
        </span>
        {fullscreenSupported() ? (
          <BarButton label={fs ? 'Vollbild verlassen' : 'Vollbild'} onClick={() => (fs ? void exitFullscreen() : void enterFullscreen({ lockLandscape: false }))}>
            {fs ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </BarButton>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </motion.div>

      <main className={`relative z-10 flex h-full flex-col items-center ${justify} gap-[3vh] px-6 text-center`}>
        <div className="flex max-w-[min(92vw,720px)] flex-col items-center gap-2">
          <p className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.2em] text-white/80 sm:text-[13.5px]">
            <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
            Hausaufgabe{module ? ` · ${module.name}` : ''}
          </p>
          <h1 className="text-balance text-[clamp(18px,3.2vmin+8px,30px)] font-semibold leading-tight text-white" data-testid="hwfocus-title">
            {hw.title}
          </h1>
        </div>
        <RollingDigits
          text={text}
          testId="hwfocus-time"
          duration={digitDuration(look.anim)}
          style={{ fontFamily: fontDef.family, fontWeight: look.weight, fontSize: fontPx, color: look.color, filter: glow, letterSpacing: '-0.04em' }}
        />
        <p className="text-[13px] text-white/70" data-testid="hwfocus-status">
          {running ? 'Läuft' : elapsed > 0 ? 'Pausiert' : 'Bereit'}
          {steps.length > 0 ? ` · ${doneSteps}/${steps.length} Schritte` : ''}
        </p>
        {elapsed > 0 && elapsed < MIN_SESSION_SEC && !running && <p className="text-[12px] text-white/55">Ab einer Minute zählt die Zeit in deiner Lernstatistik.</p>}
      </main>

      <motion.div
        initial={false}
        animate={{ opacity: controls ? 1 : 0, y: controls ? 0 : 16 }}
        transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: controls ? 'auto' : 'none' }}
        className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),18px)] z-20 flex justify-center px-4"
      >
        <div className="focus-bar flex items-center gap-1 rounded-full p-1.5 sm:gap-2 sm:p-2" role="toolbar" aria-label="Zähler-Steuerung">
          <BarButton label="Schritte" disabled={steps.length === 0} active={panel === 'steps'} onClick={() => setPanel((p) => (p === 'steps' ? 'none' : 'steps'))}>
            <ListChecks className="size-[18px]" />
          </BarButton>
          <motion.button
            type="button"
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={spring.micro}
            onClick={() => (haptic('select'), stopwatchActions.toggle())}
            aria-label={running ? 'Pausieren' : 'Weiterzählen'}
            data-testid="hwfocus-toggle"
            className="grid size-14 shrink-0 place-items-center rounded-full text-[#14122b] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] sm:size-16"
            style={{ background: `linear-gradient(160deg, #fff, ${alpha(color, 0.9)})` }}
          >
            {running ? <Pause className="size-6" fill="currentColor" /> : <Play className="ml-0.5 size-6" fill="currentColor" />}
          </motion.button>
          <BarButton label="Fertig – Lernzeit speichern" onClick={() => void finish()}>
            <Square className="size-4" />
          </BarButton>
          <BarButton label="Design anpassen" active={panel === 'design'} onClick={() => setPanel((p) => (p === 'design' ? 'none' : 'design'))}>
            <SlidersHorizontal className="size-[18px]" />
          </BarButton>
        </div>
      </motion.div>

      <AnimatePresence>{panel === 'design' && <FocusSettingsPanel designOnly onClose={() => setPanel('none')} />}</AnimatePresence>
      <AnimatePresence>
        {panel === 'steps' && (
          <motion.aside
            data-panel
            role="dialog"
            aria-label="Schritte der Hausaufgabe"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="focus-panel absolute inset-x-2 bottom-2 z-30 flex max-h-[70dvh] flex-col overflow-hidden rounded-[24px] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[400px]"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="text-[16px] font-semibold">Schritte</h2>
              <button type="button" onClick={() => setPanel('none')} aria-label="Schritte schließen" className="focus-btn grid size-9 place-items-center rounded-full text-white/80">
                <X className="size-[18px]" />
              </button>
            </div>
            <ul className="scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto px-5 pb-5">
              {steps.map((p) => {
                const done = isDone(hw.id) || isDone(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 text-[14.5px]">
                    <TaskCheckbox size={22} checked={done} color={me.color} label={`${p.title} erledigt`} disabled={isDone(hw.id)} onChange={(v) => void setHomeworkDone(hw.id, p.id, me.id, v)} />
                    <span className={`min-w-0 flex-1 ${done ? 'text-white/55 line-through' : ''}`}>{p.title}</span>
                  </li>
                );
              })}
            </ul>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ask !== null && (
          <motion.div className="absolute inset-0 z-40 grid place-items-center bg-black/55 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div role="alertdialog" aria-label="Hausaufgabe abhaken?" className="focus-panel w-full max-w-sm rounded-[26px] p-6 text-center" data-panel>
              <CheckCircle2 className="mx-auto size-10" style={{ color }} aria-hidden />
              <p className="mt-3 text-[17px] font-semibold">{ask >= MIN_SESSION_SEC ? `${Math.round(ask / 60)} Min. gelernt` : 'Gut gemacht'}</p>
              <p className="mt-1 text-[14px] text-white/75">Ist „{hw.title}“ damit erledigt?</p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-[#14122b]"
                  onClick={async () => {
                    await setHomeworkDone(hw.id, hw.id, me.id, true);
                    setAsk(null);
                    leave();
                  }}
                >
                  Ja, abhaken
                </button>
                <button type="button" className="focus-btn rounded-full px-5 py-3 text-[15px] font-semibold text-white" onClick={() => (setAsk(null), leave())}>
                  Noch nicht
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {running ? 'Zähler läuft' : 'Zähler pausiert'}, {Math.floor(elapsed / 60)} Minuten
      </span>
    </div>
  );
}
