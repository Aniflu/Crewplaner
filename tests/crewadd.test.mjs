// Guard: Wer in einer Tour steht, hat auch einen crew_members-Datensatz.
//
// Bis v0.8.2 machte `addCrew` (crew.js) nur `crew.push(name)`. Den crew_members-Datensatz legt
// aber ausschließlich `saveCrewLink` (dataService.js) an. Die so angelegte Person hatte also
// keinen — mit zwei Folgen, die BEIDE unsichtbar blieben:
//
//   (a) keine Anfrage-/Einladungsmail — der Hook steigt bei leerer crew_email still aus
//       (main.pb.js: `if (!crewEmail) { console.error(…); return; }`);
//   (b) seit v0.8.1 sieht die Person die Tour ÜBERHAUPT NICHT — /myplan und /myplans prüfen
//       genau auf diesen Datensatz. Sie stand in der Tabelle und war für das System trotzdem
//       nicht Teil der Tour.
//
// v0.8.3 löst das nicht über eine Pflichtprüfung, sondern über den Weg: Personen entstehen nur
// noch global im Crew-Pool (Name + E-Mail + Rolle) und werden in Touren ausgewählt. Es gibt
// kein Freitextfeld mehr, in das man einen Namen ohne Adresse tippen könnte.
//
// Das Verhalten deckt flows.test.mjs ab (übernehmen, anlegen, Rückbau bei Fehler). Hier stehen
// die Teile, die ein Verhaltenstest nicht sieht: die Verdrahtung im HTML und das, was NICHT
// mehr da sein darf.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const crewJs = readFileSync(join(root, 'js/crew.js'), 'utf8');

// Kommentare entfernen, sonst schlägt der Guard auf die Erklärung im Code an — dieselbe Falle
// wie bei den /viewstatus- und CORS-Guards.
const code = crewJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const importBlock = (code.match(/export async function confirmImportCrew\([\s\S]*?\n}/) || [''])[0];
const createBlock = (code.match(/export async function createAndTakeCrew\([\s\S]*?\n}/) || [''])[0];

test('index.html hat kein Freitextfeld mehr für Crew', () => {
  // Der Kern der Änderung: ohne Eingabefeld kann der Zustand „Name ohne Datensatz" nicht
  // entstehen. Ein wiederauferstandenes Feld würde die ganze Absicherung aushebeln.
  ok(!/id="newCrewName"/.test(html), 'newCrewName ist zurück — Freitext-Anlegen umgeht den Pool');
  ok(!/id="newCrewEmail"/.test(html), 'newCrewEmail ist zurück — gehört in den Pool, nicht in die Tour');
});

test('der Crew-Knopf öffnet den Pool-Dialog', () => {
  ok(/openImportCrewModal\(\)/.test(html), 'kein Weg mehr, Crew hinzuzufügen');
  ok(/id="crewImportModal"/.test(html), 'Pool-Dialog fehlt');
});

test('im Pool-Dialog kann man eine neue Person anlegen', () => {
  // Ohne diesen Nebenweg müsste man zum Planen in die Konsole wechseln.
  for (const id of ['npName', 'npEmail', 'npRole'])
    ok(new RegExp(`id="${id}"`).test(html), `Feld ${id} fehlt im Anlege-Block`);
  ok(/createAndTakeCrew\(\)/.test(html), 'der Anlege-Block ist nicht verdrahtet — ein Feld, das niemand absenden kann, ist so gut wie keins (Reachability-Klasse aus v0.14.2)');
});

test('createAndTakeCrew schreibt den Pool-Datensatz', () => {
  ok(createBlock.length > 0, 'createAndTakeCrew nicht gefunden (Signatur geändert?)');
  ok(/createPoolMember\s*\(/.test(createBlock),
     'legt keinen Pool-Datensatz an — die Person wäre nur in dieser einen Tour bekannt');
  ok(/_takeIntoTour\s*\(/.test(createBlock),
     'übernimmt nicht in die offene Tour');
});

test('confirmImportCrew übernimmt pro Person atomar', () => {
  ok(importBlock.length > 0, 'confirmImportCrew nicht gefunden (Signatur geändert?)');
  ok(/_takeIntoTour\s*\(/.test(importBlock),
     'übernimmt nicht über _takeIntoTour — ohne den fehlt der crew_members-Datensatz');
  // Der Rückbau steckt in _takeIntoTour: fällt er weg, erzeugt jeder Fehlschlag genau den
  // Zustand, den v0.8.3 beseitigt.
  const takeBlock = (code.match(/async function _takeIntoTour\([\s\S]*?\n}/) || [''])[0];
  ok(/saveCrewLink\s*\(/.test(takeBlock), '_takeIntoTour legt den Datensatz nicht an');
  ok(/crew\.splice\s*\(/.test(takeBlock),
     '_takeIntoTour nimmt den Namen bei Fehler nicht zurück — Name in der Tabelle, kein Datensatz dahinter');
});

test('renderCrew weist auf fehlende Adressen hin', () => {
  // Der Pool verhindert NEUE Fälle. Vorhandene aus der Zeit davor würden sonst stumm
  // weiterlaufen — sichtbar wird es sonst frühestens beim Einladen.
  const block = (code.match(/export function renderCrew\([\s\S]*?\n}/) || [''])[0];
  ok(/crewMeta\[name\]\?\.email|crewMeta\[name\]&&crewMeta\[name\]\.email/.test(block),
     'renderCrew prüft nicht, ob eine Adresse hinterlegt ist');
});

test('das Werkzeug „Crew verknüpfen" ist restlos entfernt', () => {
  // Es hätte den Zustand „Name ohne Adresse" weiter am Leben gehalten. Reste (verwaiste
  // Imports, tote window-Handler) fallen sonst erst zur Laufzeit auf.
  const dateien = execSync("git ls-files '*.js' '*.html'", { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const reste = dateien.filter(f => /crewLink|saveCrewLinkRow|renderAdminCrewLink|saveAdminCrewLink/
    .test(readFileSync(join(root, f), 'utf8')));
  ok(reste.length === 0, 'Reste von „Crew verknüpfen" in: ' + reste.join(', '));
});

test('Pool-Sentinel und Anlege-Logik stehen nur an EINER Stelle', () => {
  // Zwei Schreibweisen von "__pool__" wären zwei getrennte Pools: in der Konsole angelegte
  // Personen tauchten im Tour-Dialog nicht auf.
  const config = readFileSync(join(root, 'js/config.js'), 'utf8');
  ok(/export const POOL_PLAN_ID\s*=\s*'__pool__'/.test(config), 'POOL_PLAN_ID fehlt in config.js');
  const admin = readFileSync(join(root, 'admin.html'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/const POOL_PLAN_ID/.test(admin), 'admin.html definiert den Sentinel wieder selbst');
  ok(!/filter=.*crew_members.*email=/.test(admin),
     'admin.html macht den Dublettencheck wieder selbst — gehört in createPoolMember (dataService.js)');
});
