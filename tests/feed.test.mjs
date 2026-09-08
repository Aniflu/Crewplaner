// Logik-Guard für den abonnierbaren Kalender-Feed (v0.27.0, tour-spezifisch ab v0.27.1):
// feedUrls baut aus POCKETBASE_URL + feed_token + Plan-ID die Abo-URLs (https für Google,
// webcal:// für Ein-Tipp-Abo). Der Feed enthält NUR die Termine der übergebenen Tour.
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, deepEq, eq, ok } from './_assert.mjs';
import { feedUrls, crewIcsContent } from '../js/pure.js';

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

// ── RFC 5545: die Pflichtfelder ───────────────────────────────────────────────
// Anlass (v0.10.4): DTSTAMP fehlte in JEDEM VEVENT — in beiden Ausgabewegen. Beim Abo-Feed
// verweigerten strikte Clients daraufhin das ganze Abo mit „Der Kalender konnte nicht
// hinzugefügt werden. Bitte überprüfen Sie die URL" — eine Meldung, die auf die URL zeigt,
// während der Fehler im Inhalt steckt. An Peters Live-Feed gemessen: 33 Events, 0 DTSTAMP.
//
// Der Guard prüft den Ausgabeweg, den es im Repo als Code gibt (crewIcsContent). Die
// zweite Ausgabe sitzt im PocketBase-Hook und wird darunter über die Quelle geprüft.
const ROWS = [
  { date: '2027-07-04', status: 'confirmed' },
  { date: '2027-07-05', status: 'pencilled' },
];
const META = { '2027-07-04': { loc: 'CAB', typeLabel: 'Vorbereitung' }, '2027-07-05': { loc: 'BBM' } };

test('crewIcsContent: jedes VEVENT trägt DTSTAMP, UID und DTSTART', () => {
  const ics = crewIcsContent('AMK 2027', ROWS, META);
  const events = ics.split('BEGIN:VEVENT').slice(1);
  eq(events.length, 2);
  for (const ev of events) {
    ok(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/.test('\r\n' + ev), 'DTSTAMP fehlt oder hat falsches Format');
    ok(/\r\nUID:/.test('\r\n' + ev), 'UID fehlt');
    ok(/\r\nDTSTART;VALUE=DATE:\d{8}/.test('\r\n' + ev), 'DTSTART fehlt');
  }
});

test('crewIcsContent: der Kalender trägt den Tournamen (nicht zweimal denselben Titel)', () => {
  // Wer in zwei Touren steht, bekam sonst zwei gleichnamige Kalender nebeneinander.
  const ics = crewIcsContent('AMK 2027', ROWS, META);
  ok(ics.includes('X-WR-CALNAME:AMK 2027'), 'X-WR-CALNAME trägt nicht den Tournamen');
  ok(ics.includes('NAME:AMK 2027'), 'NAME fehlt (Outlook/Google lesen eher NAME)');
});

test('crewIcsContent: Zeilen enden auf CRLF (RFC 5545 verlangt es)', () => {
  const ics = crewIcsContent('AMK 2027', ROWS, META);
  ok(!/[^\r]\n/.test(ics), 'es gibt Zeilenenden ohne CR');
});

// ── Der Feed im PocketBase-Hook ──────────────────────────────────────────────
// Der Hook läuft im Server-Volume und lässt sich hier nicht ausführen — geprüft wird die
// Quelle, wie es die anderen Hook-Guards in diesem Projekt auch tun. Das fängt genau den
// Rückfall ab, der v0.10.4 nötig gemacht hat.
const hookPfad = join(dirname(fileURLToPath(import.meta.url)), '..', '.pb_hooks', 'main.pb.js');
const hook = existsSync(hookPfad) ? readFileSync(hookPfad, 'utf8') : '';
const icsRoute = hook.split("routerAdd('GET', '/ics/{token}/{plan}'")[1] || '';

test('Hook /ics: der Feed schreibt DTSTAMP in jedes VEVENT', () => {
  ok(icsRoute, '/ics-Route in .pb_hooks/main.pb.js nicht gefunden');
  ok(/'DTSTAMP:'\s*\+/.test(icsRoute), 'die /ics-Route gibt kein DTSTAMP aus');
});

test('Hook /ics: der Kalendername ist nicht mehr fest verdrahtet', () => {
  ok(icsRoute, '/ics-Route nicht gefunden');
  ok(!/X-WR-CALNAME:Crewplaner['"]/.test(icsRoute),
     'X-WR-CALNAME steht wieder fest auf „Crewplaner" — zwei Touren ergeben zwei gleichnamige Abos');
});

// ── Tourname im sichtbaren Titel (v0.12.0) ────────────────────────────────────
// Der Kalendername (X-WR-CALNAME) trägt den Tournamen seit v0.10.4 — in der Monatsansicht
// sieht man davon aber nichts, dort zählt allein SUMMARY. Wer in zwei Touren steht, las
// deshalb bloß „Reisetag" und wusste nicht, zu welcher Tour der Tag gehört.
test('Hook /ics: der sichtbare Titel beginnt mit dem Tournamen', () => {
  ok(icsRoute, '/ics-Route nicht gefunden');
  const titel = (icsRoute.match(/var title = [^;]+;/) || [''])[0];
  ok(titel, 'keine Titel-Bildung in der /ics-Route gefunden');
  ok(/m\.band/.test(titel),
     'der Tourname (m.band) geht nicht in den Titel ein — bekommen: ' + titel);
  // Nicht nur „kommt vor": Bis v0.12.0 stand m.band lediglich als Fallback am Ende
  // (`[art, loc].join(': ') || m.band`) — sichtbar war er damit nie. Er muss VORNE stehen,
  // weil Kalender in der Monatsansicht abschneiden.
  ok(titel.indexOf('m.band') < titel.indexOf('art'),
     'der Tourname steht nicht vorne im Titel — bekommen: ' + titel);
});

// Der Ort wandert aus dem Titel in das eigene Feld. Fehlt LOCATION in einem Ausgabeweg, ist
// er dort komplett weg — in calendar.js und admin.html war das bis v0.12.0 der Fall.
test('alle vier ICS-Wege setzen LOCATION (sonst geht der Ort verloren)', () => {
  const root2 = join(dirname(fileURLToPath(import.meta.url)), '..');
  const ohne = [];
  for (const f of ['js/pure.js', 'js/calendar.js', 'admin.html', '.pb_hooks/main.pb.js'])
    if (!/LOCATION/.test(readFileSync(join(root2, f), 'utf8'))) ohne.push(f);
  ok(ohne.length === 0,
     'ohne LOCATION: ' + ohne.join(', ') + ' — dort sieht niemand mehr, wo der Termin ist');
});
