import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, BookOpen, CalendarPlus, ChevronDown, GraduationCap, Layers, Palette, Pencil, Plus,
} from 'lucide-react';
import type { Member, Module, Topic } from '../lib/types';
import { groupBy, groupRatio, isDone, memberRatio, type TaskView } from '../lib/progress';
import { daysUntil, upcomingExams } from '../lib/countdown';
import { formatInstant, formatTime } from '../lib/time';
import { suggestColor } from '../lib/colors';
import { LIMITS } from '../lib/config';
import { Link, navigate } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMembers, useModules, useTaskViews } from '../store/derived';
import { archiveModule, archiveTopic, createModule, createTopic, reorderTopics, updateModule, updateTopic } from '../store/actions';
import { useUI } from '../store/ui';
import { useNow } from '../hooks/useNow';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardHeader } from '../components/ui/Card';
import { ProgressBar, ProgressRing } from '../components/ui/Progress';
import { Button, IconButton } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { TextArea, TextField } from '../components/ui/Field';
import { ColorPicker } from '../components/ui/ColorPicker';
import { EmptyState } from '../components/ui/EmptyState';
import { Menu } from '../components/ui/Menu';
import { Reveal } from '../components/ui/Reveal';
import { EntryCard } from '../components/EntryCard';
import { AttachmentList, FileDrop } from '../components/Attachments';
import { MemberProgress } from '../components/MemberProgress';

/** Übersicht aller Prüfungsmodule als farbige Karten. */
export function Modules({ me }: { me: Member }) {
  const modules = useModules();
  const views = useTaskViews();
  const members = useActiveMembers();
  const completions = useData((s) => s.task_completions);
  const exams = useData((s) => s.exams);
  const now = useNow(60_000);
  const [editing, setEditing] = useState<Module | 'new' | null>(null);
  const byModule = useMemo(() => groupBy(views, (v) => v.module.id), [views]);
  const upcoming = useMemo(() => upcomingExams(Object.values(exams), now), [exams, now]);

  return (
    <div>
      <PageHeader
        title="Fächer"
        subtitle={`${modules.length} Prüfungsmodule`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Modul
          </Button>
        }
      />
      {modules.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen className="size-6" />} title="Noch keine Module" text="Lege dein erstes Prüfungsmodul an." />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m, i) => {
            const list = byModule.get(m.id) ?? [];
            const g = groupRatio(list, members.map((x) => x.id), completions);
            const mine = memberRatio(list, me.id, completions);
            const open = list.filter((v) => !isDone(completions, v.task.id, me.id)).length;
            const exam = upcoming.find((e) => e.module_id === m.id);
            return (
              <Reveal as="li" key={m.id} delay={Math.min(i * 0.04, 0.2)}>
                <Link
                  to={`/faecher/${m.id}`}
                  className="card lift relative block h-full overflow-hidden rounded-[24px] p-5"
                  style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${m.color} 30%, var(--ss-card)) 0%, var(--ss-card) 62%)` }}
                >
                  <span aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full opacity-60" style={{ background: `radial-gradient(circle, ${m.color}, transparent 70%)` }} />
                  <div className="relative flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[17px] font-semibold leading-snug tracking-tight">{m.name}</h2>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                        <GraduationCap className="size-3.5" aria-hidden />
                        {exam
                          ? `${formatInstant(exam.starts_at, { day: 'numeric', month: 'short', year: 'numeric' }, exam.timezone)} · ${formatTime(exam.starts_at, exam.timezone)} Uhr`
                          : 'Kein Prüfungstermin'}
                      </p>
                    </div>
                    <ProgressRing ratio={mine} color={me.color} size={58} stroke={6} sublabel="Dein Fortschritt" />
                  </div>
                  <div className="relative mt-5">
                    <div className="mb-1.5 flex justify-between text-xs text-muted">
                      <span>Gruppe</span>
                      <span className="num font-semibold text-ink">{g.pct === null ? '–' : `${g.pct}%`}</span>
                    </div>
                    <ProgressBar ratio={g} color={m.color} label={`Gruppenfortschritt ${m.name}`} />
                  </div>
                  <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
                    {exam && (
                      <span className="num rounded-full bg-surface/70 px-2.5 py-1 font-semibold">
                        {daysUntil(exam.starts_at, now) === 0 ? 'Heute' : `noch ${daysUntil(exam.starts_at, now)} Tage`}
                      </span>
                    )}
                    <span className="num rounded-full bg-surface/70 px-2.5 py-1 font-medium text-muted">
                      {list.length === 0 ? 'Keine Aufgaben' : `${open} offen · ${list.length} Aufgaben`}
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      )}
      <ModuleEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Dialog: Modul anlegen oder bearbeiten (Name, Farbe, Beschreibung). */
export function ModuleEditor({ value, onClose }: { value: Module | 'new' | null; onClose: () => void }) {
  const modules = useModules(true);
  const isNew = value === 'new';
  const mod = value && value !== 'new' ? value : null;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#B4D3F2');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  const key = value === null ? null : isNew ? 'new' : mod!.id;
  if (key !== lastKey) {
    setLastKey(key);
    setError(null);
    setName(mod?.name ?? '');
    setColor(mod?.color ?? suggestColor(modules.map((m) => m.color)));
    setDescription(mod?.description ?? '');
  }

  const save = async () => {
    if (!name.trim()) return setError('Bitte einen Namen eingeben.');
    setBusy(true);
    const ok = isNew
      ? !!(await createModule({ name, color, description }))
      : await updateModule(mod!.id, { name: name.trim(), color, description: description.trim() || null }, mod!.version);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={isNew ? 'Neues Modul' : 'Modul bearbeiten'}
      description="Änderungen am Modul behalten alle Erledigungsstatus."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" data-autofocus value={name} maxLength={LIMITS.moduleName} showCount onChange={(e) => setName(e.target.value)} error={error} />
        <TextArea label="Beschreibung (optional)" value={description} maxLength={LIMITS.description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-muted">
            <Palette className="size-4" aria-hidden /> Fachfarbe
          </p>
          <ColorPicker value={color} onChange={setColor} label="Fachfarbe" />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Moduldetail
// ---------------------------------------------------------------------

export function ModuleDetail({ id, me }: { id: string; me: Member }) {
  const mod = useData((s) => s.modules[id]);
  const topicsMap = useData((s) => s.module_topics);
  const examsMap = useData((s) => s.exams);
  const completions = useData((s) => s.task_completions);
  const views = useTaskViews();
  const members = useActiveMembers();
  const openEditor = useUI((s) => s.openEntryEditor);
  const now = useNow(60_000);
  const [editing, setEditing] = useState(false);
  const [newTopic, setNewTopic] = useState('');

  const topics = useMemo(
    () => Object.values(topicsMap).filter((t) => t.module_id === id && !t.archived_at).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [topicsMap, id],
  );
  const own = useMemo(() => views.filter((v) => v.module.id === id), [views, id]);
  const byTopic = useMemo(() => groupBy(own, (v) => v.entry.topic_id ?? ''), [own]);
  const exams = useMemo(() => Object.values(examsMap).filter((e) => e.module_id === id && !e.deleted_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [examsMap, id]);
  const allEntries = useData((s) => s.study_entries);
  const hasLooseEntries = useMemo(() => Object.values(allEntries).some((e) => e.module_id === id && !e.deleted_at && !e.topic_id), [allEntries, id]);

  if (!mod) {
    return (
      <Card>
        <EmptyState icon={<BookOpen className="size-6" />} title="Modul nicht gefunden" action={<Link to="/faecher" className="text-sm font-medium text-accent">Zur Übersicht</Link>} />
      </Card>
    );
  }

  const group = groupRatio(own, members.map((m) => m.id), completions);
  const nextExam = upcomingExams(exams, now)[0] ?? exams[exams.length - 1];
  const move = (index: number, dir: -1 | 1) => {
    const ids = topics.map((t) => t.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void reorderTopics(ids);
  };

  return (
    <div>
      <button type="button" onClick={() => navigate('/faecher')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Fächer
      </button>
      <div
        className="glass relative mb-5 overflow-hidden rounded-[28px] p-5 md:p-7"
        style={{ background: `linear-gradient(140deg, color-mix(in srgb, ${mod.color} 34%, var(--ss-glass)) 0%, var(--ss-glass) 70%)` }}
      >
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Prüfungsmodul</p>
            <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight md:text-[32px]">{mod.name}</h1>
            {mod.description && <p className="mt-2 max-w-2xl text-sm text-muted">{mod.description}</p>}
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="size-4" aria-hidden />
                {nextExam
                  ? `${formatInstant(nextExam.starts_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, nextExam.timezone)} · ${formatTime(nextExam.starts_at, nextExam.timezone)}–${formatTime(nextExam.ends_at, nextExam.timezone)} Uhr`
                  : 'Kein Prüfungstermin'}
              </span>
              <Link to="/pruefungen" className="font-medium text-accent">
                Prüfungen verwalten
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
            <Menu
              items={[
                { label: 'Lerntag planen', icon: <CalendarPlus />, onSelect: () => openEditor({ moduleId: mod.id }) },
                {
                  label: 'Modul archivieren',
                  icon: <Archive />,
                  danger: true,
                  onSelect: async () => {
                    if (await archiveModule(mod.id)) navigate('/faecher');
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Themenbereiche</h2>
            <Button size="sm" icon={<CalendarPlus className="size-4" />} onClick={() => openEditor({ moduleId: mod.id })}>
              Lerntag
            </Button>
          </div>
          {topics.map((t, i) => (
            <TopicSection
              key={t.id}
              topic={t}
              views={byTopic.get(t.id) ?? []}
              me={me}
              members={members}
              color={mod.color}
              onUp={i > 0 ? () => move(i, -1) : undefined}
              onDown={i < topics.length - 1 ? () => move(i, 1) : undefined}
            />
          ))}
          {(byTopic.get('')?.length ?? 0) > 0 || hasLooseEntries ? (
            <TopicSection topic={null} moduleId={mod.id} views={byTopic.get('') ?? []} me={me} members={members} color={mod.color} />
          ) : null}
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTopic.trim()) return;
              if (await createTopic(mod.id, newTopic)) setNewTopic('');
            }}
          >
            <input className="field" placeholder="Neuen Themenbereich hinzufügen" aria-label="Neuer Themenbereich" maxLength={LIMITS.topicTitle} value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <Button type="submit" icon={<Plus className="size-4" />}>
              Thema
            </Button>
          </form>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <Card className="p-5">
            <CardHeader title="Fortschritt aller Personen" subtitle={group.pct === null ? 'Noch keine Aufgaben' : `Gruppe: ${group.pct}%`} icon={<Layers />} />
            <div className="mt-3 flex flex-col gap-1">
              {members.map((m) => (
                <MemberProgress key={m.id} member={m} ratio={memberRatio(own, m.id, completions)} forceStyle="bar" highlight={m.id === me.id} onClick={() => navigate(`/team/${m.id}`)} />
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Lernmaterialien" icon={<BookOpen />} />
            <div className="mt-3">
              <FileDrop target={{ module_id: mod.id, target_type: 'module', target_id: mod.id }} />
              <AttachmentList targetType="module" targetId={mod.id} />
            </div>
          </Card>
        </div>
      </div>
      <ModuleEditor value={editing ? mod : null} onClose={() => setEditing(false)} />
    </div>
  );
}

function TopicSection({
  topic, moduleId, views, me, members, color, onUp, onDown,
}: {
  topic: Topic | null;
  moduleId?: string;
  views: TaskView[];
  me: Member;
  members: Member[];
  color: string;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(topic?.title ?? '');
  const completions = useData((s) => s.task_completions);
  const entriesMap = useData((s) => s.study_entries);
  const openEditor = useUI((s) => s.openEntryEditor);
  const mine = memberRatio(views, me.id, completions);
  const group = groupRatio(views, members.map((m) => m.id), completions);
  const modId = topic?.module_id ?? moduleId!;
  const entries = useMemo(
    () =>
      Object.values(entriesMap)
        .filter((e) => !e.deleted_at && e.module_id === modId && (topic ? e.topic_id === topic.id : !e.topic_id))
        .sort((a, b) => a.study_date.localeCompare(b.study_date)),
    [entriesMap, modId, topic],
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 p-3 pl-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown className={`size-5 shrink-0 text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
          <span className="min-w-0 flex-1">
            {renaming && topic ? (
              <input
                className="field !min-h-9 !py-1.5"
                value={title}
                autoFocus
                maxLength={LIMITS.topicTitle}
                aria-label="Thema umbenennen"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  setRenaming(false);
                  if (title.trim() && title.trim() !== topic.title) void updateTopic(topic.id, { title: title.trim() }, topic.version);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setTitle(topic.title);
                    setRenaming(false);
                  }
                }}
              />
            ) : (
              <span className="block truncate font-semibold">{topic?.title ?? 'Ohne Themenbereich'}</span>
            )}
            <span className="num mt-0.5 block text-xs text-muted">
              {entries.length} Lerntage · {views.length} Aufgaben · Du {mine.pct ?? '–'}% · Gruppe {group.pct ?? '–'}%
            </span>
          </span>
        </button>
        <div className="hidden w-24 sm:block">
          <ProgressBar ratio={group} color={color} height={5} label="Gruppenfortschritt Thema" />
        </div>
        {topic && (
          <Menu
            items={[
              { label: 'Lerntag planen', icon: <CalendarPlus />, onSelect: () => openEditor({ moduleId: modId, topicId: topic.id }) },
              { label: 'Umbenennen', icon: <Pencil />, onSelect: () => setRenaming(true) },
              { label: 'Nach oben', icon: <ArrowUp />, onSelect: () => onUp?.(), hidden: !onUp },
              { label: 'Nach unten', icon: <ArrowDown />, onSelect: () => onDown?.(), hidden: !onDown },
              { label: 'Archivieren', icon: <Archive />, danger: true, onSelect: () => void archiveTopic(topic.id) },
            ]}
          />
        )}
        {topic && onUp && (
          <IconButton label="Thema nach oben" size="sm" className="hidden md:inline-flex" onClick={onUp}>
            <ArrowUp className="size-4" />
          </IconButton>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="flex flex-col gap-3 border-t border-line p-3 md:p-4">
              {entries.length === 0 ? (
                <p className="px-1 text-sm text-muted">Noch keine Lerntage zu diesem Thema.</p>
              ) : (
                entries.map((e) => <EntryCard key={e.id} entry={e} views={views} member={me} members={members} showDate />)
              )}
              {topic && <AttachmentList targetType="topic" targetId={topic.id} />}
              <Button size="sm" variant="ghost" className="self-start" icon={<Plus className="size-4" />} onClick={() => openEditor({ moduleId: modId, topicId: topic?.id ?? null })}>
                Lerntag zu diesem Thema
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
