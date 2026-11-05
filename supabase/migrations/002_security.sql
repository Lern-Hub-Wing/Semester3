-- =====================================================================
-- StudySpace – Migration 002: Row Level Security, Rechte, Realtime
-- ---------------------------------------------------------------------
-- StudySpace hat bewusst KEINE Anmeldung. Jeder mit dem Link darf lesen
-- und bearbeiten. Damit die Angriffsfläche trotzdem klein bleibt, gilt:
--   * RLS ist auf allen Tabellen aktiv.
--   * Die Rollen anon/authenticated dürfen nur SELECT, INSERT und UPDATE
--     auf den nötigen Tabellen – und UPDATE nur auf ausgewählten Spalten.
--   * DELETE ist für die öffentlichen Rollen komplett gesperrt
--     (Papierkorb = Soft Delete über deleted_at / archived_at).
--   * activity_log ist nur lesbar; geschrieben wird er ausschließlich
--     durch Datenbank-Trigger.
--   * version, created_at, updated_at, completed_at werden serverseitig
--     gesetzt und sind für Clients nicht beschreibbar.
-- =====================================================================

-- Alle Standardrechte entfernen und gezielt neu vergeben.
revoke all on table
  public.members, public.modules, public.module_topics, public.exams,
  public.study_entries, public.tasks, public.task_completions,
  public.attachments, public.app_settings, public.activity_log
from anon, authenticated;

-- ---------------------------------------------------------------------
-- Rechte auf Spaltenebene
-- (UPDATE enthält die Schlüsselspalten, weil Upserts sie im SET-Teil
--  mitschicken. Der Trigger ss_touch verhindert, dass sie sich ändern.)
-- ---------------------------------------------------------------------
grant select on public.members to anon, authenticated;
grant insert (id, name, color, sort_order, is_active, changed_by) on public.members to anon, authenticated;
grant update (id, name, color, sort_order, is_active, changed_by) on public.members to anon, authenticated;

grant select on public.modules to anon, authenticated;
grant insert (id, name, color, description, sort_order, archived_at, changed_by) on public.modules to anon, authenticated;
grant update (id, name, color, description, sort_order, archived_at, changed_by) on public.modules to anon, authenticated;

grant select on public.module_topics to anon, authenticated;
grant insert (id, module_id, title, description, sort_order, archived_at, changed_by) on public.module_topics to anon, authenticated;
grant update (id, module_id, title, description, sort_order, archived_at, changed_by) on public.module_topics to anon, authenticated;

grant select on public.exams to anon, authenticated;
grant insert (id, module_id, starts_at, ends_at, timezone, location, notes, deleted_at, changed_by) on public.exams to anon, authenticated;
grant update (id, module_id, starts_at, ends_at, timezone, location, notes, deleted_at, changed_by) on public.exams to anon, authenticated;

grant select on public.study_entries to anon, authenticated;
grant insert (id, module_id, topic_id, study_date, title, description, sort_order, deleted_at, changed_by) on public.study_entries to anon, authenticated;
grant update (id, module_id, topic_id, study_date, title, description, sort_order, deleted_at, changed_by) on public.study_entries to anon, authenticated;

grant select on public.tasks to anon, authenticated;
grant insert (id, study_entry_id, title, description, sort_order, deleted_at, changed_by) on public.tasks to anon, authenticated;
grant update (id, study_entry_id, title, description, sort_order, deleted_at, changed_by) on public.tasks to anon, authenticated;

grant select on public.task_completions to anon, authenticated;
grant insert (task_id, member_id, is_completed, changed_by) on public.task_completions to anon, authenticated;
grant update (task_id, member_id, is_completed, changed_by) on public.task_completions to anon, authenticated;

-- Anhänge: Metadaten werden einmal angelegt; danach ist nur das
-- Verschieben in den Papierkorb bzw. Wiederherstellen erlaubt.
grant select on public.attachments to anon, authenticated;
grant insert (id, module_id, target_type, target_id, storage_path, original_filename, mime_type, file_size, deleted_at, changed_by)
  on public.attachments to anon, authenticated;
grant update (deleted_at, changed_by) on public.attachments to anon, authenticated;

grant select on public.app_settings to anon, authenticated;
grant insert (key, value, changed_by) on public.app_settings to anon, authenticated;
grant update (key, value, changed_by) on public.app_settings to anon, authenticated;

grant select on public.activity_log to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries',
    'tasks', 'task_completions', 'attachments', 'app_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ss_public_select on public.%I', t);
    execute format('drop policy if exists ss_public_insert on public.%I', t);
    execute format('drop policy if exists ss_public_update on public.%I', t);
    execute format('create policy ss_public_select on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy ss_public_insert on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy ss_public_update on public.%I for update to anon, authenticated using (true) with check (true)', t);
    -- Bewusst KEINE Delete-Policy.
  end loop;
end;
$$;

alter table public.activity_log enable row level security;
drop policy if exists ss_public_select on public.activity_log;
create policy ss_public_select on public.activity_log for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Realtime: Tabellen zur Publikation hinzufügen
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'members', 'modules', 'module_topics', 'exams', 'study_entries',
    'tasks', 'task_completions', 'attachments', 'app_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
