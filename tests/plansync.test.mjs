// v1.2.1: Touransicht lädt immer aus der DB und überschreibt nie blind (js/planSync.js).
// Echte plan_data-Form (version/crew/positions/defaultCrew/tourDates/assignments), fetch gemockt.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadGraph, resetState } from './_graph.mjs';
import { test, ok, eq, deepEq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = await loadGraph();

const plan = (crewName) => ({
  version: 3, crew: [crewName, 'Oliver'],
  positions: [{ id: 'gl', label: 'GL', short: 'GL' }],
  defaultCrew: { gl: crewName },
  tourDates: [{ date: '2026-07-01', loc: 'Berlin', type: 'show', typeLabel: 'Show' }],
  assignments: { '2026-07-01': { gl: crewName } },
});

// Fake-PocketBase: Records im Speicher, Aufrufprotokoll, abschaltbar (offline).
function fakePb(records) {
  const calls = []; let offline = false;
  const orig = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    calls.push({ url: u, method });
    if (offline) return Promise.reject(new TypeError('offline'));
    const m = u.match(/\/api\/collections\/plans\/records\/([^/?]+)$/);
    let body = { items: [] };
    if (m && records[m[1]]) {
      if (method === 'PATCH') records[m[1]].plan_data = JSON.parse(opts.body).plan_data;
      body = { id: m[1], name: 'T', plan_data: records[m[1]].plan_data };
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
  return { calls, setOffline: v => { offline = v; }, restore: () => { globalThis.fetch = orig; },
           patches: (id) => calls.filter(c => c.method === 'PATCH' && (!id || c.url.endsWith('/' + id))) };
}

// Plan 'p1' ↔ PB 'PB1' im State/LS einrichten; State zeigt `crewName`.
function setup(crewName, dbPlan) {
  resetState(g);
  g.planSync.clearPlanBases();
  g.state.setAuthState('USER1', 'm@x.de', 'manager');
  localStorage.clear();
  localStorage.setItem('tourplan_plans', JSON.stringify([{ id: 'p1', name: 'T1' }, { id: 'p2', name: 'T2' }]));
  localStorage.setItem('tourplan_pb_p1', 'PB1');
  localStorage.setItem('tourplan_pb_p2', 'PB2');
  localStorage.setItem('tourplan_active_pb_id', 'PB1');
  g.plans.setActivePlanId('p1');
  const p = plan(crewName);
  g.state.crew.push(...p.crew);
  g.state.POSITIONS.push(...p.positions);
  Object.assign(g.state.defaultCrew, p.defaultCrew);
  g.state.TOUR_DATES.push(...p.tourDates);
  Object.assign(g.state.assignments, p.assignments);
  return fakePb({ PB1: { plan_data: JSON.stringify(dbPlan) }, PB2: { plan_data: JSON.stringify(plan('Zwei')) } });
}
const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

if (!g) {
  test('plansync: Graph laden', () => ok(false, 'Graph-Load fehlgeschlagen'));
} else {
  test('plansync (a): Basisstand gleich → PATCH, gesendeter Stand wird neue Basis', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'));
      await g.plans._savePlanToLS('p1');
      eq(pb.patches('PB1').length, 1, 'genau ein PATCH');
      ok(pb.calls.findIndex(c => c.method === 'GET') < pb.calls.findIndex(c => c.method === 'PATCH'), 'GET vor PATCH');
    } finally { pb.restore(); }
  });

  test('plansync (b): DB zwischendurch geändert → kein PATCH, State = DB-Stand, Cache aktualisiert, Fehler mit Hinweistext', async () => {
    const pb = setup('Wolf', plan('Fremd'));       // DB hat Fremdänderung
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf')); // Browser kennt den alten Stand
      let err = null;
      await quiet(() => g.plans._savePlanToLS('p1').catch(e => { err = e; }));
      eq(pb.patches().length, 0, 'es darf nichts geschrieben werden');
      ok(err && err.message === g.planSync.MSG_ZWISCHENDURCH, 'Promise lehnt mit dem Hinweistext ab: ' + (err && err.message));
      eq(g.state.assignments['2026-07-01'].gl, 'Fremd', 'State zeigt den DB-Stand');
      eq(JSON.parse(localStorage.getItem('tourplan_plan_p1')).assignments['2026-07-01'].gl, 'Fremd', 'Zwischenspeicher = DB-Stand');
      // danach ist der DB-Stand Basis: die Wiederholung der Änderung geht durch
      g.state.assignments['2026-07-01'].gl = 'Neu';
      await g.plans._savePlanToLS('p1');
      eq(pb.patches('PB1').length, 1, 'Wiederholung nach Neuladen wird geschrieben');
    } finally { pb.restore(); }
  });

  test('plansync (c): kein Basisstand → kein PATCH, DB-Stand geladen', async () => {
    const pb = setup('Wolf', plan('Fremd'));
    try {
      let err = null;
      await quiet(() => g.plans._savePlanToLS('p1').catch(e => { err = e; }));
      eq(pb.patches().length, 0, 'ohne Basisstand nie schreiben');
      ok(err, 'Fehler gemeldet');
      eq(g.state.assignments['2026-07-01'].gl, 'Fremd', 'DB-Stand geladen');
    } finally { pb.restore(); }
  });

  test('plansync (d): zwei schnelle Saves hintereinander → beide PATCH, kein Fehlalarm', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'));
      g.state.assignments['2026-07-01'].gl = 'Eins';
      const p1 = g.plans._savePlanToLS('p1');
      g.state.assignments['2026-07-01'].gl = 'Zwei';
      const p2 = g.plans._savePlanToLS('p1');
      await p1; await p2;
      eq(pb.patches('PB1').length, 2, 'beide Saves geschrieben');
    } finally { pb.restore(); }
  });

  test('plansync (e): Start mit gecachtem Plan lädt trotzdem aus der DB', async () => {
    const pb = setup('Alt', plan('DB'));
    try {
      localStorage.setItem('tourplan_plan_p1', JSON.stringify(plan('Alt')));
      ok(await g.dataService.loadPlanForManager('PB1'), 'Laden meldet Erfolg');
      eq(g.state.assignments['2026-07-01'].gl, 'DB', 'State = DB-Stand statt Cache');
      eq(JSON.parse(localStorage.getItem('tourplan_plan_p1')).assignments['2026-07-01'].gl, 'DB', 'Cache überschrieben');
      ok(g.planSync.hasPlanBase('PB1'), 'Basisstand gesetzt');
    } finally { pb.restore(); }
    const auth = readFileSync(join(root, 'js/authService.js'), 'utf8');
    ok(!/pbPlanCached\s*\?\s*Promise\.resolve\(\)/.test(auth), 'authService überspringt das DB-Laden bei gecachtem Plan wieder');
    ok(/loadPlanForManager\(knownPbId/.test(auth), 'authService lädt mit bekannter PB-ID');
  });

  test('plansync (f): switchPlan lädt den Ziel-Plan aus der DB', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'));
      localStorage.setItem('tourplan_plan_p2', JSON.stringify(plan('AltCache')));
      g.plans.switchPlan('p2');
      for (let i = 0; i < 50 && g.state.assignments['2026-07-01']?.gl !== 'Zwei'; i++) await new Promise(r => setTimeout(r, 5));
      eq(g.state.assignments['2026-07-01'].gl, 'Zwei', 'State = DB-Stand von PB2');
      ok(pb.calls.some(c => c.method === 'GET' && c.url.endsWith('/PB2')), 'PB2 wurde gelesen');
      eq(JSON.parse(localStorage.getItem('tourplan_plan_p2')).assignments['2026-07-01'].gl, 'Zwei', 'Cache von p2 überschrieben');
    } finally { pb.restore(); }
  });

  test('plansync: GET schlägt fehl (offline) → kein PATCH, lokaler Stand bleibt', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'));
      pb.setOffline(true);
      g.state.assignments['2026-07-01'].gl = 'Lokal';
      let err = null;
      await quiet(() => g.plans._savePlanToLS('p1').catch(e => { err = e; }));
      eq(pb.patches().length, 0, 'offline nie schreiben');
      eq(err && err.message, g.planSync.MSG_OFFLINE, 'Meldung Keine Verbindung');
      eq(g.state.assignments['2026-07-01'].gl, 'Lokal', 'lokaler Stand bleibt');
    } finally { pb.restore(); }
  });

  test('plansync: Schlüsselreihenfolge im DB-Stand löst keinen Fehlalarm aus', () => {
    const a = plan('X'); const b = { assignments: a.assignments, tourDates: a.tourDates, defaultCrew: a.defaultCrew, positions: a.positions, crew: a.crew, version: 3 };
    eq(g.planSync.normPlanData(a), g.planSync.normPlanData(JSON.stringify(b)), 'normalisiert gleich');
  });

  test('plansync (3): Tourvergleich zieht nach dem Patch den Zwischenspeicher nach (Struktur)', () => {
    const s = readFileSync(join(root, 'js/tourvergleich-ui.js'), 'utf8');
    ok(s.indexOf('cacheSavedTour(b.pbId, next)') > s.indexOf("await pbPatch('/api/collections/plans/records/'"), 'cacheSavedTour nach dem Patch');
    ok(/tourplan_pb_/.test(s) && /'tourplan_plan_' \+/.test(s), 'Zuordnung über tourplan_pb_ → tourplan_plan_');
  });
}
