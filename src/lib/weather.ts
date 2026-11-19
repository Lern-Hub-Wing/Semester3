/**
 * Wetter für den Hintergrund: Szene aus Wettercode (WMO, Open-Meteo) und
 * Tageszeit. Open-Meteo braucht keinen Schlüssel; der Browser fragt dort
 * direkt mit auf ~1 km gerundeten Koordinaten an (nichts geht über unseren Server).
 */

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'rain' | 'thunder' | 'snow';

export interface WeatherScene {
  kind: WeatherKind;
  /** dunkel (nach Sonnenuntergang) → Sterne, Sternschnuppen, dunklere Wolken */
  night: boolean;
  /** 0…1 – Stärke von Regen/Schnee/Bewölkung */
  intensity: number;
}

export interface CurrentWeather extends WeatherScene {
  code: number;
  temperature: number | null;
  at: number;
}

/** Einstellung: aus, automatisch (Standort, sonst nur Tageszeit) oder fest zum Ausprobieren */
export type WeatherMode = 'off' | 'auto' | 'clear' | 'cloudy' | 'rain' | 'thunder' | 'snow' | 'night';

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Klar',
  partly: 'Leicht bewölkt',
  cloudy: 'Bewölkt',
  rain: 'Regen',
  thunder: 'Gewitter',
  snow: 'Schnee',
};

/** WMO-Wettercode → Szene (https://open-meteo.com/en/docs, „Weather variable documentation“) */
export function sceneFromCode(code: number, isDay: boolean): WeatherScene {
  const night = !isDay;
  if (code === 0 || code === 1) return { kind: 'clear', night, intensity: 0 };
  if (code === 2) return { kind: 'partly', night, intensity: 0.45 };
  if (code === 3 || code === 45 || code === 48) return { kind: 'cloudy', night, intensity: 0.85 };
  if (code >= 95) return { kind: 'thunder', night, intensity: 1 };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', night, intensity: code === 75 || code === 86 ? 1 : code === 71 || code === 85 ? 0.45 : 0.7 };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    const heavy = [55, 57, 65, 67, 82].includes(code);
    const light = [51, 56, 61, 66, 80].includes(code);
    return { kind: 'rain', night, intensity: heavy ? 1 : light ? 0.45 : 0.7 };
  }
  return { kind: 'cloudy', night, intensity: 0.7 };
}

/** Dunkel nach Uhrzeit (ohne Standort): grob 19–6 Uhr Ortszeit des Geräts */
export function nightByClock(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= 19 || h < 6;
}

/** Feste Einstellung → Szene (zum Ausprobieren) */
export function sceneFromMode(mode: Exclude<WeatherMode, 'off' | 'auto'>, now: Date = new Date()): WeatherScene {
  switch (mode) {
    case 'night':
      return { kind: 'clear', night: true, intensity: 0 };
    case 'clear':
      return { kind: 'clear', night: false, intensity: 0 };
    case 'cloudy':
      return { kind: 'cloudy', night: nightByClock(now), intensity: 0.85 };
    case 'rain':
      return { kind: 'rain', night: nightByClock(now), intensity: 0.75 };
    case 'thunder':
      return { kind: 'thunder', night: nightByClock(now), intensity: 1 };
    case 'snow':
      return { kind: 'snow', night: nightByClock(now), intensity: 0.7 };
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<CurrentWeather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${round2(lat)}&longitude=${round2(lon)}&current=weather_code,is_day,temperature_2m&timezone=auto`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Wetterdienst antwortet mit ${res.status}`);
  const body = (await res.json()) as { current?: { weather_code?: number; is_day?: number; temperature_2m?: number } };
  const c = body.current;
  if (!c || typeof c.weather_code !== 'number') throw new Error('Unerwartete Antwort des Wetterdienstes');
  return { ...sceneFromCode(c.weather_code, c.is_day !== 0), code: c.weather_code, temperature: typeof c.temperature_2m === 'number' ? c.temperature_2m : null, at: Date.now() };
}

export function locate(timeoutMs = 12_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: timeoutMs },
    );
  });
}
