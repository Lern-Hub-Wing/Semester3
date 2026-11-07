/**
 * Sanfter Zweiklang am Ende einer Fokusphase (Web Audio API, keine Datei).
 * Browser erlauben Ton erst nach einer Benutzeraktion – der Start-Knopf des
 * Timers „entsperrt“ den AudioContext über unlockAudio().
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

export function playChime() {
  const c = context();
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  [659.25, 987.77].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.18;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 1.5);
  });
}
