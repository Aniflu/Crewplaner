// Guards für die CORS-Middleware (Hook v4.17, wirksam ab v4.18).
//
// Vorgeschichte: v4.17 setzte die Header NACH `e.next()`. Der Hook lud sauber, lief ohne
// Fehler und änderte keinen einzigen Header — `e.next()` arbeitet den Request komplett ab,
// danach sind die Header in Go längst raus. Vom Admin am 2026-08-05 am echten Backend
// gemessen; im Log war nichts zu sehen („v4.17 geladen" beweist nur, dass der Hook LÄDT).
//
// Der Hook läuft in PocketBases Goja-Engine und ist unter Node nicht ausführbar — diese
// Tests sichern deshalb statisch die beiden Eigenschaften ab, an denen es hing. Die
// inhaltliche Prüfung macht `node tools/check-pb-rules.mjs` gegen das echte Backend.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

// Den Middleware-Block herausschneiden: von `routerUse(` bis zur schließenden Zeile `});`
// am Zeilenanfang. Kommentare vorher entfernen, sonst schlagen die Prüfungen auf die
// Erklärungen im Block an (dieselbe Falle wie bei den v0.5.2-/v0.6.1-Guards) — dabei `//`
// in URLs stehen lassen (`(^|[^:])//`).
function middleware() {
  const m = hook.match(/^routerUse\(function\(e\)\s*\{[\s\S]*?^\}\);/m);
  ok(m, 'routerUse-Middleware nicht gefunden');
  return m[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('Hook: CORS-Middleware ist vorhanden und setzt eine Positivliste', () => {
  const mw = middleware();
  ok(/Access-Control-Allow-Origin/.test(mw), 'Header wird nicht gesetzt');
  ok(/crewplanner\.nyxlightwork\.de/.test(mw) && /aniflu\.github\.io/.test(mw),
    'Positivliste fehlt (Live- bzw. Test-Herkunft)');
  ok(/header\(\)\.del\(/.test(mw), 'fremde Herkunft: Freigabe wird nicht zurückgenommen');
});

// Der teuerste Fehler an dieser Stelle — und der bereits passierte: Wer die ANTWORT
// beeinflusst, muss VOR e.next() handeln. Die Projektregel „e.next() zuerst" gilt nur für
// beobachtende Hooks (onRecord*Success), nicht für Middleware und nicht für blockierende
// Request-Hooks (vgl. tests/registration.test.mjs, Hook v4.13).
test('Hook: CORS-Header werden VOR e.next() gesetzt (sonst wirkungslos)', () => {
  const mw = middleware();
  const posHeader = mw.indexOf('Access-Control-Allow-Origin');
  const posNext = mw.indexOf('e.next()');
  ok(posHeader !== -1 && posNext !== -1, 'Header-Setzen oder e.next() fehlt');
  ok(posHeader < posNext, 'e.next() steht VOR dem Header-Setzen — die Middleware wirkt nicht');
});

// Die Falle IN der Korrektur: bricht ein Zweig mit `return;` ab, überspringt er das
// abschließende `e.next()` — dann wird der Request nie abgearbeitet und die öffentlichen
// Routen sind als erste tot. Erlaubt ist genau ein `return e.next()`.
test('Hook: kein Weg durch die CORS-Middleware überspringt e.next()', () => {
  const mw = middleware();
  const returns = mw.match(/return\b[^\n]*/g) || [];
  ok(returns.length > 0, 'kein return gefunden — e.next() wird nie aufgerufen');
  for (const r of returns) {
    ok(/return\s+e\.next\(\)/.test(r), `nackter Abbruch überspringt e.next(): "${r.trim()}"`);
  }
  ok(/return e\.next\(\);\s*$/m.test(mw), 'e.next() steht nicht als Abschluss der Middleware');
});

// ⚠️ DIESE LÜCKE HATTE DER GUARD BIS v0.8.0 (Audit 2026-08-09): Die Prüfungen oben belegen,
// dass der Code DASTEHT und in der richtigen REIHENFOLGE steht — nicht, dass er ERREICHT wird.
// Im Audit wurde die gesamte Middleware mit `if (false && !oeffentlich && origin)` stillgelegt:
// alle 132 Tests blieben grün. Damit wiederholte ausgerechnet der Guard, der nach dem
// v4.17-Debakel geschrieben wurde, dessen Denkfehler — „geladen" ist nicht „wirksam".
//
// Merke fürs ganze Projekt: Ein Guard gilt erst als wirksam, wenn eine Mutation ihn rot
// gemacht hat. Diese drei Mutationen sind geprüft und werden erkannt:
//   (a) `if (false && …)`            (b) `… && false)`            (c) Bedingung entkernt
test('Hook: die CORS-Prüfung ist nicht stillgelegt', () => {
  const mw = middleware();

  ok(!/\b(?:false|0|null|undefined)\s*&&/.test(mw),
    'konstant-falscher Torwächter am Anfang der Bedingung — die Middleware läuft nie');
  ok(!/&&\s*(?:false|0|null|undefined)\b/.test(mw),
    'konstant-falscher Torwächter am Ende der Bedingung — die Middleware läuft nie');
  ok(!/if\s*\(\s*(?:false|0|null|undefined)\s*\)/.test(mw),
    'Bedingung ist konstant falsch');

  // Die Freigabe darf nur greifen, wenn BEIDE Größen geprüft werden: die öffentlichen Routen
  // müssen ausgenommen bleiben (sonst sterben Booker-Link und Kalender-Abo), und ohne
  // `Origin` ist es kein Browser-Aufruf. Fehlt eine davon, ist die Logik entkernt.
  const gate = mw.match(/if\s*\(([^)]*oeffentlich[^)]*)\)/);
  ok(gate, 'Torwächter-Bedingung um die Header-Logik nicht gefunden');
  ok(/origin/.test(gate[1]),
    `Bedingung prüft die Herkunft nicht mehr: "${gate[1].trim()}"`);
  // Die öffentlichen Routen müssen AUSGESCHLOSSEN werden (`!oeffentlich`), und beide
  // Bedingungen müssen gemeinsam gelten. Ein `||` statt `&&` — oder ein `oeffentlich` ohne
  // Verneinung — würde /viewplan, /viewstatus und /ics der Einschränkung unterwerfen und
  // damit Booker-Link und Kalender-Abo abwürgen.
  ok(/!\s*oeffentlich/.test(gate[1]),
    `öffentliche Routen werden nicht mehr ausgenommen: "${gate[1].trim()}"`);
  ok(gate[1].includes('&&') && !gate[1].includes('||'),
    `Bedingungen müssen gemeinsam gelten (&&, nicht ||): "${gate[1].trim()}"`);

  // Beide Zweige müssen INNERHALB des Torwächters liegen, nicht davor.
  const posGate = mw.indexOf(gate[0]);
  ok(mw.indexOf("set('Access-Control-Allow-Origin'") > posGate,
    'die Freigabe wird außerhalb des Torwächters gesetzt');
  ok(mw.indexOf('.del(') > posGate,
    'die Rücknahme für fremde Herkünfte liegt außerhalb des Torwächters');
});

// Die token-geschützten öffentlichen Routen müssen von der Einschränkung ausgenommen
// bleiben — dort IST der Token die Zugangsberechtigung, und ein Kalender-Abo muss von
// überall abrufbar sein.
test('Hook: /viewplan, /viewstatus und /ics bleiben von CORS ausgenommen', () => {
  const mw = middleware();
  for (const p of ['/viewplan/', '/viewstatus/', '/ics/']) {
    ok(mw.includes(p), `Ausnahme für ${p} fehlt`);
  }
});
