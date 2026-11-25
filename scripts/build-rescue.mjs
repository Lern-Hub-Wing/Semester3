// Erzeugt supabase/rescue/seite_reparieren.sql: Reparatur-Kopf + alle Migrationen der Seite.
//   node scripts/build-rescue.mjs          → schreibt die Datei
//   node scripts/build-rescue.mjs --check  → prüft, ob sie aktuell ist
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['001_schema.sql', '002_security.sql', '004_push_focus.sql', '005_homework.sql', '006_server_read_access.sql', '007_music.sql', '008_focus_realtime.sql', '009_exam_participants.sql', '010_moved_to_app.sql', '011_trash_7_days.sql'];
const out =
  readFileSync(join(root, 'supabase/rescue/header.sql'), 'utf8') +
  files.map((f) => `\n-- ===== supabase/migrations/${f} =====\n` + readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n') +
  "\n-- Fertig. Die Seite sollte nach dem Neuladen wieder alles anzeigen.\nselect 'Reparatur abgeschlossen' as status;\n";
const target = join(root, 'supabase/rescue/seite_reparieren.sql');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== out) {
    console.error('supabase/rescue/seite_reparieren.sql ist veraltet – node scripts/build-rescue.mjs ausführen');
    process.exit(1);
  }
  console.log('Reparatur-Skript ist aktuell');
} else {
  writeFileSync(target, out);
  console.log(`geschrieben: supabase/rescue/seite_reparieren.sql (${out.length} Zeichen)`);
}
