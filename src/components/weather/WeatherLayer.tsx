import { useEffect, useMemo, useRef } from 'react';
import { useNow } from '../../hooks/useNow';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePrefs } from '../../store/prefs';
import { refreshWeather, sceneFor, useWeather } from '../../store/weather';
import { WeatherEngine } from './engine';

/**
 * Wetter hinter den Karten (Wolken, Regen, Schnee, Sterne, Gewitter).
 * Bei klarem Tag bleibt alles wie gewohnt; bei „Bewegung reduzieren“ aus.
 */
export function WeatherLayer() {
  const mode = useWeather((s) => s.mode);
  const coords = useWeather((s) => s.coords);
  const current = useWeather((s) => s.current);
  const motion = usePrefs((s) => s.motion);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reducedMotion = motion === 'reduced' || (motion === 'system' && systemReduced);
  const minute = Math.floor(useNow(60_000) / 60_000);
  const scene = useMemo(() => sceneFor({ mode, coords, current }), [mode, coords, current, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = !!scene && !reducedMotion && !(scene.kind === 'clear' && !scene.night);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<WeatherEngine | null>(null);

  // Wetter regelmäßig aktualisieren (alle 30 Min., beim Zurückkehren in den Tab)
  useEffect(() => {
    if (mode !== 'auto' || !coords) return;
    void refreshWeather();
    const id = setInterval(() => void refreshWeather(), 10 * 60_000);
    const onVis = () => document.visibilityState === 'visible' && void refreshWeather();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mode, coords]);

  useEffect(() => {
    if (!active || !canvas.current || !scene) return;
    const e = new WeatherEngine(canvas.current, scene);
    engine.current = e;
    let raf = 0;
    const loop = (t: number) => {
      e.frame(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => e.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      engine.current = null;
    };
    // Szene wird unten ohne Neustart übergeben
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scene) engine.current?.setScene(scene);
  }, [scene]);

  if (!active) return null;
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[5]" data-testid="weather-layer" data-weather={`${scene!.kind}${scene!.night ? '-night' : ''}`} />;
}
