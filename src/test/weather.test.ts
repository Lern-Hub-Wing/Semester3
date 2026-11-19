import { describe, expect, it } from 'vitest';
import { round2, sceneFromCode, sceneFromMode } from '../lib/weather';
import { sceneFor } from '../store/weather';

describe('Wetter: Szene aus WMO-Code', () => {
  it.each([
    [0, 'clear'],
    [2, 'partly'],
    [3, 'cloudy'],
    [45, 'cloudy'],
    [61, 'rain'],
    [82, 'rain'],
    [73, 'snow'],
    [95, 'thunder'],
  ])('%i → %s', (code, kind) => expect(sceneFromCode(code, true).kind).toBe(kind));

  it('Tag/Nacht und Stärke', () => {
    expect(sceneFromCode(0, false)).toEqual({ kind: 'clear', night: true, intensity: 0 });
    expect(sceneFromCode(65, true).intensity).toBe(1);
    expect(sceneFromCode(61, true).intensity).toBeLessThan(0.6);
  });

  it('rundet den Standort auf ~1 km', () => {
    expect(round2(52.51627)).toBe(52.52);
    expect(round2(13.37769)).toBe(13.38);
  });
});

describe('Wetter: was gezeigt wird', () => {
  const noon = new Date(2026, 10, 19, 12, 0);
  const late = new Date(2026, 10, 19, 22, 0);
  it('aus → nichts; fest → gewählte Szene', () => {
    expect(sceneFor({ mode: 'off', coords: null, current: null }, noon)).toBeNull();
    expect(sceneFor({ mode: 'night', coords: null, current: null }, noon)).toEqual(sceneFromMode('night', noon));
    expect(sceneFor({ mode: 'rain', coords: null, current: null }, noon)?.kind).toBe('rain');
  });
  it('automatisch ohne Standort: nur Tageszeit (nachts Sterne)', () => {
    expect(sceneFor({ mode: 'auto', coords: null, current: null }, noon)).toEqual({ kind: 'clear', night: false, intensity: 0 });
    expect(sceneFor({ mode: 'auto', coords: null, current: null }, late)?.night).toBe(true);
  });
  it('automatisch mit Standort: echtes Wetter, veraltetes (> 3 h) nicht', () => {
    const current = { kind: 'rain' as const, night: false, intensity: 0.7, code: 63, temperature: 7, at: noon.getTime() - 60_000 };
    expect(sceneFor({ mode: 'auto', coords: { lat: 52.52, lon: 13.38 }, current }, noon)?.kind).toBe('rain');
    expect(sceneFor({ mode: 'auto', coords: { lat: 52.52, lon: 13.38 }, current: { ...current, at: noon.getTime() - 4 * 3600_000 } }, noon)?.kind).toBe('clear');
  });
});
