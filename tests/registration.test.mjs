// Guards für die Registrierungs-Sperre (v0.5.1): Ein Konto darf nur entstehen, wenn die
// E-Mail vorher vom Planer angelegt wurde (crew_members = Pool ODER Tour-Crew).
//
// Der Hook selbst läuft in PocketBases Goja-Engine und ist unter Node NICHT ausführbar —
// diese Tests sichern deshalb statisch ab, dass die Sperre überhaupt vorhanden und richtig
// verdrahtet ist. Die inhaltliche Prüfung passiert per curl nach dem Deploy
// (docs/admin-runbook-registrierungs-sperre.md).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook  = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
const login = readFileSync(join(root, 'login.html'), 'utf8');

test('Hook: Registrierungs-Sperre auf users ist vorhanden', () => {
  ok(/onRecordCreateRequest\(/.test(hook), 'onRecordCreateRequest fehlt');
  ok(/not_allowlisted/.test(hook), 'Kennung not_allowlisted fehlt (login.html erkennt sie daran)');
  ok(/findFirstRecordByFilter\(\s*'crew_members'/.test(hook), 'Prüfung gegen crew_members fehlt');
});

// Der teuerste denkbare Fehler an dieser Stelle: e.next() VOR der Prüfung. Dann läuft die
// Kette inkl. Anlegen durch und die Sperre ist wirkungslos — der Datensatz existiert
// bereits, wenn geworfen wird.
test('Hook: geprüft wird VOR e.next() (sonst ist der Datensatz schon angelegt)', () => {
  const m = hook.match(/onRecordCreateRequest\(function\(e\)\s*\{([\s\S]*?)\n\}, 'users'\);/);
  ok(m, 'users-Request-Hook nicht gefunden');
  const body = m[1];
  const posThrow = body.indexOf('not_allowlisted: Diese');
  const posNext  = body.indexOf('e.next()');
  ok(posThrow !== -1 && posNext !== -1, 'Abweisung oder e.next() fehlt');
  ok(posThrow < posNext, 'e.next() steht VOR der Abweisung — Sperre wäre wirkungslos');
});

test('Hook: Rolle kommt aus dem Pool ODER der Tour-Crew', () => {
  ok(/plan_id = "__pool__" && email = \{:email\}/.test(hook), 'Pool-Abfrage fehlt');
  ok(/email = \{:email\} && role != ""/.test(hook), 'Rückfall auf Tour-Crew fehlt');
});

test('login.html: abgewiesene Adresse bekommt einen verständlichen Hinweis', () => {
  ok(/not_allowlisted/.test(login), 'login.html erkennt die Hook-Kennung nicht');
  ok(/nicht freigegeben/.test(login), 'Hinweistext fehlt');
  ok(/status === 403|status===403/.test(login), 'Ablehnung durch die createRule (403) wird nicht behandelt');
});
