import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { addDaysISO, formatISODate, isValidISODate } from '../lib/time';
import { useData } from '../store/data';
import { createEntry, moveTask } from '../store/actions';
import { useUI } from '../store/ui';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { TextField } from './ui/Field';
import { ModuleChip } from './ui/Card';

/**
 * Verschiebt eine Aufgabe an einen anderen Lerntag (anderes Datum oder
 * anderes Thema). Die Aufgabe behält ihre ID – alle Haken bleiben.
 */
export function MoveTaskDialog() {
  const taskId = useUI((s) => s.moveTaskId);
  const setUI = useUI((s) => s.set);
  const task = useData((s) => (taskId ? s.tasks[taskId] : undefined));
  const entries = useData((s) => s.study_entries);
  const modules = useData((s) => s.modules);
  const topics = useData((s) => s.module_topics);
  const source = task ? entries[task.study_entry_id] : undefined;
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  // Vorschlag „nächster Tag“ sofort beim Öffnen setzen (nicht erst nach dem Rendern)
  const [initFor, setInitFor] = useState<string | null>(null);
  if ((taskId ?? null) !== initFor) {
    setInitFor(taskId ?? null);
    if (source) setDate(addDaysISO(source.study_date, 1));
  }

  const targets = useMemo(
    () =>
      Object.values(entries)
        .filter((e) => !e.deleted_at && e.study_date === date && e.id !== source?.id && !modules[e.module_id]?.archived_at)
        .sort((a, b) => a.sort_order - b.sort_order),
    [entries, date, source?.id, modules],
  );

  const close = () => setUI({ moveTaskId: null });

  const moveTo = async (entryId: string) => {
    if (!task) return;
    setBusy(true);
    const ok = await moveTask(task.id, entryId);
    setBusy(false);
    if (ok) close();
  };

  const moveToNewDay = async () => {
    if (!task || !source || !isValidISODate(date)) return;
    setBusy(true);
    const id = await createEntry({
      module_id: source.module_id,
      topic_id: source.topic_id,
      study_date: date,
      title: source.title,
      description: null,
      tasks: [],
    });
    if (id) await moveTo(id);
    setBusy(false);
  };

  return (
    <Modal open={!!task} onClose={close} title="Aufgabe verschieben" description={task ? `„${task.title}“ – alle Haken bleiben erhalten.` : undefined}>
      <div className="flex flex-col gap-4">
        <TextField label="Zieldatum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">
            Lerntage am {isValidISODate(date) ? formatISODate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}
          </p>
          {targets.length === 0 ? (
            <p className="rounded-2xl bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] px-4 py-3 text-sm text-muted">An diesem Tag ist noch nichts geplant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {targets.map((e) => {
                const m = modules[e.module_id];
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moveTo(e.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.title}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {m && <ModuleChip name={m.name} color={m.color} small />}
                          {e.topic_id && topics[e.topic_id] && <span className="truncate text-xs text-muted">{topics[e.topic_id].title}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {source && (
          <Button icon={<CalendarPlus className="size-4" />} loading={busy} onClick={() => void moveToNewDay()} disabled={!isValidISODate(date)}>
            Neuen Lerntag „{source.title}“ an diesem Datum anlegen
          </Button>
        )}
      </div>
    </Modal>
  );
}
