import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Coffee, Minimize2, Timer } from 'lucide-react';
import { exitFullscreen, wakeLockSupported } from '../lib/fullscreen';
import { navigate } from '../lib/router';
import { currentPreset } from '../store/focus';
import { useData } from '../store/data';
import { Landscape } from '../components/landscape/Landscape';
import { FocusControlBar, FocusDigits, FocusRing, FocusStatusChip, useFocusLive } from '../components/FocusPanel';

/**
 * Fokus im Vollbild (Querformat): ruhige Berglandschaft, riesiger laufender
 * Countdown, Fortschritt live. Bedienelemente blenden sich nach kurzer Zeit
 * aus und kommen bei Bewegung/Antippen zurück. Der Bildschirm bleibt an,
 * solange eine Session läuft (Wake Lock, wo unterstützt).
 */
export function FocusImmersive() {
  const { running, progress, isBreak, timer, rest } = useFocusLive();
  const modules = useData((s) => s.modules);
  const module = timer.moduleId ? modules[timer.moduleId] : null;
  const preset = currentPreset();
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poke = () => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 4000);
  };

  useEffect(() => {
    poke();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave();
      else poke();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', poke);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', poke);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function leave() {
    void exitFullscreen();
    navigate('/fokus');
  }

  return (
    <div
      className="dark fixed inset-0 z-50 overflow-hidden bg-[#0b0c1c] text-[#f2f5fa]"
      data-testid="focus-immersive"
      data-controls={controls ? 'visible' : 'hidden'}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, select')) return poke();
        if (controls) setControls(false);
        else poke();
      }}
      style={{ cursor: controls ? 'auto' : 'none' }}
    >
      <div className="hero-scene absolute inset-0">
        <Landscape />
      </div>
      {/* Abdunkeln für Lesbarkeit */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgba(10,10,30,0.15),rgba(10,10,30,0.55))]" aria-hidden />

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-6 py-[max(env(safe-area-inset-top),24px)]">
        <motion.div animate={{ opacity: controls ? 1 : 0, y: controls ? 0 : -8 }} transition={{ duration: 0.4 }} className="flex flex-wrap items-center justify-center gap-2">
          <FocusStatusChip />
          <span className="text-[13px] text-white/70">
            {isBreak ? `${preset.rest} Min. Pause` : `${preset.focus} Min. Fokus`}
            {module ? ` · ${module.name}` : ''}
          </span>
        </motion.div>

        <div className="flex w-full max-w-5xl flex-col items-center justify-center gap-8 landscape:flex-row landscape:gap-14">
          <div className="glass shrink-0 rounded-full p-3">
          <FocusRing size={220} stroke={12}>
            <div className="text-center">
              {isBreak ? <Coffee className="mx-auto size-7 text-[#8fdcc0]" aria-hidden /> : <Timer className="mx-auto size-7 text-[#c6b6ff]" aria-hidden />}
              <p className="num mt-2 text-[15px] font-semibold text-white/75">{Math.round(progress * 100)} %</p>
            </div>
          </FocusRing>
          </div>
          <div className="text-center landscape:text-left">
            <FocusDigits className="text-[clamp(72px,16vw,200px)]" />
            <p className="mt-2 text-[15px] text-white/70">{running ? (isBreak ? 'Durchatmen – gleich geht es weiter.' : 'Konzentriert bleiben. Du schaffst das.') : 'Tippe auf Start, um weiterzumachen.'}</p>
          </div>
        </div>

        <motion.div animate={{ opacity: controls ? 1 : 0, y: controls ? 0 : 12 }} transition={{ duration: 0.4 }} style={{ pointerEvents: controls ? 'auto' : 'none' }} className="flex items-center gap-3">
          <FocusControlBar />
          <button type="button" onClick={leave} aria-label="Vollbild verlassen" title="Vollbild verlassen" className="glass mat-interactive grid size-11 place-items-center rounded-full">
            <Minimize2 className="size-[18px]" />
          </button>
        </motion.div>
      </div>

      {/* Fortschritt als feine Linie am unteren Rand */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden>
        <div className="h-full transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%`, background: isBreak ? '#8fdcc0' : 'linear-gradient(90deg,#c6b6ff,#a9a6ff)' }} />
      </div>
      <span className="sr-only" aria-live="polite">
        Noch {Math.ceil(rest / 60)} Minuten
      </span>
    </div>
  );
}
