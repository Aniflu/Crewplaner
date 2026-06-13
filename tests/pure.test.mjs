// Tests für js/pure.js — keine Browser-Stubs nötig (dependency-frei).
import { test, eq, deepEq, ok } from './_assert.mjs';
import { toISODate, eachDateInRange, normCrewName, sameCrew } from '../js/pure.js';

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
