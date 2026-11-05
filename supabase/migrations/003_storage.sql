-- =====================================================================
-- StudySpace – Migration 003: Supabase Storage für Lernmaterialien
-- ---------------------------------------------------------------------
-- Legt den Bucket "materials" an und begrenzt serverseitig
--   * die Dateigröße (Standard 10 MB = 10485760 Byte) und
--   * die erlaubten Dateitypen (PDF, PNG, JPEG, WebP).
-- Ausführbare Dateien oder andere Typen werden vom Storage abgelehnt.
--
-- Größenlimit ändern: Wert unten anpassen UND im Frontend die Variable
-- VITE_MAX_UPLOAD_MB setzen (siehe .env.example / README).
--
-- Der Bucket ist "public": Dateien sind über ihre (zufällige, nicht
-- erratbare) URL abrufbar. Das passt zum Konzept "jeder mit dem Link".
-- Lade daher keine vertraulichen Dokumente hoch.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  true,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Hochladen erlaubt – aber nur in diesen Bucket und nur mit erlaubter Endung.
drop policy if exists "studyspace_materials_insert" on storage.objects;
create policy "studyspace_materials_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'materials'
    and lower(storage.extension(name)) in ('pdf', 'png', 'jpg', 'jpeg', 'webp')
    and char_length(name) <= 400
  );

-- Lesen erlaubt (für Listen/Downloads über die API).
drop policy if exists "studyspace_materials_select" on storage.objects;
create policy "studyspace_materials_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'materials');

-- Bewusst KEINE Update- oder Delete-Policy: Dateien können nicht
-- überschrieben oder gelöscht werden. "Löschen" in der App verschiebt nur
-- den Metadateneintrag in den Papierkorb.
