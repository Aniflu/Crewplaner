// Logik-Guard für den abonnierbaren Kalender-Feed (v0.27.0, tour-spezifisch ab v0.27.1):
// feedUrls baut aus POCKETBASE_URL + feed_token + Plan-ID die Abo-URLs (https für Google,
// webcal:// für Ein-Tipp-Abo). Der Feed enthält NUR die Termine der übergebenen Tour.
import { test, deepEq, eq } from './_assert.mjs';
import { feedUrls } from '../js/pure.js';

const BASE = 'https://api.crewplanner.nyxlightwork.de';
const PLAN = '03fs6r1o8cqeyt2';

test('feedUrls: https + webcal aus Basis, Token und Plan-ID', () => {
  deepEq(feedUrls(BASE, 'AbC123', PLAN), {
    https:  'https://api.crewplanner.nyxlightwork.de/ics/AbC123/03fs6r1o8cqeyt2',
    webcal: 'webcal://api.crewplanner.nyxlightwork.de/ics/AbC123/03fs6r1o8cqeyt2'
  });
});

test('feedUrls: nur das Schema wird zu webcal umgeschrieben (Rest identisch)', () => {
  const u = feedUrls(BASE, 'tok', PLAN);
  eq(u.webcal, u.https.replace(/^https/, 'webcal'));
});

test('feedUrls: nachgestellte Slashes in der Basis werden entfernt (kein //ics)', () => {
  eq(feedUrls('https://api.crewplanner.nyxlightwork.de///', 'x', PLAN).https,
     'https://api.crewplanner.nyxlightwork.de/ics/x/03fs6r1o8cqeyt2');
});

test('feedUrls: Token und Plan werden URL-kodiert', () => {
  eq(feedUrls(BASE, 'a b/c', 'p/q').https,
     'https://api.crewplanner.nyxlightwork.de/ics/a%20b%2Fc/p%2Fq');
});

test('feedUrls: fehlender Token/Plan → leere Segmente (Guard, kein Crash)', () => {
  eq(feedUrls(BASE, '', '').https, 'https://api.crewplanner.nyxlightwork.de/ics//');
  eq(feedUrls(BASE, null, null).https, 'https://api.crewplanner.nyxlightwork.de/ics//');
});
