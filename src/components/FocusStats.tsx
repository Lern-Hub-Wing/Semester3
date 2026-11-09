import { useMemo } from 'react';
import { Database, Timer } from 'lucide-react';
import { formatStudyTime } from '../lib/focus';
import { instantToZoned, startOfWeekISO } from '../lib/time';
import { Card, CardHeader } from './ui/Card';
import { Avatar } from './ui/Avatar';
import { useFocus } from '../store/focus';
import { useActiveMembers } from '../store/derived';
import { useToday } from '../hooks/useToday';

export function MigrationHint() {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[18px] bg-[color-mix(in_srgb,var(--ss-warn)_12%,transparent)] p-3.5 text-sm">
      <Database className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <p>
        Fokuszeiten werden noch nicht gespeichert: In Supabase fehlt die Tabelle <code className="rounded bg-[var(--ss-track)] px-1">focus_sessions</code>. Bitte Migration{' '}
        <code className="rounded bg-[var(--ss-track)] px-1">004_push_focus.sql</code> ausführen (README, Schritt 12). Der Timer funktioniert trotzdem.
      </p>
    </div>
  );
}

/** Fokuszeit des Teams in dieser Woche (nur gespeicherte Fokusphasen, Pausen zählen nie) */
export function FocusTeamCard({ className = '' }: { className?: string }) {
  const sessions = useFocus((s) => s.sessions);
  const available = useFocus((s) => s.available);
  const members = useActiveMembers();
  const today = useToday();
  const weekStart = startOfWeekISO(today);
  const team = useMemo(() => {
    const day = (iso: string) => instantToZoned(iso).date;
    return members
      .map((m) => ({ member: m, week: sessions.filter((s) => s.member_id === m.id && day(s.started_at) >= weekStart).reduce((a, s) => a + s.duration_seconds, 0) }))
      .sort((a, b) => b.week - a.week);
  }, [sessions, members, weekStart]);
  const max = Math.max(1, ...team.map((t) => t.week));
  if (available === false) return null;
  return (
    <Card className={`p-5 md:p-6 ${className}`} data-testid="focus-team">
      <CardHeader title="Fokuszeit diese Woche" icon={<Timer />} />
      <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        {team.map(({ member, week }) => (
          <li key={member.id} className="flex items-center gap-3">
            <Avatar name={member.name} color={member.color} size={30} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex justify-between gap-2 text-[13px]">
                <span className="truncate font-medium">{member.name}</span>
                <span className="num text-muted">{formatStudyTime(week)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--ss-track)]">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(week / max) * 100}%`, background: member.color }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
