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
  const calls = []; let offline = false; let gate = null; let seq = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    calls.push({ url: u, method });
    if (offline) throw new TypeError('offline');
    // gate(method,url) darf ein Promise liefern: die Antwort wartet dann (echte Netz-Asynchronität)
    if (gate) { const w = gate(method, u); if (w) await w; }
    else await Promise.resolve();
    const m = u.match(/\/api\/collections\/plans\/records\/([^/?]+)$/);
    let body = { items: [] };
    if (method === 'POST' && /\/collections\/plans\/records$/.test(u)) {
      const id = 'NEW' + (++seq), b = JSON.parse(opts.body);
      records[id] = { plan_data: b.plan_data == null ? '' : b.plan_data };
      body = { id, name: b.name, plan_data: records[id].plan_data };
    } else if (m && records[m[1]]) {
      if (method === 'PATCH') records[m[1]].plan_data = JSON.parse(opts.body).plan_data;
      body = { id: m[1], name: 'T', plan_data: records[m[1]].plan_data };
    }
    return { ok: true, status: 200, json: () => Promise.resolve(body) };
  };
  return { calls, records, setGate: f => { gate = f; }, setOffline: v => { offline = v; }, restore: () => { globalThis.fetch = orig; },
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

  // ── Fix-Runde 1 ─────────────────────────────────────────────────────────────
  const defer = () => { let r; const p = new Promise(res => { r = res; }); return { p, r }; };
  const tick = (n = 5) => new Promise(r => setTimeout(r, n));

  test('plansync (C1): neuer Plan (confirmNewPlan) → sofort speichern geht, kein Fehlalarm', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    const origGet = document.getElementById;
    const hadClose = globalThis.closeModal;
    try {
      globalThis.closeModal = () => {};
      document.getElementById = (id) => (id === 'newPlanName' ? { value: 'Neu', focus() {} } : origGet(id));
      await quiet(() => g.plans.confirmNewPlan());
      const newId = g.plans.getActivePlanId();
      const pbId = localStorage.getItem('tourplan_pb_' + newId);
      ok(pbId && pbId.startsWith('NEW'), 'PB-Record wurde angelegt');
      await tick(20);                                   // das Speichern aus confirmNewPlan auslaufen lassen
      eq(pb.patches(pbId).length, 1, 'schon das Speichern direkt nach dem Anlegen muss durchgehen');
      g.state.crew.push('Frisch');
      pb.calls.length = 0;
      await g.plans._savePlanToLS(newId);
      eq(pb.patches(pbId).length, 1, 'Speichern des neuen Plans muss PATCHen');
    } finally { document.getElementById = origGet; globalThis.closeModal = hadClose; pb.restore(); }
  });

  test('plansync (C1): Plan über POST im Save-Pfad angelegt → direkt danach PATCH', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      localStorage.removeItem('tourplan_pb_p1');
      await g.plans._savePlanToLS('p1');
      const pbId = localStorage.getItem('tourplan_pb_p1');
      ok(pbId, 'POST legte Record an');
      g.state.crew.push('Frisch');
      await g.plans._savePlanToLS('p1');
      eq(pb.patches(pbId).length, 1, 'Folge-Save PATCHt');
    } finally { pb.restore(); }
  });

  test('plansync (C1): leerer PB-Record geladen → nächster Save PATCHt', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      pb.records.PB1.plan_data = '';
      await quiet(() => g.dataService.loadPlanForManager('PB1'));
      ok(g.planSync.hasPlanBase('PB1'), 'Basis (leer) gesetzt');
      await g.plans._savePlanToLS('p1');
      eq(pb.patches('PB1').length, 1, 'PATCH auf den leeren Record');
    } finally { pb.restore(); }
  });

  test('plansync: Objekt-, String- und doppelt kodiertes plan_data normalisieren gleich', () => {
    const p = plan('X');
    const n = g.planSync.normPlanData;
    eq(n(p), n(JSON.stringify(p)), 'Objekt = String');
    eq(n(p), n(JSON.stringify(JSON.stringify(p))), 'Objekt = doppelt kodierter String');
    eq(n(''), n(null), 'leer = null');
    eq(n(undefined), n(null), 'undefined = null');
  });

  test('plansync (C3-d): GET2 wird abgesetzt, während PATCH1 noch läuft → beide PATCH, kein Fehlalarm', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'), { load: false });
      const hold = defer();
      pb.setGate((m, u) => (m === 'PATCH' ? hold.p : null));
      g.state.assignments['2026-07-01'].gl = 'Eins';
      const p1 = g.plans._savePlanToLS('p1');
      await tick(20);                                   // Save 1 steht jetzt im (gehaltenen) PATCH
      g.state.assignments['2026-07-01'].gl = 'Zwei';
      const p2 = g.plans._savePlanToLS('p1');
      await tick(20);
      eq(pb.calls.filter(c => c.method === 'GET').length, 1, 'zweiter GET darf erst nach PATCH 1 starten (Queue)');
      hold.r(); pb.setGate(null);
      await p1; await p2;
      eq(pb.patches('PB1').length, 2, 'beide geschrieben');
      eq(JSON.parse(pb.records.PB1.plan_data).assignments['2026-07-01'].gl, 'Zwei', 'letzter Stand gewinnt');
    } finally { pb.restore(); }
  });

  test('plansync (C2a): Fremdänderung + zwei gequeuete Saves → 0 PATCH', async () => {
    const pb = setup('Wolf', plan('Fremd'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'), { load: false });
      g.state.assignments['2026-07-01'].gl = 'Eins';
      const p1 = quiet(() => g.plans._savePlanToLS('p1').catch(e => e));
      g.state.assignments['2026-07-01'].gl = 'Zwei';
      const p2 = quiet(() => g.plans._savePlanToLS('p1').catch(e => e));
      const [e1, e2] = await Promise.all([p1, p2]);
      eq(pb.patches().length, 0, 'weder Save 1 noch der gequeuete Save 2 darf schreiben');
      ok(e1 instanceof Error && e2 instanceof Error, 'beide melden den Hinweis');
      eq(g.state.assignments['2026-07-01'].gl, 'Fremd', 'State = DB-Stand');
    } finally { pb.restore(); }
  });

  test('plansync (C2b): Edit während laufendem Lade-Vorgang → 0 PATCH', async () => {
    const pb = setup('Alt', plan('DB'));
    try {
      localStorage.setItem('tourplan_plan_p1', JSON.stringify(plan('Alt')));
      // Basisstand aus früherem Laden ist vorhanden und entspricht der DB: ohne Lade-Epoche
      // würde der veraltet gebaute Save durchgehen (Vergleich DB = Basis wäre grün).
      g.planSync.setPlanBase('PB1', plan('DB'), { load: false });
      const hold = defer();
      pb.setGate((m, u) => (m === 'GET' && !pb._first ? (pb._first = true, hold.p) : null));
      const loading = g.dataService.loadPlanForManager('PB1');   // Start-Laden hängt im Netz
      await tick(10);
      g.state.assignments['2026-07-01'].gl = 'Edit';
      const saving = quiet(() => g.plans._savePlanToLS('p1').catch(e => e));
      await tick(10);
      hold.r();
      await loading;
      const err = await saving;
      eq(pb.patches().length, 0, 'veraltet gebauter Save darf nicht schreiben');
      ok(err instanceof Error, 'Hinweis/Fehler gemeldet');
      eq(g.state.assignments['2026-07-01'].gl, 'DB', 'State = DB-Stand');
    } finally { pb.setGate(null); pb.restore(); }
  });

  test('plansync (I2): Zeiger von anderem Tab auf Y gesetzt → Reload von X im Tab X klappt', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      localStorage.setItem('tourplan_active_pb_id', 'PB2');     // Konsole (anderer Tab) hat den Zeiger umgesetzt
      const okLoad = await g.dataService.loadPlanForManager('PB1');   // Tab X (p1 → PB1) lädt sich neu
      eq(okLoad, true, 'Reload des eigenen Plans darf nicht am fremden Zeiger scheitern');
    } finally { pb.restore(); }
  });

  test('plansync (M4): ohne tourplan_pb_<lid> kein Rückfall auf den globalen Zeiger', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      localStorage.removeItem('tourplan_pb_p1');
      localStorage.setItem('tourplan_active_pb_id', 'PB2');     // fremder Plan
      const id = await quiet(() => g.dataService._getActivePlanId());
      ok(id !== 'PB2', 'Plan des Tabs darf nicht der fremde Zeiger sein, war ' + id);
    } finally { pb.restore(); }
  });

  test('plansync (C3): switch A→B, während A noch lädt → A-Antwort schreibt nichts in Plan B', async () => {
    const pb = setup('Wolf', plan('Wolf'));
    try {
      g.planSync.setPlanBase('PB1', plan('Wolf'), { load: false });
      g.planSync.setPlanBase('PB2', plan('Zwei'), { load: false });
      localStorage.setItem('tourplan_plan_p2', JSON.stringify(plan('CacheB')));
      const hold = defer();
      pb.setGate((m, u) => (m === 'GET' && u.endsWith('/PB1') && !pb._held ? (pb._held = true, hold.p) : null));
      const loadA = g.dataService.loadPlanForManager('PB1');    // A lädt, hängt
      await tick(10);
      g.plans.switchPlan('p2');                                 // Wechsel auf B
      for (let i = 0; i < 50 && g.state.assignments['2026-07-01']?.gl !== 'Zwei'; i++) await tick(5);
      eq(g.state.assignments['2026-07-01'].gl, 'Zwei', 'B geladen');
      pb.setGate(null); hold.r();
      await loadA;
      eq(g.state.assignments['2026-07-01'].gl, 'Zwei', 'späte A-Antwort hat B nicht überschrieben');
      eq(JSON.parse(localStorage.getItem('tourplan_plan_p2')).assignments['2026-07-01'].gl, 'Zwei', 'Cache von B unberührt');
      eq(g.plans.getActivePlanId(), 'p2', 'B bleibt aktiv');
    } finally { pb.setGate(null); pb.restore(); }
  });
}
