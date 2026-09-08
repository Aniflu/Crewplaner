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

// ── Gegenrichtung: importiert, aber dort gar nicht exportiert (v0.12.0) ───────
// Der Guard oben fängt „verwendet ohne Import". Die andere Hälfte fehlte: ein Import aus
// einer lokalen Datei, die den Namen nie exportiert. Der Browser wirft dann schon beim
// LADEN des Moduls („does not provide an export named …") — der ganze Einstiegspunkt
// bleibt tot, nicht nur eine Funktion.
//
// Anlass: Beim Kalender-Umbau importierte calendar.js `activePlanName` aus plans.js, bevor
// es dort existierte. Die Suite blieb grün, weil calendar.js in keinem Testgraph geladen
// wird — aufgefallen wäre es erst im Browser.
const importiert = [];
for (const f of files) {
  const s = strip(raw[f]);
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*''/g)) {
    // Der Pfad wurde von strip() zu '' — deshalb aus der Rohfassung nachschlagen.
  }
  for (const m of raw[f].matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/([\w.-]+)['"]/g)) {
    const ziel = m[2].endsWith('.js') ? m[2] : m[2] + '.js';
    for (const teil of m[1].split(',')) {
      const name = teil.trim().split(/\s+as\s+/)[0].trim();
      if (name) importiert.push({ von: f, name, ziel });
    }
  }
}

test('Import-Guard: Analyzer hat Imports gefunden (Sanity)', () =>
  ok(importiert.length > 30, `nur ${importiert.length} Imports erkannt — Scan kaputt?`));

test('Import-Guard: kein Import auf einen Namen, den es dort nicht gibt', () => {
  // NICHT über exp[] prüfen: das ordnet jedem Namen genau EINE Datei zu und liegt bei
  // Re-Exports daneben (utils.js reicht DE_DAYS/DE_MON aus state.js weiter — beide „besitzen"
  // den Namen). Deshalb direkt in der Zieldatei nachsehen.
  const exportiertDort = (src, name) => {
    const w = name.replace(/[$]/g, '\\$&');
    if (new RegExp(`export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${w}\\b`).test(src)) return true;
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
      for (const teil of m[1].split(','))
        if (teil.trim().split(/\s+as\s+/).pop().trim() === name) return true;
    if (/export\s*\*\s*from/.test(src)) return true;   // Sternchen-Re-Export → nicht entscheidbar
    return false;
  };
  const fehlt = [];
  for (const { von, name, ziel } of importiert) {
    if (!raw[ziel]) continue;                       // Datei außerhalb von js/ — nicht prüfbar
    if (exportiertDort(raw[ziel], name)) continue;
    fehlt.push(`${von} → importiert { ${name} } aus ${ziel}, das dort NICHT exportiert wird`);
  }
  ok(fehlt.length === 0,
     'Der Browser bricht beim Laden dieser Module ab:\n      ' + fehlt.join('\n      '));
});
