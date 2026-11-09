import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Coffee, Headphones, Maximize, Minimize, Pause, Play, RotateCcw, SkipForward, SlidersHorizontal, Square, Timer, Volume2, VolumeX, X } from 'lucide-react';
import { AMBIENCE_LABEL, setAmbienceVolume, startAmbience, stopAmbience } from '../lib/ambience';
import { phaseDuration, phaseTitle, formatClock } from '../lib/focus';
import { digitDuration } from '../lib/focusLook';
import { CLOCK_FONTS, loadClockFont } from '../lib/studyMode';
import { unlockAudio } from '../lib/chime';
import { haptic } from '../lib/haptics';
import { alpha } from '../lib/colors';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, wakeLockSupported } from '../lib/fullscreen';
import { navigate } from '../lib/router';
import { spring } from '../lib/motion';
import { focusActions, useFocus } from '../store/focus';
import { useCurrentMember } from '../store/derived';
import { useData } from '../store/data';
import { Landscape } from '../components/landscape/Landscape';
import { FocusDigits, FocusRing, focusStatusLabel, phaseColors, useFocusLive } from '../components/FocusPanel';
import { FocusSettingsPanel } from '../components/focus/FocusSettingsPanel';
import { loadFocusImage } from '../lib/focusLook';
import { returnPath } from '../lib/focusReturn';

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}

/**
 * Fokus 2.0 – immersive Vollbildansicht (Hoch- und Querformat).
 * Öffnet direkt über die Navigation. Große Zeit, Pomodoro-Runden,
 * Steuerleiste blendet sich aus; Einstellungen liegen im Bild selbst.
 */
export function Focus() {
  const reduce = useReducedMotion();
  const me = useCurrentMember();
  const modules = useData((s) => s.modules);
  const look = useFocus((s) => s.look);
  const settings = useFocus((s) => s.settings);
  const setSettings = useFocus((s) => s.setSettings);
  const { timer, rhythm, running, started, rest, progress, isBreak, title } = useFocusLive();
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState(false);
  const [fs, setFs] = useState(false);
  const [musicOn, setMusicOn] = useState(false);

  // Musik: Art und Lautstärke folgen den Einstellungen; beim Verlassen aus
  useEffect(() => {
    if (musicOn) startAmbience(settings.music);
    else stopAmbience();
  }, [musicOn, settings.music]);
  useEffect(() => setAmbienceVolume(settings.musicVolume / 100), [settings.musicVolume]);
  useEffect(() => () => stopAmbience(), []);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelOpen = useRef(panel);
  panelOpen.current = panel;
  const vp = useViewport();
  const landscape = vp.w > vp.h;
  const c = phaseColors(timer);
  const module = timer.moduleId ? modules[timer.moduleId] : null;
  const fontDef = CLOCK_FONTS.find((f) => f.id === look.font) ?? CLOCK_FONTS[0]!;

  useEffect(() => {
    void loadClockFont(look.font);
  }, [look.font]);

  // Steuerleiste: nach einer Weile ohne Bewegung ausblenden (nicht, solange Einstellungen offen sind)
  const poke = () => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const st = useFocus.getState();
    if (st.look.autoHide && st.timer.endsAt !== null) hideTimer.current = setTimeout(() => setControls(false), st.look.hideDelay * 1000);
  };
  useEffect(() => {
    if (panel) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setControls(true);
    } else poke();
  }, [panel, running, look.autoHide, look.hideDelay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panelOpen.current) setPanel(false);
        else if (!isFullscreen()) leave();
        return;
      }
      if (e.key === ' ' && !(e.target as HTMLElement).closest('input, select, textarea, button, [role=switch], [role=radio]')) {
        e.preventDefault();
        toggle();
      }
      poke();
    };
    const onMove = (e: PointerEvent) => e.pointerType === 'mouse' && poke();
    const onFs = () => setFs(isFullscreen());
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Autostart beim Öffnen (nur wenn eingestellt; Standard: bewusster Start)
  useEffect(() => {
    const st = useFocus.getState();
    if (st.settings.autoStartOnOpen && st.timer.endsAt === null && st.timer.pausedRemainingSec === null && !st.timer.finished) {
      unlockAudio();
      focusActions.start();
    }
  }, []);

  // Bildschirm wach halten, solange die Session läuft
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

  function toggle() {
    haptic('select');
    unlockAudio();
    const t = useFocus.getState().timer;
    if (t.endsAt !== null) focusActions.pause();
    else focusActions.start();
  }

  function leave() {
    void exitFullscreen();
    navigate(returnPath());
  }

  const ringSize = Math.round(Math.max(120, landscape ? Math.min(vp.h * 0.5, vp.w * 0.3, 360) : Math.min(vp.w * 0.62, vp.h * 0.34, 340)));
  const k = look.size / 100;
  const chars = look.showSeconds ? 2.9 : 1.6;
  const avail = landscape && look.ring ? vp.w * 0.55 : vp.w * 0.9;
  const fontPx = Math.round(Math.max(48, Math.min((avail / chars) * k, (landscape ? vp.h * 0.42 : vp.h * 0.24) * k * (look.showSeconds ? 1 : 1.3))));
  const ringColor = look.ringColor || c.main;
  const glow = look.glow && look.glowStrength > 0 ? `drop-shadow(0 0 ${Math.round(4 + look.glowStrength * 0.32)}px ${alpha(look.color, 0.25 + look.glowStrength / 250)})` : undefined;
  const justify = look.position === 'top' ? 'justify-start pt-[18vh]' : look.position === 'bottom' ? 'justify-end pb-[22vh]' : 'justify-center';
  const nextLabel = timer.phase === 'focus' ? (timer.round >= rhythm.rounds ? 'Lange Pause' : 'Kurze Pause') : phaseTitle({ phase: 'focus', long: false, round: timer.long ? 1 : timer.round + 1 }, rhythm);

  const bar = (
    <motion.div
      initial={false}
      animate={{ opacity: controls ? 1 : 0, y: controls ? 0 : look.barPosition === 'bottom' ? 16 : -16 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ pointerEvents: controls ? 'auto' : 'none' }}
      className={`absolute inset-x-0 z-20 flex justify-center px-4 ${look.barPosition === 'bottom' ? 'bottom-[max(env(safe-area-inset-bottom),18px)]' : 'top-[max(env(safe-area-inset-top),64px)]'}`}
      data-testid="focus-controls"
    >
      <div className="focus-bar flex items-center gap-1 rounded-full p-1.5 sm:gap-2 sm:p-2" role="toolbar" aria-label="Fokus-Steuerung">
        <BarButton label={settings.sound ? 'Ton aus' : 'Ton an'} onClick={() => setSettings({ sound: !settings.sound })} active={settings.sound}>
          {settings.sound ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px] opacity-70" />}
        </BarButton>
        <BarButton label={musicOn ? `${AMBIENCE_LABEL[settings.music]} aus` : `${AMBIENCE_LABEL[settings.music]} abspielen`} onClick={() => {
            unlockAudio();
            setMusicOn((v) => !v);
          }} active={musicOn}>
          <Headphones className="size-[18px]" />
        </BarButton>
        <BarButton label="Phase neu starten" disabled={!started} onClick={() => focusActions.reset()} className="max-[359px]:hidden">
          <RotateCcw className="size-[18px]" />
        </BarButton>
        <motion.button
          type="button"
          whileTap={reduce ? undefined : { scale: 0.9 }}
          transition={spring.micro}
          onClick={toggle}
          aria-label={timer.finished ? `Weiter: ${nextLabel}` : running ? 'Pausieren' : started ? 'Fortsetzen' : 'Starten'}
          data-testid="focus-toggle"
          className="grid size-14 shrink-0 place-items-center rounded-full text-[#14122b] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] sm:size-16"
          style={{ background: `linear-gradient(160deg, #fff, ${c.soft})` }}
        >
          {running ? <Pause className="size-6" fill="currentColor" /> : <Play className="ml-0.5 size-6" fill="currentColor" />}
        </motion.button>
        {isBreak ? (
          <BarButton label="Pause überspringen" onClick={() => focusActions.skipBreak()}>
            <SkipForward className="size-[18px]" />
          </BarButton>
        ) : (
          <BarButton label="Session beenden und Lernzeit speichern" disabled={!started && timer.round === 1} onClick={() => void focusActions.endSession(me?.id ?? null)}>
            <Square className="size-4" />
          </BarButton>
        )}
        <BarButton label="Fokus-Einstellungen" onClick={() => setPanel((v) => !v)} active={panel}>
          <SlidersHorizontal className="size-[18px]" />
        </BarButton>
      </div>
    </motion.div>
  );

  return (
    <div
      className="dark focus-scope fixed inset-0 z-50 overflow-hidden text-[#f2f5fa]"
      data-theme="dark"
      data-testid="focus-immersive"
      data-controls={controls ? 'visible' : 'hidden'}
      data-phase={timer.phase === 'focus' ? 'focus' : timer.long ? 'long' : 'short'}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, select, input, a, [role=switch], [data-panel]')) return poke();
        if (e.pointerType !== 'mouse' && controls && running && look.autoHide) setControls(false);
        else poke();
      }}
      style={{ cursor: controls ? 'auto' : 'none', background: '#0b0c1c' }}
    >
      <FocusBackdrop />
      {/* Phasenfarbe: sehr dezenter Farbschleier, wechselt weich */}
      <div aria-hidden className="pointer-events-none absolute inset-0 transition-[background] duration-[1200ms]" style={{ background: `radial-gradient(80% 60% at 50% 40%, ${c.tint}, transparent 70%)` }} />

      {/* Kopf: Schließen · Phase · Vollbild */}
      <motion.div
        initial={false}
        animate={{ opacity: controls ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.35 }}
        style={{ pointerEvents: controls ? 'auto' : 'none' }}
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)] sm:px-6"
      >
        <BarButton label="Fokus schließen" onClick={leave}>
          <X className="size-[18px]" />
        </BarButton>
        {fullscreenSupported() ? (
          <BarButton label={fs ? 'Vollbild verlassen' : 'Vollbild'} onClick={() => (fs ? void exitFullscreen() : void enterFullscreen({ lockLandscape: false }))}>
            {fs ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </BarButton>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </motion.div>

      <main className={`relative z-10 flex h-full flex-col items-center ${justify} gap-[3vh] px-6`}>
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.2em] text-white/80 sm:text-[13.5px]" data-testid="focus-phase">
            {title}
          </p>
          <p className="text-[12.5px] text-white/55">
            {focusStatusLabel(running, started, timer.finished)}
            {module ? ` · ${module.name}` : ''}
          </p>
        </div>

        <div className={`flex items-center justify-center ${landscape ? 'flex-row gap-[6vw]' : 'flex-col gap-[4vh]'}`}>
          {look.ring && (
            <div className="focus-disc rounded-full p-2.5">
              <FocusRing size={ringSize} stroke={look.ringWidth} color={ringColor} soft={look.ringColor ? alpha(look.ringColor, 0.6) : c.soft} glow={look.glow}>
                <div className="flex flex-col items-center gap-1.5">
                  {isBreak ? <Coffee className="size-7" style={{ color: c.main }} aria-hidden /> : <Timer className="size-7" style={{ color: c.main }} aria-hidden />}
                  {look.percent && <span className="num text-[15px] font-semibold text-white/75">{Math.round(progress * 100)} %</span>}
                </div>
              </FocusRing>
            </div>
          )}
          <div className="flex flex-col items-center gap-4">
            <FocusDigits
              seconds={look.showSeconds}
              duration={digitDuration(look.anim)}
              style={{ fontFamily: fontDef.family, fontWeight: look.weight, fontSize: fontPx, color: look.color, filter: glow, letterSpacing: '-0.04em' }}
            />
            {!look.ring && look.percent && <span className="num text-[15px] font-semibold text-white/70">{Math.round(progress * 100)} %</span>}
            {timer.finished && (
              <button type="button" onClick={() => focusActions.advance(true)} className="focus-bar rounded-full px-5 py-2.5 text-[14px] font-semibold text-white">
                Weiter: {nextLabel}
              </button>
            )}
          </div>
        </div>
      </main>

      {bar}

      <AnimatePresence>{panel && <FocusSettingsPanel onClose={() => setPanel(false)} />}</AnimatePresence>

      {look.bar && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-white/10" aria-hidden data-testid="focus-bar-progress">
          <div className="h-full" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${c.soft}, ${c.main})`, transition: running ? 'width 1s linear' : undefined }} />
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {title}, noch {Math.ceil(rest / 60)} Minuten{running ? '' : ', angehalten'}
      </span>
      <span className="sr-only">Gesamtdauer der Phase {formatClock(phaseDuration(timer.phase, timer.long, rhythm))}</span>
    </div>
  );
}

function BarButton({ label, onClick, disabled, active, children, className = '' }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        haptic('tap');
        onClick();
      }}
      className={`focus-btn grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-35 sm:size-11 ${active ? 'text-white' : 'text-white/80'} ${className}`}
    >
      {children}
    </button>
  );
}

/** Hintergrund nach Wahl: Berge, Polarlicht, Verlauf, Farbe oder eigenes Bild */
function FocusBackdrop() {
  const look = useFocus((s) => s.look);
  const reduce = useReducedMotion();
  const [image, setImage] = useState(loadFocusImage);
  useEffect(() => {
    const on = () => setImage(loadFocusImage());
    window.addEventListener('studyspace:focus-image', on);
    return () => window.removeEventListener('studyspace:focus-image', on);
  }, []);
  const move = look.motion && !reduce;
  const filter = look.blur ? `blur(${look.blur}px)` : undefined;
  const scale = look.blur ? 'scale(1.06)' : undefined;
  let content: ReactNode;
  if (look.background === 'image' && image) {
    content = <img src={image} alt="" className="absolute inset-0 size-full object-cover" style={{ filter, transform: scale }} />;
  } else if (look.background === 'gradient') {
    const [a, b, cc] = look.gradient;
    content = <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${a}, ${b}, ${cc})` }} />;
  } else if (look.background === 'solid') {
    content = <div className="absolute inset-0" style={{ background: look.bgColor }} />;
  } else if (look.background === 'aurora') {
    content = (
      <div className="absolute inset-0 overflow-hidden" style={{ background: look.bgColor, filter }}>
        {(
          [
            ['#AFC5F5', '-20%', '-30%', 'ss-drift-a', 38],
            ['#CBB8F5', '45%', '-25%', 'ss-drift-b', 46],
            ['#AADCCB', '10%', '40%', 'ss-drift-c', 52],
          ] as const
        ).map(([col, left, top, anim, dur], i) => (
          <span
            key={i}
            aria-hidden
            className="absolute size-[80vmax] rounded-full"
            style={{ left, top, background: `radial-gradient(circle, ${alpha(col, 0.3)}, transparent 62%)`, animation: move ? `${anim} ${dur}s ease-in-out infinite alternate` : undefined }}
          />
        ))}
      </div>
    );
  } else {
    content = (
      <div className={`hero-scene absolute inset-0 ${move ? '' : 'ls-still'}`} style={{ filter, transform: scale }}>
        <Landscape />
      </div>
    );
  }
  return (
    <div className="absolute inset-0" data-testid="focus-bg" data-bg={look.background === 'image' && !image ? 'mountains' : look.background}>
      {content}
      <div className="absolute inset-0" style={{ background: `rgba(6,7,20,${look.dim / 100})` }} />
    </div>
  );
}
