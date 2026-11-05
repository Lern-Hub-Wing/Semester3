import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ImagePlus, Maximize, Minimize, RotateCcw, Smartphone, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  BG_COLORS, CLOCK_COLORS, CLOCK_FONTS, DEFAULT_STUDY_MODE, GRADIENT_PRESETS, clockParts, loadClockFont, loadStudyImage,
  loadStudyMode, resizeImage, sanitizeStudyMode, saveStudyImage, saveStudyMode, type StudyModeSettings,
} from '../lib/studyMode';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, isIPhone, isStandalone, wakeLockSupported } from '../lib/fullscreen';
import { upcomingExams, daysUntil } from '../lib/countdown';
import { navigate } from '../lib/router';
import { haptic } from '../lib/haptics';
import { alpha } from '../lib/colors';
import { useData } from '../store/data';
import { useNow } from '../hooks/useNow';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { toast } from '../store/toast';
import { Segmented } from '../components/ui/Segmented';

const HIDE_AFTER_MS = 3500;

/**
 * Lernmodus: Vollbild-Uhr im Querformat.
 * – Hochkant auf Touch-Geräten: Hinweis „Bitte quer hinlegen“.
 * – Ohne Berührung verschwinden nach wenigen Sekunden alle Bedienelemente.
 * – Uhrzeit wird bei jedem Tick aus der echten Uhrzeit berechnet (sekundengenau).
 */
export function StudyMode() {
  const [settings, setSettings] = useState<StudyModeSettings>(loadStudyMode);
  const [image, setImage] = useState<string | null>(loadStudyImage);
  const now = useNow(1000);
  const reduce = useReducedMotion();
  const touch = useMediaQuery('(pointer: coarse)');
  const portrait = useMediaQuery('(orientation: portrait)');
  const needsRotate = touch && portrait;
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState(false);
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((patch: Partial<StudyModeSettings>) => {
    setSettings((prev) => {
      const next = sanitizeStudyMode({ ...prev, ...patch });
      saveStudyMode(next);
      return next;
    });
  }, []);

  // ---- Bedienelemente automatisch ausblenden ------------------------------
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), HIDE_AFTER_MS);
  }, []);
  const show = useCallback(() => {
    setControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  useEffect(() => {
    if (panel) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setControls(true);
    } else scheduleHide();
  }, [panel, scheduleHide]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => e.pointerType === 'mouse' && show();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isFullscreen()) {
        if (panel) setPanel(false);
        else leave();
        return;
      }
      show();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, panel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Vollbild-Status -----------------------------------------------------
  useEffect(() => {
    const onChange = () => setFullscreen(isFullscreen());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // ---- Bildschirm wach halten (Wake Lock API, wo unterstützt) -------------
  useEffect(() => {
    if (!wakeLockSupported()) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
        if (!active) void lock?.release();
      } catch {
        /* z. B. Energiesparmodus – Uhr läuft trotzdem */
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // ---- Schriftart nachladen, Pixelverschiebung -----------------------------
  useEffect(() => {
    void loadClockFont(settings.font);
  }, [settings.font]);

  const minute = Math.floor(now / 60_000);
  useEffect(() => {
    if (!settings.pixelShift || reduce) return setShift({ x: 0, y: 0 });
    setShift({ x: Math.round(Math.random() * 16 - 8), y: Math.round(Math.random() * 12 - 6) });
  }, [minute, settings.pixelShift, reduce]);

  const leave = () => {
    void exitFullscreen();
    navigate('/');
  };

  const toggleFullscreen = async () => {
    haptic('tap');
    if (isFullscreen()) await exitFullscreen();
    else if (!(await enterFullscreen())) toast.info('Vollbild wird von diesem Browser nicht unterstützt.');
  };

  const fontDef = CLOCK_FONTS.find((f) => f.id === settings.font)!;
  const date = new Date(now);
  const parts = clockParts(date, settings);
  const iphoneHint = isIPhone() && !isStandalone();
  // Auf breiten Bildschirmen rückt die Uhr neben das Einstellungsfeld – so sieht man jede Änderung live
  const wide = useMediaQuery('(min-width: 900px)');
  const reserve = panel && wide ? 396 : 0;

  return (
    <div
      className={`study-mode fixed inset-0 z-[100] select-none overflow-hidden ${controls ? '' : 'cursor-none'}`}
      data-testid="study-mode"
      data-controls={controls ? 'visible' : 'hidden'}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return show();
        // Antippen der freien Fläche blendet die Steuerung ein bzw. wieder aus
        if ((e.target as HTMLElement).closest('[data-ui]')) return show();
        if (controls && !panel) {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setControls(false);
        } else show();
      }}
    >
      <Backdrop settings={settings} image={image} reduce={!!reduce} />

      {needsRotate ? (
        <RotateHint onLeave={leave} />
      ) : (
        <div
          className="absolute inset-y-0 left-0 grid place-items-center px-[4vw]"
          style={{
            right: reserve,
            transform: `translate(${shift.x}px, ${shift.y}px)`,
            transition: 'transform 2.5s ease-in-out, right 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div className="flex flex-col items-center" style={{ color: settings.color }}>
            {settings.showDate && (
              <p className="mb-[0.6em] font-medium tracking-wide opacity-75" style={{ fontSize: 'clamp(14px, 2.4vmin + 6px, 30px)' }} data-testid="study-date">
                {date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            )}
            <Clock parts={parts} settings={settings} family={fontDef.family} animate={settings.animateDigits && !reduce} reserve={reserve} />
            {settings.showExam && <ExamLine now={now} />}
          </div>
        </div>
      )}

      {/* Steuerung (blendet sich ohne Berührung aus) */}
      <div
        data-ui
        aria-hidden={!controls}
        inert={!controls}
        className={`absolute right-[max(env(safe-area-inset-right),16px)] top-[max(env(safe-area-inset-top),16px)] flex gap-2 transition-opacity duration-500 ${controls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <RoundButton label="Darstellung anpassen" onClick={() => (haptic('tap'), setPanel((p) => !p))}>
          <SlidersHorizontal className="size-5" />
        </RoundButton>
        {fullscreenSupported() && (
          <RoundButton label={fullscreen ? 'Vollbild verlassen' : 'Vollbild'} onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </RoundButton>
        )}
        <RoundButton label="Lernmodus beenden" onClick={leave}>
          <X className="size-5" />
        </RoundButton>
      </div>

      {iphoneHint && controls && !panel && !needsRotate && (
        <p
          data-ui
          data-testid="iphone-fullscreen-hint"
          className="glass glass-strong absolute bottom-[max(env(safe-area-inset-bottom),14px)] left-1/2 w-max max-w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl px-4 py-2 text-center text-xs leading-snug text-ink"
        >
          Safari erlaubt Webseiten auf dem iPhone kein Vollbild. <b className="font-semibold">So geht's:</b> Teilen → „Zum Home-Bildschirm“, dann
          StudySpace vom Home-Bildschirm öffnen – dort läuft die Uhr ohne Browserleisten.
        </p>
      )}

      <AnimatePresence>
        {panel && (
          <SettingsPanel
            settings={settings}
            image={image}
            onChange={update}
            onImage={(img) => {
              if (!saveStudyImage(img)) return toast.error('Das Bild ist zu groß für den Gerätespeicher. Bitte ein kleineres wählen.');
              setImage(img);
              if (img) update({ background: 'image' });
            }}
            onClose={() => setPanel(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Clock({ parts, settings, family, animate, reserve }: { parts: ReturnType<typeof clockParts>; settings: StudyModeSettings; family: string; animate: boolean; reserve: number }) {
  const base = settings.format === 'hms' ? 'min(19vw, 46vh)' : 'min(29vw, 62vh)';
  const fit = useFitWidth(settings, family, reserve);
  const glow = settings.glow ? `0 0 0.05em ${alpha(settings.color, 0.55)}, 0 0 0.35em ${alpha(settings.color, 0.3)}` : 'none';
  const small = settings.secondsStyle === 'small';
  return (
    <div
      role="timer"
      aria-label={`Uhrzeit ${parts.hours}:${parts.minutes}${parts.seconds ? `:${parts.seconds}` : ''}${parts.period ? ` ${parts.period}` : ''}`}
      data-testid="study-clock"
      ref={fit.ref}
      className="flex items-baseline whitespace-nowrap leading-none"
      style={{
        fontFamily: family,
        fontWeight: settings.weight,
        fontSize: `calc(${base} * ${(settings.size / 100) * fit.factor})`,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        textShadow: glow,
      }}
    >
      <Digits value={parts.hours} animate={animate} />
      <Colon />
      <Digits value={parts.minutes} animate={animate} />
      {parts.seconds !== null && (
        <span className="flex items-baseline" style={small ? { fontSize: '0.42em', opacity: 0.7, marginLeft: '0.12em' } : undefined}>
          {small ? <span className="mx-[0.06em] opacity-60">:</span> : <Colon />}
          <Digits value={parts.seconds} animate={animate} />
        </span>
      )}
      {parts.period && (
        <span className="ml-[0.2em] font-medium opacity-70" style={{ fontSize: '0.22em', letterSpacing: '0.05em' }}>
          {parts.period}
        </span>
      )}
    </div>
  );
}

/**
 * Breite Schriften (z. B. „Digital“) würden über den Rand laufen. Die Uhr wird
 * gemessen und – falls nötig – so verkleinert, dass sie in 92 % der freien Breite passt.
 */
function useFitWidth(settings: StudyModeSettings, family: string, reserve: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [factor, setFactor] = useState(1);
  const factorRef = useRef(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (!width) return;
      const natural = width / factorRef.current;
      const available = (window.innerWidth - reserve) * 0.92;
      const next = Math.min(1, Math.floor((available / natural) * 1000) / 1000);
      if (Math.abs(next - factorRef.current) > 0.002) {
        factorRef.current = next;
        setFactor(next);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    // Nachgeladene Schriften verändern die Breite
    document.fonts?.addEventListener?.('loadingdone', measure);
    void document.fonts?.ready.then(measure);
    return () => {
      window.removeEventListener('resize', measure);
      document.fonts?.removeEventListener?.('loadingdone', measure);
    };
  }, [settings.format, settings.size, settings.weight, settings.secondsStyle, settings.hour12, family, reserve]);

  return { ref, factor };
}

function Colon() {
  return (
    <span aria-hidden className="mx-[0.04em] inline-block opacity-70" style={{ transform: 'translateY(-0.06em)' }}>
      :
    </span>
  );
}

/**
 * Jede Ziffer in einer Box der Breite „1ch“ – so springt nichts, egal welche Schrift.
 * Bewusst OHNE overflow:hidden und ohne Filter: sonst würde das Leuchten der Ziffern
 * an der Box rechteckig abgeschnitten.
 */
function Digits({ value, animate }: { value: string; animate: boolean }) {
  return (
    <span aria-hidden className="inline-flex">
      {value.split('').map((ch, i) => (
        <span key={i} className="relative inline-grid text-center" style={{ width: '1ch' }}>
          <AnimatePresence initial={false}>
            <motion.span
              key={ch}
              className="col-start-1 row-start-1 block"
              initial={animate ? { y: '-0.12em', opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              exit={animate ? { y: '0.12em', opacity: 0 } : undefined}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

function ExamLine({ now }: { now: number }) {
  const exams = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const next = useMemo(() => upcomingExams(Object.values(exams), now)[0], [exams, now]);
  if (!next) return null;
  const days = daysUntil(next.starts_at, now);
  const name = modules[next.module_id]?.name ?? 'Prüfung';
  return (
    <p className="mt-[0.9em] font-medium opacity-70" style={{ fontSize: 'clamp(13px, 2vmin + 6px, 26px)' }} data-testid="study-exam">
      {name} · {days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`}
    </p>
  );
}

function Backdrop({ settings, image, reduce }: { settings: StudyModeSettings; image: string | null; reduce: boolean }) {
  const [a, b, c] = settings.gradient;
  if (settings.background === 'image' && image) {
    return (
      <div className="absolute inset-0" data-testid="study-bg" data-bg="image">
        <img src={image} alt="" className="absolute inset-0 size-full object-cover" style={{ filter: settings.imageBlur ? `blur(${settings.imageBlur}px)` : undefined, transform: settings.imageBlur ? 'scale(1.06)' : undefined }} />
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${settings.imageDim / 100})` }} />
      </div>
    );
  }
  if (settings.background === 'gradient') {
    return <div className="absolute inset-0" data-testid="study-bg" data-bg="gradient" style={{ background: `linear-gradient(${settings.gradientAngle}deg, ${a}, ${b}, ${c})` }} />;
  }
  if (settings.background === 'aurora') {
    return (
      <div className="absolute inset-0 overflow-hidden" data-testid="study-bg" data-bg="aurora" style={{ background: settings.bgColor }}>
        {[
          ['#AFC5F5', '-20%', '-30%', 'ss-drift-a', 38],
          ['#CBB8F5', '45%', '-25%', 'ss-drift-b', 46],
          ['#AADCCB', '10%', '40%', 'ss-drift-c', 52],
          ['#F5C6A5', '60%', '45%', 'ss-drift-a', 60],
        ].map(([col, left, top, anim, dur], i) => (
          <span
            key={i}
            aria-hidden
            className="absolute size-[80vmax] rounded-full"
            style={{
              left: left as string,
              top: top as string,
              background: `radial-gradient(circle, ${alpha(col as string, 0.32)}, transparent 62%)`,
              animation: reduce ? undefined : `${anim} ${dur}s ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>
    );
  }
  return <div className="absolute inset-0" data-testid="study-bg" data-bg="solid" style={{ background: settings.bgColor }} />;
}

function RotateHint({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-8 text-center text-white" data-testid="study-rotate">
      <div className="flex flex-col items-center gap-5">
        <Smartphone className="study-rotate-icon size-16" strokeWidth={1.4} aria-hidden />
        <div>
          <p className="text-xl font-semibold">Bitte quer hinlegen</p>
          <p className="mt-1 text-sm opacity-70">Dreh dein Handy ins Querformat – dann startet die Uhr im Vollbild.</p>
        </div>
        <button data-ui type="button" onClick={onLeave} className="glass rounded-full px-5 py-2.5 text-sm font-medium text-white">
          Lernmodus beenden
        </button>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="glass grid size-11 place-items-center rounded-full text-white">
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Darstellung anpassen
// ---------------------------------------------------------------------------

function SettingsPanel({
  settings, image, onChange, onImage, onClose,
}: {
  settings: StudyModeSettings;
  image: string | null;
  onChange: (p: Partial<StudyModeSettings>) => void;
  onImage: (img: string | null) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fontDef = CLOCK_FONTS.find((f) => f.id === settings.font)!;
  return (
    <motion.aside
      data-ui
      role="dialog"
      aria-label="Darstellung des Lernmodus"
      initial={{ x: '105%' }}
      animate={{ x: 0 }}
      exit={{ x: '105%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      onPointerDown={(e) => e.stopPropagation()}
      className="glass glass-strong absolute bottom-2 right-2 top-2 z-10 flex w-[min(380px,calc(100vw-16px))] flex-col rounded-[26px] text-ink"
    >
      <header className="flex items-center gap-2 px-5 pb-2 pt-4">
        <h2 className="flex-1 text-[17px] font-semibold">Darstellung</h2>
        <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Schließen" onClick={onClose}>
          <X className="size-5" />
        </button>
      </header>
      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        <PanelSection title="Uhr">
          <Segmented size="sm" label="Ziffern" value={settings.format} onChange={(format) => onChange({ format })} options={[{ value: 'hm', label: 'HH:MM' }, { value: 'hms', label: 'HH:MM:SS' }]} className="w-full" />
          <Segmented size="sm" label="Zeitformat" value={settings.hour12 ? '12' : '24'} onChange={(v) => onChange({ hour12: v === '12' })} options={[{ value: '24', label: '24 Std.' }, { value: '12', label: '12 Std. (AM/PM)' }]} className="w-full" />
          {settings.format === 'hms' && (
            <Segmented size="sm" label="Sekunden" value={settings.secondsStyle} onChange={(secondsStyle) => onChange({ secondsStyle })} options={[{ value: 'same', label: 'Sekunden groß' }, { value: 'small', label: 'Sekunden klein' }]} className="w-full" />
          )}
        </PanelSection>

        <PanelSection title="Schriftart">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Schriftart">
            {CLOCK_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={settings.font === f.id}
                onMouseEnter={() => void loadClockFont(f.id)}
                onClick={() => {
                  void loadClockFont(f.id);
                  onChange({ font: f.id, weight: f.defaultWeight });
                }}
                className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors ${settings.font === f.id ? 'lens border-transparent' : 'border-line hover:bg-surface-2'}`}
              >
                <span className="text-[13px] font-medium">{f.label}</span>
                <span className="text-lg leading-none" style={{ fontFamily: f.family, fontWeight: f.defaultWeight }}>
                  12:45
                </span>
              </button>
            ))}
          </div>
          <Slider label="Schriftstärke" value={settings.weight} min={fontDef.min} max={fontDef.max} step={50} onChange={(weight) => onChange({ weight })} display={String(settings.weight)} />
          <Slider label="Größe" value={settings.size} min={40} max={100} onChange={(size) => onChange({ size })} display={`${settings.size} %`} />
        </PanelSection>

        <PanelSection title="Farbe der Ziffern">
          <Swatches colors={CLOCK_COLORS} value={settings.color} onChange={(color) => onChange({ color })} label="Farbe der Ziffern" />
          <Toggle label="Leuchten" checked={settings.glow} onChange={(glow) => onChange({ glow })} />
          <Toggle label="Ziffern animieren" checked={settings.animateDigits} onChange={(animateDigits) => onChange({ animateDigits })} />
        </PanelSection>

        <PanelSection title="Hintergrund">
          <Segmented
            size="sm"
            label="Hintergrund"
            value={settings.background}
            onChange={(background) => (background === 'image' && !image ? fileRef.current?.click() : onChange({ background }))}
            options={[
              { value: 'aurora', label: 'Polarlicht' },
              { value: 'gradient', label: 'Verlauf' },
              { value: 'solid', label: 'Farbe' },
              { value: 'image', label: 'Bild' },
            ]}
            className="w-full"
          />
          {(settings.background === 'solid' || settings.background === 'aurora') && (
            <Swatches colors={BG_COLORS} value={settings.bgColor} onChange={(bgColor) => onChange({ bgColor })} label="Hintergrundfarbe" />
          )}
          {settings.background === 'gradient' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {GRADIENT_PRESETS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onChange({ gradient: g.colors, gradientAngle: g.angle })}
                    className="flex h-14 items-end rounded-xl p-1.5 text-[11px] font-semibold text-white shadow-sm"
                    style={{ background: `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`, textShadow: '0 1px 2px rgba(0,0,0,.4)' }}
                    aria-label={`Verlauf ${g.label}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {settings.gradient.map((c, i) => (
                  <label key={i} className="relative size-10 overflow-hidden rounded-full border border-line" style={{ background: c }}>
                    <span className="sr-only">Verlaufsfarbe {i + 1}</span>
                    <input
                      type="color"
                      value={c}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(e) => {
                        const next = [...settings.gradient] as StudyModeSettings['gradient'];
                        next[i] = e.target.value;
                        onChange({ gradient: next });
                      }}
                    />
                  </label>
                ))}
              </div>
              <Slider label="Richtung" value={settings.gradientAngle} min={0} max={360} step={5} onChange={(gradientAngle) => onChange({ gradientAngle })} display={`${settings.gradientAngle}°`} />
            </>
          )}
          {settings.background === 'image' && (
            <>
              {image && <img src={image} alt="Aktuelles Hintergrundbild" className="h-24 w-full rounded-xl object-cover" />}
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2">
                  <ImagePlus className="size-4" /> {image ? 'Anderes Bild' : 'Bild wählen'}
                </button>
                {image && (
                  <button type="button" onClick={() => (onImage(null), onChange({ background: 'aurora' }))} className="grid size-10 place-items-center rounded-xl border border-line hover:bg-surface-2" aria-label="Bild entfernen">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <Slider label="Abdunkeln" value={settings.imageDim} min={0} max={85} onChange={(imageDim) => onChange({ imageDim })} display={`${settings.imageDim} %`} />
              <Slider label="Weichzeichnen" value={settings.imageBlur} min={0} max={24} onChange={(imageBlur) => onChange({ imageBlur })} display={`${settings.imageBlur} px`} />
              <p className="text-xs text-muted">Das Bild bleibt nur auf diesem Gerät gespeichert.</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (!file.type.startsWith('image/')) return toast.error('Bitte ein Bild (PNG, JPG oder WebP) wählen.');
              try {
                onImage(await resizeImage(file));
              } catch {
                toast.error('Das Bild konnte nicht gelesen werden.');
              }
            }}
          />
        </PanelSection>

        <PanelSection title="Extras">
          <Toggle label="Datum anzeigen" checked={settings.showDate} onChange={(showDate) => onChange({ showDate })} />
          <Toggle label="Nächste Prüfung anzeigen" checked={settings.showExam} onChange={(showExam) => onChange({ showExam })} />
          <Toggle label="Pixelverschiebung" hint="Bewegt die Uhr minütlich minimal – schont OLED-Displays." checked={settings.pixelShift} onChange={(pixelShift) => onChange({ pixelShift })} />
        </PanelSection>

        <button type="button" onClick={() => onChange(DEFAULT_STUDY_MODE)} className="flex items-center gap-2 text-sm font-medium text-accent hover:underline">
          <RotateCcw className="size-4" /> Auf Standard zurücksetzen
        </button>
        {!wakeLockSupported() && <p className="text-xs text-muted">Hinweis: Dieser Browser kann den Bildschirm nicht wach halten. Bitte die automatische Bildschirmsperre beachten.</p>}
      </div>
    </motion.aside>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, display }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; display: string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="num text-muted">{display}</span>
      </span>
      <input type="range" className="ss-range w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toUpperCase() === c.toUpperCase()}
          aria-label={c}
          onClick={() => onChange(c)}
          className="size-8 rounded-full border border-line transition-transform hover:scale-110"
          style={{ background: c, boxShadow: value.toUpperCase() === c.toUpperCase() ? `0 0 0 2px var(--ss-card), 0 0 0 4px ${c === '#FFFFFF' || c === '#F6F8FC' ? '#8A94A6' : c}` : undefined }}
        />
      ))}
      <label className="relative grid size-8 place-items-center overflow-hidden rounded-full border border-dashed border-line text-xs text-muted" title="Eigene Farbe">
        +
        <span className="sr-only">Eigene Farbe</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => (haptic('toggle'), onChange(!checked))}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#8FD8BD]' : 'bg-[var(--ss-track)]'}`}
      >
        <span className={`absolute left-0 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}
