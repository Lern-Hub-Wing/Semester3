import { useMemo } from 'react';
import { Archive, BookOpen, CalendarDays, FileText, GraduationCap, Layers, ListChecks, NotebookPen, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatISODate, formatInstant } from '../lib/time';
import { useData } from '../store/data';
import { restoreAttachment, restoreEntry, restoreExam, restoreModule, restoreTask, restoreTopic } from '../store/actions';
import { useHomework, updateHomework } from '../store/homework';
import { useTrashItems, type TrashKind } from '../store/trash';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

interface Item {
  id: string;
  kind: TrashKind;
  icon: ReactNode;
  title: string;
  meta: string;
  at: string;
  restore: () => Promise<boolean>;
}

const ICONS: Record<TrashKind, ReactNode> = {
  Hausaufgabe: <NotebookPen />,
  Aufgabe: <ListChecks />,
  Lerntag: <CalendarDays />,
  Datei: <FileText />,
  Prüfung: <GraduationCap />,
  Thema: <Layers />,
  Modul: <BookOpen />,
};

/** Papierkorb: Nichts wird sofort endgültig gelöscht. Wiederherstellen behält alle Haken. */
export function Trash() {
  const d = useData();
  const homework = useHomework((s) => s.homework);
  // Gleiche Quelle wie der Zähler im Menü (store/trash.ts)
  const trash = useTrashItems();
  const items = useMemo<Item[]>(
    () =>
      trash.map((t) => {
        const base = { id: t.id, kind: t.kind, icon: ICONS[t.kind], title: t.title, at: t.at };
        switch (t.kind) {
          case 'Hausaufgabe': {
            const h = homework[t.id];
            return { ...base, meta: `${d.modules[h.module_id]?.name ?? ''} · Abgabe ${formatISODate(h.due_date, { day: 'numeric', month: 'short' })}`, restore: () => updateHomework(h.id, { deleted_at: null }) };
          }
          case 'Aufgabe': {
            const e = d.study_entries[d.tasks[t.id].study_entry_id];
            return { ...base, meta: e ? `${e.title} · ${formatISODate(e.study_date, { day: 'numeric', month: 'short' })}` : '', restore: () => restoreTask(t.id) };
          }
          case 'Lerntag': {
            const e = d.study_entries[t.id];
            const n = Object.values(d.tasks).filter((x) => x.study_entry_id === e.id && !x.deleted_at).length;
            return { ...base, meta: `${d.modules[e.module_id]?.name ?? ''} · ${formatISODate(e.study_date, { day: 'numeric', month: 'short' })} · ${n} Aufgaben`, restore: () => restoreEntry(e.id) };
          }
          case 'Datei':
            return { ...base, meta: d.modules[d.attachments[t.id].module_id ?? '']?.name ?? '', restore: () => restoreAttachment(t.id) };
          case 'Prüfung': {
            const x = d.exams[t.id];
            return { ...base, meta: formatInstant(x.starts_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }, x.timezone), restore: () => restoreExam(t.id) };
          }
          case 'Thema':
            return { ...base, meta: d.modules[d.module_topics[t.id].module_id]?.name ?? '', restore: () => restoreTopic(t.id) };
          default:
            return { ...base, meta: 'Archiviertes Fach', restore: () => restoreModule(t.id) };
        }
      }),
    [trash, d, homework],
  );

  return (
    <div>
      <PageHeader title="Papierkorb" />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Trash2 className="size-6" />} title="Der Papierkorb ist leer" />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`} className="card flex items-center gap-3 rounded-2xl p-3 md:p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)] text-muted [&>svg]:size-[18px]">{i.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.title}</p>
                <p className="truncate text-xs text-muted">
                  {i.kind} · {i.meta} · gelöscht {formatInstant(i.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <Button size="sm" icon={i.kind === 'Modul' || i.kind === 'Thema' ? <Archive className="size-4" /> : <RotateCcw className="size-4" />} onClick={() => void i.restore()}>
                Wiederherstellen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
