// Logik-Guard für die „Heute"-Markierung (v0.25.0): todayMarkers bestimmt, wo die
// Heute-Linie in der Tourtabelle sitzt (exakter Tag vs. nächster kommender Tag / Randfälle).
import { test, deepEq } from './_assert.mjs';
import { todayMarkers } from '../js/pure.js';

const tour = ['2026-07-04','2026-07-05','2026-07-08','2026-07-09']; // Lücke am 06./07.

test('todayMarkers: heute ist ein exakter Tourtag → today gesetzt, next null', () => {
  deepEq(todayMarkers(tour, '2026-07-05'), { today:'2026-07-05', next:null });
});

test('todayMarkers: heute in einer Lücke → next = erster kommender Tag', () => {
  deepEq(todayMarkers(tour, '2026-07-06'), { today:null, next:'2026-07-08' });
});

test('todayMarkers: heute vor Tourbeginn → next = erster Tag', () => {
  deepEq(todayMarkers(tour, '2026-06-30'), { today:null, next:'2026-07-04' });
});

test('todayMarkers: heute nach Tourende → today+next null (kein Strich)', () => {
  deepEq(todayMarkers(tour, '2026-08-01'), { today:null, next:null });
});

test('todayMarkers: unsortierte Eingabe → next = kleinstes Datum > heute', () => {
  deepEq(todayMarkers(['2026-07-09','2026-07-04','2026-07-08'], '2026-07-06'),
         { today:null, next:'2026-07-08' });
});

test('todayMarkers: leere/kaputte Werte ignoriert', () => {
  deepEq(todayMarkers([null,'','2026-07-08'], '2026-07-06'),
         { today:null, next:'2026-07-08' });
});
