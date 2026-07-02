// Tests für js/pure.js — keine Browser-Stubs nötig (dependency-frei).
import { test, eq, deepEq, ok } from './_assert.mjs';
import { toISODate, eachDateInRange, normCrewName, sameCrew, confirmedIcsRows, crewIcsContent } from '../js/pure.js';

// ── eachDateInRange ───────────────────────────────────────────────────────────
test('eachDateInRange: Einzeltag', () =>
  deepEq(eachDateInRange('2026-07-01','2026-07-01'), ['2026-07-01']));

test('eachDateInRange: Mehrtagesbereich + Reihenfolge', () =>
  deepEq(eachDateInRange('2026-07-01','2026-07-03'), ['2026-07-01','2026-07-02','2026-07-03']));

test('eachDateInRange: Monatsgrenze', () =>
  deepEq(eachDateInRange('2026-06-30','2026-07-02'), ['2026-06-30','2026-07-01','2026-07-02']));

test('eachDateInRange: Jahresgrenze', () =>
  deepEq(eachDateInRange('2027-12-31','2028-01-01'), ['2027-12-31','2028-01-01']));

test('eachDateInRange: Schaltjahr (29.02.2028)', () =>
  deepEq(eachDateInRange('2028-02-28','2028-03-01'), ['2028-02-28','2028-02-29','2028-03-01']));

test('eachDateInRange: umgekehrter Bereich → leer', () =>
  deepEq(eachDateInRange('2026-07-03','2026-07-01'), []));

test('eachDateInRange: leere Eingabe → leer', () =>
  deepEq(eachDateInRange('', '2026-07-01'), []));

// Kernregression: erstes Element == Eingabe-Startdatum (KEIN Off-by-one).
// Unter TZ=Europe/Berlin lieferte der alte toISOString()-Code hier den Vortag.
test('eachDateInRange: KEIN Off-by-one (Start == erstes Element, TZ-Regression)', () =>
  eq(eachDateInRange('2026-07-01','2026-07-05')[0], '2026-07-01'));

test('eachDateInRange: letztes Element == Enddatum', () =>
  eq(eachDateInRange('2026-07-01','2026-07-05').at(-1), '2026-07-05'));

// ── toISODate ─────────────────────────────────────────────────────────────────
test('toISODate: lokale Felder, kein UTC-Versatz', () =>
  eq(toISODate(new Date(2026, 6, 1)), '2026-07-01')); // Monat 6 = Juli

test('toISODate: Padding ein-/zweistellig', () =>
  eq(toISODate(new Date(2026, 0, 5)), '2026-01-05'));

// ── Namensvergleich ───────────────────────────────────────────────────────────
test('sameCrew: trim + case-insensitiv', () => {
  ok(sameCrew(' Oliver Thomas ', 'oliver thomas'));
  ok(!sameCrew('Oliver', 'Wolf'));
});

test('normCrewName: null/leer/whitespace', () => {
  eq(normCrewName(null), '');
  eq(normCrewName(undefined), '');
  eq(normCrewName('  Wolf Geffenius '), 'wolf geffenius');
});

// ── confirmedIcsRows (ICS nur bestätigt) ──────────────────────────────────────
const _dates = [{date:'2026-07-01',type:'show'},{date:'2026-07-02',type:'show'},{date:'2026-07-03',type:'reise'}];
const _pos = [{id:'gl',label:'Gewerkeleitung'},{id:'st',label:'Stage'}];
const _st = {
  '2026-07-01': { gl:{status:'confirmed',crewName:'Wolf'}, st:{status:'proposed',crewName:'Oliver'} },
  '2026-07-02': { gl:{status:'proposed',crewName:'Wolf'} },                     // nichts confirmed
  '2026-07-03': { st:{status:'confirmed',crewName:'Oliver'} },
};

test('confirmedIcsRows: nur Tage mit bestätigten Einsätzen', () => {
  const rows = confirmedIcsRows(_dates, _pos, _st, {});
  deepEq(rows.map(r=>r.date), ['2026-07-01','2026-07-03'], '07-02 (nur proposed) fällt raus');
  deepEq(rows[0].confirmed, [{posLabel:'Gewerkeleitung',crewName:'Wolf'}], 'nur confirmed-Slot, proposed nicht');
});

test('confirmedIcsRows: onlyCrew filtert auf eigenen Namen', () => {
  const rows = confirmedIcsRows(_dates, _pos, _st, { onlyCrew:true, myName:'wolf' });
  deepEq(rows.map(r=>r.date), ['2026-07-01'], 'nur Wolfs bestätigter Tag (Olivers 07-03 raus)');
});

test('confirmedIcsRows: allowTypes filtert Tagestypen', () => {
  const rows = confirmedIcsRows(_dates, _pos, _st, { allowTypes:new Set(['show']) });
  deepEq(rows.map(r=>r.date), ['2026-07-01'], 'reise-Tag 07-03 durch Typ-Filter raus');
});

// ── crewIcsContent: persönlicher Eintrag NUR Band/Ort/Art ─────────────────────
test('crewIcsContent: Titel = Art: Ort, Band in Details, keine Crew-Namen', () => {
  const rows = [{date:'2026-07-01', confirmed:[{posLabel:'Gewerkeleitung',crewName:'Wolf'}]}];
  const meta = { '2026-07-01': { loc:'Berlin – Arena', typeLabel:'Show' } };
  const ics = crewIcsContent('Provinz 2027', rows, meta);
  ok(ics.includes('SUMMARY:Show: Berlin'), 'Titel = Art: Ort');
  ok(!ics.includes('SUMMARY:Provinz 2027'), 'Band NICHT im Titel');
  ok(ics.includes('LOCATION:Berlin'), 'Ort als LOCATION');
  ok(/DESCRIPTION:Band: Provinz 2027/.test(ics), 'Band in Beschreibung');
  ok(/DESCRIPTION:.*Art: Show/.test(ics), 'Art in Beschreibung');
  ok(ics.includes('DTSTART;VALUE=DATE:20260701'), 'Ganztags-Datum');
  ok(!ics.includes('Wolf') && !ics.includes('Gewerkeleitung'), 'KEINE Crew-/Positionsnamen');
});
