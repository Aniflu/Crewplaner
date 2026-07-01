// dedupKnownCrew (pure): tour-übergreifende Crew-Liste zusammenführen (für „Bekannte
// Crew übernehmen"). Doppelte Namen (case/trim) verschmelzen, Eintrag mit E-Mail
// bevorzugen, alphabetisch.
import { test, eq, deepEq } from './_assert.mjs';
import { dedupKnownCrew } from '../js/pure.js';

test('dedupKnownCrew: doppelte Namen zusammenführen, E-Mail bevorzugen', () => {
  const out = dedupKnownCrew([
    { name: 'Wolf Geffenius', email: '' },
    { name: ' wolf geffenius ', email: 'wolf@x.de' },   // gleiche Person, hat E-Mail
    { name: 'Oliver Thomas', email: 'oli@x.de' },
    { name: 'Oliver Thomas', email: 'anders@x.de' },     // erste E-Mail bleibt
  ]);
  eq(out.length, 2, 'zwei eindeutige Personen');
  deepEq(out.map(x => x.name), ['Oliver Thomas', 'Wolf Geffenius'], 'alphabetisch');
  eq(out.find(x => x.name === 'Wolf Geffenius').email, 'wolf@x.de', 'E-Mail vom Eintrag mit Mail übernommen');
  eq(out.find(x => x.name === 'Oliver Thomas').email, 'oli@x.de', 'erste vorhandene E-Mail bleibt');
});

test('dedupKnownCrew: leere/namelose Einträge ignorieren', () => {
  const out = dedupKnownCrew([
    { name: '', email: 'x@y.de' },
    { name: '   ', email: '' },
    { name: 'Kerrin Gall', email: '' },
    null,
  ]);
  deepEq(out.map(x => x.name), ['Kerrin Gall'], 'nur gültige Namen');
  eq(out[0].email, '', 'ohne E-Mail bleibt leer');
});
