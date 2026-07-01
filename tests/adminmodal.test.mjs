// Guard: admin.html bringt eigenes inline-CSS mit (kein styles.css). Ohne die Aufdeck-
// Regel `.modal-bg.open{display:flex}` fügt openModal() nur die Klasse hinzu, aber KEIN
// Admin-Modal wird sichtbar → „Einladung/Vorschau öffnet nicht" (Bug v0.18.2).
import { test, ok } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');

test('admin.html: .modal-bg.open macht Modals sichtbar (display:flex)', () => {
  ok(/\.modal-bg\.open\s*{\s*display:\s*flex/.test(admin),
     'Aufdeck-Regel `.modal-bg.open{display:flex}` fehlt — Admin-Modals öffnen sonst nie');
});

test('admin.html: openModal-abhängige Modals sind als .modal-bg angelegt', () => {
  ok(admin.includes('id="emailPreviewModal"') && /class="modal-bg"[^>]*id="emailPreviewModal"/.test(admin),
     'emailPreviewModal muss .modal-bg sein, damit openModal es zeigt');
});
