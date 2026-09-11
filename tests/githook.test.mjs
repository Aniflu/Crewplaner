// Guard: der pre-push-Hook bleibt scharf.
//
// Anlass (v0.13.1): Es gab weder CI noch Git-Hooks. `git push origin main:live` ging raus, ohne
// dass irgendwer vorher `node tests/run.mjs` laufen ließ — die Tests liefen nur, wenn jemand
// daran dachte. .githooks/pre-push lässt sie vor jedem Push laufen, in beiden Zeitzonen.
//
// Aktiv wird der Hook erst durch `git config core.hooksPath .githooks` — das ist lokale
// Konfiguration und steht in keinem Repo. Dieser Test prüft deshalb nur, was im Repo liegt:
// dass der Hook existiert, ausführbar ist und wirklich beide Läufe macht. Ob er in einem
// bestimmten Clone eingeschaltet ist, kann er nicht sehen (siehe README, „Test-Gate").
import { readFileSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = join(root, '.githooks', 'pre-push');

test('.githooks/pre-push existiert und ist ausführbar', () => {
  ok(existsSync(hook), '.githooks/pre-push fehlt');
  // Ohne x-Bit überspringt git den Hook kommentarlos — der Push geht ungeprüft durch.
  ok((statSync(hook).mode & 0o111) !== 0, '.githooks/pre-push ist nicht ausführbar (chmod +x)');
  ok(readFileSync(hook, 'utf8').startsWith('#!'), '.githooks/pre-push hat keine Shebang-Zeile');
});

test('der Hook lässt die Tests in beiden Zeitzonen laufen', () => {
  const src = existsSync(hook) ? readFileSync(hook, 'utf8') : '';
  ok(/tests\/run\.mjs/.test(src), 'der Hook ruft tests/run.mjs nicht auf');
  // Beide Läufe, weil der Zeitzonen-Bug aus v0.12.2 nur unter UTC+x auftrat. Der Hook läuft
  // per Schleife (`for tz in Europe/Berlin UTC` + `TZ="$tz"`) — deshalb Zonen und Zuweisung
  // getrennt prüfen, nicht die zusammengesetzte Zeichenkette.
  const ohneKommentare = src.split('\n').filter(z => !z.trim().startsWith('#')).join('\n');
  ok(/\bTZ=/.test(ohneKommentare), 'der Hook setzt TZ nicht');
  ok(/Europe\/Berlin/.test(ohneKommentare), 'Lauf mit Europe/Berlin fehlt');
  ok(/\bUTC\b/.test(ohneKommentare), 'Lauf mit UTC fehlt');
});
