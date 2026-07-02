// dataService confirm/decline — Fehlerbehandlung + kein false-confirm (fetch gemockt).
import { test, eq, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

// Fake-fetch: handler(url, method) → { status, ok, json }
function res(body, status = 200){ return { status, ok: status < 400, json: async () => body }; }
function mockFetch(handler){ globalThis.fetch = async (url, opts) => handler(String(url), (opts && opts.method) || 'GET'); }

// Manager + gecachte Plan-ID → _getActivePlanId() ohne Netzwerk
function primePlan(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');                 // Auth-Header
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');  // _getActivePlanId Cache
}

test('confirmAssignment: wirft bei PATCH-Fehler (kein stiller Fehlschlag)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  mockFetch((url, method) => {
    if (method === 'GET'   && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1' }] });
    if (method === 'PATCH') return res({ message: 'boom' }, 500);
    return res({});
  });
  let threw = false;
  try { await g.dataService.confirmAssignment('2026-07-01', 'gl'); }
  catch(_) { threw = true; }
  ok(threw, 'Fehler wird weitergereicht');
});

test('confirmAssignment: KEIN false-confirm ohne PB-Record', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Wolf' });
  mockFetch((url, method) => method === 'GET' ? res({ items: [] }) : res({}));
  await g.dataService.confirmAssignment('2026-07-01', 'gl'); // kein Record → kein throw, kein Update
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'proposed', 'Status bleibt proposed');
});

test('confirmAssignment: setzt lokal confirmed bei Erfolg', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Wolf' });
  mockFetch((url, method) => {
    if (method === 'GET'   && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1' }] });
    if (method === 'PATCH') return res({ id: 'rec1', status: 'confirmed' });
    return res({});
  });
  await g.dataService.confirmAssignment('2026-07-01', 'gl');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'confirmed', 'lokal confirmed');
});

test('confirmAssignment: legt bestätigten Record an für geplante Crew OHNE Record', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  g.state.defaultCrew.gl = 'Wolf Geffenius';                       // geplant via Standard-Crew
  g.state.crewMeta['Wolf Geffenius'] = { email: 'wolf@x.de' };
  let posted = false;
  mockFetch((url, method) => {
    if (method === 'GET'  && url.includes('/assignments/records')) return res({ items: [] }); // kein Record
    if (method === 'POST' && url.includes('/assignments/records')) { posted = true; return res({ id: 'new1' }); }
    return res({});
  });
  await g.dataService.confirmAssignment('2026-07-01', 'gl');
  ok(posted, 'POST (Record-Anlage) ausgeführt');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'confirmed', 'lokal confirmed');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.crewName, 'Wolf Geffenius', 'crewName gesetzt');
});

// ── Eigentümer-Prüfung (v0.20.0): Crew nur eigene Einsätze ───────────────────
function primeCrew(g, email){
  g.state.setAuthState('uid-crew', email, 'crew');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
}

test('confirmAssignment: Crew darf FREMDEN Slot NICHT bestätigen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g, 'marco@hoch-online.com');
  let patched = false;
  mockFetch((url, method) => {
    if (method === 'GET' && url.includes('/crew_members/records')) return res({ items: [{ plan_id: 'PLAN1' }] });
    if (method === 'GET' && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1', crew_email: 'someone@else.de' }] });
    if (method === 'PATCH') { patched = true; return res({}); }
    return res({});
  });
  let threw = false;
  try { await g.dataService.confirmAssignment('2026-07-01', 'gl'); } catch(_) { threw = true; }
  ok(threw, 'Fremd-Bestätigung wirft „Zugriff verweigert"');
  ok(!patched, 'kein PATCH auf fremden Record');
});

test('confirmAssignment: Crew darf EIGENEN Slot bestätigen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g, 'marco@hoch-online.com');
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Marco Hoch' });
  let patched = false;
  mockFetch((url, method) => {
    if (method === 'GET' && url.includes('/crew_members/records')) return res({ items: [{ plan_id: 'PLAN1' }] });
    if (method === 'GET' && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1', crew_email: 'marco@hoch-online.com' }] });
    if (method === 'PATCH') { patched = true; return res({ id: 'rec1', status: 'confirmed' }); }
    return res({});
  });
  await g.dataService.confirmAssignment('2026-07-01', 'gl');
  ok(patched, 'eigener Slot wird bestätigt');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'confirmed', 'lokal confirmed');
});

test('declineAssignment: wirft bei PATCH-Fehler', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Wolf' });
  mockFetch((url, method) => {
    if (method === 'GET'   && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1' }] });
    if (method === 'PATCH') return res({ message: 'boom' }, 500);
    return res({});
  });
  let threw = false;
  try { await g.dataService.declineAssignment('2026-07-01', 'gl'); }
  catch(_) { threw = true; }
  ok(threw, 'Fehler wird weitergereicht');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'proposed', 'Status nicht fälschlich declined');
});
