// v1.3.0 Task 2: Karte „Crew & Positionen“ in der Konsole. admin.html enthält nur Container und
// Aufrufe — Crew-/Positionslogik gibt es ausschließlich in den Modulen (js/crew.js, positions.js,
// crewNotify.js, userView.js). Struktursperren auf den Aufruf, nicht auf den Namen.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const app = readFileSync(join(root, 'js/admin-app.js'), 'utf8');
const notify = readFileSync(join(root, 'js/crewNotify.js'), 'utf8');

test('admin.html: Karte und Modal-Container der Module sind da', () => {
  for (const id of ['wrkCrewCard', 'crewList', 'crewHeading', 'posList', 'wrkCrewNotify', 'crewImportModal',
    'crewImportBody', 'newPersonForm', 'sharedModal', 'sharedBody', 'crewUpdateModal', 'crewUpdateModalBody',
    'btnSendUpdates', 'btnUpdateQueue', 'updateQueueBadge', 'updatePreviewModal'])
    ok(new RegExp('id="' + id + '"').test(admin), '#' + id + ' fehlt in admin.html');
});

test('admin.html: Knöpfe rufen die Modul-Funktionen auf', () => {
  for (const fn of ['openImportCrewModal()', 'openAddPos()', '_openUpdateQueueModal()', 'createAndTakeCrew()', 'confirmImportCrew()'])
    ok(admin.includes('onclick="' + fn + '"'), 'onclick ' + fn + ' fehlt');
  ok(/window\.renderCrew\(\)/.test(admin), 'admin.html ruft renderCrew nicht auf');
  ok(/window\.renderCrewNotifyInto\('wrkCrewNotify'\)/.test(admin), 'Einladeliste wird nicht in die Karte gerendert');
  ok(/window\.openImportCrewModal\(\)/.test(admin) && /window\._showNewPersonForm\(true\)/.test(admin), '„Neue Person“ nutzt den Dialog der Module nicht');
  ok(!/_adminPlanAction\('openCrewModal'\)/.test(admin), 'Knopf „Crew & Positionen“ führt noch in die Touransicht');
  ok(/_scrollToCrewCard\(\)/.test(admin), 'Knopf scrollt nicht zur Karte');
});

test('admin-app.js: Module importiert und auf window gelegt', () => {
  for (const f of ['./crew.js', './positions.js', './crewNotify.js', './userView.js']) ok(app.includes("from '" + f + "'"), f + ' nicht importiert');
  for (const fn of ['renderCrew', 'removeCrew', 'renameCrew', 'openAddPos', 'openRenamePos', 'renderCrewNotifyInto', '_openUpdateQueueModal', '_sendSelectedUpdates', '_updateCrewUpdateBar'])
    ok(new RegExp('Object\\.assign\\(window,[^}]*\\b' + fn + '\\b').test(app), fn + ' nicht auf window');
});

test('admin.html: keine eigene Crew-/Positionslogik (kein Schreiben in plan.crew / POSITIONS / crew_members)', () => {
  // Der Konsolen-Skriptblock darf crew/POSITIONS nur LESEN (Snapshot aus dem State), nie verändern.
  ok(!/\bcrew\.(push|splice)\(/.test(admin), 'admin.html verändert crew selbst');
  ok(!/\bPOSITIONS\.(push|splice)\(/.test(admin), 'admin.html verändert POSITIONS selbst');
  ok(!/function\s+(removeCrew|renameCrew|addCrew|openAddPos|renderCrew|takeIntoTour)\b/.test(admin), 'Duplikat einer Modulfunktion in admin.html');
  ok(!/plan_data/.test(admin.slice(admin.indexOf('function _crewCardRefresh'), admin.indexOf('function _scrollToCrewCard'))), 'Karten-Code schreibt plan_data');
});

test('crewNotify.js: Liste rendert in den parametrierten Container, Modal bleibt Vorgabe', () => {
  ok(/export function renderCrewNotifyInto\(hostId\)/.test(notify), 'renderCrewNotifyInto fehlt');
  ok(/_notifyHostId = 'sharedBody';\s*\n\s*(_logState = 'loading';\s*\n\s*)?_renderCrewNotifyList\(\)/.test(notify), 'openCrewNotifyModal setzt den Modal-Container nicht zurück');
  ok(!/getElementById\('sharedBody'\)\.innerHTML/.test(notify), 'Liste schreibt noch fest in #sharedBody');
});
