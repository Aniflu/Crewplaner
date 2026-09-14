// Guard: die Auswahl von tools/purge-invites.mjs trifft genau die alten Datensätze.
//
// Warum als Test und nicht „einmal laufen lassen": Beide Instanzen sind seit v0.13.3 leer
// (0 und 0), ein Trockenlauf beweist also nichts. Und künstlich altern lässt sich nichts —
// `created` ist ein autodate-Feld, PocketBase setzt es selbst und nimmt keinen Wert entgegen.
// Ohne diesen Test wäre die Löschentscheidung erst bei echtem Bestand erprobt, also genau dann,
// wenn ein Fehler Daten kostet.
import { waehleAlte, grenzeFuer } from '../tools/purge-invites.mjs';
import { test, ok, eq } from './_assert.mjs';

// PocketBase-Schreibweise: 'YYYY-MM-DD HH:MM:SS.sssZ' (ISO mit Leerzeichen statt 'T').
const pbDatum = (msVorJetzt) =>
  new Date(Date.now() - msVorJetzt).toISOString().replace('T', ' ');

const TAG = 86400_000;

test('purge: älter als die Grenze fliegt raus, frischer bleibt', () => {
  const grenze = grenzeFuer(30);
  const datensaetze = [
    { id: 'alt1',   created: pbDatum(31 * TAG), type: 'update' },
    { id: 'alt2',   created: pbDatum(90 * TAG), type: 'invite' },
    { id: 'frisch', created: pbDatum(29 * TAG), type: 'update' },
    { id: 'heute',  created: pbDatum(0),        type: 'reminder' },
  ];
  const treffer = waehleAlte(datensaetze, grenze).map(r => r.id);
  eq(treffer.join(','), 'alt1,alt2', 'falsche Auswahl: ' + treffer.join(','));
});

test('purge: ohne created wird NICHT gelöscht', () => {
  // Datensätze aus der Zeit vor v0.13.4 haben keinen Zeitstempel. Ihr Alter ist unbekannt —
  // „unbekannt" darf nie „alt" bedeuten, sonst löscht der erste Lauf alles Alte mit.
  const grenze = grenzeFuer(30);
  const treffer = waehleAlte([
    { id: 'ohne' },
    { id: 'leer', created: '' },
    { id: 'null', created: null },
  ], grenze);
  eq(treffer.length, 0, 'Datensätze ohne Zeitstempel wurden ausgewählt');
});

test('purge: unlesbarer Zeitstempel wird NICHT gelöscht', () => {
  const treffer = waehleAlte([{ id: 'kaputt', created: 'gestern irgendwann' }], grenzeFuer(30));
  eq(treffer.length, 0, 'unlesbarer Zeitstempel wurde als alt gewertet');
});

test('purge: die Grenze hängt an --tage', () => {
  const datensaetze = [{ id: 'x', created: pbDatum(10 * TAG) }];
  eq(waehleAlte(datensaetze, grenzeFuer(30)).length, 0, 'bei 30 Tagen dürfte nichts wegfallen');
  eq(waehleAlte(datensaetze, grenzeFuer(7)).length, 1, 'bei 7 Tagen müsste der Datensatz wegfallen');
});

test('purge: leere Eingabe und Unsinn stürzen nicht ab', () => {
  ok(waehleAlte([], grenzeFuer(30)).length === 0);
  ok(waehleAlte(null, grenzeFuer(30)).length === 0);
  ok(waehleAlte([null, undefined], grenzeFuer(30)).length === 0);
});
