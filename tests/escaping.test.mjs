// Guard gegen uneskapierte Namen im gerenderten HTML.
//
// Vorgeschichte: v0.23.3 härtete `esc()` so, dass es auch `"` und `'` maskiert — ausgelöst
// von „Robert "Woody" Steinmetz", dessen Name in einem HTML-Attribut abbrach. Seither gilt
// im Projekt: Crew- und Positionsnamen dürfen NIE ungeschützt in innerHTML (render.js:151
// hält das als Kommentar fest).
//
// Das Audit vom 2026-08-09 fand drei Stellen in render.js, die sich nicht daran hielten:
// die Positions-Kurznamen in der Kopfzeile (2×) und der Standard-Crew-Name unter der
// Spaltenüberschrift. Zeile 92 ist dabei auch in der ÖFFENTLICHEN Booker-Ansicht aktiv —
// view.html benutzt dasselbe render.js.
//
// Beide Werte stammen aus `plan_data`, das nur der Tour-Eigentümer schreibt; akut ausnutzbar
// war es also nicht. Behoben trotzdem, aus zwei Gründen: ein Name mit `<` zerlegt die
// Darstellung (genau der v0.23.3-Fehler), und es ist eine gestellte Falle — sobald ein
// künftiger Weg einem Nicht-Eigentümer erlaubt, einen dieser Namen zu setzen, wird daraus
// gespeichertes XSS.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Ausdrücke, die Nutzereingaben tragen und deshalb nie roh ausgegeben werden dürfen.
// Bewusst die AUSGABE-Form `${x}` — `${x ? … : …}` ist eine Bedingung und unbedenklich.
// BEWUSST NICHT dabei: `p.id`. Positions-IDs sind maschinell erzeugt
// (`'pos_'+Date.now()`, positions.js:26) und tragen nie Nutzereingaben. Wichtiger noch:
// sie stehen in `onclick="…('${p.id}')"`, also in einem JS-String INNERHALB eines
// HTML-Attributs. Der Browser dekodiert HTML-Entities dort VOR dem JS-Parsen — ein
// `esc()`-behandeltes `'` würde als `&#39;` geschrieben, zurück zu `'` dekodiert und den
// JS-String genauso aufbrechen. `esc()` ist an dieser Stelle also kein Schutz, sondern
// eine Scheinsicherheit. Sollte je eine ID aus einer Eingabe stammen, braucht es dort eine
// eigene Behandlung (JS-String-Escaping), nicht esc().
const HEIKEL = [
  'p.short', 'p.label',
  'def', 'val', 'display', 'name',
  'si.crewName', 'row.loc', 'row.typeLabel', 'row.blockName',
];

const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const datei of ['js/render.js', 'js/crew.js', 'js/crewview.js', 'js/blockview.js']) {
  test(`${datei}: Namen gehen nur über esc() ins HTML`, () => {
    const src = readFileSync(join(root, datei), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    for (const ausdruck of HEIKEL) {
      const bare = new RegExp('\\$\\{\\s*' + rx(ausdruck) + '\\s*\\}');
      const treffer = bare.exec(src);
      ok(!treffer,
        `\${${ausdruck}} wird ungeschützt ins HTML geschrieben — esc(${ausdruck}) verwenden ` +
        `(Fundstelle: …${src.slice(Math.max(0, (treffer?.index ?? 0) - 45), (treffer?.index ?? 0) + 45)}…)`);
    }
  });
}

// Gegenprobe: esc() muss überhaupt importiert sein, sonst wäre die Prüfung oben wertlos
// (ein `esc(x)` ohne Import wirft zur Laufzeit, nicht beim Guard).
test('render.js importiert esc()', () => {
  const src = readFileSync(join(root, 'js/render.js'), 'utf8');
  ok(/import\s*\{[^}]*\besc\b[^}]*\}\s*from\s*'\.\/utils\.js'/.test(src),
    'esc wird nicht aus utils.js importiert');
});
