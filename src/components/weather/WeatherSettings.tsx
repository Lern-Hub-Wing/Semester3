import type { ReactNode } from 'react';
import { Cloud, CloudLightning, CloudOff, CloudRain, CloudSun, LocateFixed, MapPin, MoonStar, RefreshCw, Snowflake, Sun } from 'lucide-react';
import { Row, Section } from '../ui/SettingsCard';
import { Button } from '../ui/Button';
import { WEATHER_LABEL, type WeatherMode } from '../../lib/weather';
import { forgetLocation, refreshWeather, setWeatherMode, shareLocation, useWeather } from '../../store/weather';
import { toast } from '../../store/toast';

const OPTIONS: { value: WeatherMode; label: string; icon: ReactNode }[] = [
  { value: 'auto', label: 'Automatisch', icon: <MapPin /> },
  { value: 'off', label: 'Aus', icon: <CloudOff /> },
  { value: 'clear', label: 'Sonne', icon: <Sun /> },
  { value: 'cloudy', label: 'Bewölkt', icon: <Cloud /> },
  { value: 'rain', label: 'Regen', icon: <CloudRain /> },
  { value: 'thunder', label: 'Gewitter', icon: <CloudLightning /> },
  { value: 'snow', label: 'Schnee', icon: <Snowflake /> },
  { value: 'night', label: 'Sternennacht', icon: <MoonStar /> },
];

/** Wetter im Hintergrund: automatisch nach Standort oder fest zum Ausprobieren */
export function WeatherSettings() {
  const { mode, coords, current, status, error } = useWeather();
  return (
    <Section title="Wetter im Hintergrund" icon={<CloudSun />} hint="Nur auf diesem Gerät. Bei „Bewegung reduzieren“ ausgeschaltet.">
      <Row stacked label="Wetter" hint="Fest gewählt zum Ausprobieren – „Automatisch“ zeigt das Wetter an deinem Standort.">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Wetter im Hintergrund" data-testid="weather-mode">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={mode === o.value}
              data-value={o.value}
              onClick={() => setWeatherMode(o.value)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors [&>svg]:size-4 ${mode === o.value ? 'lens text-ink' : 'text-muted hover:text-ink'}`}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </Row>
      {mode === 'auto' && (
        <Row label="Standort" hint={coords ? 'Gerundet auf etwa 1 km. Das Wetter kommt direkt von Open-Meteo, der Standort bleibt auf diesem Gerät.' : 'Ohne Standort: nachts Sterne, tagsüber wie gewohnt.'}>
          <div className="flex flex-col items-start gap-2 sm:items-end" data-testid="weather-location">
            {coords && current && (
              <span className="text-[13.5px]">
                Gerade: <strong className="font-semibold">{WEATHER_LABEL[current.kind]}</strong>
                {current.temperature !== null && ` · ${Math.round(current.temperature)}°`}
                {current.night && ' · dunkel'}
              </span>
            )}
            {status === 'denied' && <span className="text-[13px] text-warn">Standort blockiert – in den Browser-Einstellungen für diese Seite erlauben.</span>}
            {status === 'unsupported' && <span className="text-[13px] text-warn">Dieser Browser kann den Standort nicht bestimmen.</span>}
            {error && <span className="text-[13px] text-danger">{error}</span>}
            <div className="flex flex-wrap gap-2">
              {coords ? (
                <>
                  <Button size="sm" variant="glass" icon={<RefreshCw className="size-4" />} loading={status === 'loading'} onClick={() => void refreshWeather(true)}>
                    Aktualisieren
                  </Button>
                  <Button size="sm" variant="ghost" onClick={forgetLocation}>
                    Standort vergessen
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<LocateFixed className="size-4" />}
                  loading={status === 'locating' || status === 'loading'}
                  onClick={async () => {
                    if (await shareLocation()) toast.success('Wetter an deinem Standort ist aktiv.');
                  }}
                  data-testid="weather-share-location"
                >
                  Standort freigeben
                </Button>
              )}
            </div>
          </div>
        </Row>
      )}
    </Section>
  );
}
