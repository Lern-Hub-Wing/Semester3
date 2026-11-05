import { create } from 'zustand';
import type { ISODate, UUID } from '../lib/types';

/** Globale Dialoge, damit sie von überall geöffnet werden können. */
interface UIState {
  /** session: wird bei jedem Öffnen erhöht, damit das Formular genau einmal pro Öffnen befüllt wird */
  entryEditor: { open: boolean; session: number; entryId?: UUID; date?: ISODate; moduleId?: UUID; topicId?: UUID | null };
  moveTaskId: UUID | null;
  previewId: UUID | null;
  searchOpen: boolean;
  moreOpen: boolean;
  openEntryEditor: (opts?: { entryId?: UUID; date?: ISODate; moduleId?: UUID; topicId?: UUID | null }) => void;
  closeEntryEditor: () => void;
  set: (patch: Partial<Omit<UIState, 'set' | 'openEntryEditor' | 'closeEntryEditor'>>) => void;
}

export const useUI = create<UIState>((set) => ({
  entryEditor: { open: false, session: 0 },
  moveTaskId: null,
  previewId: null,
  searchOpen: false,
  moreOpen: false,
  openEntryEditor: (opts = {}) => set((s) => ({ entryEditor: { open: true, session: s.entryEditor.session + 1, ...opts } })),
  closeEntryEditor: () => set((s) => ({ entryEditor: { ...s.entryEditor, open: false } })),
  set: (patch) => set(patch),
}));
