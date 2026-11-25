import { useEffect } from 'react';
import { Clock3, Paintbrush, Timer } from 'lucide-react';
import { Row, Section } from '../../components/ui/SettingsCard';
import { Segmented } from '../../components/ui/Segmented';
import { Switch } from '../../components/ui/Switch';
import { Button } from '../../components/ui/Button';
import { ContrastWarning, SharedLookNote } from '../../components/focus/LookNotes';
import { FocusBackdrop } from '../../components/focus/FocusChrome';
import { CLOCK_FONTS, GRADIENT_PRESETS, loadAllClockFonts, loadClockFont } from '../../lib/studyMode';
import { FOCUS_COLORS } from '../../lib/focusLook';
import { FOCUS_PRESETS } from '../../lib/focus';
import { alpha } from '../../lib/colors';
import { isLightBackground } from '../../lib/clockLook';
import { startStudyMode } from '../../lib/studyModeStart';
import { navigate } from '../../lib/router';
import { TINT } from '../../lib/tints';
import { focusActions, rhythmOf, useFocus } from '../../store/focus';

/**
 * Einstellungen → Uhr & Fokus: das gemeinsame Uhr-Design mit Live-Vorschau
 * (gilt für Fokus, Lernmodus und Hausaufgaben-Zähler) und der Fokus-Rhythmus.
 * Alles Weitere (Ring, Animation, eigenes Bild …) direkt in der Vollbildansicht.
 */
export function ClockSettings() {
  const look = useFocus((s) => s.look);
  const setLook = useFocus((s) => s.setLook);
  const settings = useFocus((s) => s.settings);
  const setSettings = useFocus((s) => s.setSettings);
  const font = CLOCK_FONTS.find((f) => f.id === look.font) ?? CLOCK_FONTS[0]!;
  const r = rhythmOf(settings);
  const light = isLightBackground(look);
  useEffect(() => {
    void loadClockFont(look.font);
  }, [look.font]);
  useEffect(() => loadAllClockFonts(), []);
  const glow = look.glow && look.glowStrength > 0 ? `drop-shadow(0 0 ${Math.round(3 + look.glowStrength * 0.18)}px ${alpha(look.color, 0.25 + look.glowStrength / 250)})` : undefined;
  const segPreset = settings.preset.startsWith('saved:') ? 'custom' : settings.preset;

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      <Section title="Uhr-Design" icon={<Paintbrush />} tint={TINT.indigo} hint="Nur auf diesem Gerät.">
        {/* Live-Vorschau im echten Hintergrund */}
        <div className="dark focus-scope relative h-44 overflow-hidden rounded-2xl sm:h-52" data-light={light ? 'true' : undefined} data-testid="clock-preview" aria-label="Vorschau des Uhr-Designs" role="img">
          <FocusBackdrop />
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">Vorschau</span>
            <span className="num leading-none" style={{ fontFamily: font.family, fontWeight: look.weight, fontSize: `${Math.round(40 + look.size * 0.32)}px`, color: look.color, filter: glow, letterSpacing: '-0.04em' }}>
              25:00
            </span>
          </div>
        </div>
        <SharedLookNote />
        <Row stacked label="Schrift">
          <div role="radiogroup" aria-label="Schrift der Uhr" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {CLOCK_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={look.font === f.id}
                onClick={() => setLook({ font: f.id, weight: f.defaultWeight })}
                className={`rounded-2xl border px-2 py-2 text-center transition-colors ${look.font === f.id ? 'lens border-transparent' : 'border-line hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]'}`}
              >
                <span className="block text-[19px] leading-none" style={{ fontFamily: f.family, fontWeight: f.defaultWeight }}>
                  12:30
                </span>
                <span className="mt-1 block text-[11.5px] text-muted">{f.label}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row stacked label="Farbe der Ziffern">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe der Ziffern">
            {[...FOCUS_COLORS, '#1D2533'].map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={look.color === c}
                aria-label={c}
                onClick={() => setLook({ color: c })}
                className={`size-9 rounded-full border border-line ${look.color === c ? 'ring-2 ring-[var(--ss-accent)] ring-offset-2 ring-offset-[var(--ss-card)]' : ''}`}
                style={{ background: c }}
              />
            ))}
            <label
              title="Eigene Farbe"
              className={`relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-line text-[15px] font-semibold text-white ${![...FOCUS_COLORS, '#1D2533'].includes(look.color) ? 'ring-2 ring-[var(--ss-accent)] ring-offset-2 ring-offset-[var(--ss-card)]' : ''}`}
              style={{ background: ![...FOCUS_COLORS, '#1D2533'].includes(look.color) ? look.color : 'conic-gradient(#ff8a8a, #ffd36e, #8ef0a5, #7cc8ff, #c79bff, #ff8a8a)' }}
            >
              <span aria-hidden>{[...FOCUS_COLORS, '#1D2533'].includes(look.color) ? '+' : ''}</span>
              <span className="sr-only">Eigene Farbe der Ziffern</span>
              <input type="color" value={look.color} onChange={(e) => setLook({ color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
          <ContrastWarning look={look} />
        </Row>
        <Row stacked label="Hintergrund">
          <Segmented
            size="sm"
            dense
            label="Hintergrund"
            className="w-full"
            value={look.background === 'image' ? 'image' : look.background}
            onChange={(background) => setLook({ background })}
            options={[
              { value: 'mountains', label: 'Berge' },
              { value: 'aurora', label: 'Polarlicht' },
              { value: 'gradient', label: 'Verlauf' },
              { value: 'solid', label: 'Farbe' },
              { value: 'image', label: 'Bild' },
            ]}
          />
          {look.background === 'gradient' && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Verlauf">
              {GRADIENT_PRESETS.map((g) => {
                const on = g.colors.every((c, i) => c === look.gradient[i]);
                return (
                  <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => setLook({ gradient: g.colors })} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] ${on ? 'lens border-transparent' : 'border-line'}`}>
                    <span className="size-4 rounded-full" style={{ background: `linear-gradient(135deg, ${g.colors.join(', ')})` }} aria-hidden />
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
          {look.background === 'image' && <p className="text-[12.5px] text-muted">Das eigene Bild wählst du im Fokus oder Lernmodus über „Anpassen“ → Bild.</p>}
        </Row>
        <Row inline label="Leuchten" hint="Weicher Schein um die Ziffern.">
          <Switch label="Leuchten" checked={look.glow} onChange={(glow) => setLook({ glow })} />
        </Row>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="glass" icon={<Timer className="size-4" />} onClick={() => navigate('/fokus')}>
            Im Fokus ansehen
          </Button>
          <Button size="sm" variant="glass" icon={<Clock3 className="size-4" />} onClick={startStudyMode}>
            Im Lernmodus ansehen
          </Button>
        </div>
      </Section>

      <Section title="Fokus-Timer" icon={<Timer />} tint={TINT.violet} hint="Rhythmus und Verhalten des Pomodoro-Timers.">
        <Row stacked label="Rhythmus" hint={`${r.focus} Min. Fokus · ${r.short} Min. Pause · lange Pause ${r.long} Min. nach ${r.rounds} Runden`}>
          <Segmented
            size="sm"
            label="Rhythmus"
            className="w-full"
            value={segPreset}
            onChange={(v) => (v === 'custom' ? focusActions.setCustom(r) : focusActions.choosePreset(v as 'kurz'))}
            options={[...FOCUS_PRESETS.map((p) => ({ value: p.id as string, label: p.label })), { value: 'custom', label: 'Individuell' }]}
          />
        </Row>
        <Row inline label="Ton beim Phasenwechsel">
          <Switch label="Ton beim Phasenwechsel" checked={settings.sound} onChange={(sound) => setSettings({ sound })} />
        </Row>
        <Row inline label="Nächste Phase automatisch starten">
          <Switch label="Nächste Phase automatisch starten" checked={settings.autoStart} onChange={(autoStart) => setSettings({ autoStart })} />
        </Row>
        <Row inline label="Beim Öffnen ins Vollbild" hint="Wo der Browser es erlaubt (z. B. Laptop, Android).">
          <Switch label="Beim Öffnen ins Vollbild" checked={settings.fullscreenOnOpen} onChange={(fullscreenOnOpen) => setSettings({ fullscreenOnOpen })} />
        </Row>
      </Section>
    </div>
  );
}
