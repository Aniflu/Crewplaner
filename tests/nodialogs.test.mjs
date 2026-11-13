// Sperre: keine nativen Browser-Dialoge (confirm/alert/prompt) im App-Code.
// Eigener Dialog: showConfirm/showAlert/showPrompt/showDatePrompt aus js/dialog.js.
// Einzige Ausnahme: beforeunload (Browser erlaubt dort nur den eigenen Hinweis) – kein Aufruf, daher kein Treffer.
import { test, ok } from './_assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js') && f !== 'dialog.js').map(f => 'js/' + f),
  ...['index.html', 'admin.html', 'login.html', 'view.html'].filter(f => fs.existsSync(path.join(root, f))),
];
const RE = /(^|[^\w.$])(window\.)?(confirm|alert|prompt)\s*\(/;

// Kommentare durch Leerraum ersetzen (Zeilenzahl bleibt erhalten).
function strip(src, html) {
  const blank = m => m.replace(/[^\n]/g, ' ');
  let s = src.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (html) s = s.replace(/<!--[\s\S]*?-->/g, blank);
  return s.replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

export function findNative(src, html) {
  const hits = [];
  strip(src, html).split('\n').forEach((l, i) => { if (RE.test(l)) hits.push(i + 1); });
  return hits;
}

test('Sperre: keine nativen confirm/alert/prompt in js/*.js und App-Seiten', () => {
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    findNative(src, f.endsWith('.html')).forEach(n => bad.push(f + ':' + n));
  }
  ok(bad.length === 0, 'Native Dialoge gefunden (showConfirm/showAlert/showPrompt aus js/dialog.js nutzen): ' + bad.join(', '));
});

test('Sperre erkennt Treffer und ignoriert Erlaubtes', () => {
  ok(findNative("x();\nalert('x');", false).join() === '2');
  ok(findNative('if (!confirm(`a`)) return;', false).length === 1);
  ok(findNative('window.prompt("a")', false).length === 1);
  ok(findNative('await showConfirm("a"); await window.showAlert("b"); obj.alert("c"); myconfirm(1);', false).length === 0);
  ok(findNative('// confirm("a")\n/* alert("b") */', false).length === 0);
});
