import { useEffect, useState } from 'react';

/**
 * Aktuelle Zeit, sekundengenau auf die volle Sekunde ausgerichtet.
 * Nach Rückkehr aus dem Hintergrund wird sofort neu berechnet.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, intervalMs - (t % intervalMs) + 5);
    };
    timer = setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs]);
  return now;
}
