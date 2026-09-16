// Guard: `changed_by` wird auf ALLEN Schreibwegen gesetzt — und der Eintrag darf nie blockieren.
//
// Anlass (v0.13.7 / Hook v4.28): Die Zeitstempel aus v0.13.6 sagen *wann*, nicht *wer*. Die
// beiden naheliegenden Quellen taugen nicht: Das PocketBase-Request-Log führt nur die Auth-Art
// (`users`/`_superusers`), keine Person, und löscht nach 24 Stunden; `activity_log` deckt nur
// Crew-Antworten ab und wird vom Browser geschrieben, ist also fälschbar. Fälschungssicher geht
// es nur serverseitig: Der Hook setzt `auth.id`, der Client kann daran nichts drehen.
//
// ⚠️ Warum ein EIGENER Hook und nicht eine Zeile im Guard: Der Statuswechsel-Guard steigt viermal
// früh aus (`e.next(); return;`) — bei fehlendem Auth, bei Planern und bei fremden Datensätzen.
// Genau bei Planer-Schreibvorgängen, dem häufigsten Fall, bliebe das Feld also leer.
//
// ⚠️ Und warum ohne `throw`: v4.25 hat gezeigt, was ein Fehler in diesem Pfad kostet — die Crew
// konnte weder zu- noch absagen. Ein fehlender Protokolleintrag ist das nie wert.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

const MARKER = '// ── 2a. Protokoll: wer hat zuletzt geschrieben (v4.28)';

function protokollBlock() {
  const start = hook.indexOf(MARKER);
  if (start < 0) return '';
  // Der Block endet beim nächsten Abschnitts-Kommentar „// ── "
  const rest = hook.slice(start + MARKER.length);
  const ende = rest.indexOf('\n// ── ');
  return ende < 0 ? rest : rest.slice(0, ende);
}

test('Hook: der changed_by-Block existiert und setzt auth.id', () => {
  const block = protokollBlock();
  ok(block, `Abschnitt „${MARKER}" nicht gefunden`);
  ok(/changed_by/.test(block), 'der Block setzt kein changed_by');
  ok(/auth\.id/.test(block), 'der Block schreibt nicht auth.id — nur die ID ist fälschungssicher');
  ok(/onRecordCreateRequest/.test(block), 'kein CREATE-Hook im Block');
  ok(/onRecordUpdateRequest/.test(block), 'kein UPDATE-Hook im Block');
});

test('Hook: der changed_by-Block blockiert nie', () => {
  const block = protokollBlock();
  ok(block, 'Block nicht gefunden');
  // Kommentare erst entfernen — der Block ERKLÄRT ausdrücklich, warum dort kein `throw` steht.
  // Ohne das Strippen schlägt der Wächter auf seiner eigenen Begründung an (genau passiert,
  // beim ersten Lauf). Dasselbe Vorgehen wie in delivery.test.mjs.
  const code = block.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  ok(!/\bthrow\b/.test(code),
    'throw im Protokoll-Block — ein fehlender Protokolleintrag darf das Schreiben NIE verhindern');
  ok(/try\s*{/.test(code) && /catch/.test(code), 'kein try/catch um das Setzen');
});

test('Hook: das Protokoll läuft VOR den Guards', () => {
  // Reihenfolge der Registrierung entscheidet: Stünde der Protokoll-Hook hinter dem Guard,
  // würde bei einer abgewiesenen Änderung gar nichts mehr protokolliert — und beim Planer-Pfad
  // hinge es davon ab, welcher Handler zuerst e.next() ruft.
  const protokoll = hook.indexOf(MARKER);
  const createGuard = hook.indexOf('assignment_create_denied');
  const updateGuard = hook.indexOf('status_transition_denied');
  ok(protokoll >= 0 && createGuard >= 0 && updateGuard >= 0, 'Marker oder Guards nicht gefunden');
  ok(protokoll < createGuard, 'Protokoll-Hook steht hinter dem CREATE-Guard');
  ok(protokoll < updateGuard, 'Protokoll-Hook steht hinter dem UPDATE-Guard');
});

test('Hook: auch der /notify-Weg schreibt changed_by', () => {
  // Der Hook legt Einsätze auch selbst an (POST /notify, tx.save). Dieser Weg läuft NICHT durch
  // die Record-Request-Hooks — ohne eigene Zeile bliebe das Feld dort für immer leer.
  const start = hook.indexOf("tx.findCollectionByNameOrId('assignments')");
  const ende = hook.indexOf('tx.save(r);');
  ok(start >= 0 && ende > start, '/notify-Transaktion nicht gefunden — Aufbau geändert?');
  ok(/changed_by/.test(hook.slice(start, ende)),
    'in der /notify-Transaktion wird changed_by nicht gesetzt');
});
