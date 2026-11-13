// v1.3.0: Die Konsole macht den geladenen Plan zum aktiven Plan (js/consoleplan.js).
// Echte plan_data-Form, fetch gemockt. Vorher aktiver Plan PBX, Konsole lädt PBY.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadGraph, resetState } from './_graph.mjs';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = await loadGraph();
const cp = await import('../js/consoleplan.js');

const plan = (n) => ({ version: 3, crew: [n, 'Oliver'], positions: [{ id: 'gl', label: 'GL', short: 'GL' }],
  defaultCrew: { gl: n }, tourDates: [{ date: '2026-07-01', loc: 'Berlin', type: 'show', typeLabel: 'Show' }],
  assignments: { '2026-07-01': { gl: n } } });

function fakePb(records) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    calls.push({ url: u, method });
    await Promise.resolve();
    const m = u.match(/\/api\/collections\/plans\/records\/([^/?]+)$/);
    let body = { items: [] };
    if (m && records[m[1]]) {
      if (method === 'PATCH') records[m[1]].plan_data = JSON.parse(opts.body).plan_data;
      body = { id: m[1], name: 'Tour ' + m[1], plan_data: records[m[1]].plan_data };
    }
    return { ok: true, status: 200, json: () => Promise.resolve(body) };
  };
  return { calls, restore: () => { globalThis.fetch = orig; },
           patches: (id) => calls.filter(c => c.method === 'PATCH' && (!id || c.url.endsWith('/' + id))) };
}

// Ausgangslage: Touransicht hatte PBX aktiv (lokal pbplan_PBX), Konsole kennt den Zustand nicht.
function setup() {
  resetState(g);
  g.planSync.clearPlanBases();
  g.state.setAuthState('USER1', 'm@x.de', 'manager');
  localStorage.clear();
  localStorage.setItem('tourplan_plans', JSON.stringify([{ id: 'pbplan_PBX', name: 'X' }]));
  localStorage.setItem('tourplan_pb_pbplan_PBX', 'PBX');
  localStorage.setItem('tourplan_active_pb_id', 'PBX');
  g.plans.setActivePlanId('pbplan_PBX');
  return fakePb({ PBX: { plan_data: JSON.stringify(plan('Iks')) }, PBY: { plan_data: JSON.stringify(plan('Ypsilon')) } });
}

if (!g) {
  test('konsoleplan: Graph laden', () => ok(false, 'Graph-Load fehlgeschlagen'));
} else {
  test('konsoleplan (a): Laden von PBY macht PBY aktiv, Basisstand und State gesetzt', async () => {
    const pb = setup();
    try {
      ok(await cp.activateConsolePlan('PBY', 'Tour Y'), 'Laden meldet Erfolg');
      eq(g.plans.getActivePlanId(), 'pbplan_PBY');
      eq(localStorage.getItem('tourplan_active_pb_id'), 'PBY');
      eq(localStorage.getItem('tourplan_pb_pbplan_PBY'), 'PBY');
      ok(g.planSync.hasPlanBase('PBY'), 'Basisstand für PBY gesetzt');
      ok(JSON.parse(localStorage.getItem('tourplan_plans')).some(p => p.id === 'pbplan_PBY'), 'Plan-Index enthält PBY');
      eq(g.state.crew[0], 'Ypsilon', 'State zeigt PBY');
      eq(cp.consolePlanSnapshot().crew[0], 'Ypsilon', 'Snapshot zeigt PBY');
    } finally { pb.restore(); }
  });

  test('konsoleplan (b): _savePlanToLS danach patcht nur PBY, nie PBX', async () => {
    const pb = setup();
    try {
      await cp.activateConsolePlan('PBY', 'Tour Y');
      g.state.crew.push('Neu');
      eq(g.plans.getActivePlanId(), 'pbplan_PBY', 'gespeichert wird unter der Konsolen-ID');
      await g.plans._savePlanToLS(g.plans.getActivePlanId());
      eq(localStorage.getItem('tourplan_pb_pbplan_PBX'), 'PBX', 'Zuordnung des vorher aktiven Plans bleibt unberührt');
      eq(pb.patches('PBY').length, 1, 'genau ein PATCH auf PBY');
      eq(pb.patches('PBX').length, 0, 'kein PATCH auf PBX');
      eq(pb.patches().length, 1, 'insgesamt ein PATCH');
    } finally { pb.restore(); }
  });

  test('konsoleplan (M7): Plan-Index bekommt je pbplan_<id> genau einen Eintrag, auch bei Altlasten', async () => {
    const pb = setup();
    try {
      localStorage.setItem('tourplan_plans', JSON.stringify([
        { id: 'pbplan_PBY', name: 'alt' }, { id: 'pbplan_PBX', name: 'X' }, { id: 'pbplan_PBY', name: 'doppelt' }]));
      await cp.activateConsolePlan('PBY', 'Tour Y');
      await cp.activateConsolePlan('PBY', 'Tour Y neu');
      const idx = JSON.parse(localStorage.getItem('tourplan_plans'));
      eq(idx.filter(p => p.id === 'pbplan_PBY').length, 1, 'genau ein Eintrag für PBY');
      ok(idx.find(p => p.id === 'pbplan_PBY').name !== 'alt', 'Name aktualisiert (kommt aus dem DB-Stand)');
      eq(idx.filter(p => p.id === 'pbplan_PBX').length, 1, 'andere Pläne bleiben');
    } finally { pb.restore(); }
  });

  test('konsoleplan (c): renderCrew und renderTable ohne DOM werfen nicht', () => {
    g.crew.renderCrew();
    const r = import('../js/render.js').then(m => m.renderTable());
    return r;
  });

  test('admin.html: Rolle und aktiver Plan werden in der Konsole gesetzt', () => {
    const admin = readFileSync(join(root, 'admin.html'), 'utf8');
    ok(/window\.setConsoleAuth\(/.test(admin), 'setConsoleAuth wird nicht aufgerufen');
    ok(/window\.activateConsolePlan\(pbPlanId/.test(admin), 'loadSelectedPlan ruft activateConsolePlan nicht auf');
  });
}
