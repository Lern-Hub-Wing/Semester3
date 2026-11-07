import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, CheckCheck, Flame, Layers, Timer, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { groupRatio, memberRatio } from '../lib/progress';
import { addDaysISO, diffDaysISO, formatISODate, instantToZoned, isoWeekNumber, startOfWeekISO } from '../lib/time';
import { formatStudyTime } from '../lib/focus';
import { EASE_EMPH } from '../lib/motion';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardHeader, IconTile } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { ProgressBar } from '../components/ui/Progress';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { EmptyState } from '../components/ui/EmptyState';
import { useData } from '../store/data';
import { useActiveMemberIds, useActiveMembers, useModules, useTaskViews } from '../store/derived';
import { loadFocusSessions, useFocus } from '../store/focus';
import { useToday } from '../hooks/useToday';
import { MigrationHint } from './Focus';

type Period = 'woche' | 'monat' | 'semester';

/**
 * Analyse: ausschließlich echte Daten – Erledigungszeitpunkte der Haken
 * (completed_at) und gespeicherte Fokusphasen. Keine geschätzten Werte.
 */
export function Analytics({ me }: { me: Member }) {
  const [period, setPeriod] = useState<Period>('woche');
  const views = useTaskViews();
  const completions = useData((s) => s.task_completions);
  const members = useActiveMembers();
  const memberIds = useActiveMemberIds();
  const modules = useModules();
  const sessions = useFocus((s) => s.sessions);
  const focusAvailable = useFocus((s) => s.available);
  const today = useToday();

  useEffect(() => {
    void loadFocusSessions();
  }, []);

  // Erledigungen (nur aktive Aufgaben) mit Kalendertag in Berlin
  const done = useMemo(() => {
    const active = new Set(views.map((v) => v.task.id));
    return Object.values(completions)
      .filter((c) => c.is_completed && c.completed_at && active.has(c.task_id))
      .map((c) => ({ member: c.member_id, day: instantToZoned(c.completed_at!).date }));
  }, [views, completions]);

  const range = useMemo(() => {
    if (period === 'woche') return { from: startOfWeekISO(today), to: addDaysISO(startOfWeekISO(today), 6), bucket: 'day' as const };
    if (period === 'monat') return { from: addDaysISO(today, -29), to: today, bucket: 'day' as const };
    const first = [...views.map((v) => v.date), ...done.map((d) => d.day)].sort()[0] ?? addDaysISO(today, -7 * 7);
    const from = startOfWeekISO(first < addDaysISO(today, -7 * 25) ? addDaysISO(today, -7 * 25) : first);
    return { from, to: today, bucket: 'week' as const };
  }, [period, today, views, done]);

  const inRange = (d: string) => d >= range.from && d <= range.to;
  const mineInRange = done.filter((d) => d.member === me.id && inRange(d.day));

  const buckets = useMemo(() => {
    const out: { key: string; label: string; title: string; value: number; future: boolean }[] = [];
    if (range.bucket === 'day') {
      const n = diffDaysISO(range.from, range.to) + 1;
      for (let i = 0; i < n; i++) {
        const day = addDaysISO(range.from, i);
        const value = done.filter((d) => d.member === me.id && d.day === day).length;
        out.push({
          key: day,
          label: period === 'woche' ? formatISODate(day, { weekday: 'short' }).replace('.', '') : i % 5 === 0 || i === n - 1 ? formatISODate(day, { day: 'numeric', month: 'numeric' }) : '',
          title: formatISODate(day, { weekday: 'long', day: 'numeric', month: 'long' }),
          value,
          future: day > today,
        });
      }
    } else {
      for (let ws = range.from; ws <= range.to; ws = addDaysISO(ws, 7)) {
        const we = addDaysISO(ws, 6);
        const value = done.filter((d) => d.member === me.id && d.day >= ws && d.day <= we).length;
        out.push({ key: ws, label: `KW ${isoWeekNumber(ws)}`, title: `KW ${isoWeekNumber(ws)} (ab ${formatISODate(ws, { day: 'numeric', month: 'short' })})`, value, future: false });
      }
    }
    return out;
  }, [range, done, me.id, period, today]);

  // Serie: aufeinanderfolgende Tage (bis heute bzw. gestern) mit mindestens einer Erledigung
  const streak = useMemo(() => {
    const days = new Set(done.filter((d) => d.member === me.id).map((d) => d.day));
    let n = 0;
    let cursor = days.has(today) ? today : addDaysISO(today, -1);
    while (days.has(cursor)) {
      n++;
      cursor = addDaysISO(cursor, -1);
    }
    return n;
  }, [done, me.id, today]);

  const focusSec = sessions
    .filter((s) => s.member_id === me.id && inRange(instantToZoned(s.started_at).date))
    .reduce((a, s) => a + s.duration_seconds, 0);

  const mine = memberRatio(views, me.id, completions);
  const team = members
    .map((m) => ({ member: m, value: done.filter((d) => d.member === m.id && inRange(d.day)).length }))
    .sort((a, b) => b.value - a.value);
  const teamMax = Math.max(1, ...team.map((t) => t.value));
  const periodLabel = period === 'woche' ? 'diese Woche' : period === 'monat' ? 'in den letzten 30 Tagen' : 'im Semester';

  return (
    <div>
      <PageHeader
        eyebrow="Werkzeuge"
        title="Analyse"
        subtitle="Dein Lernverlauf aus echten Daten: erledigte Aufgaben und gespeicherte Fokuszeiten."
        actions={
          <Segmented
            label="Zeitraum"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'woche', label: 'Woche' },
              { value: 'monat', label: 'Monat' },
              { value: 'semester', label: 'Semester' },
            ]}
          />
        }
      />

      {views.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<BarChart3 />} title="Noch keine Daten" text="Sobald Lerntage angelegt und Aufgaben abgehakt werden, erscheint hier dein Verlauf." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--gap-grid)] lg:grid-cols-12 [&>*]:min-w-0">
          <div className="grid grid-cols-2 gap-[var(--gap-grid)] md:grid-cols-4 lg:col-span-12">
            <Stat testId="stat-done" icon={<CheckCheck />} tint={me.color} label={`Erledigt ${periodLabel}`} value={mineInRange.length} unit={mineInRange.length === 1 ? 'Aufgabe' : 'Aufgaben'} />
            <Stat
              icon={<Timer />}
              tint="var(--ss-accent)"
              label={`Lernzeit ${periodLabel}`}
              text={focusAvailable === false ? '–' : formatStudyTime(focusSec)}
              unit={focusAvailable === false ? 'nicht verfügbar' : 'Fokus-Timer'}
            />
            <Stat icon={<Flame />} tint="#F4B9A0" label="Serie" value={streak} unit={streak === 1 ? 'Tag in Folge' : 'Tage in Folge'} />
            <Stat icon={<Layers />} tint="var(--ss-success)" label="Gesamtfortschritt" text={mine.pct === null ? '–' : `${mine.pct} %`} unit={`${mine.done} von ${mine.total} Aufgaben`} />
          </div>

          <Card className="p-5 md:p-6 lg:col-span-8">
            <CardHeader title="Erledigte Aufgaben" subtitle={period === 'semester' ? 'pro Kalenderwoche' : 'pro Tag'} icon={<BarChart3 />} />
            <BarChart data={buckets} color={me.color} />
            {focusAvailable === false && period !== 'woche' && <MigrationHint />}
          </Card>

          <Card className="p-5 md:p-6 lg:col-span-4">
            <CardHeader title="Team" subtitle={`Erledigungen ${periodLabel}`} icon={<Users />} />
            <ul className="mt-5 flex flex-col gap-3.5">
              {team.map(({ member, value }, i) => (
                <li key={member.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: member.color }} aria-hidden />
                      <span className="truncate">
                        {member.name}
                        {member.id === me.id && <span className="ml-1 font-normal text-muted">(du)</span>}
                      </span>
                    </span>
                    <span className="num font-semibold">{value}</span>
                  </div>
                  <HBar value={value / teamMax} color={member.color} delay={i * 0.06} label={`${member.name}: ${value} Erledigungen`} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 md:p-6 lg:col-span-12">
            <CardHeader title="Fortschritt nach Modul" subtitle="Du im Vergleich zur Gruppe" icon={<Layers />} />
            <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {modules.map((m) => {
                const mv = views.filter((v) => v.module.id === m.id);
                const r = memberRatio(mv, me.id, completions);
                const g = groupRatio(mv, memberIds, completions);
                return (
                  <li key={m.id} className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{m.name}</span>
                      <span className="num shrink-0 text-xs text-muted">{r.total ? `${r.done}/${r.total}` : 'keine Aufgaben'}</span>
                    </div>
                    <div className="grid grid-cols-[52px_1fr_38px] items-center gap-x-2 gap-y-1.5 text-[11.5px] text-muted">
                      <span>Du</span>
                      <ProgressBar ratio={r} color={me.color} height={7} label={`${m.name} – dein Fortschritt`} />
                      <span className="num text-right text-ink">{r.pct === null ? '–' : `${r.pct}%`}</span>
                      <span>Gruppe</span>
                      <ProgressBar ratio={g} color={m.color} height={7} label={`${m.name} – Gruppenfortschritt`} />
                      <span className="num text-right text-ink">{g.pct === null ? '–' : `${g.pct}%`}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, tint, label, value, text, unit, testId }: { icon: React.ReactNode; tint: string; label: string; value?: number; text?: string; unit: string; testId?: string }) {
  return (
    <Card className="flex flex-col gap-3 p-4 md:p-5">
      <IconTile tint={tint} size={34}>
        {icon}
      </IconTile>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-muted">{label}</p>
        <p className="num mt-0.5 text-[28px] font-semibold leading-tight tracking-tight md:text-[32px]" data-testid={testId} data-value={value}>
          {value !== undefined ? <AnimatedNumber value={value} /> : text}
        </p>
        <p className="truncate text-[12px] text-faint">{unit}</p>
      </div>
    </Card>
  );
}

function HBar({ value, color, delay, label }: { value: number; color: string; delay: number; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--ss-track)]" role="img" aria-label={label}>
      <motion.div
        className="h-full rounded-full"
        style={{ width: `${Math.max(value * 100, value > 0 ? 3 : 0)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, white), ${color})`, transformOrigin: 'left' }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: reduce ? 0 : 0.1 + delay, ease: EASE_EMPH }}
      />
    </div>
  );
}

/**
 * Säulendiagramm (eine Reihe → keine Legende; der Titel benennt sie).
 * Dünne Säulen mit 4-px-Rundung, Werte beim Überfahren/Antippen.
 */
function BarChart({ data, color }: { data: { key: string; label: string; title: string; value: number; future: boolean }[]; color: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = max <= 4 ? max : Math.ceil(max / 2) * 2;
  const total = data.reduce((a, d) => a + d.value, 0);
  const h = 190;
  return (
    <div className="mt-5">
      <div className="relative flex gap-[3px] md:gap-1.5" style={{ height: h }} role="img" aria-label={`Säulendiagramm: insgesamt ${total} erledigte Aufgaben`}>
        {/* Grundlinie + Hilfslinie (zurückhaltend) */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--ss-line)]" aria-hidden />
        <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
        <span className="num pointer-events-none absolute -top-2 right-0 -translate-y-full text-[10.5px] text-faint" aria-hidden>
          {niceMax}
        </span>
        {data.map((d, i) => {
          const pct = d.value / niceMax;
          const active = hover === d.key;
          return (
            <div
              key={d.key}
              className="group relative flex h-full flex-1 cursor-default items-end justify-center"
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(d.key)}
              onPointerLeave={() => setHover((k) => (k === d.key ? null : k))}
              onClick={() => setHover(d.key)}
            >
              <motion.div
                className="w-full max-w-[34px] rounded-t-[4px]"
                style={{
                  height: d.value > 0 ? `max(${pct * 100}%, 4px)` : 2,
                  transformOrigin: 'bottom',
                  background: d.value > 0 ? `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 72%, #2a2f5a))` : 'var(--ss-track)',
                  opacity: d.future ? 0.35 : hover && !active ? 0.55 : 1,
                  boxShadow: active && d.value > 0 ? `0 0 16px -2px ${color}` : undefined,
                }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.75, delay: reduce ? 0 : 0.05 + i * (data.length > 14 ? 0.015 : 0.05), ease: EASE_EMPH }}
              />
              {active && (
                <div
                  className="glass mat-float pointer-events-none absolute z-10 whitespace-nowrap rounded-[12px] px-2.5 py-1.5 text-center text-[11.5px]"
                  style={{ bottom: `calc(${Math.max(pct * 100, 2)}% + 8px)`, ...(i < 2 ? { left: 0 } : i > data.length - 3 ? { right: 0 } : {}) }}
                >
                  <p className="text-muted">{d.title}</p>
                  <p className="num font-semibold">
                    {d.value} {d.value === 1 ? 'Aufgabe' : 'Aufgaben'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[3px] md:gap-1.5" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="num flex-1 truncate text-center text-[10.5px] text-muted">
            {d.label}
          </span>
        ))}
      </div>
      {/* Tabellenansicht für Screenreader */}
      <table className="sr-only">
        <caption>Erledigte Aufgaben</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.title}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
