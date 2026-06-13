// Regression: das Dialog-System (confirm/alert/prompt) MUSS window.show* setzen.
//
// Bug v0.14.4: Bei der ES6-Migration (7b95d0f) wurde das originale Top-Level-IIFE
// in `export function initDialogSystem(){ (function(){…}); }` verpackt — aber die
// invokierenden `()` gingen verloren. Folge: window.showConfirm/showAlert/showPrompt
// blieben undefined → jeder confirm/alert/prompt warf TypeError und brach still ab
// (z.B. „Zeile löschen" beim Datum-Klick tat nichts).
import { test, ok } from './_assert.mjs';

// Minimal-Stubs — dialog.js ruft beim Import initDialogSystem() auf, das nur
// window.show* zuweist (DOM erst lazy in _ensureDOM, hier nicht nötig).
if (!globalThis.window) globalThis.window = {};
if (!globalThis.document) globalThis.document = {
  createElement: () => ({ appendChild(){}, style:{}, classList:{ add(){}, remove(){} } }),
  head: { appendChild(){} }, body: { appendChild(){} },
  getElementById: () => ({ style:{}, classList:{ add(){}, remove(){} } }),
  addEventListener(){}, removeEventListener(){},
};

await import('../js/dialog.js');

test('Dialog: window.showConfirm ist eine Funktion (IIFE invoked)', () =>
  ok(typeof window.showConfirm === 'function',
     'window.showConfirm undefined — initDialogSystem ruft das innere IIFE nicht auf'));
test('Dialog: window.showAlert ist eine Funktion', () =>
  ok(typeof window.showAlert === 'function', 'window.showAlert undefined'));
test('Dialog: window.showPrompt ist eine Funktion', () =>
  ok(typeof window.showPrompt === 'function', 'window.showPrompt undefined'));
