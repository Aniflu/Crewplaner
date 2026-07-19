// Logik-Guard für den abonnierbaren Kalender-Feed (v0.27.0): feedUrls baut aus
// POCKETBASE_URL + feed_token die Abo-URLs (https für Google, webcal:// für Ein-Tipp-Abo).
import { test, deepEq, eq } from './_assert.mjs';
import { feedUrls } from '../js/pure.js';

const BASE = 'https://api.crewplanner.nyxlightwork.de';

test('feedUrls: https + webcal aus Basis-URL und Token', () => {
  deepEq(feedUrls(BASE, 'AbC123'), {
    https:  'https://api.crewplanner.nyxlightwork.de/ics/AbC123',
    webcal: 'webcal://api.crewplanner.nyxlightwork.de/ics/AbC123'
  });
});

test('feedUrls: nur das Schema wird zu webcal umgeschrieben (Rest identisch)', () => {
  const u = feedUrls(BASE, 'tok');
  eq(u.webcal, u.https.replace(/^https/, 'webcal'));
});

test('feedUrls: nachgestellte Slashes in der Basis werden entfernt (kein //ics)', () => {
  eq(feedUrls('https://api.crewplanner.nyxlightwork.de///', 'x').https,
     'https://api.crewplanner.nyxlightwork.de/ics/x');
});

test('feedUrls: Token wird URL-kodiert', () => {
  eq(feedUrls(BASE, 'a b/c').https, 'https://api.crewplanner.nyxlightwork.de/ics/a%20b%2Fc');
});

test('feedUrls: leerer/fehlender Token → leerer Token-Teil (Guard, kein Crash)', () => {
  eq(feedUrls(BASE, '').https, 'https://api.crewplanner.nyxlightwork.de/ics/');
  eq(feedUrls(BASE, null).https, 'https://api.crewplanner.nyxlightwork.de/ics/');
});
