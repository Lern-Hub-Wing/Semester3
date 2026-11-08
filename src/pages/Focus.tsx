import { useEffect, useMemo } from 'react';
import { Database, History, Maximize2, Timer, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { formatStudyTime } from '../lib/focus';
import { formatISODate, formatInstant, instantToZoned, startOfWeekISO } from '../lib/time';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardHeader } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { FocusPanel, openFocusFullscreen } from '../components/FocusPanel';
import { Landscape } from '../components/landscape/Landscape';
import { Button } from '../components/ui/Button';
import { focusActions, loadFocusSessions, useFocus } from '../store/focus';
import { useActiveMembers } from '../store/derived';
import { useData } from '../store/data';
import { useToday } from '../hooks/useToday';

export function Focus({ me }: { me: Member }) {
  const sessions = useFocus((s) => s.sessions);
  const available = useFocus((s) => s.available);
  const modulesMap = useData((s) => s.modules);
  const members = useActiveMembers();
  const today = useToday();

  useEffect(() => {
    void loadFocusSessions();
  }, []);

  const weekStart = startOfWeekISO(today);
  const stats = useMemo(() => {
    const day = (iso: string) => instantToZoned(iso).date;
    const mine = sessions.filter((s) => s.member_id === me.id);
    const sum = (list: typeof sessions) => list.reduce((a, s) => a + s.duration_seconds, 0);
    return {
      today: sum(mine.filter((s) => day(s.started_at) === today)),
      week: sum(mine.filter((s) => day(s.started_at) >= weekStart)),
      total: sum(mine),
      recent: [...mine].reverse().slice(0, 6),
      team: members
        .map((m) => ({ member: m, week: sum(sessions.filter((s) => s.member_id === m.id && day(s.started_at) >= weekStart)) }))
        .sort((a, b) => b.week - a.week),
    };
  }, [sessions, me.id, today, weekStart, members]);
  const teamMax = Math.max(1, ...stats.team.map((t) => t.week));

  return (
    <div>
      <PageHeader eyebrow="Werkzeuge" title="Fokus" subtitle="Konzentrierte Lernphasen mit Pausen. Der Timer läuft auch weiter, wenn du die App kurz verlässt." />

      <div className="grid grid-cols-1 gap-[var(--gap-grid)] lg:grid-cols-12 [&>*]:min-w-0">
        <section className="hero-scene rounded-[34px] px-5 py-7 md:px-10 md:py-10 lg:col-span-12" data-testid="focus-stage">
          <Landscape />
          <FocusPanel stage />
          <div className="mt-7 flex justify-center">
            <Button variant="glass" icon={<Maximize2 className="size-4" />} onClick={() => {
              if (!useFocus.getState().timer.endsAt) focusActions.start();
              openFocusFullscreen();
            }}>
              Fokus im Vollbild
            </Button>
          </div>
        </section>

        <Card className="p-5 lg:col-span-6">
          <CardHeader title="Deine Lernzeit" subtitle="Gespeicherte Fokusphasen" icon={<Timer />} />
          {available === false ? (
            <MigrationHint />
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ['Heute', stats.today],
                ['Diese Woche', stats.week],
                ['Insgesamt', stats.total],
              ].map(([label, sec]) => (
                <div key={label as string} className="rounded-[18px] bg-[color-mix(in_srgb,var(--ss-text)_4%,transparent)] px-3 py-3">
                  <p className="text-[11.5px] text-muted">{label}</p>
                  <p className="num mt-1 text-[20px] font-semibold tracking-tight">{formatStudyTime(sec as number)}</p>
                </div>
              ))}
            </div>
          )}
          {available !== false && stats.recent.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1">
              {stats.recent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-[14px] px-2 py-1.5 text-sm">
                  <History className="size-4 shrink-0 text-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{s.module_id ? modulesMap[s.module_id]?.name ?? 'Modul' : 'Freies Lernen'}</span>
                  <span className="num shrink-0 text-xs text-muted">
                    {formatInstant(s.started_at, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.round(s.duration_seconds / 60)} Min.
                  </span>
                </li>
              ))}
            </ul>
          )}
          {available !== false && stats.recent.length === 0 && <p className="mt-4 text-sm text-muted">Noch keine Fokusphase gespeichert. Starte den Timer – nach Ablauf wird die Zeit automatisch gespeichert.</p>}
        </Card>

        <Card className="p-5 lg:col-span-6">
          <CardHeader title="Team diese Woche" subtitle={`Seit Montag, ${formatISODate(weekStart, { day: 'numeric', month: 'long' })}`} icon={<Users />} />
          {available === false ? (
            <p className="mt-3 text-sm text-muted">Verfügbar, sobald die Fokuszeiten gespeichert werden können.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {stats.team.map(({ member, week }) => (
                <li key={member.id} className="flex items-center gap-3">
                  <Avatar name={member.name} color={member.color} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium">{member.name}</span>
                      <span className="num text-muted">{formatStudyTime(week)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--ss-track)]">
                      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(week / teamMax) * 100}%`, background: member.color }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

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
