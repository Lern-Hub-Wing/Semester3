import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlarmClock, CalendarCheck, CalendarDays, CalendarRange, ChevronRight, Clock3, FileText, GraduationCap, Play, Plus, RotateCw, Sparkles, Target, Timer, Users,
} from 'lucide-react';
import type { Member } from '../lib/types';
import { groupBy, groupRatio, isDone, memberRatio, overdueFor, remainingForGroup, type TaskView } from '../lib/progress';
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
import { Countdown } from '../components/Countdown';
import { TaskRow } from '../components/TaskRow';
import { TeamProgressGrid } from '../components/MemberProgress';
import { SemesterTimeline } from '../components/SemesterTimeline';
import { FocusMini } from '../components/FocusTimer';
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
  const mobile = useIsMobile();
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

  /** „Weiterlernen“: springt zur ersten offenen Aufgabe von heute (sonst zum Fokus-Timer) */
  const continueLearning = () => {
    haptic('tap');
    const box = document.querySelector<HTMLElement>('#today-card [role="checkbox"][aria-checked="false"]');
    if (box) {
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => box.focus({ preventScroll: true }), 450);
    } else navigate('/fokus');
  };

  return (
    <div>
      <Greeting me={me} today={today} motivation={motivation} />

      <QuickActions
        onContinue={continueLearning}
        onNewEntry={() => openEditor({ date: today })}
        hasOpen={openToday > 0 || overdue.length > 0}
      />

      <div className="stagger grid grid-flow-row-dense grid-cols-1 gap-[var(--gap-grid)] md:grid-cols-2 lg:grid-cols-12">
        <div className="md:col-span-2 lg:col-span-8">
          <Countdown className="h-full" />
        </div>

        <div className="md:col-span-1 lg:col-span-4">
          <GoalCard me={me} mine={mine} group={group} compact={mobile} />
        </div>

        <div className="md:col-span-2 lg:col-span-8">
          <Card className="h-full p-5 md:p-6" id="today-card">
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
            {todayViews.length > 0 && (
              <div className="mt-4">
                <ProgressBar ratio={memberRatio(todayViews, me.id, completions)} color={me.color} height={6} label="Dein Fortschritt heute" />
              </div>
            )}
            {views.length === 0 ? (
              <EmptyState
                icon={<Sparkles />}
                title="Dein Lernplan ist noch leer"
                text="Füge dein erstes Thema hinzu – mit Unteraufgaben, die jede Person für sich abhaken kann."
                action={
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openEditor({ date: today })}>
                    Ersten Lerntag anlegen
                  </Button>
                }
              />
            ) : todayViews.length === 0 ? (
              <EmptyState compact icon={<CalendarDays />} title="Heute ist nichts geplant" text="Gönn dir eine Pause – oder plane schnell etwas ein." />
            ) : (
              <GroupedTasks views={todayViews} me={me} members={members} />
            )}
          </Card>
        </div>

        <div className="md:col-span-1 lg:col-span-4">
          <TeamCard me={me} members={members} views={views} />
        </div>

        {overdue.length > 0 && (
          <div className="md:col-span-2 lg:col-span-12">
            <Card className="h-full p-5 md:p-6" style={{ '--m-extra': 'radial-gradient(60% 120% at 0% 0%, color-mix(in srgb, var(--ss-warn) 16%, transparent), transparent 70%)' } as React.CSSProperties}>
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
          </div>
        )}

        <Reveal className="md:col-span-2 lg:col-span-8">
          <Card className="h-full p-5 md:p-6">
            <CardHeader
              title="Semester-Timeline"
              subtitle="Lernphasen und Prüfungen"
              icon={<CalendarRange />}
              action={
                <Link to="/lernplan?ansicht=timeline" className="flex items-center gap-1 text-sm font-medium text-accent">
                  Öffnen <ChevronRight className="size-4" aria-hidden />
                </Link>
              }
            />
            <SemesterTimeline compact className="mt-4" />
          </Card>
        </Reveal>

        <Reveal className="md:col-span-1 lg:col-span-4">
          <Card className="h-full p-5 md:p-6">
            <CardHeader title="Fokus" subtitle="Konzentriert lernen mit Pausen" icon={<Timer />} />
            <div className="mt-5">
              <FocusMini />
            </div>
          </Card>
        </Reveal>

        <Reveal className="md:col-span-1 lg:col-span-6">
          <UpcomingDays views={views} me={me} today={today} />
        </Reveal>

        <Reveal className="md:col-span-2 lg:col-span-6">
          <UpcomingExams />
        </Reveal>

        <Reveal className="md:col-span-2 lg:col-span-12">
          <StudyModeCard />
        </Reveal>
      </div>
    </div>
  );
}

/** Begrüßung mit kinetischer Überschrift (große Typografie erscheint Wort für Wort). */
function Greeting({ me, today, motivation }: { me: Member; today: string; motivation: string }) {
  const reduce = useReducedMotion();
  const greeting = greetingFor();
  const words = `${greeting},`.split(' ');
  const rise = (i: number) => ({
    initial: reduce ? false : ({ opacity: 0, y: 22, filter: 'blur(8px)' } as const),
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.7, delay: 0.05 + i * 0.07, ease: EASE_EMPH },
  });
  return (
    <header className="mb-5 md:mb-6">
      <motion.p {...rise(0)} className="text-[13px] font-medium text-muted">
        {formatISODate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </motion.p>
      <h1 className="display mt-1.5 text-[34px] md:text-[48px]">
        {words.map((w, i) => (
          <motion.span key={i} {...rise(i + 1)} className="inline-block">
            {w}&nbsp;
          </motion.span>
        ))}
        <motion.span {...rise(words.length + 1)} className="inline-block" style={{ color: `color-mix(in srgb, ${me.color} 62%, var(--ss-text))` }}>
          {me.name}
        </motion.span>
      </h1>
      <motion.p {...rise(words.length + 2)} className="mt-2 text-[15px] text-muted">
        {motivation}
      </motion.p>
    </header>
  );
}

function QuickActions({ onContinue, onNewEntry, hasOpen }: { onContinue: () => void; onNewEntry: () => void; hasOpen: boolean }) {
  const reduce = useReducedMotion();
  const items = [
    { label: 'Lerntag', icon: <Plus className="size-4" />, run: onNewEntry },
    { label: 'Fokus', icon: <Timer className="size-4" />, run: () => navigate('/fokus') },
    { label: 'Material', icon: <FileText className="size-4" />, run: () => navigate('/materialien') },
    { label: 'Lernplan', icon: <CalendarDays className="size-4" />, run: () => navigate('/lernplan') },
  ];
  return (
    <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:mb-7 md:px-0">
      <motion.div initial={reduce ? false : { opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.25 }}>
        <Button variant="primary" icon={hasOpen ? <Play className="size-4" fill="currentColor" /> : <Timer className="size-4" />} onClick={onContinue}>
          {hasOpen ? 'Weiterlernen' : 'Fokus starten'}
        </Button>
      </motion.div>
      {items.map((it, i) => (
        <motion.div key={it.label} initial={reduce ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.32 + i * 0.05, ease: EASE_EMPH }}>
          <Button variant="glass" icon={it.icon} onClick={it.run}>
            {it.label}
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

/** Gemeinsames Ziel: äußerer Ring = Gruppe, innerer Ring = du (Dual Progress). */
function GoalCard({ me, mine, group, compact }: { me: Member; mine: ReturnType<typeof memberRatio>; group: ReturnType<typeof groupRatio>; compact: boolean }) {
  const outer = compact ? 136 : 172;
  const inner = compact ? 98 : 126;
  return (
    <Card className="flex h-full flex-col gap-4 p-5 md:p-6">
      <CardHeader title="Gemeinsames Ziel" subtitle="Gesamter Lernplan" icon={<Target />} />
      <div className="flex flex-1 items-center justify-center gap-5 md:flex-col md:gap-4">
        <ProgressRing ratio={group} color="var(--ss-accent)" size={outer} stroke={compact ? 10 : 12} sublabel="Gruppenfortschritt" showValue={false}>
          <ProgressRing ratio={mine} color={me.color} size={inner} stroke={compact ? 8 : 10} sublabel="Dein Fortschritt" />
        </ProgressRing>
        <div className="flex flex-col gap-2.5 md:w-full md:flex-row md:justify-center md:gap-6">
          <Legend color="var(--ss-accent)" label="Gruppe" value={group} />
          <Legend color={me.color} label="Du" value={mine} />
        </div>
      </div>
      {group.total > 0 && (
        <p className="rounded-[16px] bg-[color-mix(in_srgb,var(--ss-text)_4%,transparent)] px-3 py-2.5 text-center text-[13px] text-muted">
          {group.pct === 100 ? 'Gemeinsames Ziel erreicht – 100 %!' : `Noch ${remainingForGroup(group)} gemeinsame Erledigungen bis zum Ziel.`}
        </p>
      )}
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: ReturnType<typeof memberRatio> }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-8 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      <div className="leading-tight">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="num text-[17px] font-semibold">
          {value.pct === null ? '–' : `${value.pct} %`} <span className="text-[12px] font-normal text-faint">{value.total ? `${value.done}/${value.total}` : ''}</span>
        </p>
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
    <div className="mt-4 flex flex-col gap-3">
      {[...byEntry.values()].map((list) => {
        const { entry, module, topic } = list[0];
        return (
          <section
            key={entry.id}
            className="relative overflow-hidden rounded-[20px] p-2 pt-3"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${module.color} 12%, transparent), transparent 60%)`, boxShadow: 'inset 0 0 0 1px var(--ss-line)' }}
          >
            <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: module.color }} />
            <div className="flex items-center gap-2 px-2">
              <h4 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{entry.title}</h4>
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
    <Card className="h-full p-5 md:p-6">
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
      <TeamProgressGrid members={members} views={views} meId={me.id} ringSize={mobile ? 66 : 76} className="mt-4" />
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
