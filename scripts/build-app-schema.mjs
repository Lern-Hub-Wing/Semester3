// Fügt alle SQL-Dateien für das EIGENE Supabase-Projekt der neuen App zu
// einer Datei zusammen: supabase-app/app_schema.sql (einmal im SQL-Editor
// des NEUEN Projekts ausführen). Die gemeinsamen Tabellen stammen aus
// supabase/migrations (ohne 003 Storage – die App hat keine Uploads).
//   node scripts/build-app-schema.mjs          → schreibt die Datei
//   node scripts/build-app-schema.mjs --check  → prüft, ob sie aktuell ist
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = ['001_schema.sql', '002_security.sql', '004_push_focus.sql', '005_homework.sql', '006_server_read_access.sql', '007_music.sql', '008_focus_realtime.sql'];
const own = readdirSync(join(root, 'supabase-app/migrations')).filter((f) => f.endsWith('.sql')).sort();
export const appSchemaFiles = [...shared.map((f) => `supabase/migrations/${f}`), ...own.map((f) => `supabase-app/migrations/${f}`)];

const header = `-- =====================================================================
-- StudySpace App – komplettes Datenbankschema (automatisch erzeugt)
-- ---------------------------------------------------------------------
-- NUR im EIGENEN Supabase-Projekt der neuen App ausführen (SQL Editor),
-- NIEMALS in der Datenbank der bisherigen StudySpace-Seite.
-- Erzeugt mit: node scripts/build-app-schema.mjs – nicht von Hand ändern.
-- Wiederholbar ausführbar (Updates: einfach erneut ausführen).
-- =====================================================================
`;
const out = header + appSchemaFiles.map((f) => `\n-- ===== ${f} =====\n` + readFileSync(join(root, f), 'utf8')).join('\n');
const target = join(root, 'supabase-app/app_schema.sql');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {}
  if (current !== out) {
    console.error('supabase-app/app_schema.sql ist veraltet – node scripts/build-app-schema.mjs ausführen');
    process.exit(1);
  }
  console.log('app_schema.sql ist aktuell');
} else if (process.argv.includes('--list')) {
  console.log(appSchemaFiles.join('\n'));
} else {
  writeFileSync(target, out);
  console.log(`geschrieben: supabase-app/app_schema.sql (${appSchemaFiles.length} Dateien)`);
}
