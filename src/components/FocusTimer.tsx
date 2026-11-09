import { useEffect } from 'react';
import { playChime } from '../lib/chime';
import { haptic } from '../lib/haptics';
import { useNow } from '../hooks/useNow';
import { tickFocus, useFocus } from '../store/focus';
import { useCurrentMember } from '../store/derived';
import { toast } from '../store/toast';

/**
 * Läuft unsichtbar im Hintergrund: beendet abgelaufene Phasen, speichert
 * Fokuszeiten, spielt einen Ton und zeigt – falls eingeschaltet, erlaubt und
 * die App gerade nicht sichtbar ist – eine lokale Systemmitteilung.
 * Tickt nur, solange ein Timer läuft (keine Dauer-Timer im Leerlauf).
 */
export function FocusWatcher() {
  const me = useCurrentMember();
  const running = useFocus((s) => s.timer.endsAt !== null);
  const now = useNow(running ? 1000 : 60_000);
  useEffect(() => {
    if (!running) return;
    void tickFocus(me?.id ?? null, now).then((done) => {
      if (!done) return;
      const { sound, volume, notify } = useFocus.getState().settings;
      haptic('success');
      if (sound) playChime(volume / 100, done.phase === 'break');
      const title = done.phase === 'focus' ? 'Fokusrunde geschafft' : done.long ? 'Lange Pause vorbei' : 'Pause vorbei';
      const msg = done.phase === 'focus' ? 'Zeit für eine Pause.' : 'Bereit für die nächste Fokusrunde?';
      toast.success(`${title} – ${msg}`);
      if (notify) void showLocalNotification(title, msg);
    });
  }, [now, running, me?.id]);
  return null;
}

async function showLocalNotification(title: string, body: string) {
  try {
    if (document.visibilityState === 'visible') return;
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.showNotification(title, { body, tag: 'focus-timer', icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, data: { url: '#/fokus' } });
  } catch {
    /* nicht unterstützt */
  }
}
