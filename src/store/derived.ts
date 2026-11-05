import { useMemo } from 'react';
import { useData } from './data';
import { useSession } from './session';
import { activeMembers, activeTaskViews, sortedMembers, type TaskView } from '../lib/progress';
import type { Member, Module } from '../lib/types';

/** Aktive Aufgaben mit ihren Lerntagen/Modulen – zentral berechnet und memoisiert. */
export function useTaskViews(): TaskView[] {
  const modules = useData((s) => s.modules);
  const topics = useData((s) => s.module_topics);
  const entries = useData((s) => s.study_entries);
  const tasks = useData((s) => s.tasks);
  return useMemo(() => activeTaskViews({ modules, topics, entries, tasks }), [modules, topics, entries, tasks]);
}

export function useActiveMembers(): Member[] {
  const members = useData((s) => s.members);
  return useMemo(() => activeMembers(members), [members]);
}

export function useAllMembers(): Member[] {
  const members = useData((s) => s.members);
  return useMemo(() => sortedMembers(members), [members]);
}

export function useActiveMemberIds(): string[] {
  const list = useActiveMembers();
  return useMemo(() => list.map((m) => m.id), [list]);
}

export function useCurrentMember(): Member | null {
  const id = useSession((s) => s.activeMemberId);
  const members = useData((s) => s.members);
  return id ? members[id] ?? null : null;
}

export function useModules(includeArchived = false): Module[] {
  const modules = useData((s) => s.modules);
  return useMemo(
    () =>
      Object.values(modules)
        .filter((m) => includeArchived || !m.archived_at)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [modules, includeArchived],
  );
}

export function useAppName(): string {
  const v = useData((s) => s.app_settings.app_name?.value);
  return typeof v === 'string' && v.trim() ? v : 'StudySpace';
}
