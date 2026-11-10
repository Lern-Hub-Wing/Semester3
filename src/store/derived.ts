import { useMemo } from 'react';
import { useData } from './data';
import { useSession } from './session';
import {
  activeHomeworkItems, activeMembers, activeTaskViews, scopeForModule, scopeGroupRatio, scopeMemberRatio, sortedMembers,
  type DoneLookup, type ProgressScope, type Ratio, type TaskView,
} from '../lib/progress';
import { useHomework } from './homework';
import type { Member, Module } from '../lib/types';

/** Aktive Aufgaben mit ihren Lerntagen/Modulen – zentral berechnet und memoisiert. */
export function useTaskViews(): TaskView[] {
  const modules = useData((s) => s.modules);
  const topics = useData((s) => s.module_topics);
  const entries = useData((s) => s.study_entries);
  const tasks = useData((s) => s.tasks);
  return useMemo(() => activeTaskViews({ modules, topics, entries, tasks }), [modules, topics, entries, tasks]);
}

export interface Progress {
  /** Alle Lernplan-Aufgaben und Hausaufgaben */
  scope: ProgressScope;
  done: DoneLookup;
  /** Persönlicher Fortschritt (optional für einen Ausschnitt, z. B. ein Fach) */
  member: (memberId: string, scope?: ProgressScope) => Ratio;
  /** Gruppenfortschritt */
  group: (memberIds: string[], scope?: ProgressScope) => Ratio;
  forModule: (moduleId: string) => ProgressScope;
}

/**
 * Zentrale Fortschrittsberechnung: Lernplan-Aufgaben + Hausaufgaben mit
 * derselben Regel für alle Ansichten (lib/progress.ts). Aktualisiert sich
 * sofort, wenn irgendwo ein Haken gesetzt wird.
 */
export function useProgress(): Progress {
  const tasks = useTaskViews();
  const modules = useData((s) => s.modules);
  const taskDone = useData((s) => s.task_completions);
  const available = useHomework((s) => s.available);
  const homework = useHomework((s) => s.homework);
  const parts = useHomework((s) => s.parts);
  const hwDone = useHomework((s) => s.completions);
  return useMemo(() => {
    const scope: ProgressScope = { tasks, homework: available ? activeHomeworkItems(homework, parts, modules) : [] };
    const done: DoneLookup = { tasks: taskDone, homework: hwDone };
    return {
      scope,
      done,
      member: (id, sc = scope) => scopeMemberRatio(sc, id, done),
      group: (ids, sc = scope) => scopeGroupRatio(sc, ids, done),
      forModule: (id) => scopeForModule(scope, id),
    };
  }, [tasks, modules, taskDone, available, homework, parts, hwDone]);
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
