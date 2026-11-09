import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, ShieldAlert } from 'lucide-react';
import type { ActivityEntry } from '../lib/types';
import { getSupabase } from '../lib/supabase';
import { describeError } from '../lib/errors';
import { formatInstant } from '../lib/time';
import { useData } from '../store/data';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

const ENTITY: Record<string, string> = {
  members: 'Person',
  modules: 'Modul',
  module_topics: 'Thema',
  exams: 'Prüfung',
  study_entries: 'Lerntag',
  tasks: 'Aufgabe',
  task_completions: 'Erledigung',
  attachments: 'Datei',
  app_settings: 'Einstellung',
  homework: 'Hausaufgabe',
  homework_parts: 'Teil einer Hausaufgabe',
};

const ACTION: Record<string, string> = {
  created: 'erstellt',
  updated: 'bearbeitet',
  moved: 'verschoben',
  archived: 'gelöscht/archiviert',
  restored: 'wiederhergestellt',
  completed: 'abgehakt',
  uncompleted: 'Haken entfernt',
};

const PAGE = 60;

/** Änderungsverlauf. Die Profilangabe ist NICHT verifiziert. */
export function Activity() {
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const members = useData((s) => s.members);

  const load = useCallback(async (before?: number) => {
    setError(null);
    let q = getSupabase().from('activity_log').select('*').order('id', { ascending: false }).limit(PAGE);
    if (before) q = q.lt('id', before);
    const { data, error: err } = await q;
    if (err) return setError(describeError(err));
    const list = (data ?? []) as ActivityEntry[];
    setMore(list.length === PAGE);
    setRows((prev) => (before && prev ? [...prev, ...list] : list));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Änderungsverlauf"
        actions={
          <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => void load()}>
            Aktualisieren
          </Button>
        }
      />
      <p className="mb-4 flex items-start gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] px-4 py-3 text-xs text-muted">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Die angezeigte Person ist das zum Zeitpunkt aktive Lernprofil. Da es keine Anmeldung gibt, ist diese Angabe nicht verifiziert.
      </p>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {rows === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<History className="size-6" />} title="Noch keine Änderungen" />
        </Card>
      ) : (
        <Card className="p-2">
          <ul>
            {rows.map((r) => {
              const actor = r.actor_member_id ? members[r.actor_member_id] : undefined;
              const target = r.entity_type === 'task_completions' ? (r.details?.member_name as string | undefined) : undefined;
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                  {actor ? <Avatar name={actor.name} color={actor.color} size={28} /> : <span className="grid size-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)] text-[10px] text-muted">?</span>}
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      <span className="font-medium">{r.actor_label ?? 'Unbekannt'}</span>{' '}
                      <span className="text-muted">
                        hat {ENTITY[r.entity_type] ?? r.entity_type} {ACTION[r.action] ?? r.action}
                      </span>
                      {target && target !== r.actor_label && <span className="text-muted"> (für {target})</span>}
                    </p>
                    {r.summary && <p className="truncate text-[13px] text-muted">„{r.summary}“</p>}
                  </div>
                  <time className="shrink-0 text-xs text-faint" dateTime={r.occurred_at}>
                    {formatInstant(r.occurred_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </li>
              );
            })}
          </ul>
          {more && (
            <div className="p-2 text-center">
              <Button size="sm" variant="ghost" onClick={() => void load(rows[rows.length - 1]?.id)}>
                Ältere laden
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
