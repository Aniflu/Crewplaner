// Reachability-Audit — statische Analyse, kein Modul-Loading.
//
// Fängt die Fehlerklasse, die reine JS-Modulgraph-Scanner NICHT sehen können:
//   Richtung B (Orphan):    Funktion ist auf window registriert, aber KEIN UI-Element
//                           und kein JS-Aufruf löst sie aus → totes Feature.
//                           (so verschwanden in v0.9.9.3 die Tage/Blöcke-Buttons,
//                            während openAddDate/openBlockRange weiterlebten.)
//   Richtung A (kaputt):    on*-Handler ruft eine nirgends definierte Funktion auf
//                           → Klick crasht (Regressionsschutz v0.10.5/v0.11.0).
//
// Robustheit gegen False-Positives (alle real aufgetretenen Fallen abgedeckt):
//   - ALLE Event-Attribute (onclick/onchange/oninput/onsubmit/…), nicht nur onclick
//   - zusammengesetzte Handler  onclick="event.stopPropagation();removeLogo('x')"
//   - JS-generierte Handler in Template-Literalen (dropdown.js baut onclick="…")
//   - Inline-<script>-Blöcke in HTML beim Aufruf-Scan einbeziehen
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = ['index.html', 'admin.html', 'login.html', 'view.html'];
// dynamisch: ALLE js/*.js (ein neues Modul wird automatisch mitgescannt)
const JS = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`);

const read = p => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };

// ── Korpora ───────────────────────────────────────────────────────────────────
const htmlSrc = HTML.map(read).join('\n');
const jsSrc = JS.map(read).join('\n');
// Inline-<script>-Inhalte aus den HTML-Seiten (echter JS-Code, z.B. admin.html)
const inlineScripts = (htmlSrc.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) || [])
  .map(s => s.replace(/<\/?script\b[^>]*>/g, '')).join('\n');
const jsCorpus = jsSrc + '\n' + inlineScripts;

// ── 1) Registrierte Handler (window.X = …) aus app.js + admin-app.js ───────────
const registered = new Set();
for (const f of ['js/app.js', 'js/admin-app.js']) {
  for (const m of read(f).matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) registered.add(m[1]);
}

// ── 2) Bezeichner, die in IRGENDEINEM on*-Attribut als Aufruf vorkommen ────────
// Attribut-Inhalte aus HTML *und* JS-Template-Literalen (onclick="…").
const onAttrBodies = [];
for (const src of [htmlSrc, jsSrc]) {
  for (const m of src.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/g)) onAttrBodies.push(m[1]);
  for (const m of src.matchAll(/\son[a-z]+\s*=\s*'([^']*)'/g)) onAttrBodies.push(m[1]);
}
const uiCalled = new Set();        // alle aufgerufenen Namen (für Orphan-Check)
const uiBareCalls = new Set();     // nur "bare" Aufrufe, nicht .method() (für Undefined-Check)
for (const body of onAttrBodies) {
  for (const m of body.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) uiBareCalls.add(m[2]);
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) uiCalled.add(m[1]);
}

// ── 3) Hilfsfunktion: wird Name irgendwo in JS aufgerufen/referenziert? ────────
// Korpus bereinigt um: import-Zeilen, window.NAME=-Registrierung, eigene Definition.
function usedInJs(name) {
  const esc = name.replace(/[$]/g, '\\$&');
  const reduced = jsCorpus
    .split('\n')
    .filter(l => !/^\s*import\b/.test(l))
    .filter(l => !new RegExp(`window\\.${esc}\\s*=`).test(l))
    .filter(l => !new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\*?\\s+${esc}\\b`).test(l))
    .join('\n');
  return new RegExp(`\\b${esc}\\b`).test(reduced);
}

// ── 4) Hilfsfunktion: ist Name irgendwo definiert? (für Undefined-Check) ───────
const KEYWORDS = new Set(['if','for','while','switch','catch','return','function',
  'typeof','void','do','else','new','await','delete','in','of','instanceof','throw']);
function definedSomewhere(name) {
  if (registered.has(name)) return true;
  const esc = name.replace(/[$]/g, '\\$&');
  return new RegExp(`(?:function\\*?\\s+${esc}\\b|(?:const|let|var)\\s+${esc}\\b)`).test(jsCorpus);
}

// ── Auswertung ─────────────────────────────────────────────────────────────────
const orphans = [...registered]
  .filter(n => !uiCalled.has(n) && !usedInJs(n))
  .sort();

const unresolved = [...uiBareCalls]
  .filter(n => !KEYWORDS.has(n) && !definedSomewhere(n))
  .sort();

// ── Tests ──────────────────────────────────────────────────────────────────────
test('Reachability: Analyzer hat Quellen gefunden (Sanity)', () =>
  ok(registered.size > 20 && onAttrBodies.length > 20,
     `registered=${registered.size}, onAttr=${onAttrBodies.length} — Pfade/Scan kaputt?`));

test('Reachability/B: keine verwaisten window-Handler (kein UI-Trigger)', () =>
  ok(orphans.length === 0,
     `Verwaiste Handler (registriert, aber nirgends ausgelöst):\n      ` +
     orphans.map(n => `ORPHAN: ${n}`).join('\n      ') +
     `\n      → Button wiederherstellen ODER Funktion+Registrierung entfernen.`));

test('Reachability/A: keine on*-Handler auf undefinierte Funktionen', () =>
  ok(unresolved.length === 0,
     `Klick würde crashen (on*-Handler ruft undefinierte Funktion):\n      ` +
     unresolved.map(n => `UNRESOLVED: ${n}`).join('\n      ')));
