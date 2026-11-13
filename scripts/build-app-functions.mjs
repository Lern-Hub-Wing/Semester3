// Erzeugt aus supabase-app/functions-src/*.ts je EINE eigenständige Datei
// supabase-app/functions/<name>/index.ts (gemeinsame Bausteine aus
// supabase/functions/_shared werden eingebettet). So lässt sich eine
// Funktion per GitHub-Workflow ODER per Kopieren im Supabase-Dashboard
// bereitstellen.
//   node scripts/build-app-functions.mjs          → schreibt die Dateien
//   node scripts/build-app-functions.mjs --check  → prüft, ob sie aktuell sind
import { rolldown } from 'rolldown';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'supabase-app/functions-src');
const check = process.argv.includes('--check');
let stale = false;

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.ts')).sort()) {
  const name = file.replace(/\.ts$/, '');
  const bundle = await rolldown({ input: join(srcDir, file), external: [/^npm:/, /^jsr:/], platform: 'neutral', logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const header = `// =====================================================================
// AUTOMATISCH ERZEUGT aus supabase-app/functions-src/${file} –
// nicht von Hand ändern (npm run app:functions).
// Bereitstellen: GitHub-Workflow „App: Edge Functions bereitstellen“ oder
// im Supabase-Dashboard → Edge Functions → „${name}“ den gesamten Inhalt
// dieser Datei einfügen (JWT-Prüfung AUS – die Funktion prüft selbst).
// =====================================================================
`;
  const text = header + output[0].code;
  const target = join(root, 'supabase-app/functions', name, 'index.ts');
  if (check) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {}
    if (current !== text) {
      console.error(`${target} ist veraltet – npm run app:functions ausführen`);
      stale = true;
    }
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    console.log(`geschrieben: supabase-app/functions/${name}/index.ts (${text.length} Zeichen)`);
  }
}
if (check) {
  if (stale) process.exit(1);
  console.log('App-Funktionen sind aktuell');
}
