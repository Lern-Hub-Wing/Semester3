import { useEffect, useMemo } from 'react';
import { Database, Timer } from 'lucide-react';
import { formatFocusDuration, teamFocusWeek, weekRange } from '../lib/focusWeek';
import { formatISODate, isoWeekNumber, zonedToInstant } from '../lib/time';
import { Card, CardHeader } from './ui/Card';
import { Avatar } from './ui/Avatar';
import { loadFocusSessions, refreshFocusSessions, useFocus } from '../store/focus';
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

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * Hält die Fokuszeiten aktuell: lädt beim Öffnen, danach jede Minute und bei
 * der Rückkehr in die App nur die Sitzungen seit Wochenbeginn nach. Eigene
 * Sitzungen erscheinen sofort (sie werden beim Speichern direkt eingetragen).
 */
export function useLiveFocusSessions(sinceDay: string) {
  useEffect(() => {
    const since = zonedToInstant(sinceDay, '00:00').toISOString();
    void loadFocusSessions();
    const refresh = () => document.visibilityState === 'visible' && void refreshFocusSessions(since);
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [sinceDay]);
}

/**
 * Lernzeit aller Gruppenmitglieder in der aktuellen Kalenderwoche
 * (Montag–Sonntag, Europe/Berlin). Nur gespeicherte Fokuszeit, ohne Pausen.
 * Bewusst in Teamreihenfolge statt als Rangliste – motivieren, nicht antreiben.
 */
export function TeamFocusWeekCard({ meId, className = '' }: { meId?: string; className?: string }) {
  const sessions = useFocus((s) => s.sessions);
  const available = useFocus((s) => s.available);
  const members = useActiveMembers();
  const today = useToday();
  const range = weekRange(today);
  useLiveFocusSessions(range.from);

  const week = useMemo(() => teamFocusWeek(sessions, members.map((m) => m.id), today), [sessions, members, today]);
  const max = Math.max(1, ...week.members.map((m) => m.seconds));
  const todayIdx = range.days.indexOf(today);
  if (available === false) return null;

  const active = week.members.filter((m) => m.seconds > 0).length;
  return (
    <Card className={`p-5 md:p-6 ${className}`} data-testid="focus-team" data-total={week.total}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <CardHeader
          title="Lernzeit diese Woche"
          subtitle={`KW ${isoWeekNumber(today)} · ${formatISODate(range.from, { day: 'numeric', month: 'short' })} – ${formatISODate(range.to, { day: 'numeric', month: 'short' })} · Fokuszeit ohne Pausen`}
          icon={<Timer />}
        />
        <p className="text-right max-sm:w-full max-sm:text-left" data-testid="focus-team-total">
          <span className="num block text-[22px] font-semibold leading-tight tracking-tight">{formatFocusDuration(week.total)}</span>
          <span className="text-[12.5px] text-muted">
            gemeinsam{members.length > 1 ? ` · ${active} von ${members.length} ${active === 1 ? 'hat' : 'haben'} gelernt` : ''}
          </span>
        </p>
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-2">
        {members.map((member) => {
          const w = week.members.find((x) => x.memberId === member.id)!;
          const dayMax = Math.max(1, ...w.perDay);
          return (
            <li key={member.id} className="flex items-center gap-3" data-testid="focus-team-row" data-member={member.id} data-seconds={w.seconds}>
              <Avatar name={member.name} color={member.color} size={34} ring={member.id === meId} />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px] font-medium">
                    {member.name}
                    {member.id === meId && <span className="ml-1 text-xs font-normal text-muted">(du)</span>}
                  </span>
                  <span className={`num shrink-0 text-[13.5px] ${w.seconds > 0 ? 'font-semibold' : 'text-muted'}`}>{w.seconds > 0 ? formatFocusDuration(w.seconds) : 'noch keine'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--ss-track)]" role="img" aria-label={`${member.name}: ${formatFocusDuration(w.seconds)} in dieser Woche`}>
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(w.seconds / max) * 100}%`, background: member.color }} />
                </div>
              </div>
              {/* Wochenverlauf Mo–So: an welchen Tagen gelernt wurde */}
              <div className="flex shrink-0 items-end gap-[3px]" aria-hidden>
                {w.perDay.map((sec, i) => (
                  <span key={i} className="flex w-[7px] flex-col items-center gap-1" title={`${DAY_LABELS[i]}: ${formatFocusDuration(sec)}`}>
                    <span className="flex h-[22px] w-full items-end">
                      <span
                        className="w-full rounded-[2px]"
                        style={{ height: sec > 0 ? `${Math.max(18, (sec / dayMax) * 100)}%` : 3, background: sec > 0 ? member.color : 'var(--ss-track)', opacity: i > todayIdx ? 0.45 : 1 }}
                      />
                    </span>
                    <span className={`text-[8.5px] leading-none ${i === todayIdx ? 'font-bold text-ink' : 'text-faint'}`}>{DAY_LABELS[i]![0]}</span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {week.total === 0 && <p className="mt-4 text-[13px] text-muted">In dieser Woche wurde noch keine Fokuszeit gespeichert. Starte eine Fokus-Session – sie erscheint hier automatisch.</p>}
    </Card>
  );
}
