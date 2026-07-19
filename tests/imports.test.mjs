// Import-Guard — statische Analyse, kein Modul-Loading.
//
// Fängt die ES6-„Bounce"-Klasse: ein Modul referenziert eine Bindung, die es nie
// importiert hat → ReferenceError, sobald die Funktion läuft (Klick „tot").
// So brach in v0.14.3 „Datum hinzufügen": dates.js nutzte TYPE_OPTS ohne Import.
//
// Regel: Für jede ES6-Modul-Datei → kein Bezeichner, der ein EXPORT einer ANDEREN
// Datei ist, darf verwendet werden, ohne ihn zu importieren (es sei denn, er ist
// window-global oder ein Standard-Builtin).
//
// Robust gegen False-Positives: Kommentare + String-/Template-Literale werden vor
// der Verwendungs-Suche entfernt; bundle.js (globaler Scope-Spiegel, importlos) und
// *.test.js fallen automatisch raus (kein import/export); Mehrzeilen-Imports,
// lokale Deklarationen und Funktions-Parameter werden erfasst.
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));
const raw = Object.fromEntries(files.map(f => [f, readFileSync(join(jsDir, f), 'utf8')]));

// Kommentare + String-/Template-Literale entfernen (Reihenfolge wichtig).
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // Block-Kommentare
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')        // Zeilen-Kommentare (nicht http://)
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '``')  // Template-Literale
    .replace(/'(?:\\.|[^'\\])*'/g, "''")          // '…'
    .replace(/"(?:\\.|[^"\\])*"/g, '""');         // "…"
}

const WORD = '[A-Za-z_$][\\w$]*';
const reword = name => new RegExp(`(^|[^.\\w$])${name.replace(/[$]/g, '\\$&')}\\b`);

// 1) EXPORTS: name → datei
const exp = {};
for (const f of files) {
  const s = raw[f];
  for (const m of s.matchAll(new RegExp(`export\\s+(?:async\\s+)?(?:function\\*?|const|let|var)\\s+(${WORD})`, 'g'))) exp[m[1]] = f;
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (n) exp[n] = f; }
}

// 2) GLOBALS-Allow-List: window.X aus allen Dateien + Builtins
const globals = new Set([
  'window','document','console','setTimeout','clearTimeout','setInterval','clearInterval',
  'Promise','Date','Math','JSON','Object','Array','String','Number','Boolean','Symbol',
  'Map','Set','WeakMap','WeakSet','RegExp','Error','Function','Proxy','Reflect','BigInt',
  'fetch','localStorage','sessionStorage','navigator','location','history','alert','confirm','prompt',
  'FileReader','Blob','File','URL','URLSearchParams','FormData','Headers','Request','Response',
  'requestAnimationFrame','cancelAnimationFrame','atob','btoa','structuredClone','crypto',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','globalThis',
  'Intl','TextEncoder','TextDecoder','AbortController','event','CustomEvent','Event','Image',
]);
for (const f of files)
  for (const m of raw[f].matchAll(new RegExp(`window\\.(${WORD})\\s*=`, 'g'))) globals.add(m[1]);

// 3) Pro Modul-Datei prüfen
const leaks = [];
for (const f of files) {
  const s = raw[f];
  if (!/\b(import|export)\b/.test(s)) continue;     // kein ES6-Modul (z.B. bundle.js)
  if (f.endsWith('.test.js')) continue;             // Jest-Altlast

  const code = strip(s);

  // deklarierte / importierte / parametrisierte Namen
  const declared = new Set();
  for (const m of code.matchAll(/import\s*(?:\{([^}]*)\}|(\*\s+as\s+\w+)|(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from/g)) {
    for (const grp of [m[1], m[4]]) if (grp) for (const part of grp.split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) declared.add(n); }
    if (m[3]) declared.add(m[3]);                   // default import
    if (m[2]) declared.add(m[2].split(/\s+/).pop()); // namespace import
  }
  for (const m of code.matchAll(new RegExp(`(?:function\\*?\\s+|const\\s+|let\\s+|var\\s+|class\\s+)(${WORD})`, 'g'))) declared.add(m[1]);
  // Funktions-Parameter (function f(a,b){…} und Arrow (a,b)=>)
  for (const m of code.matchAll(/(?:function\*?\s*\w*\s*|\b)\(([^)]*)\)\s*(?:=>|\{)/g))
    for (const p of m[1].split(',')) { const n = p.trim().replace(/[=:].*$/,'').replace(/^\.\.\./,'').replace(/[{}\[\]]/g,'').trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n); }

  // import/re-export-Statements aus der Verwendungs-Suche entfernen — der Quell-Name
  // in `X as Y` ist KEINE Nutzung (sonst False-Positive für aliasierte Imports).
  const usage = code.replace(/\b(?:import|export)\b[\s\S]*?from\s*['"][^'"]*['"]\s*;?/g, ' ');

  // Objekt-Literal-Property-Keys (`{ name: … }` / `, name: …`) sind KEINE Bindungs-
  // Nutzungen — neutralisieren, damit ein Export-Name, der nur als Daten-Key vorkommt
  // (z.B. `defaultCrew:{…}` in init.js Demo-Plan), nicht fälschlich als „fehlender
  // Import" gemeldet wird. Shorthand `{ name }` (kein `:`) bleibt eine Nutzung; der
  // Wert nach `:` bleibt ebenfalls scanbar.
  const usageNoKeys = usage.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g,
    (_, pre, id, post) => pre + '_'.repeat(id.length) + post);

  for (const name of Object.keys(exp)) {
    if (exp[name] === f) continue;        // eigener Export
    if (declared.has(name)) continue;     // importiert / lokal / Parameter
    if (globals.has(name)) continue;      // window-global / Builtin
    if (reword(name).test(usageNoKeys)) leaks.push(`${f} → ${name} (Export aus ${exp[name]}) — fehlt import`);
  }
}
leaks.sort();

test('Import-Guard: Analyzer hat Module gefunden (Sanity)', () =>
  ok(Object.keys(exp).length > 30, `nur ${Object.keys(exp).length} Exporte erkannt — Scan kaputt?`));

test('Import-Guard: kein Modul nutzt Fremd-Export ohne Import', () =>
  ok(leaks.length === 0,
     `Fehlende Imports (Bezeichner verwendet, aber nicht importiert → ReferenceError beim Aufruf):\n      ` +
     leaks.join('\n      ')));
