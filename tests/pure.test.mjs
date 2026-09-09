// Tests für js/pure.js — keine Browser-Stubs nötig (dependency-frei).
import { test, eq, deepEq, ok } from './_assert.mjs';
import { toISODate, eachDateInRange, normCrewName, sameCrew, icsExportRows, crewIcsContent, pickApiUrl,
         CREW_STATUS_TRANSITIONS, isCrewStatusTransitionAllowed } from '../js/pure.js';

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

// ── icsExportRows (ICS: bestätigt UND vorgemerkt, v0.50.0) ────────────────────
const _dates = [{date:'2026-07-01',type:'show'},{date:'2026-07-02',type:'show'},{date:'2026-07-03',type:'reise'}];
const _pos = [{id:'gl',label:'Gewerkeleitung'},{id:'st',label:'Stage'}];
const _st = {
  '2026-07-01': { gl:{status:'confirmed',crewName:'Wolf'}, st:{status:'proposed',crewName:'Oliver'} },
  '2026-07-02': { gl:{status:'proposed',crewName:'Wolf'} },                     // nur angefragt
  '2026-07-03': { st:{status:'confirmed',crewName:'Oliver'} },
};

test('icsExportRows: nur Tage mit bestätigten Einsätzen (angefragt zählt nicht)', () => {
  const rows = icsExportRows(_dates, _pos, _st, {});
  deepEq(rows.map(r=>r.date), ['2026-07-01','2026-07-03'], '07-02 (nur proposed) fällt raus');
  deepEq(rows[0].slots, [{posLabel:'Gewerkeleitung',crewName:'Wolf',status:'confirmed'}], 'nur confirmed-Slot, proposed nicht');
  eq(rows[0].status, 'confirmed', 'Tagesstatus = bestätigt');
});

test('icsExportRows: vorgemerkt (✎) bleibt im Export, markiert als pencilled', () => {
  const dates=[{date:'2026-08-01',type:'show'}];
  const pos=[{id:'gl',label:'Gewerkeleitung'}];
  const st={'2026-08-01':{gl:{status:'pencilled',crewName:'Wolf'}}};
  const rows = icsExportRows(dates, pos, st, {});
  deepEq(rows.map(r=>r.date), ['2026-08-01'], 'vorgemerkter Tag ist im Kalender-Export enthalten');
  eq(rows[0].status, 'pencilled', 'Tagesstatus = vorgemerkt');
});

test('icsExportRows: bestätigt schlägt vorgemerkt im Tagesstatus', () => {
  const dates=[{date:'2026-08-02',type:'show'}];
  const pos=[{id:'gl',label:'GL'},{id:'st',label:'Stage'}];
  const st={'2026-08-02':{gl:{status:'pencilled',crewName:'Wolf'},st:{status:'confirmed',crewName:'Wolf'}}};
  const rows = icsExportRows(dates, pos, st, {});
  eq(rows[0].status, 'confirmed', 'ein bestätigter Slot macht den Tag bestätigt');
});

test('icsExportRows: cancelled/declined bleiben draußen', () => {
  const dates=[{date:'2026-08-03',type:'show'}];
  const pos=[{id:'gl',label:'GL'},{id:'st',label:'Stage'}];
  const st={'2026-08-03':{gl:{status:'declined',crewName:'Wolf'},st:{status:'cancelled',crewName:'Wolf'}}};
  deepEq(icsExportRows(dates, pos, st, {}), [], 'abgesagte/entfernte Einsätze nie im Kalender');
});

test('icsExportRows: onlyCrew filtert auf eigenen Namen', () => {
  const rows = icsExportRows(_dates, _pos, _st, { onlyCrew:true, myName:'wolf' });
  deepEq(rows.map(r=>r.date), ['2026-07-01'], 'nur Wolfs bestätigter Tag (Olivers 07-03 raus)');
});

test('icsExportRows: allowTypes filtert Tagestypen', () => {
  const rows = icsExportRows(_dates, _pos, _st, { allowTypes:new Set(['show']) });
  deepEq(rows.map(r=>r.date), ['2026-07-01'], 'reise-Tag 07-03 durch Typ-Filter raus');
});

// ── crewIcsContent: persönlicher Eintrag NUR Band/Ort/Art + Status ────────────
test('crewIcsContent: Status im Infofeld — bestätigt bzw. vorgemerkt', () => {
  const meta = { '2026-07-01': { loc:'Berlin – Arena', typeLabel:'Show' } };
  const conf = crewIcsContent('Provinz 2027', [{date:'2026-07-01', status:'confirmed', slots:[]}], meta);
  ok(/DESCRIPTION:.*Status: Best/.test(conf), 'bestätigter Tag trägt Status: Bestätigt');
  ok(conf.includes('STATUS:CONFIRMED'), 'VEVENT-STATUS = CONFIRMED');
  const pen = crewIcsContent('Provinz 2027', [{date:'2026-07-01', status:'pencilled', slots:[]}], meta);
  ok(/DESCRIPTION:.*Status: Vorgemerkt/.test(pen), 'vorgemerkter Tag trägt Status: Vorgemerkt');
  ok(pen.includes('STATUS:TENTATIVE'), 'vorgemerkt = TENTATIVE, nicht CONFIRMED');
});

// ── Titel = „Tour · Art" (v0.12.0) ───────────────────────────────────────────
// Vorher stand hier „Art: Ort", der Tourname nur in der Beschreibung. Wer in mehreren Touren
// steht, sah in der Monatsansicht also bloß „Reisetag" und wusste nicht, zu welcher Tour der
// Tag gehört. Kalender schneiden lange Titel ab — was vorne steht, sieht man sicher, deshalb
// der Tourname zuerst.
//
// Der Ort faellt damit aus dem Titel und MUSS als LOCATION erhalten bleiben, sonst verliert
// die Umstellung Information (in calendar.js und admin.html fehlte LOCATION bis v0.12.0).
test('crewIcsContent: Titel = Tour · Art, Ort als LOCATION, keine Crew-Namen', () => {
  const rows = [{date:'2026-07-01', status:'confirmed', slots:[{posLabel:'Gewerkeleitung',crewName:'Wolf',status:'confirmed'}]}];
  const meta = { '2026-07-01': { loc:'Berlin – Arena', typeLabel:'Show' } };
  const ics = crewIcsContent('Provinz 2027', rows, meta);
  ok(ics.includes('SUMMARY:Provinz 2027 · Show'), 'Titel = Tour · Art — bekommen: ' + (ics.match(/SUMMARY:.*/)||[''])[0]);
  ok(ics.includes('LOCATION:Berlin'), 'Ort bleibt als LOCATION erhalten');
  ok(/DESCRIPTION:Band: Provinz 2027/.test(ics), 'Band weiterhin in der Beschreibung');
  ok(/DESCRIPTION:.*Art: Show/.test(ics), 'Art in Beschreibung');
  ok(ics.includes('DTSTART;VALUE=DATE:20260701'), 'Ganztags-Datum');
  ok(!ics.includes('Wolf') && !ics.includes('Gewerkeleitung'), 'KEINE Crew-/Positionsnamen');
});

test('crewIcsContent: ohne Tournamen kein fuehrendes Trennzeichen', () => {
  const meta = { '2026-07-01': { loc:'Berlin', typeLabel:'Show' } };
  const ics = crewIcsContent('', [{date:'2026-07-01', status:'confirmed', slots:[]}], meta);
  const zeile = (ics.match(/SUMMARY:.*/)||[''])[0];
  ok(!/SUMMARY:\s*·/.test(zeile), 'Titel beginnt mit „ · " — bekommen: ' + zeile);
  ok(/SUMMARY:.*Show/.test(zeile), 'die Art muss trotzdem dastehen: ' + zeile);
});

test('crewIcsContent: ohne Art bleibt der Tourname allein stehen', () => {
  const meta = { '2026-07-01': { loc:'Berlin' } };
  const ics = crewIcsContent('Provinz 2027', [{date:'2026-07-01', status:'confirmed', slots:[]}], meta);
  const zeile = (ics.match(/SUMMARY:.*/)||[''])[0];
  ok(!/·\s*$/.test(zeile), 'Titel endet auf ein leeres Trennzeichen: ' + zeile);
  ok(zeile.includes('Provinz 2027'), 'Tourname fehlt: ' + zeile);
});

// ── pickApiUrl (Umgebungs-Auswahl Test vs. Live, v0.31.0) ─────────────────────
test('pickApiUrl: Live-Host → Live-API (mit und ohne www)', () => {
  eq(pickApiUrl('crewplanner.nyxlightwork.de'), 'https://api.crewplanner.nyxlightwork.de');
  eq(pickApiUrl('www.crewplanner.nyxlightwork.de'), 'https://api.crewplanner.nyxlightwork.de');
});

test('pickApiUrl: alles andere → Test-API (Sicherheits-Default "im Zweifel Test")', () => {
  eq(pickApiUrl('aniflu.github.io'), 'https://api-test.crewplanner.nyxlightwork.de', 'GitHub Pages → Test');
  eq(pickApiUrl('localhost'), 'https://api-test.crewplanner.nyxlightwork.de', 'lokal → Test');
  eq(pickApiUrl(''), 'https://api-test.crewplanner.nyxlightwork.de', 'leer/unbekannt → Test');
});

// ── Crew-Statuswechsel (v0.13.0) ──────────────────────────────────────────────
// Leitprinzip: Crew bewegt einen Status nur ABWÄRTS (Richtung declined). Die einzige
// Aufwärtsbewegung, die ihr gehört, ist die Antwort auf eine Anfrage (proposed → confirmed).
// Vormerken und Wiederbeleben sind Planer-Sache.

test('Crew-Übergänge: Anfrage beantworten — beides erlaubt', () => {
  ok(isCrewStatusTransitionAllowed('proposed', 'confirmed'), 'angefragt → bestätigt muss gehen');
  ok(isCrewStatusTransitionAllowed('proposed', 'declined'),  'angefragt → abgesagt muss gehen');
});

test('Crew-Übergänge: vorgemerkt darf NICHT selbst bestätigt werden (der gemeldete Fehler)', () => {
  ok(!isCrewStatusTransitionAllowed('pencilled', 'confirmed'),
     'vorgemerkt → bestätigt durch die Crew ist genau der Fehler, um den es geht');
});

test('Crew-Übergänge: vorgemerkt darf die Crew absagen', () =>
  ok(isCrewStatusTransitionAllowed('pencilled', 'declined')));

test('Crew-Übergänge: bestätigt darf die Crew noch absagen, aber nicht erneut bestätigen', () => {
  ok(isCrewStatusTransitionAllowed('confirmed', 'declined'), 'späte Absage muss möglich bleiben');
  ok(!isCrewStatusTransitionAllowed('confirmed', 'confirmed'), 'kein Selbstwechsel');
});

test('Crew-Übergänge: eine Absage nimmt nur der Planer zurück', () => {
  ok(!isCrewStatusTransitionAllowed('declined', 'confirmed'));
  ok(!isCrewStatusTransitionAllowed('declined', 'proposed'));
  ok(!isCrewStatusTransitionAllowed('declined', 'pencilled'));
});

test('Crew-Übergänge: niemand vermerkt sich selbst vor', () => {
  for (const von of ['proposed', 'confirmed', 'declined', 'pencilled', '', null])
    ok(!isCrewStatusTransitionAllowed(von, 'pencilled'), `${von} → pencilled darf die Crew nicht`);
});

test('Crew-Übergänge: ohne Record (nur geplant) darf die Crew antworten', () => {
  ok(isCrewStatusTransitionAllowed(null, 'confirmed'), 'defaultCrew-Slot ohne Record bestätigen');
  ok(isCrewStatusTransitionAllowed('',   'declined'),  'defaultCrew-Slot ohne Record absagen');
});

test('Crew-Übergänge: "Gesehen"-Quittung der Absage bleibt erlaubt', () =>
  ok(isCrewStatusTransitionAllowed('cancelled', 'cancel_acked')));

test('Crew-Übergänge: unbekannter Status wird abgelehnt, nicht durchgewunken', () => {
  ok(!isCrewStatusTransitionAllowed('assigned', 'confirmed'), 'Alt-/Fremdwert darf nichts erlauben');
  ok(!isCrewStatusTransitionAllowed('proposed', 'quatsch'),   'unbekanntes Ziel ist kein Ziel');
});

// Form der Tabelle festnageln: Der Hook (.pb_hooks/main.pb.js) führt eine handkopierte
// Zweitfassung, weil Goja kein `import` kann. Ändert jemand hier etwas, MUSS er dort
// nachziehen — tests/statusguard.test.mjs vergleicht beide Seiten.
test('Crew-Übergänge: Tabellenform ist festgenagelt (Anker gegen Drift zum Hook)', () =>
  deepEq(CREW_STATUS_TRANSITIONS, {
    proposed:  ['confirmed', 'declined'],
    confirmed: ['declined'],
    pencilled: ['declined'],
    cancelled: ['cancel_acked']
  }));
