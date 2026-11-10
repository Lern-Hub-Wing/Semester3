import { useEffect, useMemo, useRef } from 'react';
import { memberRatio } from '../lib/progress';
import { useData } from '../store/data';
import { useActiveMemberIds, useCurrentMember, useProgress, useTaskViews } from '../store/derived';
import { useToday } from '../hooks/useToday';
import { toast } from '../store/toast';

type Kind = 'small' | 'big';

/** Konfetti (nachgeladen, blockiert nie die Bedienung, respektiert reduzierte Bewegung). */
export async function celebrate(kind: Kind, colors: string[]) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion')) return;
  const { default: confetti } = await import('canvas-confetti');
  const base = { colors, disableForReducedMotion: true, zIndex: 90, ticks: 220, scalar: 0.9 };
  if (kind === 'small') {
    void confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 32, origin: { y: 0.75 } });
    return;
  }
  const end = Date.now() + 1400;
  const frame = () => {
    void confetti({ ...base, particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
    void confetti({ ...base, particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  setTimeout(() => void confetti({ ...base, particleCount: 160, spread: 110, startVelocity: 45, origin: { y: 0.55 } }), 350);
}

/**
 * Beobachtet echte Fortschrittsübergänge. Ausgelöst wird nur beim
 * tatsächlichen Wechsel auf 100 % während der Nutzung – nicht beim Laden.
 */
export function CelebrationWatcher() {
  const views = useTaskViews();
  const memberIds = useActiveMemberIds();
  const members = useData((s) => s.members);
  const completions = useData((s) => s.task_completions);
  const fresh = useData((s) => s.phase === 'ready' && !s.fromCache);
  const me = useCurrentMember();
  const today = useToday();

  // Gemeinsames Ziel: Lernplan + Hausaufgaben (dieselbe Regel wie überall)
  const group = useProgress().group(memberIds);
  const todayViews = useMemo(() => views.filter((v) => v.date === today), [views, today]);
  const mine = me ? memberRatio(todayViews, me.id, completions) : null;

  const prevGroup = useRef<number | null | undefined>(undefined);
  const prevDay = useRef<{ member: string; pct: number | null } | undefined>(undefined);

  useEffect(() => {
    if (!fresh) return;
    const prev = prevGroup.current;
    prevGroup.current = group.pct;
    if (prev !== undefined && prev !== null && prev < 100 && group.pct === 100) {
      const colors = memberIds.map((id) => members[id]?.color).filter(Boolean) as string[];
      void celebrate('big', colors);
      toast.success('Geschafft! Die ganze Gruppe hat 100 % erreicht.');
    }
  }, [group.pct, fresh, memberIds, members]);

  useEffect(() => {
    if (!fresh || !me || !mine) return;
    const prev = prevDay.current;
    prevDay.current = { member: me.id, pct: mine.pct };
    if (prev && prev.member === me.id && prev.pct !== null && prev.pct < 100 && mine.pct === 100 && group.pct !== 100) {
      void celebrate('small', [me.color, '#ffffff']);
      toast.success('Alle heutigen Aufgaben erledigt – stark!');
    }
  }, [mine?.pct, me?.id, fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
