// Guard: keine unsichtbaren Steuerzeichen im Repo.
//
// Anlass (v0.13.1): Zero-Width-Zeichen und Bidi-Steuerzeichen sieht ein Mensch weder im Editor
// noch im GitHub-Diff — ein Sprachmodell, das die Datei liest, sieht sie sehr wohl. Damit
// lassen sich Anweisungen in Dateien verstecken, die sauber aussehen („Trojan Source",
// versteckte Prompt-Injection). Das Repo bekommt regelmäßig Dateien über „Add files via upload"
// auf GitHub, und die Markdown-Dateien werden von Claude gelesen. Stand heute: kein Fund.
//
// Geprüft wird alles, was git kennt (eingecheckt oder neu, nicht ignoriert), mit Textendung.
// assets/ bleibt draußen — dort liegen Schriften und Bilder.
//
// ⚠️ Die Zeichen stehen hier nur als \u-Escape. Literal eingefügt, schlüge der Test auf sich
// selbst an.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TEXT = /\.(m?js|html|css|md|json|conf|sh|txt)$|(^|\/)(Dockerfile|pre-push)$/;
const dateien = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter(f => !f.startsWith('assets/'))
  .filter(f => TEXT.test(f));

// Zero-Width (200B–200D), Word Joiner (2060), BOM (FEFF),
// Bidi-Einbettung/-Override (202A–202E) und Bidi-Isolate (2066–2069).
const UNSICHTBAR = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g;

test('Unicode: keine unsichtbaren Zero-Width- oder Bidi-Steuerzeichen', () => {
  ok(dateien.length > 50, `nur ${dateien.length} Dateien gefunden — git ls-files kaputt?`);
  const fund = [];
  for (const f of dateien) {
    let src;
    try { src = readFileSync(join(root, f), 'utf8'); } catch { continue; } // gelöscht, noch nicht committet
    src.split('\n').forEach((zeile, i) => {
      for (const m of zeile.matchAll(UNSICHTBAR)) {
        const cp = 'U+' + m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        fund.push(`${f}:${i + 1}:${m.index + 1} ${cp}`);
      }
    });
  }
  ok(fund.length === 0, `unsichtbare Zeichen gefunden:\n    ${fund.join('\n    ')}`);
});
