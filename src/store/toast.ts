import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, durationMs) => {
    const id = ++counter;
    // Gleiche Meldung nicht stapeln
    const without = get().toasts.filter((x) => x.message !== t.message);
    set({ toasts: [...without.slice(-3), { ...t, id }] });
    const ms = durationMs ?? (t.kind === 'error' ? 6000 : t.action ? 6000 : 2800);
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string, action?: Toast['action']) => useToasts.getState().push({ kind: 'success', message, action }),
  error: (message: string) => useToasts.getState().push({ kind: 'error', message }),
  info: (message: string) => useToasts.getState().push({ kind: 'info', message }),
};
