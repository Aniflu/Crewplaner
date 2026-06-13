// Headless Test-Runner — Ausführung:  node tests/run.mjs
//   TZ=Europe/Berlin node tests/run.mjs   (Zeitzonen-Regression)
//   TZ=UTC           node tests/run.mjs
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runAll } from './_assert.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();

console.log(`\nCrewplaner Tests — TZ=${process.env.TZ || '(system)'} — ${files.length} Datei(en)\n`);
for(const f of files){
  console.log(`▶ ${f}`);
  await import(join(here, f));
}
console.log('');
const fail = await runAll();
process.exit(fail > 0 ? 1 : 0);
