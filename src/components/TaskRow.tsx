import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PresenceDiv } from './ui/PresenceDiv';
import { Check, Circle, MoveRight, Paperclip, Pencil, Trash2, Users } from 'lucide-react';
import type { Member, Task } from '../lib/types';
import { completionKey } from '../lib/types';
import { LIMITS } from '../lib/config';
import { taskGroupStatus } from '../lib/progress';
import { useData } from '../store/data';
import { deleteTask, setCompletion, updateTask } from '../store/actions';
import { useUI } from '../store/ui';
import { TaskCheckbox } from './ui/TaskCheckbox';
import { Menu } from './ui/Menu';
import { Avatar } from './ui/Avatar';

interface Props {
  task: Task;
  member: Member;
  members: Member[];
  showGroup?: boolean;
  dense?: boolean;
  subtitle?: string;
  readOnly?: boolean;
}

/** Eine Aufgabe mit dem Haken der aktiven Person und dem Gruppenstatus. */
export const TaskRow = memo(function TaskRow({ task, member, members, showGroup = true, dense, subtitle, readOnly }: Props) {
  const completions = useData((s) => s.task_completions);
  const attachmentCount = useData((s) => {
    let n = 0;
    for (const a of Object.values(s.attachments)) if (!a.deleted_at && a.target_type === 'task' && a.target_id === task.id) n++;
    return n;
  });
  const checked = completions[completionKey(task.id, member.id)]?.is_completed === true;
  const status = taskGroupStatus(task.id, members.map((m) => m.id), completions);
  const [editing, setEditing] = useState(false);
  const setUI = useUI((s) => s.set);

  return (
    <li className={`group/task relative flex items-start gap-3 rounded-2xl ${dense ? 'px-2 py-2' : 'px-2.5 py-2.5'} transition-colors hover:bg-surface-2/70`}>
      <div className="pt-[1px]">
        <TaskCheckbox
          checked={checked}
          color={member.color}
          label={`${task.title} – ${checked ? 'erledigt' : 'offen'} für ${member.name}`}
          onChange={(next) => void setCompletion(task.id, member.id, next)}
          disabled={readOnly}
        />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <InlineEdit
            initial={task.title}
            onCancel={() => setEditing(false)}
            onSave={async (title) => {
              setEditing(false);
              if (title !== task.title) await updateTask(task.id, { title }, task.version);
            }}
          />
        ) : (
          <motion.p
            className="text-[15px] leading-snug"
            animate={{ opacity: checked ? 0.5 : 1 }}
            transition={{ duration: 0.3 }}
            onDoubleClick={() => !readOnly && setEditing(true)}
            // Echtes Durchstreichen folgt jeder Zeile (auch bei Umbrüchen) und blendet weich ein
            style={{
              textDecorationLine: 'line-through',
              textDecorationThickness: '1.5px',
              textDecorationColor: checked ? 'currentColor' : 'transparent',
              transition: 'text-decoration-color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {task.title}
          </motion.p>
        )}
        {(subtitle || attachmentCount > 0) && !editing && (
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            {subtitle}
            {attachmentCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="size-3" aria-hidden />
                {attachmentCount}
              </span>
            )}
          </p>
        )}
      </div>
      {showGroup && members.length > 1 && <GroupStatus doneIds={status.doneMembers} members={members} allDone={status.allDone} />}
      {!readOnly && (
        <div className="-my-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/task:opacity-100 md:focus-within:opacity-100">
          <Menu
            items={[
              { label: 'Umbenennen', icon: <Pencil />, onSelect: () => setEditing(true) },
              { label: 'Verschieben …', icon: <MoveRight />, onSelect: () => setUI({ moveTaskId: task.id }) },
              { label: 'In den Papierkorb', icon: <Trash2 />, danger: true, onSelect: () => void deleteTask(task.id) },
            ]}
          />
        </div>
      )}
    </li>
  );
});

function InlineEdit({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => (value.trim() ? onSave(value.trim()) : onCancel());
  return (
    <input
      ref={ref}
      className="field !min-h-9 !py-1.5"
      value={value}
      maxLength={LIMITS.taskTitle}
      aria-label="Aufgabentitel"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/** „3 von 4 fertig“ mit aufklappbarer Liste, wer schon fertig ist. */
function GroupStatus({ doneIds, members, allDone }: { doneIds: string[]; members: Member[]; allDone: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const done = new Set(doneIds);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${doneIds.length} von ${members.length} Personen fertig – Details anzeigen`}
        className={`flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors ${
          allDone ? 'bg-[color-mix(in_srgb,var(--ss-success)_16%,transparent)] text-success' : 'text-muted hover:bg-surface-2'
        }`}
      >
        <span className="flex -space-x-1" aria-hidden>
          {members.slice(0, 5).map((m) => (
            <span
              key={m.id}
              className="size-2.5 rounded-full ring-2 ring-[var(--ss-card)]"
              style={{ background: done.has(m.id) ? m.color : 'var(--ss-track)' }}
            />
          ))}
        </span>
        <span className="num">
          {doneIds.length}/{members.length}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <PresenceDiv
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16 }}
            className="glass glass-strong absolute right-0 top-9 z-40 w-56 rounded-2xl p-2"
          >
            <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-xs font-semibold text-muted">
              <Users className="size-3.5" aria-hidden />
              {doneIds.length} von {members.length} Personen fertig
            </p>
            <ul>
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm">
                  <Avatar name={m.name} color={m.color} size={22} />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {done.has(m.id) ? (
                    <Check className="size-4 text-success" aria-label="erledigt" />
                  ) : (
                    <Circle className="size-4 text-faint" aria-label="offen" />
                  )}
                </li>
              ))}
            </ul>
          </PresenceDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
