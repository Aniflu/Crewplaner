// Vereintes Crew-Verzeichnis (v0.23.0): reine Merge- und Rename-Logik (pure.js).
import { test, eq, deepEq, ok } from './_assert.mjs';
import { mergeCrewDirectory, renameInPlanData } from '../js/pure.js';

const plans = [
  { id: 'AMK',   name: 'AMK Tour 2026' },
  { id: 'PROV',  name: 'Provinz 2027' },
];

test('mergeCrewDirectory: Konto+Pool+Tour derselben Mail = 1 Eintrag', () => {
  const users = [{ id: 'u1', email: 'Robert@x.de', name: '', role: 'crew', verified: true }];
  const crew = [
    { id: 'c1', plan_id: '__pool__', name: 'Robert Steinmetz', email: 'robert@x.de', role: 'crew' },
    { id: 'c2', plan_id: 'AMK',      name: 'Robert Steinmetz', email: 'robert@x.de' },
  ];
  const dir = mergeCrewDirectory(users, crew, plans);
  eq(dir.length, 1, 'ein zusammengeführter Eintrag');
  const e = dir[0];
  eq(e.name, 'Robert Steinmetz', 'Name aus crew_members (nicht leerer users.name)');
  ok(e.account && e.account.id === 'u1', 'Konto verknüpft');
  ok(e.pool && e.pool.id === 'c1', 'Pool-Record verknüpft');
  eq(e.tours.length, 1, 'in einer Tour');
  eq(e.tours[0].planName, 'AMK Tour 2026', 'Tour-Name aufgelöst');
});

test('mergeCrewDirectory: verschiedene Mails bleiben getrennt; Rolle vom Konto', () => {
  const users = [{ id: 'u1', email: 'a@x.de', name: 'A', role: 'manager', verified: true }];
  const crew  = [{ id: 'c9', plan_id: '__pool__', name: 'B Person', email: 'b@x.de', role: 'booker' }];
  const dir = mergeCrewDirectory(users, crew, plans);
  eq(dir.length, 2, 'zwei getrennte Personen');
  const a = dir.find(x => x.email === 'a@x.de');
  const b = dir.find(x => x.email === 'b@x.de');
  eq(a.role, 'manager', 'Konto-Rolle gewinnt');
  ok(!a.pool, 'A ohne Pool');
  eq(b.role, 'booker', 'Pool-Rolle wenn kein Konto');
  ok(!b.account, 'B ohne Konto');
});

test('mergeCrewDirectory: Person ohne E-Mail wird per Name gekeyt; robust', () => {
  const crew = [
    { id: 'c1', plan_id: 'AMK', name: 'Ohne Mail', email: '' },
    { id: 'c2', plan_id: 'PROV', name: 'ohne mail', email: '' }, // gleicher Name → merge
    null,
  ];
  const dir = mergeCrewDirectory([], crew, plans);
  eq(dir.length, 1, 'per Name zusammengeführt');
  eq(dir[0].tours.length, 2, 'in beiden Touren');
  eq(dir[0].email, '', 'keine E-Mail');
});

test('renameInPlanData: ersetzt in crew/defaultCrew/assignments, Fremdnamen unberührt', () => {
  const pd = {
    crew: ['Alt Name', 'Andere'],
    defaultCrew: { p1: 'Alt Name', p2: 'Andere' },
    assignments: { '2026-06-23': { p1: 'Alt Name', p2: 'Andere' } },
    tourDates: [{ date: '2026-06-23' }],
  };
  const out = renameInPlanData(pd, 'Alt Name', 'Neu Name');
  deepEq(out.crew, ['Neu Name', 'Andere']);
  eq(out.defaultCrew.p1, 'Neu Name');
  eq(out.defaultCrew.p2, 'Andere');
  eq(out.assignments['2026-06-23'].p1, 'Neu Name');
  eq(out.assignments['2026-06-23'].p2, 'Andere');
  deepEq(out.tourDates, [{ date: '2026-06-23' }], 'andere Felder bleiben');
});

test('renameInPlanData: mutiert die Eingabe NICHT (immutabel)', () => {
  const pd = { crew: ['Alt'], defaultCrew: { p1: 'Alt' }, assignments: { d: { p1: 'Alt' } } };
  const out = renameInPlanData(pd, 'Alt', 'Neu');
  eq(pd.crew[0], 'Alt', 'Original-crew unverändert');
  eq(pd.defaultCrew.p1, 'Alt', 'Original-defaultCrew unverändert');
  eq(pd.assignments.d.p1, 'Alt', 'Original-assignments unverändert');
  eq(out.crew[0], 'Neu');
  ok(out !== pd, 'neues Objekt');
});
