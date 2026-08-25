// Guard: die Versionsnummer im Markup stimmt mit dem Changelog überein.
//
// Anlass (v0.10.3): v0.10.1 und v0.10.2 gingen live, während index.html, login.html und
// admin.html weiter „v0.10.0" anzeigten. Aufgefallen ist es dem Betreiber am fertig
// ausgelieferten Stand — nicht beim Bauen.
//
// Warum das mehr ist als Kosmetik: Die Nummer im Markup ist das einzige, woran sich im
// Browser ablesen lässt, WELCHER Stand gerade läuft. Stimmt sie nicht, führt die erste
// Frage jeder Fehlersuche („welche Version hast du?") in die Irre — und dieses Projekt hat
// genau davon eine Geschichte: siehe README zu v0.19.0, wo ein alter Stand im Cache
// stundenlang für einen Fehler gehalten wurde, der längst behoben war.
//
// Die Quelle der Wahrheit ist der oberste Changelog-Eintrag in README.md. Der wird beim
// Release ohnehin geschrieben; die Marker sind das, was vergessen wird.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (f) => readFileSync(join(root, f), 'utf8');

// Jede Oberfläche, die eine Nummer anzeigt, mit der Stelle, an der sie steht. view.html hat
// bewusst keine (die Crew-Ansicht zeigt keinen Versionsstand) — steht hier deshalb nicht.
const MARKER = {
  'index.html': /Personalplan · (v\d+\.\d+\.\d+)/,
  'login.html': /class="login-version">(v\d+\.\d+\.\d+)</,
  'admin.html': />(v\d+\.\d+\.\d+)<\/span>/,
};

function changelogVersion() {
  const treffer = lies('README.md').match(/^\*\*(v\d+\.\d+\.\d+)\*\*/m);
  ok(treffer, 'README.md: kein Changelog-Eintrag im Format **vX.Y.Z** gefunden');
  return treffer[1];
}

test('jede Oberfläche zeigt die Version aus dem Changelog', () => {
  const soll = changelogVersion();
  const fund = [];
  for (const [datei, muster] of Object.entries(MARKER)) {
    const treffer = lies(datei).match(muster);
    if (!treffer) { fund.push(`${datei}: kein Versions-Marker gefunden (Muster geändert?)`); continue; }
    if (treffer[1] !== soll) fund.push(`${datei}: zeigt ${treffer[1]}, Changelog sagt ${soll}`);
  }
  ok(fund.length === 0,
    'Versionsnummer im Markup weicht ab — beim Release mitziehen:\n      ' + fund.join('\n      '));
});

test('die Marker sind untereinander einig', () => {
  // Getrennter Test, damit die Meldung eindeutig ist: Weichen die Marker voneinander ab,
  // wurde beim letzten Mal nur ein Teil nachgezogen — ein anderes Fehlerbild als „alle alt".
  const werte = Object.entries(MARKER)
    .map(([datei, muster]) => [datei, (lies(datei).match(muster) || [])[1]])
    .filter(([, v]) => v);
  const einig = new Set(werte.map(([, v]) => v));
  ok(einig.size <= 1,
    'unterschiedliche Versionen im Markup: ' + werte.map(([d, v]) => `${d}=${v}`).join(', '));
});
