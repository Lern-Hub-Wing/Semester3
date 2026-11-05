import { create } from 'zustand';
import type { ISODate, UUID } from '../lib/types';

/** Globale Dialoge, damit sie von überall geöffnet werden können. */
interface UIState {
  entryEditor: { open: boolean; entryId?: UUID; date?: ISODate; moduleId?: UUID; topicId?: UUID | null };
  moveTaskId: UUID | null;
  previewId: UUID | null;
  searchOpen: boolean;
  moreOpen: boolean;
  openEntryEditor: (opts?: { entryId?: UUID; date?: ISODate; moduleId?: UUID; topicId?: UUID | null }) => void;
  closeEntryEditor: () => void;
  set: (patch: Partial<Omit<UIState, 'set' | 'openEntryEditor' | 'closeEntryEditor'>>) => void;
}

export const useUI = create<UIState>((set) => ({
  entryEditor: { open: false },
  moveTaskId: null,
  previewId: null,
  searchOpen: false,
  moreOpen: false,
  openEntryEditor: (opts = {}) => set({ entryEditor: { open: true, ...opts } }),
  closeEntryEditor: () => set((s) => ({ entryEditor: { ...s.entryEditor, open: false } })),
  set: (patch) => set(patch),
}));
