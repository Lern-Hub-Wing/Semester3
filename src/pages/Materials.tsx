import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { formatISODate } from '../lib/time';
import { isImage } from '../lib/files';
import { useData } from '../store/data';
import { useModules } from '../store/derived';
import type { UploadTarget } from '../store/actions';
import { PageHeader } from '../components/layout/AppShell';
import { AttachmentCard, FileDrop } from '../components/Attachments';
import { Card } from '../components/ui/Card';
import { SelectField } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState } from '../components/ui/EmptyState';

/** Gemeinsame Lernmaterialsammlung. */
export function Materials() {
  const modules = useModules();
  const topicsMap = useData((s) => s.module_topics);
  const entriesMap = useData((s) => s.study_entries);
  const tasksMap = useData((s) => s.tasks);
  const attachments = useData((s) => s.attachments);

  const [moduleId, setModuleId] = useState(modules[0]?.id ?? '');
  const [topicId, setTopicId] = useState('');
  const [entryId, setEntryId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [type, setType] = useState<'alle' | 'pdf' | 'bild'>('alle');
  const [q, setQ] = useState('');

  const topics = useMemo(() => Object.values(topicsMap).filter((t) => t.module_id === moduleId && !t.archived_at).sort((a, b) => a.sort_order - b.sort_order), [topicsMap, moduleId]);
  const entries = useMemo(
    () =>
      Object.values(entriesMap)
        .filter((e) => e.module_id === moduleId && !e.deleted_at && (!topicId || e.topic_id === topicId))
        .sort((a, b) => a.study_date.localeCompare(b.study_date)),
    [entriesMap, moduleId, topicId],
  );
  const tasks = useMemo(() => Object.values(tasksMap).filter((t) => t.study_entry_id === entryId && !t.deleted_at).sort((a, b) => a.sort_order - b.sort_order), [tasksMap, entryId]);

  const target: UploadTarget | null = !moduleId
    ? null
    : taskId
      ? { module_id: moduleId, target_type: 'task', target_id: taskId }
      : entryId
        ? { module_id: moduleId, target_type: 'study_entry', target_id: entryId }
        : topicId
          ? { module_id: moduleId, target_type: 'topic', target_id: topicId }
          : { module_id: moduleId, target_type: 'module', target_id: moduleId };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return Object.values(attachments)
      .filter((a) => !a.deleted_at)
      .filter((a) => !filterModule || a.module_id === filterModule)
      .filter((a) => type === 'alle' || (type === 'pdf' ? !isImage(a.mime_type) : isImage(a.mime_type)))
      .filter((a) => !term || a.original_filename.toLowerCase().includes(term))
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }, [attachments, filterModule, type, q]);

  return (
    <div>
      <PageHeader title="Materialien" subtitle="Lernzettel, Bilder und PDFs – für alle verfügbar." />

      <Card className="mb-6 p-4 md:p-5">
        <h2 className="mb-3 text-[15px] font-semibold">Datei hinzufügen</h2>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Modul"
            value={moduleId}
            onChange={(e) => {
              setModuleId(e.target.value);
              setTopicId('');
              setEntryId('');
              setTaskId('');
            }}
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Themenbereich (optional)"
            value={topicId}
            onChange={(e) => {
              setTopicId(e.target.value);
              setEntryId('');
              setTaskId('');
            }}
          >
            <option value="">—</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Lerntag (optional)"
            value={entryId}
            onChange={(e) => {
              setEntryId(e.target.value);
              setTaskId('');
            }}
          >
            <option value="">—</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {formatISODate(e.study_date, { day: '2-digit', month: '2-digit' })} · {e.title}
              </option>
            ))}
          </SelectField>
          <SelectField label="Aufgabe (optional)" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!entryId}>
            <option value="">—</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </SelectField>
        </div>
        <FileDrop target={target} disabled={!target} />
        <p className="mt-3 text-xs text-faint">
          Hinweis: Dateien sind für alle mit dem Link abrufbar. Bitte keine vertraulichen oder personenbezogenen Dokumente hochladen.
        </p>
      </Card>

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <Segmented
          size="sm"
          label="Dateityp"
          value={type}
          onChange={setType}
          options={[
            { value: 'alle', label: 'Alle' },
            { value: 'pdf', label: 'PDF' },
            { value: 'bild', label: 'Bilder' },
          ]}
        />
        <select aria-label="Nach Modul filtern" className="field !h-9 !min-h-9 !rounded-xl !py-0 text-[13px] md:!w-auto" value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
          <option value="">Alle Module</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input className="field !h-9 !min-h-9 !rounded-xl !py-0 text-[13px] md:ml-auto md:!w-64" placeholder="Dateiname suchen" aria-label="Dateiname suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText className="size-6" />} title="Noch keine Materialien" text="Lade Lernzettel, Mitschriften oder Übungsblätter hoch – sie sind sofort für alle sichtbar." />
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          {list.map((a) => (
            <li key={a.id}>
              <AttachmentCard attachment={a} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
