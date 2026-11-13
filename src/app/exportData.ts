import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { TABLES } from '../lib/types';
import { fetchTable } from '../store/sync';
import { downloadJson } from '../store/backup';
import { useAccount } from './account';

/**
 * Datenexport der App (DSGVO: Recht auf Datenübertragbarkeit): alle Inhalte
 * der aktiven Lerngruppe bzw. des Lernbereichs plus die eigenen Kontoangaben,
 * als lesbare JSON-Datei. Gelesen wird nur, was die Datenbank ohnehin erlaubt.
 */
export async function exportMyData(): Promise<void> {
  const sb = getSupabase();
  const me = useAccount.getState().me;
  const user = useAccount.getState().session?.user;
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  const core = TABLES.filter((t) => t !== 'attachments');
  const extra = ['homework', 'homework_parts', 'homework_completions', 'focus_sessions', 'music_tracks'] as const;
  const coreRows = await Promise.all(core.map((t) => fetchTable(t)));
  const extraRows = await Promise.all(
    extra.map(async (t) => {
      const { data, error } = await sb.from(t).select('*');
      return error ? [] : (data ?? []);
    }),
  );
  const file = {
    format: 'studyspace-app-export',
    version: 1,
    exported_at: new Date().toISOString(),
    app_version: config.version,
    account: {
      email: user?.email ?? null,
      display_name: me?.display_name ?? null,
      created_at: user?.created_at ?? null,
      plan: me?.plan ?? null,
      plan_until: me?.plan_until ?? null,
      trial_ends_at: me?.trial_ends_at ?? null,
    },
    group: group ? { name: group.name, kind: group.kind, role: group.role } : null,
    tables: {
      ...Object.fromEntries(core.map((t, i) => [t, coreRows[i]])),
      ...Object.fromEntries(extra.map((t, i) => [t, extraRows[i]])),
    },
  };
  const slug = (group?.kind === 'solo' ? 'lernbereich' : group?.name ?? 'gruppe').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').slice(0, 30);
  downloadJson(file, `studyspace-${slug}-${new Date().toISOString().slice(0, 10)}.json`);
}
