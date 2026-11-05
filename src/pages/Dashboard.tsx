import { useMemo } from 'react';
import { AlarmClock, CalendarCheck, CalendarDays, ChevronRight, Clock3, Play, RotateCw, GraduationCap, Plus, Sparkles, Target, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { groupBy, groupRatio, isDone, memberRatio, overdueFor, remainingForGroup, type TaskView } from '../lib/progress';
import { addDaysISO, formatISODate, formatInstant, greetingFor, relativeDayLabel } from '../lib/time';
import { daysUntil, upcomingExams } from '../lib/countdown';
import { Link } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMembers, useTaskViews } from '../store/derived';
import { useUI } from '../store/ui';
import { usePrefs } from '../store/prefs';
import { useToday } from '../hooks/useToday';
import { useNow } from '../hooks/useNow';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Countdown } from '../components/Countdown';
import { TaskRow } from '../components/TaskRow';
import { TeamProgressGrid } from '../components/MemberProgress';
import { Card, CardHeader, ModuleChip } from '../components/ui/Card';
import { ProgressRing, ProgressBar } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Segmented } from '../components/ui/Segmented';
import { Reveal } from '../components/ui/Reveal';
import { startStudyMode } from '../lib/studyModeStart';
import { isIPhone, isStandalone } from '../lib/fullscreen';

export function Dashboard({ me }: { me: Member }) {
  const views = useTaskViews();
  const members = useActiveMembers();
  const completions = useData((s) => s.task_completions);
  const today = useToday();
  const openEditor = useUI((s) => s.openEntryEditor);
  const memberIds = members.map((m) => m.id);

  const todayViews = useMemo(() => views.filter((v) => v.date === today), [views, today]);
  const overdue = useMemo(() => overdueFor(views, me.id, completions, today), [views, me.id, completions, today]);
  const mine = memberRatio(views, me.id, completions);
  const group = groupRatio(views, memberIds, completions);
  const openToday = todayViews.filter((v) => !isDone(completions, v.task.id, me.id)).length;

  const motivation =
    views.length === 0
      ? 'Euer Lernplan ist noch leer – legt den ersten Lerntag an.'
      : todayViews.length === 0
        ? 'Für heute ist nichts geplant.'
        : openToday === 0
          ? 'Alle heutigen Aufgaben sind erledigt.'
          : `Heute ${openToday === 1 ? 'ist noch 1 Aufgabe' : `sind noch ${openToday} Aufgaben`} offen.`;

  return (
    <div>
      <header className="mb-5 md:mb-7">
        <p className="text-[13px] font-medium text-muted">{formatISODate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight md:text-[36px]">
          {greetingFor()}, <span style={{ color: `color-mix(in srgb, ${me.color} 55%, var(--ss-text))` }}>{me.name}</span>
        </h1>
        <p className="mt-1 text-[15px] text-muted">{motivation}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-12">
        <div className="md:col-span-2 lg:col-span-8">
          <Countdown className="h-full" />
        </div>

        <Reveal className="md:col-span-2 lg:col-span-4">
          <Card className="flex h-full flex-col justify-between gap-4 p-5">
            <CardHeader title="Fortschritt" subtitle="Gesamter Lernplan" icon={<Target />} />
            <div className="flex items-center justify-around gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <ProgressRing ratio={mine} color={me.color} size={108} stroke={10} sublabel="Dein Fortschritt" />
                <span className="text-[13px] font-medium">Du</span>
                <span className="num text-xs text-muted">{mine.total ? `${mine.done} / ${mine.total}` : 'keine Aufgaben'}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <ProgressRing ratio={group} color="var(--ss-accent)" size={108} stroke={10} sublabel="Gruppenfortschritt" />
                <span className="text-[13px] font-medium">Gruppe</span>
                <span className="num text-xs text-muted">{group.total ? `${group.done} / ${group.total}` : 'keine Aufgaben'}</span>
              </div>
            </div>
            {group.total > 0 && (
              <p className="rounded-2xl bg-surface-2/70 px-3 py-2 text-center text-[13px] text-muted">
                {group.pct === 100 ? 'Gemeinsames Ziel erreicht – 100 %!' : `Noch ${remainingForGroup(group)} gemeinsame Erledigungen bis zum Ziel.`}
              </p>
            )}
          </Card>
        </Reveal>

        <Reveal className="md:col-span-2 lg:col-span-8">
          <Card className="h-full p-5">
            <CardHeader
              title="Heute"
              subtitle={todayViews.length ? `${openToday} von ${todayViews.length} offen` : formatISODate(today, { weekday: 'long', day: 'numeric', month: 'long' })}
              icon={<CalendarCheck />}
              action={
                <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: today })}>
                  <span className="hidden sm:inline">Lerntag</span>
                </Button>
              }
            />
            {views.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="size-6" />}
                title="Dein Lernplan ist noch leer"
                text="Füge dein erstes Thema hinzu – mit Unteraufgaben, die jede Person für sich abhaken kann."
                action={
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: today })}>
                    Ersten Lerntag anlegen
                  </Button>
                }
              />
            ) : todayViews.length === 0 ? (
              <EmptyState compact icon={<CalendarDays className="size-6" />} title="Heute ist nichts geplant" text="Gönn dir eine Pause – oder plane schnell etwas ein." />
            ) : (
              <GroupedTasks views={todayViews} me={me} members={members} />
            )}
          </Card>
        </Reveal>

        <Reveal className="lg:col-span-4">
          <TeamCard me={me} members={members} views={views} />
        </Reveal>

        {overdue.length > 0 && (
          <Reveal className="lg:col-span-4">
            <Card className="h-full p-5">
              <CardHeader title="Überfällig" subtitle={overdueText(overdue, today)} icon={<AlarmClock className="text-warn" />} />
              <ul className="-mx-2 mt-2 max-h-[340px] overflow-y-auto scroll-thin">
                {overdue.slice(0, 12).map((v) => (
                  <TaskRow
                    key={v.task.id}
                    task={v.task}
                    member={me}
                    members={members}
                    dense
                    showGroup={false}
                    subtitle={`${relativeDayLabel(v.date, today)} · ${v.module.name}`}
                  />
                ))}
              </ul>
              {overdue.length > 12 && (
                <Link to="/lernplan?ansicht=liste&status=ueberfaellig" className="mt-2 inline-block text-sm font-medium text-accent">
                  Alle {overdue.length} anzeigen
                </Link>
              )}
            </Card>
          </Reveal>
        )}

        <Reveal className="lg:col-span-4">
          <UpcomingDays views={views} me={me} today={today} />
        </Reveal>

        <Reveal className="lg:col-span-4">
          <UpcomingExams />
        </Reveal>

        <Reveal className="md:col-span-2 lg:col-span-12">
          <StudyModeCard />
        </Reveal>
      </div>
    </div>
  );
}

function overdueText(list: TaskView[], today: string) {
  const yesterday = addDaysISO(today, -1);
  const n = list.length;
  const word = n === 1 ? 'Aufgabe' : 'Aufgaben';
  const verb = n === 1 ? 'ist' : 'sind';
  if (list.every((v) => v.date === yesterday)) return `${n} ${word} vom Vortag ${verb} noch offen.`;
  return `${n} ${word} aus vergangenen Lerntagen ${verb} noch offen.`;
}

/** Aufgaben gruppiert nach Lerntag (mit Modulfarbe). */
export function GroupedTasks({ views, me, members }: { views: TaskView[]; me: Member; members: Member[] }) {
  const byEntry = groupBy(views, (v) => v.entry.id);
  return (
    <div className="mt-3 flex flex-col gap-3">
      {[...byEntry.values()].map((list) => {
        const { entry, module, topic } = list[0];
        return (
          <section key={entry.id} className="rounded-2xl border border-line p-2 pt-3">
            <div className="flex items-center gap-2 px-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: module.color }} aria-hidden />
              <h4 className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.title}</h4>
              <span className="truncate text-xs text-muted">{topic ? `${module.name} · ${topic.title}` : module.name}</span>
            </div>
            <ul className="mt-1">
              {list.map((v) => (
                <TaskRow key={v.task.id} task={v.task} member={me} members={members} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TeamCard({ me, members, views }: { me: Member; members: Member[]; views: TaskView[] }) {
  const style = usePrefs((s) => s.progressStyle);
  const setPrefs = usePrefs((s) => s.set);
  const mobile = useIsMobile();

  return (
    <Card className="h-full p-5">
      <CardHeader
        title="Team"
        subtitle={`${members.length} aktive ${members.length === 1 ? 'Person' : 'Personen'}`}
        icon={<Users />}
        action={
          <Segmented
            size="sm"
            label="Darstellung"
            value={style}
            onChange={(v) => setPrefs({ progressStyle: v })}
            options={[
              { value: 'ring', label: 'Kreise' },
              { value: 'bar', label: 'Balken' },
            ]}
          />
        }
      />
      {/* Immer alle aktiven Personen – auf dem Handy kompakter */}
      <TeamProgressGrid members={members} views={views} meId={me.id} ringSize={mobile ? 66 : 78} className="mt-3" />
    </Card>
  );
}

function UpcomingDays({ views, me, today }: { views: TaskView[]; me: Member; today: string }) {
  const completions = useData((s) => s.task_completions);
  const upcoming = useMemo(() => {
    const future = views.filter((v) => v.date > today);
    return [...groupBy(future, (v) => v.date).entries()].slice(0, 5);
  }, [views, today]);
  return (
    <Card className="h-full p-5">
      <CardHeader title="Kommende Lerntage" icon={<CalendarDays />} action={<Link to="/lernplan" className="text-sm font-medium text-accent">Lernplan</Link>} />
      {upcoming.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Keine weiteren Lerntage geplant.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {upcoming.map(([date, list]) => {
            const r = memberRatio(list, me.id, completions);
            const mods = [...new Map(list.map((v) => [v.module.id, v.module])).values()];
            return (
              <li key={date}>
                <Link to={`/lernplan?ansicht=tag&datum=${date}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface-2">
                  <span className="grid w-11 shrink-0 text-center">
                    <span className="text-[11px] font-semibold uppercase text-muted">{formatISODate(date, { weekday: 'short' })}</span>
                    <span className="num text-lg font-semibold leading-tight">{formatISODate(date, { day: 'numeric' })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap gap-1">
                      {mods.slice(0, 2).map((m) => (
                        <ModuleChip key={m.id} name={m.name} color={m.color} small />
                      ))}
                      {mods.length > 2 && <span className="text-xs text-muted">+{mods.length - 2}</span>}
                    </span>
                    <span className="mt-1.5 block">
                      <ProgressBar ratio={r} color={me.color} height={4} label={`Fortschritt am ${date}`} />
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted">{list.length} Aufg.</span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function UpcomingExams() {
  const now = useNow(60_000);
  const exams = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const list = useMemo(() => upcomingExams(Object.values(exams), now).slice(0, 6), [exams, now]);
  return (
    <Card className="h-full p-5">
      <CardHeader title="Bevorstehende Prüfungen" icon={<GraduationCap />} action={<Link to="/pruefungen" className="text-sm font-medium text-accent">Alle</Link>} />
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Keine bevorstehenden Prüfungen.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {list.map((e) => {
            const m = modules[e.module_id];
            const days = daysUntil(e.starts_at, now);
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: m?.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m?.name}</span>
                  <span className="block text-xs text-muted">
                    {formatInstant(e.starts_at, { weekday: 'short', day: 'numeric', month: 'short' }, e.timezone)} ·{' '}
                    {formatInstant(e.starts_at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, e.timezone)} Uhr
                  </span>
                </span>
                <span className="num shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">
                  {Date.parse(e.starts_at) <= now ? 'läuft' : days === 0 ? 'heute' : `${days} T.`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Einstieg in den Lernmodus (Vollbild-Uhr im Querformat). */
function StudyModeCard() {
  const now = useNow(1000);
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iphoneBrowser = isIPhone() && !isStandalone();
  return (
    <section
      aria-labelledby="study-mode-title"
      className="glass glass-tint relative overflow-hidden rounded-[26px] p-5 md:p-6"
      data-testid="study-mode-card"
    >
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        {/* Mini-Vorschau: Handy quer mit Uhr */}
        <div aria-hidden className="mx-auto grid h-[92px] w-[176px] shrink-0 place-items-center rounded-[22px] border border-[var(--lg-hi)] bg-[#0C1018] shadow-[0_12px_30px_-14px_rgba(0,0,0,0.6)] md:mx-0">
          <span className="num text-[30px] font-semibold tracking-tight text-[#F2F5FA]" style={{ textShadow: '0 0 12px rgba(175,197,245,.45)' }}>
            {pad(d.getHours())}:{pad(d.getMinutes())}
            <span className="text-[16px] opacity-60">:{pad(d.getSeconds())}</span>
          </span>
        </div>
        <div className="min-w-0 flex-1 text-center md:text-left">
          <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted md:justify-start">
            <Clock3 className="size-3.5" aria-hidden /> Lernmodus
          </p>
          <h2 id="study-mode-title" className="mt-1 text-xl font-semibold tracking-tight">
            Konzentriert lernen mit der Vollbild-Uhr
          </h2>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted md:justify-start">
            <RotateCw className="size-4 shrink-0" aria-hidden />
            Handy quer hinlegen – die Uhrzeit läuft sekundengenau im Vollbild, alles andere blendet sich aus.
          </p>
          {iphoneBrowser && (
            <p className="mt-1.5 text-xs text-faint" data-testid="iphone-install-hint">
              iPhone: Vollbild gibt es nur, wenn StudySpace über „Teilen → Zum Home-Bildschirm“ hinzugefügt und von dort geöffnet wird.
            </p>
          )}
        </div>
        <Button variant="primary" size="lg" icon={<Play className="size-4" />} onClick={startStudyMode} className="w-full md:w-auto">
          Lernmodus starten
        </Button>
      </div>
    </section>
  );
}
