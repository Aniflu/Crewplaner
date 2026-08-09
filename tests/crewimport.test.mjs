// dedupKnownCrew (pure): tour-übergreifende Crew-Liste für „Aus Crew-Pool wählen".
// Identität = E-Mail (nicht Name!) → zwei gleichnamige Personen mit verschiedenen Mails
// bleiben getrennt (Wurzel des v0.19.1-Bugs: „Marco Hoch" Admin vs. GL-Crew wurden über
// den Namen verschmolzen → falsche Mail importiert).
import { test, eq, deepEq, ok } from './_assert.mjs';
import { dedupKnownCrew } from '../js/pure.js';

test('dedupKnownCrew: gleiche Namen, VERSCHIEDENE Mails bleiben getrennt', () => {
  const out = dedupKnownCrew([
    { name: 'Marco Hoch', email: 'admin@example.com' },   // Admin
    { name: 'Marco Hoch', email: 'crew@example.com' }, // GL-Crew — andere Person
    { name: 'Marco Hoch', email: 'crew@example.com' }, // Duplikat gleicher Mail → merge
  ]);
  eq(out.length, 2, 'zwei verschiedene Personen (per Mail unterschieden)');
  const mails = out.map(x => x.email).sort();
  deepEq(mails, ['admin@example.com', 'crew@example.com'], 'beide Mails erhalten');
});

test('dedupKnownCrew: gleiche Mail (abweichende Schreibweise) → ein Eintrag', () => {
  const out = dedupKnownCrew([
    { name: 'Wolf Geffenius', email: 'Wolf@x.de' },
    { name: ' wolf geffenius ', email: 'wolf@x.de' },   // gleiche Mail (case) → merge
  ]);
  eq(out.length, 1, 'eine Person');
  eq(out[0].email, 'Wolf@x.de', 'erste Mail-Schreibweise bleibt');
});

test('dedupKnownCrew: ohne E-Mail nach Name; leere/namelose ignorieren', () => {
  const out = dedupKnownCrew([
    { name: 'Kerrin Gall', email: '' },
    { name: 'kerrin gall', email: '' },   // gleicher Name ohne Mail → merge
    { name: '', email: 'x@y.de' },          // namenlos → ignorieren
    null,
  ]);
  deepEq(out.map(x => x.name), ['Kerrin Gall'], 'nur gültige, per Name zusammengeführt');
  eq(out[0].email, '', 'ohne E-Mail bleibt leer');
});
