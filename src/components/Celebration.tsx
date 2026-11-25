import { useEffect, useMemo, useRef } from 'react';
import { memberRatio } from '../lib/progress';
import { useData } from '../store/data';
import { useActiveMemberIds, useCurrentMember, useProgress, useTaskViews } from '../store/derived';
import { useToday } from '../hooks/useToday';
import { toast } from '../store/toast';
import { useHomework } from '../store/homework';
import { hwKey } from '../lib/homework';

type Kind = 'small' | 'big';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');

/**
 * Feier – dezent und hochwertig:
 *  – small: ein ruhiger Lichtschein mit gezeichnetem Haken (kein Konfetti)
 *  – big (ganze Gruppe 100 %): feiner, langsam fallender Glanz in den Gruppenfarben
 * Blockiert nie die Bedienung, respektiert reduzierte Bewegung.
 */
export async function celebrate(kind: Kind, colors: string[]) {
  if (reduced()) return;
  if (kind === 'small') {
    finishGlow(colors[0] ?? 'var(--ss-accent)');
    return;
  }
  const { default: confetti } = await import('canvas-confetti');
  const base = { colors: [...colors, '#ffffff', '#f3e3b5'], disableForReducedMotion: true, zIndex: 90, ticks: 320, scalar: 0.62, gravity: 0.55, drift: 0.2, shapes: ['circle' as const] };
  void confetti({ ...base, particleCount: 70, spread: 100, startVelocity: 30, origin: { y: 0.45 } });
  setTimeout(() => void confetti({ ...base, particleCount: 40, spread: 140, startVelocity: 22, origin: { y: 0.4 } }), 260);
}

/** Ruhiger Lichtschein mit Haken in der Bildmitte (≈ 1,3 s), danach wieder weg */
export function finishGlow(color: string) {
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = 'finish-glow';
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--finish', color);
  el.innerHTML = '<span class="finish-halo"></span><span class="finish-ring"></span><svg viewBox="0 0 52 52" class="finish-check"><path d="M15 27.5l7.5 7.5L38 18.5" /></svg>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
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

/**
 * Hausaufgabe komplett erledigt (eigener Haken an der ganzen Hausaufgabe) →
 * dezente Feier. Nur bei echten Übergängen während der Nutzung, nicht beim Laden.
 */
export function HomeworkFinishWatcher() {
  const me = useCurrentMember();
  const completions = useHomework((s) => s.completions);
  const homework = useHomework((s) => s.homework);
  const available = useHomework((s) => s.available);
  const done = useMemo(() => {
    if (!me) return new Set<string>();
    return new Set(Object.values(homework).filter((h) => !h.deleted_at && completions[hwKey(h.id, me.id)]?.is_completed).map((h) => h.id));
  }, [homework, completions, me]);
  const prev = useRef<{ member: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!available || !me) return;
    const before = prev.current;
    prev.current = { member: me.id, ids: done };
    if (!before || before.member !== me.id) return;
    const fresh = [...done].filter((id) => !before.ids.has(id));
    if (fresh.length !== 1) return;
    const hw = homework[fresh[0]!];
    finishGlow(me.color);
    toast.success(hw ? `„${hw.title}“ erledigt.` : 'Hausaufgabe erledigt.');
  }, [done, available, me, homework]);
  return null;
}
