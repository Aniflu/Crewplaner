// Guard: view-app.js muss den Render-State über die state.js-Setter befüllen,
// NICHT über window.* — sonst bleiben in der öffentlichen Ansicht (view.html) die
// Besetzungszellen leer und der Kopf zeigt die Default-Positionen (Bug v0.27.1:
// „öffentlicher Link leer"). render.js/utils.js lesen die ES-Modul-Bindings.
import { test, ok } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/view-app.js'), 'utf8');

test('view-app.js befüllt den State über state.js-Setter', () => {
  for (const setter of ['setCrew', 'setPositions', 'setTourDates',
                        'loadAssignmentsData', 'setDefaultCrew', 'loadStatusesData']) {
    ok(new RegExp(setter + '\\s*\\(').test(src), 'ruft ' + setter + '(...) auf');
  }
});

test('view-app.js weist Render-Daten NICHT window.* zu (wirkungslos für den Render)', () => {
  for (const g of ['assignments', 'defaultCrew', 'POSITIONS', 'crew', 'assignmentStatuses']) {
    ok(!new RegExp('window\\.' + g + '\\s*=').test(src),
       'keine window.' + g + '=-Zuweisung');
  }
});

// ── Öffentliche Ansicht darf die assignments-Collection NICHT direkt lesen ────
// Genau dafür musste deren listRule offen sein — wodurch am 2026-08-03 alle 913
// Einsätze inkl. der Crew-Mailadressen weltöffentlich abrufbar waren. Seit Hook v4.14
// kommen die Status über die token-geschützte Route /viewstatus/{token}, die keine
// Adressen herausgibt.
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

test('view-app.js liest die assignments-Collection nicht mehr direkt', () => {
  ok(!/pbListAll\(\s*['"]assignments['"]/.test(src),
     'greift wieder direkt auf assignments zu — das erzwingt eine offene listRule');
  ok(/\/viewstatus\//.test(src), 'nutzt die token-geschützte Status-Route nicht');
});

test('Hook: /viewstatus-Route existiert und gibt KEINE Mailadressen heraus', () => {
  const m = hook.match(/routerAdd\('GET',\s*'\/viewstatus\/\{token\}',[\s\S]*?\n\}\);/);
  ok(m, 'Route /viewstatus/{token} fehlt');
  ok(/view_token = \{:t\}/.test(m[0]), 'prüft den view_token nicht');
  // Kommentare vorher entfernen — geprüft wird der CODE, nicht die Prosa (der erklärende
  // Kommentar erwähnt crew_email zwangsläufig).
  const code = m[0].replace(/\/\/[^\n]*/g, '');
  ok(!/crew_email/.test(code), 'crew_email darf in der öffentlichen Antwort nicht vorkommen');
});

// ── Öffentliche Ansicht darf auch die plans-Collection NICHT direkt lesen ─────
// Dafür musste `plans.listRule` auf `view_token != ""` stehen — ein Zweig, der auf JEDEN
// Plan mit Token zutrifft. Folge (2026-08-04): alle Pläne anonym abrufbar, inklusive der
// `view_token` im Klartext, die damit aufzählbar statt geheim waren. Seit Hook v4.15 läuft
// der Abruf über /viewplan/{token}.
test('view-app.js liest die plans-Collection nicht mehr direkt', () => {
  ok(!/collections\/plans/.test(src),
     'greift wieder direkt auf die plans-REST-API zu — das erzwingt eine offene listRule');
  ok(/\/viewplan\//.test(src), 'nutzt die Plan-Route nicht');
});

test('Hook: /viewplan-Route gibt weder Token noch Owner heraus', () => {
  const m = hook.match(/routerAdd\('GET',\s*'\/viewplan\/\{token\}',[\s\S]*?\n\}\);/);
  ok(m, 'Route /viewplan/{token} fehlt');
  ok(/view_token = \{:t\}/.test(m[0]), 'löst den Plan nicht über den view_token auf');
  // Kommentare raus — geprüft wird der CODE, nicht die Erklärung (die erwähnt die Felder
  // zwangsläufig; genau darauf lief der Guard in v0.5.2 zuerst auf).
  const code = m[0].replace(/\/\/[^\n]*/g, '');
  for (const feld of ['view_token', 'owner', 'view_shorturl', 'crew_email']) {
    ok(!new RegExp("getString\\('" + feld + "'\\)").test(code) && !new RegExp(feld + '\\s*:').test(code),
       feld + ' darf in der öffentlichen Antwort nicht vorkommen');
  }
});
