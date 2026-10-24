// Regression v0.13.8: PDF-Export im Admin (Werkzeuge) zeigte den Demo-Plan statt des geladenen.
//
// admin.html lädt einen Plan per PocketBase in EIGENE Inline-Variablen (TOUR_DATES, crew, …).
// pdf.js ist aber seit der ES6-Umstellung (86d8fe9) ein Modul und liest aus state.js — dort
// standen im Admin weiter die Startwerte: „Max Mustermann, Anna Bauer, …", sechs
// Standard-Positionen, eine Demo-Tour. Gemeldet am Plan AMK 2026.
//
// Dieselbe Klasse wie der ICS-Fehler v0.19.1 (siehe Kommentar in js/admin-app.js). Darum
// zwei Sperren: das Verhalten an der Datennaht (loadPlanState → pdf.js) und der Aufruf am
// Aufrufort (openAdminPDF muss den geladenen Plan übergeben, bevor der Filter aufgeht).
import { loadGraph } from './_graph.mjs';
import { test, ok } from './_assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = await loadGraph();
const pdf = g ? await import('../js/pdf.js') : null;

// Form wie admin.html sie liefert: plan_data aus dem plans-Record (version 3) und die
// Status-Map, die admin.html aus der assignments-Collection baut (_wrkAssignmentStatuses).
const planData = {
  version: 3,
  crew: ['Jana Licht', 'Olaf Rigger'],
  positions: [{ id: 'gl', label: 'GL', short: 'GL' }, { id: 'ton', label: 'Ton', short: 'Ton' }],
  defaultCrew: {},
  tourDates: [{ date: '2027-03-04', type: 'show', typeLabel: 'Show', loc: 'Kassel' }],
  assignments: { '2027-03-04': { gl: 'Jana Licht', ton: 'Olaf Rigger' } },
};
const statuses = {
  '2027-03-04': { gl: { status: 'confirmed', crewName: 'Jana Licht', crewEmail: '', proposedBy: '', id: 'a1' } },
};

// Admin-Ausgangslage: state.js trägt seine Startwerte, weil admin.html es nie befüllt.
function demoStand() {
  const s = g.state;
  s.setCrew(['Max Mustermann', 'Anna Bauer']);
  s.setPositions([{ id: 'gl', label: 'GL', short: 'GL' }]);
  s.setTourDates([{ date: '2026-06-23', type: 'show', typeLabel: 'Show', loc: 'CAB' }]);
  s.loadAssignmentsData({});
  s.loadStatusesData({});
}

// document.getElementById liefert sonst bei jedem Aufruf ein neues Wegwerf-Element — hier je
// Id dasselbe, damit sich lesen lässt, was pdf.js hineingeschrieben hat.
function mitDom(fn) {
  const els = {};
  const orig = document.getElementById;
  const origModal = globalThis.openModal, origClose = globalThis.closeModal;
  document.getElementById = id => (els[id] ||= { innerHTML: '', style: {}, checked: true });
  globalThis.openModal = () => {}; globalThis.closeModal = () => {};
  try { return fn(els); }
  finally { document.getElementById = orig; globalThis.openModal = origModal; globalThis.closeModal = origClose; }
}

if (!g || !pdf) {
  test('adminpdf: Graph laden', () => ok(false, 'Graph-Load fehlgeschlagen'));
} else {
  test('adminpdf: PDF-Filter zeigt die Crew des geladenen Plans, nicht die Startwerte', () => {
    demoStand();
    mitDom(els => {
      g.state.loadPlanState(planData, statuses, 'AMK 2027');
      pdf.openPDFFilter();
      const crewHtml = els.pdfCrewCbs.innerHTML, posHtml = els.pdfPosCbs.innerHTML;
      ok(crewHtml.includes('Jana Licht') && crewHtml.includes('Olaf Rigger'), 'Crew des Plans fehlt im Filter: ' + crewHtml.slice(0, 200));
      ok(!crewHtml.includes('Mustermann'), 'Startwert-Crew steht noch im Filter');
      ok(posHtml.includes('Ton'), 'Positionen des Plans fehlen im Filter');
    });
  });

  test('adminpdf: Druckansicht enthält Termine, Einteilung und Namen des geladenen Plans', async () => {
    demoStand();
    let html = '';
    const origOpen = globalThis.open;
    globalThis.open = () => ({ document: { write: h => { html += h; }, close() {} }, close() {} });
    try {
      await mitDom(async () => {
        g.state.loadPlanState(planData, statuses, 'AMK 2027');
        await pdf.generatePDF();
      });
    } finally { globalThis.open = origOpen; }
    ok(!html.includes('PDF-Fehler'), 'generatePDF warf: ' + html.slice(0, 300));
    ok(html.includes('Kassel'), 'Termin des Plans fehlt');
    ok(html.includes('Jana Licht') && html.includes('Olaf Rigger'), 'Einteilung des Plans fehlt');
    ok(html.includes('AMK 2027'), 'Planname fehlt im Kopf');
    ok(!html.includes('CAB') && !html.includes('Mustermann'), 'Demo-Stand steht noch im PDF');
  });

  test('adminpdf: openAdminPDF übergibt den geladenen Plan an state.js, bevor der Filter aufgeht', () => {
    const admin = readFileSync(join(root, 'admin.html'), 'utf8');
    const m = admin.match(/function openAdminPDF\(\)\s*\{([\s\S]*?)\n\}/);
    ok(m, 'openAdminPDF nicht gefunden');
    const rumpf = m[1];
    const laden = rumpf.search(/window\.loadPlanState\(\s*\{[^}]*tourDates:\s*TOUR_DATES[^}]*crew[^}]*\}\s*,\s*_wrkAssignmentStatuses\s*,\s*_wrkPlanName\s*\)/);
    const filter = rumpf.indexOf('openPDFFilter(');
    ok(laden >= 0, 'openAdminPDF ruft window.loadPlanState nicht mit den geladenen Plandaten auf');
    ok(filter > laden, 'loadPlanState muss VOR openPDFFilter laufen');
    const app = readFileSync(join(root, 'js/admin-app.js'), 'utf8');
    ok(/window\.loadPlanState\s*=\s*loadPlanState\b/.test(app), 'admin-app.js stellt loadPlanState nicht bereit');
  });
}
