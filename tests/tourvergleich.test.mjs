// Tourvergleich (v1.2.0): reine Vergleichslogik zweier Touren — Raster, Konflikte, Umsetzen.
import './_setup.mjs';
import { test, eq, deepEq, ok } from './_assert.mjs';
import { OFFEN } from '../js/state.js';
import {
  isPerson, effective, overlapDays, slotsOf, personMatrix, dayDemand,
  candidates, applySlot, planMove, planAssign
} from '../js/tourvergleich.js';

// Echte PB-Form: JSON-String geparst wie in loadSelectedPlan
const A = () => JSON.parse(JSON.stringify({ version:3, crew:['Anna Bauer','Tom Richter','Max Mustermann'],
  positions:[{id:'gl',label:'GL',short:'GL'},{id:'lt1',label:'Licht 1',short:'Licht 1'}],
  defaultCrew:{ gl:'Anna Bauer', lt1:'Tom Richter' },
  tourDates:[{date:'2026-07-08',type:'show',typeLabel:'Show',loc:'X'},{date:'2026-07-09',type:'show',typeLabel:'Show',loc:'Y'}],
  assignments:{ '2026-07-08':{ lt1:'__offen__' } } }));
const B = () => JSON.parse(JSON.stringify({ version:3, crew:['anna bauer ','Sara Klein','Tom Richter'],
  positions:[{id:'gl',label:'GL',short:'GL'},{id:'sys',label:'System',short:'Sys'}],
  defaultCrew:{ gl:'Sara Klein', sys:'Tom Richter' },
  tourDates:[{date:'2026-07-09',type:'show',typeLabel:'Show',loc:'Y'},{date:'2026-07-10',type:'show',typeLabel:'Show',loc:'Z'}],
  assignments:{ '2026-07-09':{ gl:'anna bauer ' } } }));

const DAYS = ['2026-07-08','2026-07-09','2026-07-10'];

test('isPerson: Platzhalter und leer sind keine Personen', () => {
  ok(isPerson('Anna Bauer'));
  ok(!isPerson('')); ok(!isPerson('__offen__')); ok(!isPerson('__offday__'));
  ok(!isPerson('__reise_tag__')); ok(!isPerson('__ausschreiben__'));
});
test('effective: Abweichung (auch leer) vor Stammbesetzung', () => {
  const a = A();
  eq(effective(a, '2026-07-08', 'lt1'), '__offen__');
  eq(effective(a, '2026-07-09', 'gl'), 'Anna Bauer');
  a.assignments['2026-07-09'] = { gl:'' };
  eq(effective(a, '2026-07-09', 'gl'), '');
});
test('overlapDays: nur gemeinsame Tage', () => deepEq(overlapDays(A(), B()), ['2026-07-09']));
test('personMatrix: Konflikt über Abweichung (B) + Stammbesetzung (A)', () => {
  const c = personMatrix(A(), B(), { days:DAYS, onlyShared:false }).cells['Anna Bauer']['2026-07-09'];
  eq(c.state, 'conflict'); deepEq(c.aPos, ['gl']); deepEq(c.bPos, ['gl']);
});
test('personMatrix: Konflikt über zwei Stammbesetzungen', () => {
  const c = personMatrix(A(), B(), { days:DAYS, onlyShared:false }).cells['Tom Richter']['2026-07-09'];
  eq(c.state, 'conflict'); deepEq(c.aPos, ['lt1']); deepEq(c.bPos, ['sys']);
});
test('personMatrix: Platzhalter ist keine Person', () => {
  const c = personMatrix(A(), B(), { days:['2026-07-08'], onlyShared:false }).cells['Tom Richter']['2026-07-08'];
  ok(c.state === 'freeA' || c.state === 'freeBoth'); ok(c.state !== 'A');
});
test('personMatrix: Name normalisiert, gemeinsam zuerst', () => {
  const m = personMatrix(A(), B(), { days:DAYS, onlyShared:false });
  deepEq(m.people.slice(0, 2).map(p => p.name), ['Anna Bauer', 'Tom Richter']);
  ok(m.people[0].inA && m.people[0].inB && m.people[1].inA && m.people[1].inB);
  ok(!m.people.some(p => p.name === 'anna bauer '));
  ok(!('anna bauer ' in m.cells));
  // Einzelne danach, in Crew-Reihenfolge
  deepEq(m.people.slice(2).map(p => p.name), ['Max Mustermann', 'Sara Klein']);
});
test('personMatrix: onlyShared filtert', () => {
  const names = personMatrix(A(), B(), { days:DAYS, onlyShared:true }).people.map(p => p.name);
  ok(!names.includes('Max Mustermann')); ok(!names.includes('Sara Klein')); eq(names.length, 2);
});
test('personMatrix: Zustände A / B / freeB / none', () => {
  const m = personMatrix(A(), B(), { days:DAYS, onlyShared:false });
  eq(m.cells['Max Mustermann']['2026-07-09'].state, 'freeBoth');
  eq(m.cells['Max Mustermann']['2026-07-10'].state, 'freeB');
  eq(m.cells['Max Mustermann']['2026-07-08'].state, 'freeA');
  eq(m.cells['Sara Klein']['2026-07-10'].state, 'B');
  deepEq(m.cells['Sara Klein']['2026-07-10'].bPos, ['gl']);
  const a = A(); a.tourDates = [];
  eq(personMatrix(a, B(), { days:['2026-07-08'], onlyShared:false }).cells['Tom Richter']['2026-07-08'].state, 'none');
});
test('personMatrix: Person doppelt in A am selben Tag → beide Positionen', () => {
  const a = A(); a.assignments['2026-07-09'] = { lt1:'Anna Bauer' };
  const c = personMatrix(a, B(), { days:['2026-07-09'], onlyShared:false }).cells['Anna Bauer']['2026-07-09'];
  deepEq(c.aPos, ['gl', 'lt1']);
});
test('slotsOf: nach normalisiertem Namen', () => deepEq(slotsOf(B(), '2026-07-09', 'ANNA bauer'), ['gl']));
test('dayDemand: OFFEN zählt offen, Tag fehlt → 0/0', () => {
  deepEq(dayDemand(A(), '2026-07-08'), { total:2, open:1 });
  deepEq(dayDemand(A(), '2026-07-10'), { total:0, open:0 });
});
test('dayDemand: OFFDAY/REISE_TAG zählen nicht als offen, leer und AUSSCHREIBEN schon', () => {
  const a = A(); a.assignments['2026-07-09'] = { gl:'__offday__', lt1:'__ausschreiben__' };
  deepEq(dayDemand(a, '2026-07-09'), { total:2, open:1 });
  a.assignments['2026-07-09'] = { gl:'', lt1:'__reise_tag__' };
  deepEq(dayDemand(a, '2026-07-09'), { total:2, open:1 });
});
test('candidates: frei vor anderer Tour vor gleicher Tour', () => {
  const a = applySlot(A(), '2026-07-09', 'gl', '');
  const c = candidates(a, B(), '2026-07-09', 'gl');
  deepEq(c.map(x => x.kind), ['free', 'other', 'same']);
  deepEq(c.map(x => x.name), ['Max Mustermann', 'Anna Bauer', 'Tom Richter']);
  deepEq(c[1].otherPos, ['gl']);
});
test('candidates: aktuelle Besetzung des Slots fehlt', () => {
  ok(!candidates(A(), B(), '2026-07-09', 'gl').some(x => x.name === 'Anna Bauer'));
});
test('applySlot: Rückkehr zur Stammbesetzung löscht Abweichung', () => {
  const a = A(), snap = JSON.stringify(a);
  const r = applySlot(a, '2026-07-08', 'lt1', 'Tom Richter');
  eq(r.assignments['2026-07-08'], undefined);
  eq(JSON.stringify(a), snap);
});
test('applySlot: setzt Abweichung, behält andere Einträge', () => {
  const a = A(); a.assignments['2026-07-08'].gl = 'Max Mustermann';
  const r = applySlot(a, '2026-07-08', 'lt1', 'Max Mustermann');
  eq(r.assignments['2026-07-08'].gl, 'Max Mustermann'); eq(r.assignments['2026-07-08'].lt1, 'Max Mustermann');
  const r2 = applySlot(A(), '2026-07-09', 'gl', 'Max Mustermann');
  eq(r2.assignments['2026-07-09'].gl, 'Max Mustermann');
});
test('planMove: keep A öffnet alle B-Plätze', () => {
  const b = B(); b.assignments['2026-07-09'].gl = 'Tom Richter'; // Tom auf gl (Abweichung) + sys (Stamm)
  const steps = planMove({ a:A(), b, date:'2026-07-09', name:'Tom Richter', keep:'A' });
  deepEq(steps, [{ tour:'B', posId:'gl', value:OFFEN }, { tour:'B', posId:'sys', value:OFFEN }]);
});
test('planMove: keep B öffnet A-Plätze', () => {
  deepEq(planMove({ a:A(), b:B(), date:'2026-07-09', name:'Anna Bauer', keep:'B' }),
    [{ tour:'A', posId:'gl', value:OFFEN }]);
});
test('planAssign: zieht Person aus anderer Tour ab', () => {
  const steps = planAssign({ self:A(), other:B(), selfTour:'A', date:'2026-07-09', posId:'lt1', name:'Tom Richter' });
  deepEq(steps, [{ tour:'A', posId:'lt1', value:'Tom Richter' }, { tour:'B', posId:'sys', value:OFFEN }]);
});
test('planAssign: null = Stammbesetzung, OFFEN erlaubt', () => {
  deepEq(planAssign({ self:A(), other:B(), selfTour:'A', date:'2026-07-09', posId:'gl', name:null }),
    [{ tour:'A', posId:'gl', value:'Anna Bauer' }]);
  deepEq(planAssign({ self:A(), other:B(), selfTour:'B', date:'2026-07-09', posId:'gl', name:OFFEN }),
    [{ tour:'B', posId:'gl', value:OFFEN }]);
});
test('robust: leere Pläne', () => {
  const empty = { crew:[], positions:[], tourDates:[] };
  const m = personMatrix(empty, B(), { days:DAYS, onlyShared:false });
  ok(m.people.length > 0);
  deepEq(dayDemand({}, '2026-07-09'), { total:0, open:0 });
  deepEq(overlapDays({}, B()), []);
  eq(effective({}, '2026-07-09', 'gl'), '');
  deepEq(candidates({}, B(), '2026-07-09', 'gl'), []);
  deepEq(applySlot({}, '2026-07-09', 'gl', 'X').assignments, { '2026-07-09':{ gl:'X' } });
});
