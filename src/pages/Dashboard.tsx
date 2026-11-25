import { useMemo } from 'react';
import { AlarmClock, BookOpen, CalendarDays, CalendarRange, ChartLine, ChevronRight, Clock3, GraduationCap, Music2, Play, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { groupBy, memberRatio, overdueFor, type TaskView } from '../lib/progress';
import { addDaysISO, formatISODate, formatInstant, greetingFor, relativeDayLabel } from '../lib/time';
import { Greeting } from '../components/layout/Greeting';
import { daysUntil, upcomingExams } from '../lib/countdown';
import { Link } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMembers, useTaskViews } from '../store/derived';
import { usePrefs } from '../store/prefs';
import { useToday } from '../hooks/useToday';
import { useNow } from '../hooks/useNow';
import { useIsMobile } from '../hooks/useMediaQuery';
import { TaskRow } from '../components/TaskRow';
import { TeamProgressGrid } from '../components/MemberProgress';
import { SemesterTimeline } from '../components/SemesterTimeline';
import { ExamHero, FocusButton, FocusStatsCard } from '../components/dashboard/SummitCards';
import { HomeworkDashCard } from '../components/homework/HomeworkDashCard';
import { CardHead, ProgressCard, TodayCard, useDashboardRatios } from '../components/dashboard/HeroCards';
import { Card, CardHeader, ModuleChip } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { startStudyMode } from '../lib/studyModeStart';
import { isIPhone, isStandalone } from '../lib/fullscreen';

export function Dashboard({ me }: { me: Member }) {
  const views = useTaskViews();
  const members = useActiveMembers();
  const completions = useData((s) => s.task_completions);
  const today = useToday();
  const mobile = useIsMobile();
  const memberIds = members.map((m) => m.id);

  const todayViews = useMemo(() => views.filter((v) => v.date === today), [views, today]);
  const overdue = useMemo(() => overdueFor(views, me.id, completions, today), [views, me.id, completions, today]);
  const { mine, group } = useDashboardRatios(me, memberIds);

  if (mobile) {
    return (
      <div className="flex flex-col gap-[var(--gap-grid)]">
        <h1 className="sr-only">
          {greetingFor()}, {me.name}
        </h1>
        <header className="pt-1" aria-hidden>
          <Greeting className="text-[14px] font-medium text-muted" />
          <h1 className="title mt-0.5 text-[26px] leading-tight">Bereit für Fokus?</h1>
        </header>
        <ExamHero compact />
        <FocusButton className="w-full" />
        {/* Handy: nur das Wichtigste – alles Weitere eine Berührung entfernt (Schnellzugriff + Tab-Leiste) */}
        <HomeworkDashCard me={me} />
        <TodayCard views={todayViews} today={today} me={me} members={members} allEmpty={views.length === 0} />
        {overdue.length > 0 && <OverdueCard overdue={overdue} me={me} members={members} today={today} />}
        <UpcomingExams limit={3} />
        <QuickLinks />
        <StudyModeCard slim />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]">
      <h1 className="sr-only">
        {greetingFor()}, {me.name}
      </h1>
      <ExamHero />
      <div className="grid grid-cols-1 gap-[var(--gap-grid)] md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <HomeworkDashCard me={me} />
        <TodayCard views={todayViews} today={today} me={me} members={members} allEmpty={views.length === 0} />
        <FocusStatsCard me={me} className="md:col-span-2 lg:col-span-1" />
      </div>
      {overdue.length > 0 && <OverdueCard overdue={overdue} me={me} members={members} today={today} />}
      <div className="grid grid-cols-1 gap-[var(--gap-grid)] md:grid-cols-2 lg:grid-cols-12 [&>*]:min-w-0">
        <ProgressCard me={me} mine={mine} group={group} className="lg:col-span-4" />
        <div className="lg:col-span-8">
          <TeamCard me={me} members={members} />
        </div>
      </div>
      <Card className="p-5 md:p-6">
        <CardHeader title="Semester-Timeline" icon={<CalendarRange />} action={<TimelineLink />} />
        <SemesterTimeline className="mt-4" />
      </Card>
      <div className="grid grid-cols-1 gap-[var(--gap-grid)] md:grid-cols-2 [&>*]:min-w-0">
        <UpcomingDays views={views} me={me} today={today} />
        <UpcomingExams />
      </div>
      <StudyModeCard />
    </div>
  );
}

/** Schnellzugriff (Handy): was nicht auf der Startseite steht, ist eine Berührung entfernt */
function QuickLinks() {
  const items = [
    { to: '/faecher', icon: <BookOpen />, label: 'Fächer' },
    { to: '/analyse', icon: <ChartLine />, label: 'Statistik' },
    { to: '/lernplan?ansicht=timeline', icon: <CalendarRange />, label: 'Timeline' },
    { to: '/musik', icon: <Music2 />, label: 'Musik' },
  ];
  return (
    <nav aria-label="Schnellzugriff" className="card grid grid-cols-4 rounded-[22px] p-1.5" data-testid="quick-links">
      {items.map((it) => (
        <Link key={it.to} to={it.to} className="press flex flex-col items-center gap-1.5 rounded-[16px] py-3 text-[12px] font-medium text-muted transition-colors hover:text-ink active:bg-[var(--ss-surface-2)]">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--ss-accent-soft)] text-accent [&>svg]:size-[18px]" aria-hidden>
            {it.icon}
          </span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

function TimelineLink() {
  return (
    <Link to="/lernplan?ansicht=timeline" className="flex items-center gap-1 text-sm font-medium text-accent">
      Öffnen <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

function OverdueCard({ overdue, me, members, today }: { overdue: TaskView[]; me: Member; members: Member[]; today: string }) {
  return (
    <Card className="h-full p-5 md:p-6" style={{ '--m-extra': 'radial-gradient(60% 120% at 0% 0%, color-mix(in srgb, var(--ss-warn) 14%, transparent), transparent 70%)' } as React.CSSProperties}>
      <CardHeader title="Überfällig" subtitle={overdueText(overdue, today)} icon={<AlarmClock />} tint="var(--ss-warn)" />
      <ul className="-mx-2 mt-2 grid max-h-[340px] grid-cols-1 overflow-y-auto scroll-thin lg:grid-cols-2 lg:gap-x-4">
        {overdue.slice(0, 12).map((v) => (
          <TaskRow key={v.task.id} task={v.task} member={me} members={members} dense showGroup={false} subtitle={`${relativeDayLabel(v.date, today)} · ${v.module.name}`} />
        ))}
      </ul>
      {overdue.length > 12 && (
        <Link to="/lernplan?ansicht=liste&status=ueberfaellig" className="mt-2 inline-block text-sm font-medium text-accent">
          Alle {overdue.length} anzeigen
        </Link>
      )}
    </Card>
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

function TeamCard({ me, members }: { me: Member; members: Member[] }) {
  const style = usePrefs((s) => s.progressStyle);
  const setPrefs = usePrefs((s) => s.set);
  const mobile = useIsMobile();

  return (
    <Card className="p-5 md:p-6" data-testid="team-card">
      <CardHeader
        title="Team"
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
      <TeamProgressGrid members={members} meId={me.id} ringSize={mobile ? 62 : 64} className="mt-4" />
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
    <Card className="h-full p-5 md:p-6">
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
                <Link to={`/lernplan?ansicht=tag&datum=${date}`} className="flex items-center gap-3 rounded-[18px] px-2 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)]">
                  <span className="lens grid w-12 shrink-0 rounded-[14px] py-1 text-center">
                    <span className="text-[10.5px] font-semibold uppercase text-muted">{formatISODate(date, { weekday: 'short' })}</span>
                    <span className="num text-[18px] font-semibold leading-tight">{formatISODate(date, { day: 'numeric' })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap gap-1">
                      {mods.slice(0, 2).map((m) => (
                        <ModuleChip key={m.id} name={m.name} color={m.color} small />
                      ))}
                      {mods.length > 2 && <span className="text-xs text-muted">+{mods.length - 2}</span>}
                    </span>
                    <span className="mt-2 block">
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

function UpcomingExams({ limit = 6 }: { limit?: number }) {
  const now = useNow(60_000);
  const exams = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const list = useMemo(() => upcomingExams(Object.values(exams), now).slice(0, limit), [exams, now, limit]);
  return (
    <Card className="h-full p-5 md:p-6">
      <CardHead title="Nächste Prüfungen" icon={<GraduationCap />} to="/faecher" />
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Keine bevorstehenden Prüfungen.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {list.map((e) => {
            const m = modules[e.module_id];
            const days = daysUntil(e.starts_at, now);
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-[18px] px-2 py-2">
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: m?.color, boxShadow: `0 0 10px -2px ${m?.color}` }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m?.name}</span>
                  <span className="block text-xs text-muted">
                    {formatInstant(e.starts_at, { weekday: 'short', day: 'numeric', month: 'short' }, e.timezone)} ·{' '}
                    {formatInstant(e.starts_at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, e.timezone)} Uhr
                  </span>
                </span>
                <span className="lens num shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
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
function StudyModeCard({ slim = false }: { slim?: boolean }) {
  const now = useNow(1000);
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iphoneBrowser = isIPhone() && !isStandalone();
  const hint = iphoneBrowser && (
    <p className="mt-1.5 text-xs text-faint" data-testid="iphone-install-hint">
      iPhone: Vollbild gibt es nur, wenn StudySpace über „Teilen → Zum Home-Bildschirm“ hinzugefügt und von dort geöffnet wird.
    </p>
  );
  // Handy: schlanke Zeile – Vorschau, Titel, Start
  if (slim)
    return (
      <section aria-labelledby="study-mode-title" className="card rounded-[22px] p-3.5" data-testid="study-mode-card">
        <div className="flex items-center gap-3.5">
          <div aria-hidden className="grid h-[52px] w-[92px] shrink-0 place-items-center rounded-[14px] border border-white/10 bg-[#0C1018] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <span className="num text-[17px] font-semibold tracking-tight text-[#F2F5FA]">
              {pad(d.getHours())}:{pad(d.getMinutes())}
              <span className="text-[10px] opacity-60">:{pad(d.getSeconds())}</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="study-mode-title" className="title text-[15px] leading-tight">
              Lernmodus
            </h2>
            <p className="text-[12.5px] text-muted">Vollbild-Uhr</p>
          </div>
          <Button variant="primary" size="sm" icon={<Play className="size-3.5" />} onClick={startStudyMode} aria-label="Lernmodus starten">
            Start
          </Button>
        </div>
        {hint}
      </section>
    );
  return (
    <section aria-labelledby="study-mode-title" className="glass glass-tint relative overflow-hidden rounded-[30px] p-5 md:p-6" data-testid="study-mode-card">
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        {/* Mini-Vorschau: Handy quer mit Uhr */}
        <div aria-hidden className="mx-auto grid h-[92px] w-[176px] shrink-0 place-items-center rounded-[24px] border border-white/15 bg-[#0C1018] shadow-[0_14px_34px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] md:mx-0">
          <span className="num text-[30px] font-semibold tracking-tight text-[#F2F5FA]" style={{ textShadow: '0 0 14px rgba(169,166,255,.55)' }}>
            {pad(d.getHours())}:{pad(d.getMinutes())}
            <span className="text-[16px] opacity-60">:{pad(d.getSeconds())}</span>
          </span>
        </div>
        <div className="min-w-0 flex-1 text-center md:text-left">
          <p className="eyebrow flex items-center justify-center gap-1.5 md:justify-start">
            <Clock3 className="size-3.5" aria-hidden /> Lernmodus
          </p>
          <h2 id="study-mode-title" className="title mt-1 text-xl">
            Vollbild-Uhr
          </h2>
          {hint}
        </div>
        <Button variant="primary" size="lg" icon={<Play className="size-4" />} onClick={startStudyMode} className="w-full md:w-auto">
          Lernmodus starten
        </Button>
      </div>
    </section>
  );
}
