// v1.3.0 Task 4: Die Touransicht (index.html) verwaltet Crew und Positionen nicht mehr, das macht die
// Konsole (admin.html). Strukturlock auf Abwesenheit, Hinweis-Knopf mit Zählung, Weiterleitung der
// alten Folgeaktion 'openCrewModal'.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, eq, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const render = readFileSync(join(root, 'js/render.js'), 'utf8');
const dropdown = readFileSync(join(root, 'js/dropdown.js'), 'utf8');

test('index.html: keine Crew-/Positions-Modale und keine Pflege-Aufrufe mehr', () => {
  for (const id of ['crewModal', 'crewImportModal', 'crewUpdateModal', 'updatePreviewModal', 'crewUpdateBar', 'btnUpdateQueue', 'crewList', 'posList'])
    ok(!new RegExp('id="' + id + '"').test(index), '#' + id + ' ist zurück in index.html');
  ok(!/onclick="[^"]*\b(openCrewModal|openAddPos|openPosMenu|_openUpdateQueueModal|_sendPendingUpdates|openImportCrewModal)\(/.test(index),
    'index.html ruft wieder eine Crew-/Positions-/Update-Funktion im onclick auf');
});

test('index.html: Hinweis-Knopf führt zur Konsole #crew', () => {
  const m = index.match(/<button id="btnCrewKonsole"[^>]*>/);
  ok(m, 'Hinweis-Knopf fehlt');
  ok(/manager-only/.test(m[0]), 'Hinweis-Knopf ist nicht manager-only');
  ok(/getNavUrl\('admin\.html'\)\+'#crew'/.test(m[0]), 'Knopf führt nicht zu admin.html#crew');
  ok(index.includes('Crew in der Konsole verwalten'), 'Beschriftung fehlt');
});

test('render.js: Tabellenkopf ohne Positionsmenü und „+ Position“, Stammbesetzung bleibt', () => {
  ok(!/openPosMenu|openAddPos/.test(render), 'render.js hat wieder Positionsverwaltung im Kopf');
  ok(/openDefaultDD\(/.test(render), 'Stammbesetzungs-Dropdown fehlt');
});

test('dropdown.js: Zellen-Dropdown pflegt die Crew-Liste nicht', () => {
  ok(!/openImportCrewModal|removeCrew|renameCrew|openAddPos|openCrewModal/.test(dropdown), 'Zellen-Dropdown hat Crew-Pflege');
});

function mockLocation(href) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const loc = { origin: 'https://test.local', pathname: '/Crewplaner/index.html', href: '', search: '', hash: '' };
  Object.defineProperty(globalThis, 'location', { value: loc, configurable: true, writable: true });
  globalThis.getNavUrl = (f) => '/Crewplaner/' + f;
  return { loc, restore() { if (old) Object.defineProperty(globalThis, 'location', old); } };
}

test('openCrewModal leitet in die Konsole #crew um, wirft nicht', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  const sidebar = await import('../js/sidebar.js');
  const m = mockLocation();
  try {
    sidebar.openCrewModal();
    eq(m.loc.href, '/Crewplaner/admin.html#crew', 'Weiterleitung');
  } finally { m.restore(); }
});

test('openCrewModal: Nicht-Planer bleiben, keine Weiterleitung (M9)', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  const sidebar = await import('../js/sidebar.js');
  const m = mockLocation();
  try {
    g.state.setAuthState('uid-crew', 'c@x.de', 'crew');
    const before = m.loc.href;
    sidebar.openCrewModal();
    eq(m.loc.href, before, 'Crew wird nicht in die Konsole geschickt');
  } finally { g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager'); m.restore(); }
});

test('Folgeaktion tourplan_pending_action=openCrewModal landet in der Konsole #crew', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  const init = await import('../js/init.js');
  const m = mockLocation();
  try {
    localStorage.setItem('tourplan_pending_action', 'openCrewModal');
    init._checkPendingAction();
    await new Promise(r => setTimeout(r, 450));
    eq(m.loc.href, '/Crewplaner/admin.html#crew', 'Weiterleitung nach Folgeaktion');
    eq(localStorage.getItem('tourplan_pending_action'), null, 'Folgeaktion wurde nicht verbraucht');
  } finally { m.restore(); }
});

test('Hinweis-Knopf zählt die Updates des aktiven Plans (Queue + Live-Erkennung)', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  resetState(g);
  const PID = 'tour-hint-plan';
  localStorage.setItem('tourplan_active_pb_id', PID);
  localStorage.removeItem('crewplan_updates_' + PID);
  const { TOUR_DATES, POSITIONS, crewMeta, setAssignment } = g.state;
  POSITIONS.push({ id: 'gl', label: 'GL', short: 'GL' });
  crewMeta['Wolf'] = { email: 'w@x.de' };
  TOUR_DATES.push({ date: '2026-07-01', loc: 'X' });
  const btn = { style: {}, dataset: {} }, txt = { textContent: '' };
  const orig = document.getElementById;
  document.getElementById = (id) => id === 'btnCrewKonsole' ? btn : id === 'btnCrewKonsoleTxt' ? txt : orig.call(document, id);
  try {
    g.userView._updateCrewUpdateBar();
    eq(txt.textContent, 'Crew in der Konsole verwalten', 'ohne offene Updates: neutrale Beschriftung');
    eq(btn.style.color, '', 'ohne offene Updates keine Statusfarbe');
    setAssignment('2026-07-01', 'gl', 'Wolf');   // live erkannt, noch nicht angefragt
    g.userView._updateCrewUpdateBar();
    eq(txt.textContent, '↻ 1 Update offen – in der Konsole senden', 'Zählung bei offenem Update');
    ok(/warn/.test(btn.style.color), 'Statusfarbe fehlt');
  } finally { document.getElementById = orig; localStorage.removeItem('crewplan_updates_' + PID); }
});
