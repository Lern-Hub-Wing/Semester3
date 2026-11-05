import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Plus, Trash2, X } from 'lucide-react';
import { LIMITS } from '../lib/config';
import { checkFile, formatBytes } from '../lib/files';
import { isValidISODate, todayISO } from '../lib/time';
import { uuid } from '../lib/uuid';
import { useData } from '../store/data';
import { useModules } from '../store/derived';
import { createEntry, createTopic, deleteEntry, saveEntry, uploadFile, type TaskDraft } from '../store/actions';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';
import { Modal } from './ui/Modal';
import { Skeleton } from './ui/Skeleton';
import { Button, IconButton } from './ui/Button';
import { TextArea, TextField, FieldWrap } from './ui/Field';
import { FileDrop, AttachmentList } from './Attachments';

interface DraftTask extends TaskDraft {
  key: string;
}

const LAST_MODULE = 'studyspace.lastModule';
const NEW_TOPIC = '__new__';

/** Dialog zum Anlegen und Bearbeiten eines Lerntags mit Unteraufgaben. */
export function EntryEditor() {
  const { open, session, entryId, date, moduleId, topicId } = useUI((s) => s.entryEditor);
  const close = useUI((s) => s.closeEntryEditor);
  const entry = useData((s) => (entryId ? s.study_entries[entryId] : undefined));
  const allTasks = useData((s) => s.tasks);
  const topicsMap = useData((s) => s.module_topics);
  const modules = useModules();

  const [form, setForm] = useState(() => emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  /** Aufgaben, die in diesem Editor ausdrücklich entfernt wurden (nur diese gehen in den Papierkorb) */
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  /** true, sobald die Aufgabenliste im Editor bearbeitet wurde */
  const [tasksTouched, setTasksTouched] = useState(false);
  const [initSession, setInitSession] = useState<number | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);

  const liveTasks = useMemo(
    () =>
      entryId
        ? Object.values(allTasks)
            .filter((t) => t.study_entry_id === entryId && !t.deleted_at)
            .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
        : [],
    [allTasks, entryId],
  );
  const toDrafts = (list: typeof liveTasks): DraftTask[] => (list.length ? list.map((t) => ({ key: t.id, id: t.id, title: t.title })) : [blankTask()]);

  // Formular SOFORT beim Öffnen befüllen (während des Renderns, nicht erst in einem
  // Effekt). So ist nie ein veralteter oder leerer Formularstand sichtbar, der
  // versehentlich gespeichert werden könnte.
  if (open && initSession !== session && (!entryId || entry)) {
    setInitSession(session);
    setErrors({});
    setFiles([]);
    setRemovedIds([]);
    setTasksTouched(false);
    if (entry) {
      setBaseVersion(entry.version);
      setForm({
        study_date: entry.study_date,
        module_id: entry.module_id,
        topic_id: entry.topic_id ?? '',
        newTopic: '',
        title: entry.title,
        description: entry.description ?? '',
        tasks: toDrafts(liveTasks),
      });
    } else {
      let last = '';
      try {
        last = localStorage.getItem(LAST_MODULE) ?? '';
      } catch {
        /* egal */
      }
      const mod = moduleId ?? (modules.some((m) => m.id === last) ? last : modules[0]?.id ?? '');
      setForm({ ...emptyForm(), study_date: date ?? todayISO(), module_id: mod, topic_id: topicId ?? '' });
    }
  }

  const ready = initSession === session;

  // Kommen Aufgaben hinzu (z. B. von einem anderen Gerät), solange die Liste
  // hier noch unverändert ist, werden sie übernommen.
  const formIds = form.tasks.map((t) => t.id ?? '').join(',');
  const liveIds = liveTasks.map((t) => t.id).join(',');
  if (open && entry && initSession === session && !tasksTouched && formIds !== liveIds && !(liveTasks.length === 0 && formIds === '')) {
    setForm((f) => ({ ...f, tasks: toDrafts(liveTasks) }));
  }

  const topics = useMemo(
    () => Object.values(topicsMap).filter((t) => t.module_id === form.module_id && !t.archived_at).sort((a, b) => a.sort_order - b.sort_order),
    [topicsMap, form.module_id],
  );

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTasks = (tasks: DraftTask[]) => {
    setTasksTouched(true);
    set('tasks', tasks);
  };
  const setTask = (key: string, title: string) => setTasks(form.tasks.map((t) => (t.key === key ? { ...t, title } : t)));
  const moveTask = (index: number, dir: -1 | 1) => {
    const next = [...form.tasks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTasks(next);
  };
  const removeTask = (task: DraftTask) => {
    if (task.id) setRemovedIds((ids) => [...ids, task.id!]);
    const rest = form.tasks.filter((x) => x.key !== task.key);
    setTasks(rest.length ? rest : [blankTask()]);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isValidISODate(form.study_date)) e.study_date = 'Bitte ein gültiges Datum wählen.';
    if (!form.module_id) e.module_id = 'Bitte ein Modul wählen.';
    if (!form.title.trim()) e.title = 'Bitte einen Titel eingeben.';
    if (form.topic_id === NEW_TOPIC && !form.newTopic.trim()) e.newTopic = 'Bitte einen Namen für das neue Thema eingeben.';
    if (form.tasks.some((t) => t.title.length > LIMITS.taskTitle)) e.tasks = `Aufgaben dürfen höchstens ${LIMITS.taskTitle} Zeichen lang sein.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!ready || !validate()) return;
    setSaving(true);
    try {
      let topic: string | null = form.topic_id || null;
      if (form.topic_id === NEW_TOPIC) {
        topic = await createTopic(form.module_id, form.newTopic);
        if (!topic) return;
      }
      try {
        localStorage.setItem(LAST_MODULE, form.module_id);
      } catch {
        /* egal */
      }
      const draft = {
        module_id: form.module_id,
        topic_id: topic,
        study_date: form.study_date,
        title: form.title,
        description: form.description,
        tasks: form.tasks.map(({ id, title }) => ({ id, title })),
        removedTaskIds: removedIds,
      };
      let id: string | null = entryId ?? null;
      if (entry) {
        if (!(await saveEntry(entry.id, draft, baseVersion))) return;
      } else {
        id = await createEntry(draft);
        if (!id) return;
      }
      for (const f of files) await uploadFile(f, { module_id: form.module_id, target_type: 'study_entry', target_id: id! });
      close();
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of list) {
      const c = checkFile(f);
      if (c.ok) ok.push(f);
      else toast.error(c.reason);
    }
    setFiles((prev) => [...prev, ...ok]);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={entry ? 'Lerntag bearbeiten' : 'Neuer Lerntag'}
      description={entry ? 'Änderungen behalten alle bisherigen Haken.' : 'Plane ein Thema mit Unteraufgaben für einen Tag.'}
      wide
      footer={
        <>
          {entry && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              className="mr-auto"
              onClick={() => {
                void deleteEntry(entry.id);
                close();
              }}
            >
              Papierkorb
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={saving} disabled={!ready} onClick={() => void submit()}>
            {entry ? 'Speichern' : 'Lerntag speichern'}
          </Button>
        </>
      }
    >
      {!ready ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Lerntag wird geladen">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-24" />
        </div>
      ) : (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <TextField label="Datum" type="date" value={form.study_date} onChange={(e) => set('study_date', e.target.value)} error={errors.study_date} required />
          <FieldWrap label="Prüfungsmodul" error={errors.module_id}>
            {() => (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Prüfungsmodul">
                {modules.map((m) => {
                  const active = m.id === form.module_id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setForm((f) => ({ ...f, module_id: m.id, topic_id: '' }))}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all"
                      style={{
                        borderColor: active ? m.color : 'var(--ss-line)',
                        background: active ? `color-mix(in srgb, ${m.color} 32%, transparent)` : 'transparent',
                      }}
                    >
                      <span className="size-2 rounded-full" style={{ background: m.color }} aria-hidden />
                      {m.name}
                    </button>
                  );
                })}
              </div>
            )}
          </FieldWrap>
        </div>

        <FieldWrap label="Themenbereich (optional)">
          {(id) => (
            <div className="flex flex-col gap-2">
              <select id={id} className="field" value={form.topic_id} onChange={(e) => set('topic_id', e.target.value)}>
                <option value="">Ohne Themenbereich</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
                <option value={NEW_TOPIC}>+ Neues Thema anlegen …</option>
              </select>
              {form.topic_id === NEW_TOPIC && (
                <input
                  className="field"
                  placeholder="Name des neuen Themas"
                  value={form.newTopic}
                  maxLength={LIMITS.topicTitle}
                  aria-invalid={!!errors.newTopic}
                  aria-label="Name des neuen Themas"
                  onChange={(e) => set('newTopic', e.target.value)}
                />
              )}
              {errors.newTopic && <p className="text-xs text-danger">{errors.newTopic}</p>}
            </div>
          )}
        </FieldWrap>

        <TextField
          label="Titel"
          data-autofocus
          placeholder="z. B. Kostenstellenrechnung"
          value={form.title}
          maxLength={LIMITS.entryTitle}
          showCount
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
          required
        />
        <TextArea label="Beschreibung (optional)" value={form.description} maxLength={LIMITS.entryDescription} onChange={(e) => set('description', e.target.value)} rows={2} />

        <FieldWrap label="Unteraufgaben" error={errors.tasks} hint={entry ? 'Umbenennen und Umsortieren behält alle Haken.' : undefined}>
          {() => (
            <ol className="flex flex-col gap-2">
              {form.tasks.map((t, i) => (
                <li key={t.key} className="flex items-center gap-1.5">
                  <span className="num w-6 shrink-0 text-center text-xs text-faint">{i + 1}.</span>
                  <input
                    className="field !min-h-10 !py-2"
                    value={t.title}
                    placeholder={i === 0 ? 'z. B. Anbauverfahren verstehen' : 'Weitere Aufgabe'}
                    maxLength={LIMITS.taskTitle}
                    aria-label={`Aufgabe ${i + 1}`}
                    onChange={(e) => setTask(t.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (i === form.tasks.length - 1 && t.title.trim()) setTasks([...form.tasks, blankTask()]);
                        setTimeout(() => {
                          const inputs = (e.target as HTMLElement).closest('ol')?.querySelectorAll('input');
                          inputs?.[i + 1]?.focus();
                        }, 0);
                      }
                    }}
                  />
                  <IconButton label="Nach oben" size="sm" disabled={i === 0} onClick={() => moveTask(i, -1)}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton label="Nach unten" size="sm" disabled={i === form.tasks.length - 1} onClick={() => moveTask(i, 1)}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Aufgabe entfernen"
                    size="sm"
                    onClick={() => removeTask(t)}
                  >
                    <X className="size-4" />
                  </IconButton>
                </li>
              ))}
              <li>
                <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setTasks([...form.tasks, blankTask()])}>
                  Aufgabe hinzufügen
                </Button>
              </li>
            </ol>
          )}
        </FieldWrap>

        <FieldWrap label="Dateien (optional)">
          {() =>
            entry ? (
              <div>
                <FileDrop target={{ module_id: form.module_id, target_type: 'study_entry', target_id: entry.id }} />
                <AttachmentList targetType="study_entry" targetId={entry.id} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-4 text-sm font-medium text-muted hover:bg-surface-2/50">
                  <Plus className="size-4" aria-hidden />
                  Dateien auswählen (werden nach dem Speichern hochgeladen)
                  <input type="file" className="sr-only" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
                </label>
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                    <FileText className="size-4 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                    <IconButton label="Datei entfernen" size="sm" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </IconButton>
                  </div>
                ))}
              </div>
            )
          }
        </FieldWrap>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
      )}
    </Modal>
  );
}

interface Form {
  study_date: string;
  module_id: string;
  topic_id: string;
  newTopic: string;
  title: string;
  description: string;
  tasks: DraftTask[];
}

function blankTask(): DraftTask {
  return { key: uuid(), title: '' };
}

function emptyForm(): Form {
  return { study_date: todayISO(), module_id: '', topic_id: '', newTopic: '', title: '', description: '', tasks: [blankTask()] };
}
