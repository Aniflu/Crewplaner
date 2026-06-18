// Syntax-Guard — fängt Zuweisungen an einen Funktionsaufruf-Rückgabewert.
//
// Hintergrund (v0.16.0): persistence.js hatte `getActivePlanId()=id;` — eine Zuweisung
// an einen Funktionsaufruf. V8/Chrome PARST das tolerant durch, SpiderMonkey/Firefox
// wirft beim Parsen `SyntaxError: invalid assignment left-hand side`. Da app.js das
// Modul importiert, riss der Parse-Fehler in Firefox den GANZEN Modulgraphen mit →
// keine window.*-Registrierungen → leere Tabelle (Wolf sah nie einen Plan, nur Firefox).
// node-basierte Tests sehen das NICHT, weil node (V8) genauso tolerant ist wie Chrome.
//
// Regel: kein `name(...) = …` (Zuweisung an Call-Ergebnis). Erlaubt bleiben ==, ===,
// =>, >=, <=, !=, += usw. (die haben kein nacktes `)=` als linke Seite).
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));

// Kommentare + String-/Template-Literale entfernen (wie imports.test.mjs).
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

// Bezeichner gefolgt von (…) gefolgt von `=` (aber nicht ==, =>).
const reBadAssign = /[A-Za-z_$][\w$]*\s*\([^()]*\)\s*=(?![=>])/g;

test('Syntax: keine Zuweisung an einen Funktionsaufruf (f(...) = …) — bricht Firefox', () => {
  const hits = [];
  for (const f of files) {
    const s = strip(readFileSync(join(jsDir, f), 'utf8'));
    for (const m of s.matchAll(reBadAssign)) {
      const line = s.slice(0, m.index).split('\n').length;
      hits.push(`js/${f}:${line} → ${m[0].trim()}`);
    }
  }
  ok(hits.length === 0,
    'Zuweisung an Funktionsaufruf-Ergebnis gefunden (V8 toleriert, Firefox bricht):\n      ' + hits.join('\n      '));
});
