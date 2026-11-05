import { todayISO } from '../lib/time';
import { useNow } from './useNow';

/** Heutiges Datum in Berlin; aktualisiert sich automatisch um Mitternacht. */
export function useToday(): string {
  const now = useNow(60_000);
  return todayISO(new Date(now));
}
