// v1.3.0: Crew-Einträge (crew_members, assignments) erst ändern, wenn der Plan GESPEICHERT ist.
// Lehnt der Speicherschutz (js/planSync.js) ab, darf weder umbenannt noch gelöscht noch angelegt
// werden — sonst steht in plan_data der alte Name und in crew_members der neue.
// Echte plan_data-Form, fetch gemockt; Ablehnung = DB-Stand zwischendurch geändert.
import { loadGraph, resetState } from './_graph.mjs';
import { test, ok, eq } from './_assert.mjs';

const g = await loadGraph();
const plan = (loc) => ({
  version: 3, crew: ['Wolf', 'Oliver'],
  positions: [{ id: 'gl', label: 'GL', short: 'GL' }],
  defaultCrew: { gl: 'Wolf' },
  tourDates: [{ date: '2026-07-01', loc, type: 'show', typeLabel: 'Show' }],
  assignments: { '2026-07-01': { gl: 'Wolf' } },
});

// Fake-PocketBase mit Protokoll aller Aufrufe (Methode, Pfad, Body) in Reihenfolge.
function fakePb(dbPlan) {
  const calls = [];
  const members = [{ id: 'cmW', plan_id: 'PB1', name: 'Wolf', email: 'wolf@example.com' },
                   { id: 'cmO', plan_id: 'PB1', name: 'Oliver', email: 'oli@example.com' }];
  const assigns = [{ id: 'asW', plan_id: 'PB1', crew_name: 'Wolf', date: '2026-07-01', pos_id: 'gl' }];
  let planData = JSON.stringify(dbPlan);
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url), 'https://x.test'); const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, path: u.pathname, body });
    const res = (b, status = 200) => ({ ok: true, status, json: async () => b });
    if (/\/plans\/records\/PB1$/.test(u.pathname)) {
      if (method === 'PATCH') planData = body.plan_data;
      return res({ id: 'PB1', name: 'T', plan_data: planData });
    }
    if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
    if (method !== 'GET') return res({ id: 'rec' + calls.length });
    const f = u.searchParams.get('filter') || '';
    const col = u.pathname.split('/')[3];
    const nm = (f.match(/(?:crew_)?name = "([^"]*)"/) || [])[1];
    let items = [];
    if (col === 'crew_members' && /plan_id = "PB1"/.test(f)) items = members.filter(m => !nm || m.name === nm);
    if (col === 'assignments' && /plan_id = "PB1"/.test(f)) items = assigns.filter(a => !nm || a.crew_name === nm);
    return res({ items, page: 1, perPage: 200, totalPages: 1 });
  };
  const writes = (col) => calls.filter(c => c.method !== 'GET' && (!col || c.path.includes('/' + col + '/')));
  return { calls, writes, restore: () => { globalThis.fetch = orig; }, planData: () => JSON.parse(planData) };
}

// Plan 'p1' ↔ PB 'PB1'; State = plan('Berlin'); Basisstand = plan('Berlin'); DB = dbLoc.
function setup(dbLoc) {
  resetState(g);
  g.planSync.clearPlanBases();
  g.state.setAuthState('USER1', 'm@x.de', 'manager');
  localStorage.clear();
  localStorage.setItem('pb_token', 't');
  localStorage.setItem('tourplan_plans', JSON.stringify([{ id: 'p1', name: 'T1' }]));
  localStorage.setItem('tourplan_pb_p1', 'PB1');
  localStorage.setItem('tourplan_active_pb_id', 'PB1');
  g.plans.setActivePlanId('p1');
  const p = plan('Berlin');
  g.state.crew.push(...p.crew); g.state.POSITIONS.push(...p.positions);
  Object.assign(g.state.defaultCrew, p.defaultCrew); g.state.TOUR_DATES.push(...p.tourDates);
  Object.assign(g.state.assignments, p.assignments);
  g.planSync.setPlanBase('PB1', plan('Berlin'));
  return fakePb(plan(dbLoc));
}
const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const prompt = (v) => { window.showPrompt = async () => v; };
const neuePerson = (name, email) => {
  const real = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    if (id === 'npName') return Object.assign(real(id) || {}, { value: name });
    if (id === 'npEmail') return Object.assign(real(id) || {}, { value: email });
    return real(id);
  };
  return () => { globalThis.document.getElementById = real; };
};

// Aufräumen nach jedem Test: Module sind Singletons, ein hängender aktiver Plan 'p1' ließe
// spätere Tests (flows) in den PB-Zweig laufen.
const t = (name, fn) => test(name, async () => {
  try { await fn(); }
  finally { g.plans.setActivePlanId(null); localStorage.clear(); g.planSync.clearPlanBases(); resetState(g); }
});

if (!g) {
  t('crewsaveorder: Graph laden', () => ok(false, 'Graph-Load fehlgeschlagen'));
} else {
  t('Umbenennen: Erfolg → erst Plan-PATCH, dann crew_members/assignments', async () => {
    const pb = setup('Berlin'); prompt('Wolfgang');
    try {
      await g.crew.renameCrew(0);
      const w = pb.writes().map(c => c.method + ' ' + c.path.split('/').slice(3).join('/'));
      eq(w[0], 'PATCH plans/records/PB1', 'Plan zuerst: ' + w.join(' | '));
      ok(w.some(x => x.startsWith('PATCH crew_members')), 'crew_members umbenannt');
      ok(w.some(x => x.startsWith('PATCH assignments')), 'assignments umbenannt');
      ok(pb.planData().crew.includes('Wolfgang'), 'plan_data hat den neuen Namen');
    } finally { pb.restore(); }
  });

  t('Umbenennen: Speicherschutz lehnt ab → crew_members/assignments unberührt, Plan alt', async () => {
    const pb = setup('Hamburg'); prompt('Wolfgang');
    try {
      await quiet(() => g.crew.renameCrew(0));
      eq(pb.writes().length, 0, 'gar kein Schreibzugriff: ' + JSON.stringify(pb.writes()));
      ok(pb.planData().crew.includes('Wolf') && !pb.planData().crew.includes('Wolfgang'), 'plan_data hat den alten Namen');
      ok(g.state.crew.includes('Wolf') && !g.state.crew.includes('Wolfgang'), 'State = DB-Stand');
    } finally { pb.restore(); }
  });

  t('Umbenennen: offline → lokaler Stand zurückgenommen, nichts in crew_members', async () => {
    const pb = setup('Berlin'); prompt('Wolfgang');
    const orig = globalThis.fetch; globalThis.fetch = async () => { throw new TypeError('offline'); };
    try {
      await quiet(() => g.crew.renameCrew(0));
      ok(g.state.crew.includes('Wolf') && !g.state.crew.includes('Wolfgang'), 'Name zurück');
      eq(g.state.defaultCrew.gl, 'Wolf', 'defaultCrew zurück');
      eq(g.state.assignments['2026-07-01'].gl, 'Wolf', 'assignments zurück');
    } finally { globalThis.fetch = orig; pb.restore(); }
  });

  t('Entfernen: Erfolg → erst Plan-PATCH, dann DELETE crew_members', async () => {
    const pb = setup('Berlin');
    try {
      await g.crew.removeCrew(0); await new Promise(r => setTimeout(r, 20));
      const w = pb.writes().map(c => c.method + ' ' + c.path.split('/').slice(3).join('/'));
      eq(w[0], 'PATCH plans/records/PB1', 'Plan zuerst: ' + w.join(' | '));
      ok(w.some(x => x.startsWith('DELETE crew_members')), 'crew_members gelöscht');
    } finally { pb.restore(); }
  });

  t('Entfernen: Speicherschutz lehnt ab → kein DELETE, Person bleibt (DB-Stand)', async () => {
    const pb = setup('Hamburg');
    try {
      await quiet(() => g.crew.removeCrew(0)); await new Promise(r => setTimeout(r, 20));
      eq(pb.writes().length, 0, 'gar kein Schreibzugriff: ' + JSON.stringify(pb.writes()));
      ok(g.state.crew.includes('Wolf'), 'Person steht wieder in der Crew');
      eq(g.state.assignments['2026-07-01'].gl, 'Wolf', 'Zuweisung steht wieder');
    } finally { pb.restore(); }
  });

  t('Entfernen: offline → lokaler Stand zurückgenommen, kein DELETE', async () => {
    const pb = setup('Berlin');
    const orig = globalThis.fetch; globalThis.fetch = async () => { throw new TypeError('offline'); };
    try {
      await quiet(() => g.crew.removeCrew(0)); await new Promise(r => setTimeout(r, 20));
      ok(g.state.crew.includes('Wolf'), 'Person wieder da');
      eq(g.state.assignments['2026-07-01'].gl, 'Wolf', 'Zuweisung wieder da');
    } finally { globalThis.fetch = orig; pb.restore(); }
  });

  t('Übernehmen: Erfolg → erst Plan-PATCH, dann crew_members der Tour', async () => {
    const pb = setup('Berlin'); const back = neuePerson('Nora', 'nora@example.com');
    try {
      await g.crew.createAndTakeCrew();
      const w = pb.writes();
      const iPlan = w.findIndex(c => c.method === 'PATCH' && /plans\/records\/PB1/.test(c.path));
      const iLink = w.findIndex(c => c.method === 'POST' && c.body && c.body.plan_id === 'PB1' && c.body.name === 'Nora');
      ok(iPlan >= 0 && iLink > iPlan, 'Plan-PATCH (' + iPlan + ') vor crew_members-POST (' + iLink + ')');
    } finally { back(); pb.restore(); }
  });

  t('Übernehmen: Speicherschutz lehnt ab → kein crew_members-Eintrag der Tour, Name nicht in der Crew', async () => {
    const pb = setup('Hamburg'); const back = neuePerson('Nora', 'nora@example.com');
    try {
      await quiet(() => g.crew.createAndTakeCrew());
      ok(!pb.writes().some(c => c.method !== 'GET' && c.body && c.body.plan_id === 'PB1'), 'nichts für PB1 geschrieben: ' + JSON.stringify(pb.writes()));
      ok(!g.state.crew.includes('Nora'), 'Name nicht in der Crew');
    } finally { back(); pb.restore(); }
  });
}
