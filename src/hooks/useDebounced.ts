import { useEffect, useRef } from 'react';

/** Verzögert Aufrufe (z. B. beim Ziehen im Farbwähler), damit nicht jede Bewegung gespeichert wird. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  const pending = useRef<A | null>(null);
  useEffect(
    () => () => {
      // Beim Schließen noch ausstehende Änderung speichern
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) latest.current(...pending.current);
    },
    [],
  );
  return (...args: A) => {
    pending.current = args;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      latest.current(...args);
    }, ms);
  };
}
