/**
 * Dezente UI-Klänge (Web Audio, keine Dateien): Antippen, Auswählen,
 * Umschalten, Erledigt. Sehr leise und kurz, abschaltbar in den
 * Einstellungen („Klänge“). Auf dem iPhone folgen sie dem Stummschalter.
 */
import { context } from './chime';
import type { HapticKind } from './haptics';

let enabled = true;
let lastAt = 0;

export function setSoundsEnabled(value: boolean) {
  enabled = value;
}

export function soundsEnabled() {
  return enabled;
}

interface Tone {
  type: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  gain: number;
}

const TONES: Record<HapticKind, Tone[]> = {
  // weiches „Tick“
  tap: [{ type: 'sine', from: 1250, to: 950, dur: 0.045, gain: 0.03 }],
  // kleines, aufsteigendes „Plopp“
  select: [{ type: 'triangle', from: 620, to: 930, dur: 0.07, gain: 0.04 }],
  // gezupfter Ton mit Oberton
  toggle: [
    { type: 'sine', from: 540, dur: 0.11, gain: 0.045 },
    { type: 'sine', from: 1080, dur: 0.07, gain: 0.015 },
  ],
  // kurzes Dur-Arpeggio (C–E–G)
  success: [
    { type: 'sine', from: 1046.5, at: 0, dur: 0.32, gain: 0.04 },
    { type: 'sine', from: 1318.5, at: 0.06, dur: 0.32, gain: 0.035 },
    { type: 'sine', from: 1568, at: 0.12, dur: 0.42, gain: 0.032 },
  ],
};

/** Spielt einen kurzen Klang (muss aus einer Benutzeraktion kommen, damit iOS Ton erlaubt). */
export function playUiSound(kind: HapticKind) {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastAt < 45) return;
  lastAt = now;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  const t0 = c.currentTime + 0.005;
  for (const tone of TONES[kind]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    const start = t0 + (tone.at ?? 0);
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.from, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(tone.gain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
    osc.connect(g).connect(c.destination);
    osc.start(start);
    osc.stop(start + tone.dur + 0.02);
  }
}
