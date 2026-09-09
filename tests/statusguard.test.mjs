// Guard: Statuswechsel an assignments laufen serverseitig (v0.13.0 / Hook v4.25).
//
// Warum das hier stehen MUSS: assignments.updateRule ist feldblind — sie erlaubt der Crew
// „ändere deinen eigenen Record" und kann nicht unterscheiden, WELCHES Feld auf WELCHEN Wert
// geht. Ein Crew-Konto kann also per PATCH direkt auf die REST-API jeden Status setzen, ganz
// ohne diese Oberfläche. Ein Filter im Frontend versteckt den Fehler nur.
//
// Der Hook selbst läuft in Goja und ist von Node aus nicht ausführbar. Geprüft wird darum die
// STRUKTUR der Datei — dasselbe Vorgehen wie in viewapp/cors/registration.test.mjs. Das kann
// nicht beweisen, dass der Guard auf dem Server greift (das zeigt erst die Test-Instanz laut
// docs/admin-runbook-hook-deploy.md); es fängt aber ab, dass jemand ihn entfernt oder die
// Übergangstabelle nur auf einer der beiden Seiten ändert.
import { test, ok, deepEq } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CREW_STATUS_TRANSITIONS } from '../js/pure.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
// Kommentare raus — geprüft wird der CODE, nicht die Prosa. Die Erklärungen im Hook nennen
// die verbotenen Übergänge absichtlich beim Namen und würden die Guards sonst auslösen.
const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('Hook: blockierender Update-Guard auf assignments existiert', () => {
  ok(/onRecordUpdateRequest\(/.test(code), 'onRecordUpdateRequest fehlt — ohne ihn ist der Statuswechsel ungeschützt');
  ok(/onRecordUpdateRequest\([\s\S]*?,\s*'assignments'\)/.test(code), 'der Update-Guard hängt nicht an assignments');
});

test('Hook: der Update-Guard vergleicht ALTEN mit NEUEM Status', () => {
  const m = code.match(/onRecordUpdateRequest\(function[\s\S]*?,\s*'assignments'\);/);
  ok(m, 'Update-Guard-Block nicht gefunden');
  ok(/originalCopy\(\)\.get\('status'\)/.test(m[0]),
     'liest den vorherigen Status nicht über originalCopy() — ohne ihn kann er keinen Übergang prüfen');
  ok(/isCrewStatusTransitionAllowed\(/.test(m[0]), 'wendet die Übergangstabelle nicht an');
});

test('Hook: Planer und Plan-Owner kommen am Guard vorbei (sonst sperrt er die Falschen ein)', () => {
  const m = code.match(/function _istPlaner\([\s\S]*?\n\}/);
  ok(m, '_istPlaner nicht gefunden — beide Guards hängen an dieser Ausnahme');
  ok(/superadmin/.test(m[0]), 'superadmin-Ausnahme fehlt');
  ok(/manager/.test(m[0]),    'manager-Ausnahme fehlt');
  ok(/getString\('owner'\)/.test(m[0]),
     'Plan-Owner-Ausnahme fehlt — die steht heute in der updateRule und darf nicht wegfallen');
  // Beide Guards MÜSSEN sie benutzen, sonst schützt sie nur die Hälfte.
  for (const guard of ['onRecordUpdateRequest', 'onRecordCreateRequest']) {
    const g = code.match(new RegExp(guard + '\\(function[\\s\\S]*?,\\s*\'assignments\'\\);'));
    ok(g && /_istPlaner\(/.test(g[0]), guard + ' auf assignments fragt _istPlaner nicht');
  }
});

test('Hook: Create-Guard schließt den Zweitrecord-Weg', () => {
  // Ohne ihn ließe sich der Update-Guard umgehen: statt den vorgemerkten Record zu patchen,
  // legt man einfach einen ZWEITEN Record für denselben Slot mit status confirmed an.
  // createRule steht auf `@request.auth.id != ""` und es gibt keinen Unique-Index auf
  // (plan_id, date, pos_id) — der Weg ist offen, solange der Hook ihn nicht zumacht.
  ok(/onRecordCreateRequest\([\s\S]*?,\s*'assignments'\)/.test(code),
     'kein Create-Guard auf assignments — der Update-Guard ist damit umgehbar');
});

test('Hook: Übergangstabelle ist mit js/pure.js identisch (Handkopie darf nicht driften)', () => {
  // Goja kennt kein `import`, deshalb führt der Hook eine zweite Fassung derselben Tabelle
  // (gleiches Muster wie ICS_STATUS_LABEL ↔ LABEL). Genau solche Kopien laufen auseinander.
  const m = code.match(/var CREW_STATUS_TRANSITIONS\s*=\s*(\{[\s\S]*?\});/);
  ok(m, 'CREW_STATUS_TRANSITIONS fehlt im Hook');
  // eslint-disable-next-line no-new-func — Testcode, Eingabe ist die repo-eigene Hook-Datei
  const imHook = new Function('return ' + m[1])();
  deepEq(imHook, CREW_STATUS_TRANSITIONS,
         'Hook-Tabelle weicht von js/pure.js ab — eine Seite wurde geändert, die andere nicht');
});

test('Hook: die Version ist mitgezogen worden', () => {
  const m = hook.match(/^\/\/ Version:\s*([\d.]+)/m);
  ok(m, 'Versionszeile fehlt');
  const [maj, min] = m[1].split('.').map(Number);
  ok(maj > 4 || (maj === 4 && min >= 25),
     'Hook-Version muss mit dem Guard auf mindestens 4.25 stehen — bekommen: ' + m[1]);
});
