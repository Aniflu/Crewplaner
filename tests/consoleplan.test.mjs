// v1.2.3: Konsolen-Knöpfe (Tourblock, Bereich→Block, Datum, Crew) öffnen den in der Konsole
// geladenen Plan, nicht die zuletzt aktive Tour. Struktursperre auf admin.html + Verhalten der
// Übergabe in js/authService.js (echte plan_data-Form, fetch gemockt).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadGraph } from './_graph.mjs';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const g = await loadGraph();

function body(name) {
  const i = admin.indexOf('function ' + name + '(');
  ok(i >= 0, name + ' fehlt in admin.html');
  const j = admin.indexOf('\n}\n', i);
  return admin.slice(i, j);
}

test('admin.html: _adminPlanAction und loadPlanIntoTourview nutzen die gemeinsame Übergabe', () => {
  ok(/_transferPlanToTourview\(action\)/.test(body('_adminPlanAction')), '_adminPlanAction ruft _transferPlanToTourview(action) nicht auf');
  ok(/_transferPlanToTourview\(\)/.test(body('loadPlanIntoTourview')), 'loadPlanIntoTourview ruft _transferPlanToTourview() nicht auf');
  const t = body('_transferPlanToTourview');
  ok(t.includes("'_planTransfer_pbid'"), 'Übergabe setzt _planTransfer_pbid nicht');
  ok(t.includes("'tourplan_pending_action'"), 'Übergabe setzt tourplan_pending_action nicht');
});

const plan = (n) => ({ version: 3, crew: [n], positions: [{ id: 'gl', label: 'GL', short: 'GL' }],
  defaultCrew: { gl: n }, tourDates: [{ date: '2026-07-01', loc: 'Berlin', type: 'show', typeLabel: 'Show' }],
  assignments: { '2026-07-01': { gl: n } } });

if (!g) { test('consoleplan: Graph nicht ladbar', () => ok(false, 'Graph-Load fehlgeschlagen')); }
else {
  test('authService: Übergabe von Plan Y macht Y zum aktiven Plan und lädt ihn aus der DB', async () => {
    const auth = await import('../js/authService.js');
    const ls = localStorage;
    // Zustand sichern: Module sind Singletons, andere Tests laufen im selben Prozess
    const snap = Object.keys(ls).map(k => [k, ls.getItem(k)]);
    const prevActive = g.plans.getActivePlanId();
    const prevAuth = [g.state.CURRENT_USER_ID, g.state.CURRENT_USER_EMAIL, g.state.IS_CREW ? 'crew' : 'manager'];
    ls.clear();
    // zuletzt aktiv war Plan X
    ls.setItem('tourplan_plans', JSON.stringify([{ id: 'pbplan_PBX', name: 'X' }]));
    ls.setItem('tourplan_plan_pbplan_PBX', JSON.stringify(plan('X')));
    ls.setItem('tourplan_pb_pbplan_PBX', 'PBX'); ls.setItem('tourplan_active_pb_id', 'PBX');
    ls.setItem('tourplan_active_plan', 'pbplan_PBX');
    ls.setItem('pb_token', 't'); ls.setItem('pb_user', JSON.stringify({ id: 'u1', email: 'm@test', role: 'manager' }));
    // Übergabe aus der Konsole für Plan Y + Folgeaktion
    ls.setItem('_planTransfer_data', JSON.stringify(plan('Y')));
    ls.setItem('_planTransfer_name', 'Y'); ls.setItem('_planTransfer_pbid', 'PBY');
    ls.setItem('_planTransfer_flag', '1'); ls.setItem('tourplan_pending_action', 'openCrewModal');
    const urls = []; const orig = globalThis.fetch;
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      const m = String(url).match(/plans\/records\/([^/?]+)$/);
      const b = m ? { id: m[1], name: 'Y', plan_data: plan('Y') } : { items: [] };
      return { ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) };
    };
    try {
      await auth._authCheckAndStart();
      await new Promise(r => setTimeout(r, 100));
    } finally { globalThis.fetch = orig; }
    try {
    eq(g.plans.getActivePlanId(), 'pbplan_PBY', 'aktiver Plan ist Y (startApp hat tourplan_active_plan übernommen)');
    eq(ls.getItem('tourplan_pb_pbplan_PBY'), 'PBY', 'Plan Y ist mit PB-ID verknüpft');
    eq(ls.getItem('tourplan_active_pb_id'), 'PBY', 'aktive PB-ID ist Y');
    ok(urls.some(u => /plans\/records\/PBY/.test(u)), 'DB-Laden von PBY nicht angefordert: ' + urls.join(' | '));
    ok(!urls.some(u => /plans\/records\/PBX/.test(u)), 'Plan X wurde geladen');
    } finally {
      ls.clear(); snap.forEach(([k, v]) => ls.setItem(k, v));
      g.plans.setActivePlanId(prevActive);
      g.state.setAuthState(prevAuth[0], prevAuth[1], prevAuth[2]);
    }
  });
}
