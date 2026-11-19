import { create } from 'zustand';
import { fetchWeather, locate, nightByClock, sceneFromMode, type CurrentWeather, type WeatherMode, type WeatherScene } from '../lib/weather';

/**
 * Wetter im Hintergrund (nur dieses Gerät, lokal gespeichert).
 * „Automatisch“: mit freigegebenem Standort echtes Wetter, sonst nur die
 * Tageszeit (nachts Sterne). Standort und Wetter bleiben im Browser.
 */
const KEY = 'studyspace.weather.v1';
const REFRESH_MS = 30 * 60_000;

type Status = 'idle' | 'locating' | 'loading' | 'denied' | 'unsupported' | 'error';

interface Saved {
  mode: WeatherMode;
  coords: { lat: number; lon: number } | null;
  current: CurrentWeather | null;
}

interface WeatherState extends Saved {
  status: Status;
  error: string | null;
}

const MODES: WeatherMode[] = ['off', 'auto', 'clear', 'cloudy', 'rain', 'thunder', 'snow', 'night'];

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    const c = raw?.coords;
    return {
      mode: MODES.includes(raw?.mode as WeatherMode) ? (raw!.mode as WeatherMode) : 'auto',
      coords: c && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? { lat: c.lat, lon: c.lon } : null,
      current: raw?.current && typeof raw.current.code === 'number' ? raw.current : null,
    };
  } catch {
    return { mode: 'auto', coords: null, current: null };
  }
}

export const useWeather = create<WeatherState>(() => ({ ...(typeof window === 'undefined' ? { mode: 'auto' as const, coords: null, current: null } : load()), status: 'idle', error: null }));

function save() {
  const { mode, coords, current } = useWeather.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode, coords, current }));
  } catch {
    /* ohne Speicher gilt die Einstellung nur bis zum Neuladen */
  }
}

export function setWeatherMode(mode: WeatherMode) {
  useWeather.setState({ mode, error: null });
  save();
  if (mode === 'auto') void refreshWeather();
}

let inflight: Promise<void> | null = null;

/** Aktuelles Wetter am gespeicherten Standort laden (höchstens alle 30 Minuten, außer force) */
export function refreshWeather(force = false): Promise<void> {
  const { coords, current, mode } = useWeather.getState();
  if (mode !== 'auto' || !coords) return Promise.resolve();
  if (!force && current && Date.now() - current.at < REFRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  useWeather.setState({ status: 'loading' });
  inflight = fetchWeather(coords.lat, coords.lon)
    .then((w) => {
      useWeather.setState({ current: w, status: 'idle', error: null });
      save();
    })
    .catch((e: unknown) => useWeather.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Standort freigeben – direkt aus einem Klick aufrufen (Berechtigungsdialog des Browsers) */
export async function shareLocation(): Promise<boolean> {
  useWeather.setState({ status: 'locating', error: null });
  try {
    const coords = await locate();
    useWeather.setState({ coords, mode: 'auto', current: null });
    save();
    await refreshWeather(true);
    return useWeather.getState().status !== 'error';
  } catch (e) {
    const reason = e instanceof Error ? e.message : '';
    useWeather.setState({ status: reason === 'denied' ? 'denied' : reason === 'unsupported' ? 'unsupported' : 'error', error: reason === 'denied' || reason === 'unsupported' ? null : 'Standort nicht verfügbar.' });
    return false;
  }
}

export function forgetLocation() {
  useWeather.setState({ coords: null, current: null, status: 'idle', error: null });
  save();
}

/** Was gerade gezeigt wird (null = nichts) */
export function sceneFor(s: Pick<WeatherState, 'mode' | 'coords' | 'current'>, now: Date = new Date()): WeatherScene | null {
  if (s.mode === 'off') return null;
  if (s.mode !== 'auto') return sceneFromMode(s.mode, now);
  // Wetter höchstens 3 Stunden alt verwenden, sonst nur die Tageszeit
  if (s.coords && s.current && now.getTime() - s.current.at < 3 * 3600_000) return { kind: s.current.kind, night: s.current.night, intensity: s.current.intensity };
  return { kind: 'clear', night: nightByClock(now), intensity: 0 };
}
