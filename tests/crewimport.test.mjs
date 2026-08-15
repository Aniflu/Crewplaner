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

// ── Der Pool ist die Stammdatenquelle ────────────────────────────────────────────
// Gemeldet am 15.08.2026: Eine gerade unter „Benutzer" angelegte Person tauchte im
// Pool-Dialog der Tour nicht auf. Ursache: Stand dieselbe Adresse schon als crew_members-
// Eintrag IRGENDEINER Tour, verdrängte dieser den Pool-Eintrag — „erster Treffer bleibt",
// und „erster" hing an der Sortierung `-id`. PocketBase-IDs sind Zufallsketten, keine
// Reihenfolge: Welcher Datensatz gewann, war praktisch Würfeln. Im schlechten Fall zeigte
// der Dialog einen ALTEN Namen derselben Person, und der neue schien zu fehlen.
//
// Regel seit v0.8.5: Der Pool-Eintrag gewinnt IMMER. Er ist die Stammdatenquelle — der
// Tour-Eintrag ist nur eine Kopie aus dem Moment der Übernahme.
test('dedupKnownCrew: der Pool-Eintrag schlägt den Tour-Eintrag', () => {
  const ausTour = { name: 'L. Hawelky',    email: 'mail@hawelky-hoch.de', pool: false };
  const ausPool = { name: 'Leroy Hawelky', email: 'mail@hawelky-hoch.de', pool: true  };

  for (const reihenfolge of [[ausTour, ausPool], [ausPool, ausTour]]) {
    const out = dedupKnownCrew(reihenfolge);
    eq(out.length, 1, 'eine Person');
    eq(out[0].name, 'Leroy Hawelky',
       'der Pool-Name muss gewinnen — unabhängig von der Reihenfolge, die der Server liefert');
  }
});

test('dedupKnownCrew: zwei Tour-Einträge ohne Pool bleiben beim ersten', () => {
  // Ohne Pool-Eintrag ändert sich nichts am bisherigen Verhalten.
  const out = dedupKnownCrew([
    { name: 'Wolf Geffenius', email: 'wolf@x.de', pool: false },
    { name: 'W. Geffenius',   email: 'wolf@x.de', pool: false },
  ]);
  eq(out.length, 1);
  eq(out[0].name, 'Wolf Geffenius', 'erster Treffer bleibt');
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
