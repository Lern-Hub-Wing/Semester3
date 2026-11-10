import { useEffect, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, CheckCheck, Flame, Layers, Timer, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { addDaysISO, diffDaysISO, formatISODate, instantToZoned, isoWeekNumber, startOfWeekISO } from '../lib/time';
import { formatStudyTime } from '../lib/focus';
import { focusByDay } from '../lib/focusWeek';
import { EASE_EMPH } from '../lib/motion';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardHeader, IconTile } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { ProgressBar } from '../components/ui/Progress';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { EmptyState } from '../components/ui/EmptyState';
import { useData } from '../store/data';
import { useActiveMemberIds, useActiveMembers, useModules, useProgress, useTaskViews } from '../store/derived';
import { useHomework } from '../store/homework';
import { loadFocusSessions, useFocus } from '../store/focus';
import { useToday } from '../hooks/useToday';
import { MigrationHint, TeamFocusWeekCard } from '../components/FocusStats';

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

  const progress = useProgress();
  const hwCompletions = useHomework((s) => s.completions);

  // Erledigungen (nur aktive Aufgaben) mit Kalendertag in Berlin.
  // Eine abgehakte Hausaufgabe zählt wie eine Lernplan-Aufgabe genau einmal;
  // ihre Arbeitseinheiten zählen hier nicht zusätzlich (keine Doppelzählung).
  const done = useMemo(() => {
    const active = new Set(views.map((v) => v.task.id));
    const activeHw = new Set(progress.scope.homework.map((h) => h.id));
    return [
      ...Object.values(completions)
        .filter((c) => c.is_completed && c.completed_at && active.has(c.task_id))
        .map((c) => ({ member: c.member_id, day: instantToZoned(c.completed_at!).date })),
      ...Object.values(hwCompletions)
        .filter((c) => c.is_completed && c.completed_at && c.target_id === c.homework_id && activeHw.has(c.homework_id))
        .map((c) => ({ member: c.member_id, day: instantToZoned(c.completed_at!).date })),
    ];
  }, [views, completions, hwCompletions, progress.scope.homework]);

  // Lerntage für die Serie: zusätzlich Tage, an denen eine Arbeitseinheit oder Unteraufgabe abgehakt wurde
  const partDays = useMemo(() => {
    const activeHw = new Set(progress.scope.homework.map((h) => h.id));
    return Object.values(hwCompletions)
      .filter((c) => c.is_completed && c.completed_at && c.target_id !== c.homework_id && activeHw.has(c.homework_id))
      .map((c) => ({ member: c.member_id, day: instantToZoned(c.completed_at!).date }));
  }, [hwCompletions, progress.scope.homework]);

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
    const days = new Set([...done, ...partDays].filter((d) => d.member === me.id).map((d) => d.day));
    let n = 0;
    let cursor = days.has(today) ? today : addDaysISO(today, -1);
    while (days.has(cursor)) {
      n++;
      cursor = addDaysISO(cursor, -1);
    }
    return n;
  }, [done, partDays, me.id, today]);

  // Fokuszeit im Zeitraum – Sitzungen über Mitternacht anteilig je Tag (lib/focusWeek)
  const focusSec = useMemo(() => {
    const days = Array.from({ length: diffDaysISO(range.from, range.to) + 1 }, (_, i) => addDaysISO(range.from, i));
    return Math.round([...focusByDay(sessions, days, me.id).values()].reduce((a, b) => a + b, 0));
  }, [sessions, range, me.id]);

  const mine = progress.member(me.id);
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
        actions={
          <Segmented
            accent
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

      {views.length === 0 && progress.scope.homework.length === 0 ? (
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
            <AreaChart data={buckets} color="var(--ss-accent)" />
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

          <TeamFocusWeekCard meId={me.id} className="lg:col-span-12" />

          <Card className="p-5 md:p-6 lg:col-span-12">
            <CardHeader title="Fortschritt nach Fach" subtitle="Lernplan-Aufgaben und Hausaufgaben · angefangene Hausaufgaben zählen anteilig" icon={<Layers />} />
            <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {modules.map((m) => {
                const sc = progress.forModule(m.id);
                const r = progress.member(me.id, sc);
                const g = progress.group(memberIds, sc);
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
    <Card className="flex flex-col gap-2 p-3.5 md:gap-2.5 md:p-5">
      <IconTile tint={tint} size={32}>
        {icon}
      </IconTile>
      <div className="min-w-0">
        <p className="num text-[26px] font-semibold leading-tight tracking-[-0.03em] md:text-[34px]" data-testid={testId} data-value={value}>
          {value !== undefined ? <AnimatedNumber value={value} /> : text}
        </p>
        <p className="truncate text-[13px] font-medium">{label}</p>
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
 * Flächendiagramm (eine Reihe → keine Legende; der Titel benennt sie):
 * weiche Kurve, zarte Fläche, Punkte; Werte per Fadenkreuz beim Überfahren/Antippen.
 */
function AreaChart({ data, color }: { data: { key: string; label: string; title: string; value: number; future: boolean }[]; color: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const gid = `ac-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = 640;
  const H = 210;
  const padX = 14;
  const padTop = 18;
  const padBottom = 10;
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = max <= 4 ? max : Math.ceil(max / 2) * 2;
  const total = data.reduce((a, d) => a + d.value, 0);
  const n = data.length;
  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2));
  const y = (v: number) => padTop + (1 - v / niceMax) * (H - padTop - padBottom);
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  // Monotone, weiche Kurve (kein Überschwingen unter null)
  const line = pts.reduce((acc, [px, py], i) => {
    if (i === 0) return `M${px},${py}`;
    const [qx, qy] = pts[i - 1];
    const mx = (qx + px) / 2;
    return `${acc} C${mx},${qy} ${mx},${py} ${px},${py}`;
  }, '');
  const area = n ? `${line} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z` : '';
  const showDots = n <= 31;
  const h = hover === null ? null : data[hover];

  return (
    <div className="mt-5">
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[210px] w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={`Verlauf: insgesamt ${total} erledigte Aufgaben`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--ss-line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={W} y1={H - padBottom} y2={H - padBottom} stroke="var(--ss-line)" vectorEffect="non-scaling-stroke" />
          <motion.path d={area} fill={`url(#${gid})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.3 }} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
          {hover !== null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padTop - 6} y2={H - padBottom} stroke="var(--ss-text-3)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* Punkte als HTML (bleiben rund trotz gestrecktem SVG) */}
        {pts.map(([px, py], i) =>
          showDots || hover === i ? (
            <motion.span
              key={data[i].key}
              aria-hidden
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(px / W) * 100}%`,
                top: `${(py / H) * 100}%`,
                width: hover === i ? 12 : 8,
                height: hover === i ? 12 : 8,
                background: data[i].future ? 'var(--ss-track)' : color,
                boxShadow: `0 0 0 2px var(--ss-bg)${hover === i ? `, 0 0 14px ${color}` : ''}`,
              }}
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: reduce ? 0 : 0.6 + i * 0.03 }}
            />
          ) : null,
        )}
        {/* Treffflächen (größer als die Punkte) */}
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <button key={d.key} type="button" tabIndex={-1} aria-hidden className="h-full flex-1 cursor-default" onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </div>
        {h && hover !== null && (
          <div
            className="glass mat-float pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-[12px] px-2.5 py-1.5 text-center text-[11.5px]"
            style={{ left: `clamp(60px, ${(pts[hover][0] / W) * 100}%, calc(100% - 60px))`, top: `calc(${(pts[hover][1] / H) * 100}% - 52px)` }}
          >
            <p className="text-muted">{h.title}</p>
            <p className="num font-semibold">
              {h.value} {h.value === 1 ? 'Aufgabe' : 'Aufgaben'}
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 flex" aria-hidden>
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
