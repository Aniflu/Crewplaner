// Hook v4.31: Der PocketBase-Superuser zählt in beiden assignments-Guards als Planer.
//
// Anlass (2026-11-14, Abnahme v4.30 auf Test): Ein Superuser-Konto hat keine `role` und ist
// nie Plan-Owner. Beide Guards hielten es deshalb für Crew und wiesen jedes Anlegen und jeden
// Statuswechsel über die normale API ab, auch wenn der Admin von Hand Daten pflegen wollte.
// Erkennung über `auth.isSuperuser()` (PocketBase-Record-Methode seit 0.23); fehlt die Methode,
// gilt das Konto wie bisher als Nicht-Superuser.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
const ENDE = "}, 'assignments');";

function lade(marker, art) {
  const von = hook.indexOf(marker);
  const hs = hook.lastIndexOf(art + '(', von);
  const he = hook.indexOf(ENDE, von) + ENDE.length;
  let handler = null;
  class BadRequestError extends Error {}
  const $app = { findRecordById: () => ({ getString: () => 'anderer-owner' }) };
  // eslint-disable-next-line no-new-func — Testcode, Eingabe ist die repo-eigene Hook-Datei
  new Function(art, 'BadRequestError', '$app', 'console', hook.slice(hs, he))(
    (fn) => { handler = fn; }, BadRequestError, $app, { log() {}, error() {} });
  return { handler, BadRequestError };
}

function lauf(h, rec, auth) {
  let weiter = false;
  try { h.handler({ auth, record: rec, next: () => { weiter = true; } }); }
  catch (err) { return err instanceof h.BadRequestError ? 'abgelehnt' : 'FEHLER ' + err; }
  return weiter ? 'erlaubt' : 'nichts';
}

const superuser = { id: 'su1', isSuperuser: () => true, getString: (k) => (k === 'email' ? 'admin@x.de' : '') };
const crew = { id: 'u1', isSuperuser: () => false, getString: (k) => (k === 'email' ? 'crew@x.de' : k === 'role' ? 'crew' : '') };
const crewAlt = { id: 'u1', getString: (k) => (k === 'email' ? 'crew@x.de' : k === 'role' ? 'crew' : '') };

const create = lade("throw new BadRequestError('assignment_create_denied", 'onRecordCreateRequest');
const update = lade('status_transition_denied', 'onRecordUpdateRequest');
const neu = (status) => ({ get: (k) => (k === 'status' ? status : k === 'crew_email' ? 'crew@x.de' : 'PLAN1') });
const geaendert = (alt, nach) => ({
  id: 'a1',
  get: (k) => (k === 'status' ? nach : k === 'crew_email' ? 'crew@x.de' : 'PLAN1'),
  original: () => ({ get: () => alt }),
});

test('Create-Guard v4.31: Superuser darf Einsätze anlegen', () =>
  eq(lauf(create, neu('proposed'), superuser), 'erlaubt'));

test('Update-Guard v4.31: Superuser darf den Status ändern', () =>
  eq(lauf(update, geaendert('proposed', 'confirmed'), superuser), 'erlaubt'));

test('Guards v4.31: Crew bleibt gesperrt, auch ohne isSuperuser-Methode', () => {
  eq(lauf(create, neu('confirmed'), crew), 'abgelehnt');
  eq(lauf(create, neu('confirmed'), crewAlt), 'abgelehnt');
  eq(lauf(update, geaendert('proposed', 'confirmed'), crew), 'abgelehnt');
  eq(lauf(update, geaendert('proposed', 'confirmed'), crewAlt), 'abgelehnt');
});
