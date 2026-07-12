// Guard: Handy-Tauglichkeit (v0.24.0). Fängt Regressionen der Responsive-Basis:
// (1) styles.css MUSS einen mobilen Breakpoint haben, der den Scroll-Trap löst
//     (.layout einspaltig statt fixe 232px-Sidebar) — sonst ist die Seite am Handy
//     wieder unbenutzbar (kein Scrollen, Tabelle zerquetscht).
// (2) admin.html braucht einen eigenen Handy-Breakpoint (eigenes Inline-CSS, kein styles.css).
// (3) Der Drawer-Trigger muss verdrahtet UND registriert sein: #btnMenu→toggleDrawer,
//     export toggleDrawer, window.toggleDrawer (window-Globals sind seiten-spezifisch —
//     ohne Registrierung crasht der Klick, vgl. CLAUDE.md-Historie).
import { test, ok } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root   = join(dirname(fileURLToPath(import.meta.url)), '..');
const css    = readFileSync(join(root, 'styles.css'), 'utf8');
const admin  = readFileSync(join(root, 'admin.html'), 'utf8');
const index  = readFileSync(join(root, 'index.html'), 'utf8');
const sidebar= readFileSync(join(root, 'js/sidebar.js'), 'utf8');
const app    = readFileSync(join(root, 'js/app.js'), 'utf8');

test('styles.css: hat einen mobilen Breakpoint (max-width)', () => {
  ok(/@media[^{]*max-width\s*:\s*\d+px/.test(css),
     'styles.css hat keine @media(max-width)-Regel — Handy-Layout fehlt');
});

test('styles.css: Scroll-Trap gelöst — .layout am Handy einspaltig', () => {
  ok(/\.layout\s*{\s*grid-template-columns\s*:\s*1fr/.test(css),
     '.layout wird am Handy nicht auf eine Spalte gesetzt (fixe 232px-Sidebar bleibt → kein Scrollen)');
});

test('admin.html: hat eigenen Handy-Breakpoint (max-width:768px)', () => {
  ok(/@media[^{]*max-width\s*:\s*768px/.test(admin),
     'admin.html fehlt der 768px-Breakpoint (eigenes Inline-CSS, kein styles.css)');
});

test('Drawer verdrahtet: #btnMenu→toggleDrawer + Backdrop', () => {
  ok(/id="btnMenu"[^>]*onclick="toggleDrawer\(\)"/.test(index),
     '#btnMenu ruft toggleDrawer nicht auf');
  ok(index.includes('id="drawerBackdrop"'),
     'drawerBackdrop-Element fehlt in index.html');
});

test('Drawer registriert: export + window.toggleDrawer', () => {
  ok(/export\s+function\s+toggleDrawer/.test(sidebar),
     'toggleDrawer wird in sidebar.js nicht exportiert');
  ok(/window\.toggleDrawer\s*=\s*toggleDrawer/.test(app),
     'window.toggleDrawer wird in app.js nicht registriert — Klick crasht sonst');
});
