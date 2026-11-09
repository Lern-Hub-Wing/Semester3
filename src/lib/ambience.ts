/**
 * Hintergrundklang für den Fokus – komplett im Browser erzeugt (Web Audio),
 * ohne Musikdateien und ohne Urheberrechtsfragen:
 *  – „lofi“: ruhige Jazz-Akkorde (E-Piano-Klang), weicher Bass, gedämpfte
 *    Drums mit Swing und Vinyl-Knistern; die Akkordfolge variiert leicht.
 *  – „rain“: Regen (gefiltertes Rauschen mit einzelnen Tropfen)
 *  – „noise“: tiefes, gleichmäßiges Rauschen (Braunes Rauschen)
 * Läuft nur, solange es eingeschaltet ist; Lautstärke 0–100.
 */
import { context } from './chime';

export type AmbienceKind = 'lofi' | 'rain' | 'noise';

export const AMBIENCE_LABEL: Record<AmbienceKind, string> = { lofi: 'Lofi', rain: 'Regen', noise: 'Rauschen' };

interface Running {
  kind: AmbienceKind;
  master: GainNode;
  stop: () => void;
}

let current: Running | null = null;
let volume = 0.5;

export function isAmbiencePlaying(): AmbienceKind | null {
  return current?.kind ?? null;
}

export function setAmbienceVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  const c = context();
  if (current && c) current.master.gain.setTargetAtTime(gainFor(current.kind), c.currentTime, 0.15);
}

const gainFor = (kind: AmbienceKind) => volume * (kind === 'lofi' ? 1.4 : kind === 'rain' ? 0.4 : 0.45);

/** Startet einen Klang (muss aus einer Benutzeraktion kommen). Ein laufender Klang wird ersetzt. */
export function startAmbience(kind: AmbienceKind) {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  stopAmbience();
  const master = c.createGain();
  master.gain.setValueAtTime(0, c.currentTime);
  master.gain.setTargetAtTime(gainFor(kind), c.currentTime, 0.8);
  master.connect(c.destination);
  const stop = kind === 'lofi' ? lofi(c, master) : kind === 'rain' ? rain(c, master) : brown(c, master);
  current = { kind, master, stop };
}

export function stopAmbience() {
  const c = context();
  const run = current;
  current = null;
  if (!run || !c) return;
  run.master.gain.setTargetAtTime(0, c.currentTime, 0.25);
  setTimeout(() => {
    run.stop();
    run.master.disconnect();
  }, 1200);
}

// ---------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------

function noiseBuffer(c: AudioContext, seconds: number, color: 'white' | 'brown' | 'pink'): AudioBuffer {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  return buf;
}

function loopNoise(c: AudioContext, color: 'white' | 'brown' | 'pink', dest: AudioNode) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4, color);
  src.loop = true;
  src.connect(dest);
  src.start();
  return src;
}

function brown(c: AudioContext, out: AudioNode) {
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(out);
  const src = loopNoise(c, 'brown', lp);
  return () => src.stop();
}

function rain(c: AudioContext, out: AudioNode) {
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 400;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  hp.connect(lp).connect(out);
  const bed = loopNoise(c, 'pink', hp);
  // einzelne Tropfen
  const drops = setInterval(() => {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + Math.random() * 0.25;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1800 + Math.random() * 2400, t);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025 + Math.random() * 0.03, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.06);
    }
  }, 250);
  return () => {
    clearInterval(drops);
    bed.stop();
  };
}

// ---------------------------------------------------------------------
// Lofi-Generator
// ---------------------------------------------------------------------

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Akkordfolgen (MIDI-Noten, Bassnote zuerst) – ruhige ii–V–I-Varianten */
const PROGRESSIONS: number[][][] = [
  [
    [50, 65, 69, 72, 76], // Dm9
    [43, 65, 69, 71, 74], // G13
    [48, 64, 67, 71, 74], // Cmaj9
    [45, 64, 67, 72, 76], // Am7
  ],
  [
    [53, 64, 69, 72, 76], // Fmaj7
    [52, 62, 67, 71, 74], // Em7
    [50, 60, 65, 69, 72], // Dm7
    [43, 62, 65, 69, 71], // G7
  ],
  [
    [45, 60, 64, 67, 71], // Am9
    [50, 60, 65, 69, 72], // Dm7
    [43, 59, 65, 69, 74], // G9
    [48, 59, 64, 67, 71], // Cmaj7
  ],
];

function lofi(c: AudioContext, out: AudioNode) {
  const bpm = 72;
  const beat = 60 / bpm;
  const bar = beat * 4;

  // Gesamtklang: weich, etwas dumpf
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  tone.connect(comp).connect(out);

  // leichtes „Wow“ (Bandmaschine): modulierte Verzögerung auf dem Piano-Bus
  const keysBus = c.createGain();
  const wobble = c.createDelay(0.05);
  wobble.delayTime.value = 0.012;
  const wow = c.createOscillator();
  const wowDepth = c.createGain();
  wow.frequency.value = 0.35;
  wowDepth.gain.value = 0.0018;
  wow.connect(wowDepth).connect(wobble.delayTime);
  wow.start();
  keysBus.connect(wobble).connect(tone);

  // Vinyl: Rauschen + Knistern
  const vinylLp = c.createBiquadFilter();
  vinylLp.type = 'bandpass';
  vinylLp.frequency.value = 2500;
  vinylLp.Q.value = 0.6;
  const vinylGain = c.createGain();
  vinylGain.gain.value = 0.018;
  vinylLp.connect(vinylGain).connect(out);
  const vinyl = loopNoise(c, 'white', vinylLp);

  const keys = (freq: number, t: number, dur: number, gain: number) => {
    // E-Piano: Sinus + leiser Oberton, weicher Anschlag
    for (const [mult, g] of [
      [1, 1],
      [2, 0.18],
      [3, 0.05],
    ] as const) {
      const o = c.createOscillator();
      const a = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * mult, t);
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(gain * g, t + 0.025);
      a.gain.exponentialRampToValueAtTime(gain * g * 0.35, t + 0.6);
      a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(a).connect(keysBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  };

  const bass = (freq: number, t: number, dur: number) => {
    const o = c.createOscillator();
    const a = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    a.gain.setValueAtTime(0, t);
    a.gain.linearRampToValueAtTime(0.22, t + 0.02);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a).connect(tone);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const noiseHit = (t: number, type: BiquadFilterType, freq: number, gain: number, dur: number) => {
    const src = c.createBufferSource();
    src.buffer = hitBuffer;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const a = c.createGain();
    a.gain.setValueAtTime(gain, t);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(a).connect(tone);
    src.start(t);
    src.stop(t + dur + 0.02);
  };
  const hitBuffer = noiseBuffer(c, 0.5, 'white');

  const kick = (t: number) => {
    const o = c.createOscillator();
    const a = c.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    a.gain.setValueAtTime(0.45, t);
    a.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(a).connect(tone);
    o.start(t);
    o.stop(t + 0.35);
  };

  let prog = PROGRESSIONS[0]!;
  let step = 0; // Achtelnoten seit Start
  let next = c.currentTime + 0.15;
  const swing = beat * 0.17;

  const schedule = () => {
    while (next < c.currentTime + 0.4) {
      const inBar = step % 8;
      const barIndex = Math.floor(step / 8);
      const chord = prog[barIndex % prog.length]!;
      const t = next + (inBar % 2 === 1 ? swing : 0);
      if (inBar === 0) {
        // neue Akkordfolge alle 8 Takte
        if (barIndex % 8 === 0 && barIndex > 0) prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]!;
        chord.slice(1).forEach((n, i) => keys(midi(n), t + i * 0.012, bar * 0.95, 0.05));
      }
      // kleine Wiederholung des Akkords auf der „und 3“ (manchmal)
      if (inBar === 5 && Math.random() < 0.45) chord.slice(2).forEach((n) => keys(midi(n), t, beat * 1.2, 0.028));
      if (inBar === 0 || (inBar === 5 && Math.random() < 0.6)) bass(midi(chord[0]!), t, beat * 1.6);
      if (inBar === 4) bass(midi(chord[0]! + 7 - 12 * (chord[0]! + 7 > 55 ? 1 : 0)), t, beat * 1.2);
      // Drums
      if (inBar === 0 || inBar === 3 || (inBar === 5 && Math.random() < 0.35)) kick(t);
      if (inBar === 2 || inBar === 6) noiseHit(t, 'bandpass', 1900, 0.16, 0.18);
      noiseHit(t, 'highpass', 7500, inBar % 2 === 0 ? 0.05 : 0.03, 0.04);
      // Vinyl-Knackser
      if (Math.random() < 0.2) noiseHit(t + Math.random() * beat * 0.5, 'highpass', 3000, 0.05, 0.008);
      next += beat / 2;
      step++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 100);

  return () => {
    clearInterval(timer);
    vinyl.stop();
    wow.stop();
  };
}
