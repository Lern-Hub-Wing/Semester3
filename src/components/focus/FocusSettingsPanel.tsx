import { useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ImagePlus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { FOCUS_PRESETS, RHYTHM_LIMITS, type Rhythm } from '../../lib/focus';
import { FOCUS_COLORS, RING_COLORS, saveFocusImage, loadFocusImage } from '../../lib/focusLook';
import { CLOCK_FONTS, GRADIENT_PRESETS, BG_COLORS, resizeImage } from '../../lib/studyMode';
import { focusActions, rhythmOf, useFocus } from '../../store/focus';
import { useModules } from '../../store/derived';
import { toast } from '../../store/toast';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { GlassSlider } from '../ui/GlassSlider';

type Tab = 'rhythmus' | 'anzeige' | 'hintergrund' | 'steuerung';

/** Einstellungen direkt in der Fokusansicht – Glasblatt rechts (Desktop) bzw. unten (Smartphone). */
export function FocusSettingsPanel({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>('rhythmus');
  return (
    <motion.aside
      data-panel
      role="dialog"
      aria-label="Fokus-Einstellungen"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98, filter: 'blur(6px)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="focus-panel absolute inset-x-2 bottom-2 z-30 flex max-h-[78dvh] flex-col overflow-hidden rounded-[28px] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[400px]"
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="text-[16px] font-semibold">Fokus anpassen</h2>
        <button type="button" onClick={onClose} aria-label="Einstellungen schließen" className="focus-btn grid size-9 place-items-center rounded-full text-white/80">
          <X className="size-[18px]" />
        </button>
      </div>
      <div className="px-4 pb-3">
        <Segmented
          size="sm"
          dense
          label="Bereich"
          className="w-full"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rhythmus', label: 'Rhythmus' },
            { value: 'anzeige', label: 'Anzeige' },
            { value: 'hintergrund', label: 'Bild' },
            { value: 'steuerung', label: 'Steuerung' },
          ]}
        />
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-6">
        {tab === 'rhythmus' && <RhythmTab />}
        {tab === 'anzeige' && <DisplayTab />}
        {tab === 'hintergrund' && <BackgroundTab />}
        {tab === 'steuerung' && <ControlsTab />}
      </div>
    </motion.aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-1">
      <h3 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/55">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 text-[14px]">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c || 'auto'}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c ? c : 'Phasenfarbe'}
          title={c ? c : 'Phasenfarbe'}
          onClick={() => onChange(c)}
          className={`size-8 rounded-full border transition-transform duration-200 hover:scale-110 ${value === c ? 'border-white ring-2 ring-white/40' : 'border-white/25'}`}
          style={{ background: c || 'conic-gradient(#a9a6ff, #7fd6b6, #8cbcff, #a9a6ff)' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RhythmTab() {
  const settings = useFocus((s) => s.settings);
  const timer = useFocus((s) => s.timer);
  const modules = useModules();
  const r = rhythmOf(settings);
  const [name, setName] = useState('');
  const options = [
    ...FOCUS_PRESETS.map((p) => ({ value: p.id as string, label: p.label })),
    { value: 'custom', label: 'Individuell' },
  ];
  const segValue = settings.preset.startsWith('saved:') ? 'custom' : settings.preset;
  const set = (k: keyof Rhythm) => (v: number) => focusActions.setCustom({ ...r, [k]: v });
  return (
    <>
      <Section title="Rhythmus">
        <Segmented size="sm" dense label="Pomodoro-Rhythmus" className="w-full" value={segValue} onChange={(v) => (v === 'custom' ? focusActions.setCustom(r) : focusActions.choosePreset(v as 'kurz'))} options={options} />
        <p className="num text-[13px] text-white/65" data-testid="focus-rhythm">
          {r.focus} Min. Fokus · {r.short} Min. Pause · lange Pause {r.long} Min. nach {r.rounds} {r.rounds === 1 ? 'Runde' : 'Runden'}
        </p>
        {settings.saved.length > 0 && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Eigene Vorlagen">
            {settings.saved.map((p) => (
              <span key={p.id} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-[13px] ${settings.preset === `saved:${p.id}` ? 'bg-white/20' : 'bg-white/8'}`}>
                <button type="button" role="radio" aria-checked={settings.preset === `saved:${p.id}`} onClick={() => focusActions.choosePreset(`saved:${p.id}`)}>
                  {p.name}
                </button>
                <button type="button" aria-label={`Vorlage ${p.name} löschen`} onClick={() => focusActions.deletePreset(p.id)} className="grid size-6 place-items-center rounded-full hover:bg-white/15">
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>
      <Section title="Individuell">
        <GlassSlider label="Fokus" value={r.focus} min={RHYTHM_LIMITS.focus[0]} max={120} step={1} onChange={set('focus')} display={`${r.focus} Min.`} />
        <GlassSlider label="Kurze Pause" value={r.short} min={RHYTHM_LIMITS.short[0]} max={30} onChange={set('short')} display={`${r.short} Min.`} />
        <GlassSlider label="Lange Pause" value={r.long} min={RHYTHM_LIMITS.long[0]} max={60} onChange={set('long')} display={`${r.long} Min.`} />
        <GlassSlider label="Runden bis zur langen Pause" value={r.rounds} min={1} max={8} onChange={set('rounds')} display={String(r.rounds)} />
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            focusActions.savePreset(name);
            setName('');
            toast.success('Vorlage gespeichert');
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name der Vorlage" aria-label="Name der Vorlage" className="focus-input min-w-0 flex-1" />
          <button type="submit" className="focus-btn inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-white">
            <Plus className="size-4" /> Speichern
          </button>
        </form>
      </Section>
      <Section title="Lernen für">
        <select className="focus-input" value={timer.moduleId ?? ''} onChange={(e) => focusActions.setModule(e.target.value || null)} aria-label="Modul für diese Fokusphase">
          <option value="">Kein bestimmtes Modul</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Section>
    </>
  );
}

function DisplayTab() {
  const look = useFocus((s) => s.look);
  const setLook = useFocus((s) => s.setLook);
  const font = CLOCK_FONTS.find((f) => f.id === look.font) ?? CLOCK_FONTS[0]!;
  return (
    <>
      <Section title="Schrift">
        <div role="radiogroup" aria-label="Schriftart" className="grid grid-cols-3 gap-2">
          {CLOCK_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={look.font === f.id}
              onClick={() => setLook({ font: f.id, weight: f.defaultWeight })}
              className={`rounded-2xl px-2 py-2.5 text-center transition-colors ${look.font === f.id ? 'bg-white/20' : 'bg-white/[0.06] hover:bg-white/12'}`}
            >
              <span className="block text-[20px] leading-none" style={{ fontFamily: f.family, fontWeight: f.defaultWeight }}>
                25
              </span>
              <span className="mt-1 block text-[11.5px] text-white/70">{f.label}</span>
            </button>
          ))}
        </div>
        <GlassSlider label="Größe" value={look.size} min={40} max={100} onChange={(size) => setLook({ size })} display={`${look.size} %`} />
        <GlassSlider label="Schriftstärke" value={look.weight} min={font.min} max={font.max} step={50} onChange={(weight) => setLook({ weight })} display={String(look.weight)} />
        <Row label="Sekunden anzeigen">
          <Switch label="Sekunden anzeigen" checked={look.showSeconds} onChange={(showSeconds) => setLook({ showSeconds })} />
        </Row>
        <Segmented size="sm" label="Position" className="w-full" value={look.position} onChange={(position) => setLook({ position })} options={[{ value: 'top', label: 'Oben' }, { value: 'center', label: 'Mitte' }, { value: 'bottom', label: 'Unten' }]} />
        <Segmented size="sm" dense label="Animation der Ziffern" className="w-full" value={look.anim} onChange={(anim) => setLook({ anim })} options={[{ value: 'off', label: 'Aus' }, { value: 'slow', label: 'Ruhig' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Schnell' }]} />
      </Section>
      <Section title="Farbe & Leuchten">
        <Swatches label="Farbe der Zeit" colors={FOCUS_COLORS} value={look.color} onChange={(color) => setLook({ color })} />
        <Row label="Leuchten">
          <Switch label="Leuchten" checked={look.glow} onChange={(glow) => setLook({ glow })} />
        </Row>
        {look.glow && <GlassSlider label="Stärke" value={look.glowStrength} min={0} max={100} onChange={(glowStrength) => setLook({ glowStrength })} display={`${look.glowStrength} %`} />}
      </Section>
      <Section title="Ring & Fortschritt">
        <Row label="Ring">
          <Switch label="Ring anzeigen" checked={look.ring} onChange={(ring) => setLook({ ring })} />
        </Row>
        {look.ring && (
          <>
            <GlassSlider label="Ringstärke" value={look.ringWidth} min={2} max={24} onChange={(ringWidth) => setLook({ ringWidth })} display={`${look.ringWidth} px`} />
            <Swatches label="Ringfarbe" colors={RING_COLORS} value={look.ringColor} onChange={(ringColor) => setLook({ ringColor })} />
          </>
        )}
        <Row label="Prozent anzeigen">
          <Switch label="Prozent anzeigen" checked={look.percent} onChange={(percent) => setLook({ percent })} />
        </Row>
        <Row label="Fortschrittslinie">
          <Switch label="Fortschrittslinie anzeigen" checked={look.bar} onChange={(bar) => setLook({ bar })} />
        </Row>
      </Section>
    </>
  );
}

function BackgroundTab() {
  const look = useFocus((s) => s.look);
  const setLook = useFocus((s) => s.setLook);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasImage, setHasImage] = useState(() => loadFocusImage() !== null);
  return (
    <>
      <Section title="Hintergrund">
        <div role="radiogroup" aria-label="Hintergrund" className="grid grid-cols-3 gap-2">
          {(
            [
              ['mountains', 'Berge'],
              ['aurora', 'Polarlicht'],
              ['gradient', 'Verlauf'],
              ['solid', 'Farbe'],
              ['image', 'Eigenes Bild'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={look.background === id}
              onClick={() => (id === 'image' && !hasImage ? fileRef.current?.click() : setLook({ background: id }))}
              className={`rounded-2xl px-2 py-3 text-[13px] font-medium transition-colors ${look.background === id ? 'bg-white/20' : 'bg-white/[0.06] hover:bg-white/12'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const data = await resizeImage(file);
              if (!saveFocusImage(data)) return toast.error('Das Bild ist zu groß für den Gerätespeicher.');
              setHasImage(true);
              setLook({ background: 'image' });
              // Neu laden, damit der Hintergrund das Bild übernimmt
              window.dispatchEvent(new Event('studyspace:focus-image'));
            } catch {
              toast.error('Das Bild konnte nicht geladen werden.');
            }
          }}
        />
        {look.background === 'image' && (
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="focus-btn inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-medium text-white">
              <ImagePlus className="size-4" /> Anderes Bild
            </button>
            <button
              type="button"
              onClick={() => {
                saveFocusImage(null);
                setHasImage(false);
                setLook({ background: 'mountains' });
                window.dispatchEvent(new Event('studyspace:focus-image'));
              }}
              className="focus-btn inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium text-white"
            >
              <Trash2 className="size-4" /> Entfernen
            </button>
          </div>
        )}
        {(look.background === 'solid' || look.background === 'aurora') && <Swatches label="Grundfarbe" colors={BG_COLORS} value={look.bgColor} onChange={(bgColor) => setLook({ bgColor })} />}
        {look.background === 'gradient' && (
          <div role="radiogroup" aria-label="Verlauf" className="grid grid-cols-3 gap-2">
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={look.gradient.join() === g.colors.join()}
                onClick={() => setLook({ gradient: g.colors })}
                className={`h-12 rounded-2xl border text-[11.5px] font-medium text-white ${look.gradient.join() === g.colors.join() ? 'border-white' : 'border-white/20'}`}
                style={{ background: `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})` }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </Section>
      <Section title="Wirkung">
        <GlassSlider label="Weichzeichnen" value={look.blur} min={0} max={24} onChange={(blur) => setLook({ blur })} display={`${look.blur} px`} />
        <GlassSlider label="Abdunkeln" value={look.dim} min={0} max={85} onChange={(dim) => setLook({ dim })} display={`${look.dim} %`} />
        <Row label="Dezente Bewegung">
          <Switch label="Dezente Bewegung" checked={look.motion} onChange={(motion) => setLook({ motion })} />
        </Row>
      </Section>
    </>
  );
}

function ControlsTab() {
  const look = useFocus((s) => s.look);
  const setLook = useFocus((s) => s.setLook);
  const resetLook = useFocus((s) => s.resetLook);
  const settings = useFocus((s) => s.settings);
  const setSettings = useFocus((s) => s.setSettings);
  return (
    <>
      <Section title="Ablauf">
        <Row label="Automatischer Phasenwechsel">
          <Switch label="Automatischer Phasenwechsel" checked={settings.autoAdvance} onChange={(autoAdvance) => setSettings({ autoAdvance })} />
        </Row>
        <Row label="Nächste Phase automatisch starten">
          <Switch label="Nächste Phase automatisch starten" checked={settings.autoStart} disabled={!settings.autoAdvance} onChange={(autoStart) => setSettings({ autoStart })} />
        </Row>
        <Row label="Beim Öffnen sofort starten">
          <Switch label="Beim Öffnen sofort starten" checked={settings.autoStartOnOpen} onChange={(autoStartOnOpen) => setSettings({ autoStartOnOpen })} />
        </Row>
      </Section>
      <Section title="Ton & Mitteilung">
        <Row label="Signalton">
          <Switch label="Signalton" checked={settings.sound} onChange={(sound) => setSettings({ sound })} />
        </Row>
        {settings.sound && <GlassSlider label="Lautstärke" value={settings.volume} min={0} max={100} step={5} onChange={(volume) => setSettings({ volume })} display={`${settings.volume} %`} />}
        <Row label="Mitteilung beim Phasenwechsel">
          <Switch
            label="Mitteilung beim Phasenwechsel"
            checked={settings.notify}
            onChange={async (notify) => {
              if (notify && 'Notification' in window && Notification.permission === 'default') {
                const res = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
                if (res !== 'granted') return toast.error('Mitteilungen sind für StudySpace nicht erlaubt.');
              } else if (notify && (!('Notification' in window) || Notification.permission === 'denied')) {
                return toast.error('Mitteilungen sind auf diesem Gerät nicht erlaubt.');
              }
              setSettings({ notify });
            }}
          />
        </Row>
      </Section>
      <Section title="Musik">
        <Segmented
          size="sm"
          label="Hintergrundklang"
          className="w-full"
          value={settings.music}
          onChange={(music) => setSettings({ music })}
          options={[
            { value: 'lofi', label: 'Lofi' },
            { value: 'rain', label: 'Regen' },
            { value: 'noise', label: 'Rauschen' },
          ]}
        />
        <GlassSlider label="Lautstärke Musik" value={settings.musicVolume} min={0} max={100} step={5} onChange={(musicVolume) => setSettings({ musicVolume })} display={`${settings.musicVolume} %`} />
      </Section>
      <Section title="Steuerleiste">
        <Segmented size="sm" label="Position der Steuerleiste" className="w-full" value={look.barPosition} onChange={(barPosition) => setLook({ barPosition })} options={[{ value: 'bottom', label: 'Unten' }, { value: 'top', label: 'Oben' }]} />
        <Row label="Automatisch ausblenden">
          <Switch label="Steuerleiste automatisch ausblenden" checked={look.autoHide} onChange={(autoHide) => setLook({ autoHide })} />
        </Row>
        {look.autoHide && <GlassSlider label="Ausblenden nach" value={look.hideDelay} min={2} max={15} onChange={(hideDelay) => setLook({ hideDelay })} display={`${look.hideDelay} s`} />}
      </Section>
      <button
        type="button"
        onClick={() => {
          resetLook();
          toast.success('Darstellung zurückgesetzt');
        }}
        className="focus-btn mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium text-white"
      >
        <RotateCcw className="size-4" /> Darstellung zurücksetzen
      </button>
    </>
  );
}
