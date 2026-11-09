/**
 * Datenbank-Typen. Sie entsprechen 1:1 den Tabellen in
 * supabase/migrations/001_schema.sql.
 */

export type UUID = string;
/** ISO-Zeitstempel (timestamptz) */
export type Timestamp = string;
/** Kalenderdatum im Format YYYY-MM-DD */
export type ISODate = string;

interface Versioned {
  version: number;
  updated_at: Timestamp;
  changed_by: UUID | null;
}

export interface Member extends Versioned {
  id: UUID;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
}

export interface Module extends Versioned {
  id: UUID;
  name: string;
  color: string;
  description: string | null;
  sort_order: number;
  archived_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Topic extends Versioned {
  id: UUID;
  module_id: UUID;
  title: string;
  description: string | null;
  sort_order: number;
  archived_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Exam extends Versioned {
  id: UUID;
  module_id: UUID;
  starts_at: Timestamp;
  ends_at: Timestamp;
  timezone: string;
  location: string | null;
  notes: string | null;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
}

export interface StudyEntry extends Versioned {
  id: UUID;
  module_id: UUID;
  topic_id: UUID | null;
  study_date: ISODate;
  title: string;
  description: string | null;
  sort_order: number;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Task extends Versioned {
  id: UUID;
  study_entry_id: UUID;
  title: string;
  description: string | null;
  sort_order: number;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Completion extends Versioned {
  task_id: UUID;
  member_id: UUID;
  is_completed: boolean;
  completed_at: Timestamp | null;
  created_at: Timestamp;
}

export type AttachmentTarget = 'module' | 'topic' | 'study_entry' | 'task' | 'homework';

export interface Attachment extends Versioned {
  id: UUID;
  module_id: UUID | null;
  target_type: AttachmentTarget;
  target_id: UUID;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  uploaded_at: Timestamp;
  deleted_at: Timestamp | null;
}

export type SettingKey = 'app_name' | 'group_goal_title' | 'motivation_enabled';

export interface AppSetting {
  key: SettingKey;
  value: unknown;
  version: number;
  updated_at: Timestamp;
  changed_by: UUID | null;
}

export interface ActivityEntry {
  id: number;
  occurred_at: Timestamp;
  actor_member_id: UUID | null;
  actor_label: string | null;
  entity_type: string;
  entity_id: string;
  action: 'created' | 'updated' | 'moved' | 'archived' | 'restored' | 'completed' | 'uncompleted' | string;
  summary: string | null;
  details: Record<string, unknown> | null;
}

/** Tabellen, die in den lokalen Store geladen und per Realtime synchronisiert werden. */
export type TableName =
  | 'members'
  | 'modules'
  | 'module_topics'
  | 'exams'
  | 'study_entries'
  | 'tasks'
  | 'task_completions'
  | 'attachments'
  | 'app_settings';

export interface RowByTable {
  members: Member;
  modules: Module;
  module_topics: Topic;
  exams: Exam;
  study_entries: StudyEntry;
  tasks: Task;
  task_completions: Completion;
  attachments: Attachment;
  app_settings: AppSetting;
}

export const TABLES: TableName[] = [
  'members',
  'modules',
  'module_topics',
  'exams',
  'study_entries',
  'tasks',
  'task_completions',
  'attachments',
  'app_settings',
];

/** Eindeutiger Schlüssel einer Zeile innerhalb ihrer Tabelle. */
export function rowKey<T extends TableName>(table: T, row: RowByTable[T]): string {
  if (table === 'task_completions') {
    const c = row as Completion;
    return completionKey(c.task_id, c.member_id);
  }
  if (table === 'app_settings') return (row as AppSetting).key;
  return (row as { id: string }).id;
}

export function completionKey(taskId: UUID, memberId: UUID): string {
  return `${taskId}:${memberId}`;
}
