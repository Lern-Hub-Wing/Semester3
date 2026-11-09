import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { uuid } from '../lib/uuid';
import { describeError } from '../lib/errors';
import type { MusicCategory } from '../lib/youtube';
import type { UUID } from '../lib/types';
import { getActiveMemberId } from './session';
import { isMissingTable } from './homework';
import { toast } from './toast';

/**
 * Musik-Bibliothek (Migration 007): gemeinsame YouTube-Links.
 * Fehlt die Tabelle, ist `available === false` und die Bibliothek bleibt
 * ausgeblendet – die erzeugten Klänge (Lofi, Regen, Rauschen) gehen immer.
 */
export interface MusicTrack {
  id: UUID;
  category: MusicCategory;
  title: string;
  youtube_id: string;
  start_seconds: number | null;
  sort_order: number;
  deleted_at: string | null;
  changed_by: UUID | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface MusicState {
  available: boolean | null;
  tracks: Record<UUID, MusicTrack>;
}

export const useMusic = create<MusicState>(() => ({ available: null, tracks: {} }));

let loading: Promise<void> | null = null;

export function loadMusic(): Promise<void> {
  if (!config.isConfigured) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data, error } = await getSupabase().from('music_tracks').select('*').order('sort_order', { ascending: true }).limit(1000);
      if (error) throw error;
      useMusic.setState({ available: true, tracks: Object.fromEntries((data as MusicTrack[]).map((t) => [t.id, t])) });
    } catch (err) {
      if (isMissingTable(err)) useMusic.setState({ available: false });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function applyMusicChange(table: string, type: string, row: Record<string, unknown>) {
  if (table !== 'music_tracks' || type === 'DELETE') return;
  const r = row as unknown as MusicTrack;
  useMusic.setState((s) => (s.tracks[r.id] && s.tracks[r.id]!.version > r.version ? s : { available: true, tracks: { ...s.tracks, [r.id]: r } }));
}

/** Sichtbare Titel einer Kategorie in Reihenfolge */
export function tracksOf(tracks: Record<UUID, MusicTrack>, category?: MusicCategory): MusicTrack[] {
  return Object.values(tracks)
    .filter((t) => !t.deleted_at && (!category || t.category === category))
    .sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export async function addTrack(input: { category: MusicCategory; title: string; youtubeId: string; start: number | null }): Promise<boolean> {
  const existing = tracksOf(useMusic.getState().tracks, input.category);
  const row = {
    id: uuid(),
    category: input.category,
    title: input.title.trim().slice(0, 120),
    youtube_id: input.youtubeId,
    start_seconds: input.start,
    sort_order: existing.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1,
    deleted_at: null,
    changed_by: getActiveMemberId(),
  };
  const t = new Date().toISOString();
  useMusic.setState((s) => ({ tracks: { ...s.tracks, [row.id]: { ...row, version: 0, created_at: t, updated_at: t } } }));
  try {
    const { data, error } = await getSupabase().from('music_tracks').insert(row).select().single();
    if (error) throw error;
    useMusic.setState((s) => ({ tracks: { ...s.tracks, [row.id]: data as MusicTrack } }));
    toast.success(`„${row.title}“ hinzugefügt – für alle verfügbar`);
    return true;
  } catch (err) {
    useMusic.setState((s) => {
      const tracks = { ...s.tracks };
      delete tracks[row.id];
      return { tracks };
    });
    toast.error(`Link nicht gespeichert: ${describeError(err)}`);
    return false;
  }
}

export async function updateTrack(id: UUID, patch: Partial<Pick<MusicTrack, 'title' | 'deleted_at'>>): Promise<boolean> {
  const prev = useMusic.getState().tracks[id];
  if (!prev) return false;
  useMusic.setState((s) => ({ tracks: { ...s.tracks, [id]: { ...prev, ...patch } } }));
  try {
    const { data, error } = await getSupabase().from('music_tracks').update({ ...patch, changed_by: getActiveMemberId() }).eq('id', id).select().single();
    if (error) throw error;
    useMusic.setState((s) => ({ tracks: { ...s.tracks, [id]: data as MusicTrack } }));
    return true;
  } catch (err) {
    useMusic.setState((s) => ({ tracks: { ...s.tracks, [id]: prev } }));
    toast.error(`Änderung nicht gespeichert: ${describeError(err)}`);
    return false;
  }
}

export async function removeTrack(id: UUID) {
  const title = useMusic.getState().tracks[id]?.title ?? 'Titel';
  if (await updateTrack(id, { deleted_at: new Date().toISOString() })) {
    toast.success(`„${title}“ entfernt`, { label: 'Rückgängig', run: () => void updateTrack(id, { deleted_at: null }) });
  }
}
