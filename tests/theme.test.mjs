// Guard: der Hell/Dunkel-Umschalter + die zentrale Token-Ebene (theme.css) müssen
// auf ALLEN vier Oberflächen verdrahtet sein — sonst blitzt beim Laden das falsche
// Theme auf (fehlendes FOUC-Script) oder eine Seite fällt aus dem Design (v0.28.0).
import { test, ok } from './_assert.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');

test('theme.css + favicon.svg existieren', () => {
  ok(existsSync(join(root, 'theme.css')), 'theme.css fehlt');
  ok(existsSync(join(root, 'favicon.svg')), 'favicon.svg fehlt');
});

test('theme.css definiert Light- und Dark-Tokens + Toggle-Stil', () => {
  const s = read('theme.css');
  ok(/:root\[data-theme="dark"\]/.test(s), 'dark-Scope fehlt');
  ok(/:root\[data-theme="light"\]/.test(s), 'light-Scope fehlt');
  ok(/prefers-color-scheme:\s*dark/.test(s), 'OS-Fallback fehlt');
  ok(/--sans:/.test(s) && /--gold:/.test(s), '--sans/--gold fehlen');
  ok(/\.theme-toggle\b/.test(s), '.theme-toggle-Stil fehlt');
});

for (const f of ['index.html', 'admin.html', 'login.html', 'view.html']) {
  test(`${f}: FOUC-Script + theme.css-Link + Favicon + Toggle verdrahtet`, () => {
    const s = read(f);
    ok(s.includes("localStorage.getItem('cp_mode')"), `${f}: cp_mode-FOUC-Script fehlt`);
    ok(/dataset\.theme\s*=\s*_m/.test(s), `${f}: data-theme-Setzen im FOUC-Script fehlt`);
    ok(/href="theme\.css/.test(s), `${f}: theme.css nicht verlinkt`);
    ok(/rel="icon"[^>]*favicon\.svg/.test(s), `${f}: Favicon fehlt`);
    ok(/id="themeToggle"[^>]*onclick="toggleTheme\(\)"/.test(s), `${f}: #themeToggle/onclick fehlt`);
  });
}

test('keine dekorativen Alt-Gold-Literale mehr (Gold nur im Logo/HEUTE)', () => {
  // #e8c84a (altes UI-Gold) darf nirgends mehr stehen; #d4a53a (styles.css-Gold) auch nicht.
  for (const f of ['styles.css', 'index.html', 'admin.html', 'login.html', 'view.html']) {
    const s = read(f);
    ok(!s.includes('#e8c84a'), `${f}: enthält noch #e8c84a (Alt-Gold)`);
    ok(!s.includes('#d4a53a'), `${f}: enthält noch #d4a53a (Alt-Gold)`);
  }
});
