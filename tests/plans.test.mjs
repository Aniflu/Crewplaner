// Regression: Plan-PB-Sync darf NIE in einen fremden Record schreiben (Cross-Write).
//
// Bug v0.14.6: _savePlanToLS nutzte `tourplan_pb_<id> || tourplan_active_pb_id`.
// Fehlte die plan-eigene Zuordnung, patchte es den GLOBALEN active_pb_id-Record →
// „Provinz 2027" überschrieb den „AMK 2026"-Record (Datenverlust).
import { loadGraph, resetState } from './_graph.mjs';
import { test, ok } from './_assert.mjs';

const g = await loadGraph();

async function withFetchSpy(fn) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
    return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ id: 'NEW' }), text: () => Promise.resolve('{"id":"NEW"}') });
  };
  try { await fn(calls); } finally { globalThis.fetch = orig; }
}

if (!g) {
  test('plans: Graph laden', () => ok(false, 'Graph-Load fehlgeschlagen'));
} else {
  test('plans: _savePlanToLS patcht NIE einen fremden active_pb_id (Cross-Write-Guard)', async () => {
    resetState(g);
    g.state.setAuthState('USER1', 'm@x.de', 'manager');
    localStorage.setItem('tourplan_plans', JSON.stringify([{ id: 'p1', name: 'Testplan' }]));
    localStorage.setItem('tourplan_active_pb_id', 'FOREIGN'); // Zeiger auf FREMDEN Plan
    localStorage.removeItem('tourplan_pb_p1');                 // KEINE eigene Zuordnung
    g.plans.setActivePlanId('p1');
    await withFetchSpy(async calls => {
      await g.plans._savePlanToLS('p1').catch(() => {});
      ok(calls.some(c => c.method === 'POST'), 'ohne Zuordnung muss ein NEUER Record angelegt werden (sonst prüft der Test nichts)');
      const foreignPatch = calls.find(c => c.method === 'PATCH' && c.url.includes('FOREIGN'));
      ok(!foreignPatch, 'PATCH auf fremden Record FOREIGN → Cross-Write!');
    });
  });

  test('plans: _savePlanToLS patcht den EIGENEN Record (tourplan_pb_<id>)', async () => {
    resetState(g);
    g.state.setAuthState('USER1', 'm@x.de', 'manager');
    localStorage.setItem('tourplan_plans', JSON.stringify([{ id: 'p2', name: 'Testplan2' }]));
    localStorage.setItem('tourplan_active_pb_id', 'FOREIGN');
    localStorage.setItem('tourplan_pb_p2', 'OWN');            // eigene Zuordnung vorhanden
    g.plans.setActivePlanId('p2');
    // Seit v1.2.1 liest _savePlanToLS den Record vor dem PATCH (Überschreib-Schutz, js/planSync.js):
    // DB-Stand = Basisstand, damit der PATCH zugelassen wird.
    const dbState = { version: 3, crew: [], positions: [], defaultCrew: {}, tourDates: [], assignments: {} };
    g.planSync.setPlanBase('OWN', dbState);
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      calls.push({ url: String(url), method });
      const body = method === 'GET' ? { id: 'OWN', plan_data: dbState } : { id: 'OWN' };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
    try {
      await g.plans._savePlanToLS('p2');
      ok(calls.some(c => c.method === 'PATCH' && c.url.includes('OWN')), 'kein PATCH auf eigenen Record OWN');
      ok(!calls.some(c => c.url.includes('FOREIGN')), 'Zugriff ging an FOREIGN statt OWN');
    } finally { globalThis.fetch = orig; }
  });
}
