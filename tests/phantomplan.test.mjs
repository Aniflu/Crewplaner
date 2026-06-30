// Phantom-Plan-Guard: _getActivePlanId (via loadAssignmentStatuses) legt NIE einen Plan an.
// Früher erzeugte ein 'Tour Plan'-Default-pbPost leere Phantom-Plan-Leichen.
import { test, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

test('kein pbPost auf plans, wenn kein Plan auflösbar ist (kein Phantom)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  g.plans.setActivePlanId(null);
  const ls = globalThis.localStorage;
  ls.setItem('pb_token', 't');
  ls.removeItem('tourplan_pb_default');
  ls.removeItem('tourplan_active_pb_id');

  let postedPlan = false;
  globalThis.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    if (method === 'POST' && u.includes('/collections/plans/records')) postedPlan = true;
    // Owner-/Name-Suche liefert nichts → _getActivePlanId muss null zurückgeben
    if (method === 'GET' && u.includes('/collections/plans/records')) return { status: 200, ok: true, json: async () => ({ items: [] }) };
    return { status: 200, ok: true, json: async () => ({ items: [] }) };
  };

  await g.dataService.loadAssignmentStatuses();
  ok(!postedPlan, 'es wurde KEIN neuer plans-Record angelegt');
});
