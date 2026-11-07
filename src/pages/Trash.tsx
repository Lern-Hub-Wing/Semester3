import { useMemo } from 'react';
import { Archive, BookOpen, CalendarDays, FileText, GraduationCap, Layers, ListChecks, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatISODate, formatInstant } from '../lib/time';
import { useData } from '../store/data';
import { restoreAttachment, restoreEntry, restoreExam, restoreModule, restoreTask, restoreTopic } from '../store/actions';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

interface Item {
  id: string;
  kind: string;
  icon: ReactNode;
  title: string;
  meta: string;
  at: string;
  restore: () => Promise<boolean>;
}

/** Papierkorb: Nichts wird sofort endgültig gelöscht. Wiederherstellen behält alle Haken. */
export function Trash() {
  const d = useData();
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of Object.values(d.tasks)) {
      if (!t.deleted_at) continue;
      const e = d.study_entries[t.study_entry_id];
      out.push({
        id: t.id, kind: 'Aufgabe', icon: <ListChecks />, title: t.title,
        meta: e ? `${e.title} · ${formatISODate(e.study_date, { day: 'numeric', month: 'short' })}` : '',
        at: t.deleted_at, restore: () => restoreTask(t.id),
      });
    }
    for (const e of Object.values(d.study_entries)) {
      if (!e.deleted_at) continue;
      const n = Object.values(d.tasks).filter((t) => t.study_entry_id === e.id && !t.deleted_at).length;
      out.push({
        id: e.id, kind: 'Lerntag', icon: <CalendarDays />, title: e.title,
        meta: `${d.modules[e.module_id]?.name ?? ''} · ${formatISODate(e.study_date, { day: 'numeric', month: 'short' })} · ${n} Aufgaben`,
        at: e.deleted_at, restore: () => restoreEntry(e.id),
      });
    }
    for (const a of Object.values(d.attachments)) {
      if (!a.deleted_at) continue;
      out.push({ id: a.id, kind: 'Datei', icon: <FileText />, title: a.original_filename, meta: d.modules[a.module_id ?? '']?.name ?? '', at: a.deleted_at, restore: () => restoreAttachment(a.id) });
    }
    for (const x of Object.values(d.exams)) {
      if (!x.deleted_at) continue;
      out.push({
        id: x.id, kind: 'Prüfung', icon: <GraduationCap />, title: d.modules[x.module_id]?.name ?? 'Prüfung',
        meta: formatInstant(x.starts_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }, x.timezone),
        at: x.deleted_at, restore: () => restoreExam(x.id),
      });
    }
    for (const t of Object.values(d.module_topics)) {
      if (!t.archived_at) continue;
      out.push({ id: t.id, kind: 'Thema', icon: <Layers />, title: t.title, meta: d.modules[t.module_id]?.name ?? '', at: t.archived_at, restore: () => restoreTopic(t.id) });
    }
    for (const m of Object.values(d.modules)) {
      if (!m.archived_at) continue;
      out.push({ id: m.id, kind: 'Modul', icon: <BookOpen />, title: m.name, meta: 'Archiviertes Modul', at: m.archived_at, restore: () => restoreModule(m.id) });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [d]);

  return (
    <div>
      <PageHeader title="Papierkorb" subtitle="Gelöschte und archivierte Inhalte. Beim Wiederherstellen bleiben alle Haken erhalten." />
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
