import { useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Member, StudyEntry } from '../lib/types';
import { LIMITS } from '../lib/config';
import { groupRatio, memberRatio, type TaskView } from '../lib/progress';
import { formatISODate } from '../lib/time';
import { useData } from '../store/data';
import { addTask, deleteEntry } from '../store/actions';
import { useUI } from '../store/ui';
import { TaskRow } from './TaskRow';
import { Menu } from './ui/Menu';
import { ModuleChip } from './ui/Card';
import { ProgressBar } from './ui/Progress';
import { AttachmentList } from './Attachments';

interface Props {
  entry: StudyEntry;
  views: TaskView[];
  member: Member;
  members: Member[];
  showDate?: boolean;
  defaultCollapsed?: boolean;
}

/** Lerntag mit Aufgaben, Fortschritt und Anhängen. */
export function EntryCard({ entry, views, member, members, showDate }: Props) {
  const module = useData((s) => s.modules[entry.module_id]);
  const topic = useData((s) => (entry.topic_id ? s.module_topics[entry.topic_id] : undefined));
  const completions = useData((s) => s.task_completions);
  const openEditor = useUI((s) => s.openEntryEditor);
  const [adding, setAdding] = useState('');

  const own = useMemo(() => views.filter((v) => v.entry.id === entry.id), [views, entry.id]);
  const mine = memberRatio(own, member.id, completions);
  const group = groupRatio(own, members.map((m) => m.id), completions);
  const color = module?.color ?? '#AFC5F5';

  return (
    <article className="card relative overflow-hidden rounded-[var(--radius-card)]">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="p-4 pl-5 md:p-5 md:pl-6">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {module && <ModuleChip name={module.name} color={color} small />}
              {topic && <span className="truncate text-xs text-muted">· {topic.title}</span>}
            </div>
            <h3 className="mt-1.5 text-[16px] font-semibold leading-snug tracking-tight">{entry.title}</h3>
            {showDate && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <CalendarDays className="size-3.5" aria-hidden />
                {formatISODate(entry.study_date, { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            )}
            {entry.description && <p className="mt-1.5 whitespace-pre-line text-sm text-muted">{entry.description}</p>}
          </div>
          <Menu
            items={[
              { label: 'Bearbeiten', icon: <Pencil />, onSelect: () => openEditor({ entryId: entry.id }) },
              { label: 'In den Papierkorb', icon: <Trash2 />, danger: true, onSelect: () => void deleteEntry(entry.id) },
            ]}
          />
        </header>

        {own.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted">
            <div>
              <div className="mb-1 flex justify-between">
                <span>Du</span>
                <span className="num font-semibold text-ink">{mine.pct}%</span>
              </div>
              <ProgressBar ratio={mine} color={member.color} height={5} label="Dein Fortschritt an diesem Lerntag" />
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span>Gruppe</span>
                <span className="num font-semibold text-ink">{group.pct}%</span>
              </div>
              <ProgressBar ratio={group} color={color} height={5} label="Gruppenfortschritt an diesem Lerntag" />
            </div>
          </div>
        )}

        <ul className="-mx-2 mt-2">
          {own.map((v) => (
            <TaskRow key={v.task.id} task={v.task} member={member} members={members} />
          ))}
        </ul>

        <form
          className="mt-1 flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const title = adding.trim();
            if (!title) return;
            setAdding('');
            await addTask(entry.id, title);
          }}
        >
          <Plus className="ml-1 size-4 shrink-0 text-faint" aria-hidden />
          <input
            className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-1 text-sm outline-none placeholder:text-faint focus:bg-surface-2/60"
            placeholder="Aufgabe hinzufügen"
            aria-label={`Aufgabe zu „${entry.title}“ hinzufügen`}
            value={adding}
            maxLength={LIMITS.taskTitle}
            onChange={(e) => setAdding(e.target.value)}
          />
        </form>

        <AttachmentList targetType="study_entry" targetId={entry.id} compact />
      </div>
    </article>
  );
}
