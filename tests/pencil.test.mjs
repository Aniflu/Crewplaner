// v1.4.0: Vormerkung als Information — App-Seite von pencil_declined (Hook v4.29).
// Echte Datenformen: PATCH-Body und notify-Nutzlast werden aus dem Fetch-Mock gelesen.
import { test, eq, ok, deepEq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';
import { icsExportRows, isCrewStatusTransitionAllowed } from '../js/pure.js';

function res(body, status = 200){ return { status, ok: status < 400, json: async () => body }; }
function mockFetch(handler){
  globalThis.fetch = async (url, opts) => handler(String(url), (opts && opts.method) || 'GET', opts && opts.body ? JSON.parse(opts.body) : null);
}
function primeCrew(g){
  g.state.setAuthState('uid-crew', 'crew@example.com', 'crew');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
}
function primeMgr(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
}
// Ein Slot-Datensatz in der Form, wie PocketBase ihn liefert.
const rec = (status) => ({ id: 'rec1', crew_email: 'crew@example.com', crew_name: 'Marco Hoch', pos_label: 'GL', status });
function crewMock(status, patches){
  mockFetch((url, method, body) => {
    if (method === 'GET' && url.includes('/myplans')) return res([{ id: 'PLAN1', name: 'Tour' }]);
    if (method === 'GET' && url.includes('/assignments/records')) return res({ items: [rec(status)] });
    if (method === 'PATCH') { patches.push(body); return res({ id: 'rec1', status: body.status }); }
    return res({});
  });
}

test('Crew sagt eine Vormerkung ab → PATCH pencil_declined', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'pencilled', crewName: 'Marco Hoch' });
  const patches = []; crewMock('pencilled', patches);
  await g.dataService.declineAssignment('2026-07-01', 'gl');
  eq(patches.length, 1); eq(patches[0].status, 'pencil_declined');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'pencil_declined', 'lokal gleich');
});

test('Crew sagt eine ANFRAGE ab → weiter declined', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Marco Hoch' });
  const patches = []; crewMock('proposed', patches);
  await g.dataService.declineAssignment('2026-07-01', 'gl');
  eq(patches[0].status, 'declined');
});

test('restorePencilled: pencil_declined → pencilled', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g);
  g.state.setStatus('2026-07-01', 'gl', { status: 'pencil_declined', crewName: 'Marco Hoch' });
  const patches = []; crewMock('pencil_declined', patches);
  await g.dataService.restorePencilled('2026-07-01', 'gl');
  eq(patches.length, 1); eq(patches[0].status, 'pencilled');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'pencilled');
});

test('restorePencilled: aus declined oder confirmed verweigert, kein PATCH', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  for (const st of ['declined', 'confirmed', 'proposed']) {
    resetState(g); primeCrew(g);
    const patches = []; crewMock(st, patches);
    let threw = false;
    try { await g.dataService.restorePencilled('2026-07-01', 'gl'); } catch(_) { threw = true; }
    ok(threw, st + ' darf nicht auf pencilled'); eq(patches.length, 0);
  }
});

test('Crew-Regeln: pencil_declined → confirmed verboten', () => {
  ok(!isCrewStatusTransitionAllowed('pencil_declined', 'confirmed'));
  ok(isCrewStatusTransitionAllowed('pencil_declined', 'pencilled'));
});

// ── Einladung/Erinnerung/Update: keine Vormerkungen ──────────────────────────
function einladungAufbauen(g, status){
  resetState(g); primeMgr(g);
  globalThis.localStorage.removeItem('tourplan_crew_invites_default');
  g.state.TOUR_DATES.length = 0; g.state.POSITIONS.length = 0;
  Object.keys(g.state.assignments).forEach(k => delete g.state.assignments[k]);
  Object.keys(g.state.defaultCrew).forEach(k => delete g.state.defaultCrew[k]);
  g.state.TOUR_DATES.push(
    { date: '2026-09-01', type: 'show', typeLabel: 'Show', loc: 'A' },
    { date: '2026-09-02', type: 'show', typeLabel: 'Show', loc: 'B' },
    { date: '2026-09-03', type: 'show', typeLabel: 'Show', loc: 'C' });
  g.state.POSITIONS.push({ id: 'gl', label: 'Gruppenleitung' });
  g.state.assignments['2026-09-01'] = { gl: 'Wolf Geffenius' };
  g.state.assignments['2026-09-02'] = { gl: 'Wolf Geffenius' };
  g.state.assignments['2026-09-03'] = { gl: 'Wolf Geffenius' };
  g.state.crewMeta['Wolf Geffenius'] = { email: 'wolf@example.com' };
  for (const [d, s] of Object.entries(status)) g.state.setStatus(d, 'gl', { status: s, crewName: 'Wolf Geffenius' });
}

test('sendInvite: vorgemerkte/abgesagte Vormerkungen NICHT in slots und lokal NICHT proposed', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  einladungAufbauen(g, { '2026-09-01': 'pencilled', '2026-09-02': 'pencil_declined' });
  let nutz = null;
  mockFetch((url, method, body) => { if (url.includes('/notify')) { nutz = body; return res({ ok: true }); } return res({ items: [] }); });
  await g.crewNotify.sendInvite('Wolf Geffenius', 'invite');
  ok(nutz, 'notify wurde aufgerufen');
  deepEq(nutz.slots.map(s => s.date), ['2026-09-03'], 'nur der ungeplante Tag');
  eq(g.state.assignmentStatuses['2026-09-01'].gl.status, 'pencilled', 'Vormerkung bleibt');
  eq(g.state.assignmentStatuses['2026-09-02'].gl.status, 'pencil_declined', 'Absage bleibt');
  eq(g.state.assignmentStatuses['2026-09-03'].gl.status, 'proposed');
});

test('sendInvite (Erinnerung): ebenfalls ohne Vormerkungen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  einladungAufbauen(g, { '2026-09-01': 'pencilled', '2026-09-02': 'proposed' });
  let nutz = null;
  mockFetch((url, method, body) => { if (url.includes('/notify')) { nutz = body; return res({ ok: true }); } return res({ items: [] }); });
  await g.crewNotify.sendInvite('Wolf Geffenius', 'reminder');
  deepEq(nutz.slots.map(s => s.date).sort(), ['2026-09-02', '2026-09-03']);
});

test('Update-Slotliste (_getNewSlotsForCrew): ohne pencilled und pencil_declined', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  einladungAufbauen(g, { '2026-09-01': 'pencilled', '2026-09-02': 'pencil_declined' });
  deepEq(g.crewNotify._getNewSlotsForCrew('Wolf Geffenius', 'wolf@example.com').map(s => s.date), ['2026-09-03']);
});

// ── Status-Listen kennen pencil_declined ─────────────────────────────────────
test('ICS: pencil_declined bleibt draußen', () => {
  const rows = icsExportRows([{ date: '2026-08-01', type: 'show' }], [{ id: 'gl', label: 'GL' }],
    { '2026-08-01': { gl: { status: 'pencil_declined', crewName: 'Wolf' } } }, {});
  eq(rows.length, 0);
});

test('Tourvergleich-Bündel: pencil_declined wird wie declined ausgeblendet', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeMgr(g);
  const { loadBundle } = await import('../js/tourvergleich-ui.js');
  const items = [
    { id: 'r1', date: '2026-07-09', pos_id: 'a', status: 'pencil_declined', crew_name: 'X' },
    { id: 'r2', date: '2026-07-09', pos_id: 'b', status: 'pencilled', crew_name: 'Y' }];
  mockFetch((url) => {
    if (url.includes('/collections/plans/records/')) return res({ id: 'P', name: 'T', plan_data: { crew: [] } });
    if (url.includes('/collections/crew_members/')) return res({ items: [], totalPages: 1 });
    return res({ items, totalPages: 1, page: 1 });
  });
  const b = await loadBundle('P');
  ok(!b.statuses['2026-07-09']?.a, 'pencil_declined ausgeblendet');
  ok(b.statuses['2026-07-09'].b, 'pencilled bleibt');
});

test('Tabelle (Manager) und Sammel-Dialog verarbeiten pencil_declined', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  einladungAufbauen(g, { '2026-09-01': 'pencil_declined' });
  const render = await import('../js/render.js');
  const bulk = await import('../js/bulkStatus.js');
  let body = '';
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    if (id === 'tBody') return { set innerHTML(v) { body = v; }, get innerHTML() { return body; } };
    if (id === 'bulkStatusBody') return { set innerHTML(v) { body = v; }, get innerHTML() { return body; } };
    if (id === 'btnBulkStatusApply') return { textContent: '', disabled: false, style: {} };
    return realGet(id);
  };
  try {
    g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
    render.renderBody();
    ok(/✎✗/.test(body) && /Vormerkung abgesagt/.test(body) && /line-through/.test(body), 'violett, durchgestrichen, Tooltip');
    body = '';
    bulk.openBulkStatusModal();
    ok(/2026-09-01/.test(body), 'Dialog nennt den Tag');
    ok(/Vormerkung abgesagt/.test(body), 'Zustand bekannt');
  } finally { globalThis.document.getElementById = realGet; }
});
