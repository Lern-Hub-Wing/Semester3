import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlarmClock, CalendarDays, CalendarRange, ChevronRight, Clock3, FileText, GraduationCap, NotebookPen, Play, Plus, Timer, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { groupBy, isDone, memberRatio, overdueFor, type TaskView } from '../lib/progress';
import { addDaysISO, formatISODate, formatInstant, greetingFor, relativeDayLabel } from '../lib/time';
import { daysUntil, upcomingExams } from '../lib/countdown';
import { EASE_EMPH } from '../lib/motion';
import { Link, navigate } from '../lib/router';
import { haptic } from '../lib/haptics';
import { useData } from '../store/data';
import { useActiveMembers, useTaskViews } from '../store/derived';
import { useUI } from '../store/ui';
import { usePrefs } from '../store/prefs';
import { useToday } from '../hooks/useToday';
import { useNow } from '../hooks/useNow';
import { useIsMobile } from '../hooks/useMediaQuery';
import { TaskRow } from '../components/TaskRow';
import { TeamProgressGrid } from '../components/MemberProgress';
import { SemesterTimeline } from '../components/SemesterTimeline';
import { FocusLauncher } from '../components/FocusPanel';
import { HomeworkDashCard } from '../components/homework/HomeworkDashCard';
import { useHomework } from '../store/homework';
import { openHomeworkEditor } from '../store/ui';
import { NextExamCard, ProgressCard, TodayCard, useDashboardRatios } from '../components/dashboard/HeroCards';
import { Landscape } from '../components/landscape/Landscape';
import { Card, CardHeader, ModuleChip } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Reveal } from '../components/ui/Reveal';
import { startStudyMode } from '../lib/studyModeStart';
import { isIPhone, isStandalone } from '../lib/fullscreen';

export function Dashboard({ me }: { me: Member }) {
  const views = useTaskViews();
  const members = useActiveMembers();
  const completions = useData((s) => s.task_completions);
  const today = useToday();
  const mobile = useIsMobile();
  const openEditor = useUI((s) => s.openEntryEditor);
  const memberIds = members.map((m) => m.id);

  const todayViews = useMemo(() => views.filter((v) => v.date === today), [views, today]);
  const overdue = useMemo(() => overdueFor(views, me.id, completions, today), [views, me.id, completions, today]);
  const { mine, group } = useDashboardRatios(views, me, memberIds);
  const openToday = todayViews.filter((v) => !isDone(completions, v.task.id, me.id)).length;

  const motivation =
    views.length === 0
      ? 'Euer Lernplan ist noch leer – legt den ersten Lerntag an.'
      : todayViews.length === 0
        ? 'Für heute ist nichts geplant. Bereit für den nächsten Schritt?'
        : openToday === 0
          ? 'Alle heutigen Aufgaben sind erledigt – stark!'
          : `Heute ${openToday === 1 ? 'ist noch 1 Aufgabe' : `sind noch ${openToday} Aufgaben`} offen. Bereit für den nächsten Schritt?`;

  /** „Weiterlernen“: springt zur ersten offenen Aufgabe von heute (sonst zum Fokus-Timer) */
  const continueLearning = () => {
    haptic('tap');
    const box = document.querySelector<HTMLElement>('#today-card [role="checkbox"][aria-checked="false"]');
    if (box) {
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => box.focus({ preventScroll: true }), 450);
    } else navigate('/fokus');
  };

  const today3 = (
    <>
      <TodayCard views={todayViews} today={today} me={me} members={members} allEmpty={views.length === 0} className="md:col-span-2 lg:col-span-5" />
      <ProgressCard me={me} mine={mine} group={group} className="lg:col-span-3" />
      <NextExamCard className="lg:col-span-4" memberId={me.id} />
    </>
  );

  return (
    <div className="relative">
      {mobile ? (
        <>
          {/* Smartphone: gleiche Stimmung wie der Desktop-Hero – Landschaft läuft weich in den Hintergrund aus */}
          <div aria-hidden className="pointer-events-none absolute inset-x-[-16px] -top-[96px] h-[330px] overflow-hidden [mask-image:linear-gradient(180deg,#000_45%,transparent)]">
            <div className="hero-scene absolute inset-0">
              <Landscape />
            </div>
          </div>
          <div className="relative on-image">
            <Greeting me={me} today={today} motivation={motivation} />
            <QuickActions onContinue={continueLearning} onNewEntry={() => openEditor({ date: today })} hasOpen={openToday > 0 || overdue.length > 0} />
          </div>
          <div className="stagger relative flex flex-col gap-[var(--gap-grid)]">
            <NextExamCard memberId={me.id} />
            <ProgressCard me={me} mine={mine} group={group} ringSize={104} />
            <TodayCard views={todayViews} today={today} me={me} members={members} allEmpty={views.length === 0} />
            <Card className="p-4" data-testid="focus-card">
              <FocusLauncher />
            </Card>
            <HomeworkDashCard me={me} />
            {overdue.length > 0 && <OverdueCard overdue={overdue} me={me} members={members} today={today} />}
            <Card className="p-4">
              <CardHeader title="Semester-Timeline" icon={<CalendarRange />} action={<TimelineLink />} />
              <SemesterTimeline compact className="mt-4" />
            </Card>
            <TeamCard me={me} members={members} views={views} />
            <UpcomingDays views={views} me={me} today={today} />
            <UpcomingExams />
            <StudyModeCard />
          </div>
        </>
      ) : (
        <>
          {/* Tablet/Desktop: Hero-Bühne mit Berglandschaft, Glaskarten schweben darüber */}
          <section className="hero-scene -mx-1 mb-[var(--gap-grid)] rounded-[34px] px-5 pb-5 pt-6 md:-mt-[56px] md:px-7 md:pb-7 md:pt-[68px] lg:px-9 lg:pt-[72px]" data-testid="dashboard-hero">
            <Landscape />
            <div className="relative max-w-[640px] on-image">
              <Greeting me={me} today={today} motivation={motivation} />
            </div>
            <QuickActions onContinue={continueLearning} onNewEntry={() => openEditor({ date: today })} hasOpen={openToday > 0 || overdue.length > 0} />
            <div className="stagger mt-[clamp(24px,7vh,96px)] grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">{today3}</div>
          </section>

          <div className="stagger grid grid-flow-row-dense grid-cols-1 gap-[var(--gap-grid)] md:grid-cols-2 lg:grid-cols-12">
            <Card className="flex items-center p-5 md:col-span-2 md:p-8 lg:col-span-7" data-testid="focus-card">
              <FocusLauncher large />
            </Card>
            <HomeworkDashCard me={me} className="md:col-span-2 lg:col-span-5" />
            <Reveal className="md:col-span-2 lg:col-span-12">
              <Card className="h-full p-5 md:p-6">
                <CardHeader title="Semester-Timeline" icon={<CalendarRange />} action={<TimelineLink />} />
                <SemesterTimeline className="mt-4" />
              </Card>
            </Reveal>
            {overdue.length > 0 && (
              <div className="md:col-span-2 lg:col-span-12">
                <OverdueCard overdue={overdue} me={me} members={members} today={today} />
              </div>
            )}
            <div className="md:col-span-2 lg:col-span-4">
              <TeamCard me={me} members={members} views={views} />
            </div>
            <Reveal className="md:col-span-1 lg:col-span-4">
              <UpcomingDays views={views} me={me} today={today} />
            </Reveal>
            <Reveal className="md:col-span-1 lg:col-span-4">
              <UpcomingExams />
            </Reveal>
            <Reveal className="md:col-span-2 lg:col-span-12">
              <StudyModeCard />
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}

function TimelineLink() {
  return (
    <Link to="/lernplan?ansicht=timeline" className="flex items-center gap-1 text-sm font-medium text-accent">
      Öffnen <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Begrüßung mit kinetischer Überschrift (große Typografie erscheint Wort für Wort). */
function Greeting({ me, today, motivation }: { me: Member; today: string; motivation: string }) {
  const reduce = useReducedMotion();
  const words = `${greetingFor()},`.split(' ');
  const rise = (i: number) => ({
    initial: reduce ? false : ({ opacity: 0, y: 18, filter: 'blur(8px)' } as const),
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.7, delay: 0.05 + i * 0.07, ease: EASE_EMPH },
  });
  return (
    <header className="mb-5">
      <motion.p {...rise(0)} className="text-[13px] font-medium text-muted">
        {formatISODate(today, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </motion.p>
      <h1 className="display mt-1 text-[28px] md:text-[40px]">
        {words.map((w, i) => (
          <motion.span key={i} {...rise(i + 1)} className="inline-block">
            {w}&nbsp;
          </motion.span>
        ))}
        <motion.span {...rise(words.length + 1)} className="inline-block" style={{ color: `color-mix(in srgb, var(--ss-accent) 55%, ${me.color})` }}>
          {me.name}
        </motion.span>
      </h1>
      <motion.p {...rise(words.length + 2)} className="mt-1.5 text-[14.5px] text-muted">
        {motivation}
      </motion.p>
    </header>
  );
}

function QuickActions({ onContinue, onNewEntry, hasOpen }: { onContinue: () => void; onNewEntry: () => void; hasOpen: boolean }) {
  const reduce = useReducedMotion();
  const homeworkReady = useHomework((s) => s.available === true);
  const items = [
    { label: 'Aufgabe+', icon: <Plus className="size-4" />, run: onNewEntry },
    ...(homeworkReady ? [{ label: 'Hausaufgabe', icon: <NotebookPen className="size-4" />, run: () => openHomeworkEditor() }] : []),
    { label: 'Fokus', icon: <Timer className="size-4" />, run: () => navigate('/fokus') },
    { label: 'Material', icon: <FileText className="size-4" />, run: () => navigate('/materialien') },
  ];
  return (
    <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)] md:mx-0 md:mb-0 md:px-0 md:[mask-image:none]">
      <motion.div className="shrink-0" initial={reduce ? false : { opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.25 }}>
        <Button variant="primary" icon={<Play className="size-4" fill="currentColor" />} onClick={onContinue}>
          {hasOpen ? 'Weiterlernen' : 'Fokus starten'}
        </Button>
      </motion.div>
      {items.map((it, i) => (
        <motion.div key={it.label} className="shrink-0" initial={reduce ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.32 + i * 0.05, ease: EASE_EMPH }}>
          <Button variant="glass" icon={it.icon} onClick={it.run} aria-label={it.label === 'Aufgabe+' ? 'Neuen Lerntag mit Aufgaben anlegen' : it.label === 'Hausaufgabe' ? 'Neue Hausaufgabe anlegen' : undefined}>
            {it.label}
          </Button>
        </motion.div>
      ))}
    </div>
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

function TeamCard({ me, members, views }: { me: Member; members: Member[]; views: TaskView[] }) {
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
      <TeamProgressGrid members={members} views={views} meId={me.id} ringSize={mobile ? 62 : 64} className="mt-4" />
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

function UpcomingExams() {
  const now = useNow(60_000);
  const exams = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const list = useMemo(() => upcomingExams(Object.values(exams), now).slice(0, 6), [exams, now]);
  return (
    <Card className="h-full p-5 md:p-6">
      <CardHeader title="Bevorstehende Prüfungen" icon={<GraduationCap />} action={<Link to="/pruefungen" className="text-sm font-medium text-accent">Alle</Link>} />
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
function StudyModeCard() {
  const now = useNow(1000);
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iphoneBrowser = isIPhone() && !isStandalone();
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
