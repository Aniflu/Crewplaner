// Guard: der Service Worker (dauerhafte Cache-Lösung) existiert und ist auf allen
// Einstiegsseiten registriert. Ohne ihn kehrt das „stale Sub-Modul"-Problem zurück.
import { test, ok } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

test('sw.js existiert und revalidiert (network-first, no-cache), cached NICHT stale', () => {
  const sw = read('sw.js');
  ok(/addEventListener\(\s*['"]fetch['"]/.test(sw), 'fetch-Handler vorhanden');
  ok(/cache:\s*['"]no-cache['"]/.test(sw), 'erzwingt Revalidierung (no-cache)');
  ok(!/caches\.(open|put)\(/.test(sw), 'kein eigenes Caching → kann nicht „einsperren"');
});

for (const page of ['index.html', 'admin.html', 'login.html', 'view.html']) {
  test(`${page}: registriert den Service Worker`, () => {
    ok(/serviceWorker\.register\(\s*['"]sw\.js['"]\s*\)/.test(read(page)),
       `${page} muss sw.js registrieren`);
  });
}
