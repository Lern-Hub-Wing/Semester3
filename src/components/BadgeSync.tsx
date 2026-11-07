import { useEffect, useMemo } from 'react';
import type { Member } from '../lib/types';
import { isDone } from '../lib/progress';
import { setAppBadge } from '../lib/push';
import { useData } from '../store/data';
import { useTaskViews } from '../store/derived';
import { usePush } from '../store/push';
import { useToday } from '../hooks/useToday';

/**
 * Zahl offener Aufgaben (heute + überfällig) am App-Symbol – nur wenn
 * Benachrichtigungen aktiv sind und „Zahl am App-Symbol“ eingeschaltet ist
 * (Badging API, z. B. iOS 16.4+ als Home-Bildschirm-App, Chrome/Edge).
 */
export function BadgeSync({ me }: { me: Member }) {
  const views = useTaskViews();
  const completions = useData((s) => s.task_completions);
  const today = useToday();
  const on = usePush((s) => s.phase === 'on' && s.prefs.badge);
  const devMember = usePush((s) => s.memberId);
  const memberId = devMember ?? me.id;
  const count = useMemo(() => views.filter((v) => v.date <= today && !isDone(completions, v.task.id, memberId)).length, [views, completions, today, memberId]);
  useEffect(() => {
    if (on) setAppBadge(count);
  }, [on, count]);
  return null;
}
