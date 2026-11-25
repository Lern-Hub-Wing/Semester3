import { getSupabase } from './supabase';
import { IS_APP } from './edition';
import { resync } from '../store/sync';

/** Nach so vielen Tagen leert sich der Papierkorb von selbst (Migration 011 / App 0008). */
export const TRASH_DAYS = 7;

let started = false;

/**
 * Stößt das Leeren des Papierkorbs einmal pro Sitzung an (zusätzlich zum täglichen
 * Datenbank-Job). Der Server löscht ausschließlich, was seit mehr als 7 Tagen im
 * Papierkorb liegt – inklusive Schonfrist nach Einführung der Regel. Fehlt die
 * Funktion (Migration noch nicht ausgeführt), passiert einfach nichts.
 */
export function purgeTrashOnce(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    void (async () => {
      try {
        const { data, error } = await getSupabase().rpc(IS_APP ? 'app_purge_trash' : 'ss_purge_trash');
        if (!error && typeof data === 'number' && data > 0) await resync();
      } catch {
        /* still: nächster Start versucht es erneut */
      }
    })();
  }, 4000);
}

/** Verbleibende Tage, bis ein Eintrag endgültig gelöscht wird (mindestens 0). */
export function trashDaysLeft(deletedAt: string, now = Date.now()): number {
  const end = Date.parse(deletedAt) + TRASH_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}
