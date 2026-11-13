// v1.4.0: Crew-Seite der Vormerkung — Info-Popup, Absagen, Zurücknehmen, „Alle absagen".
import { test, eq, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

function res(body, status = 200){ return { status, ok: status < 400, json: async () => body }; }
const ME = 'Marco Hoch';

// Echte Form: crewMeta, assignments (Zellwert = Name), Status je Slot, PB-Datensätze je (date,pos).
function setup(g, statuses){
  resetState(g);
  g.state.setAuthState('uid-crew', 'crew@example.com', 'crew');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  globalThis.localStorage.removeItem('crew_pencil_seen_PLAN1');
  globalThis.localStorage.removeItem('crew_pencil_seen_PLAN2');
  if (g.dataService._setCrewLoadedPlanId) g.dataService._setCrewLoadedPlanId('PLAN1');
  g.state.crewMeta[ME] = { email: 'crew@example.com', userId: 'uid-crew' };
  g.state.POSITIONS.push({ id: 'gl', label: 'Gruppenleitung' }, { id: 'fa', label: 'Fahrer' });
  Object.entries(statuses).forEach(([k, st]) => {
    const [date, pos] = k.split('|');
    if (!g.state.TOUR_DATES.find(d => d.date === date)) g.state.TOUR_DATES.push({ date, loc: 'Berlin' });
    g.state.assignments[date] = Object.assign(g.state.assignments[date] || {}, { [pos]: ME });
    g.state.setStatus(date, pos, { status: st, crewName: ME });
  });
}
const log = { patches: [], posts: [] };
function mock(statuses){
  log.patches = []; log.posts = [];
  globalThis.fetch = async (url, opts) => {
    url = String(url); const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (method === 'GET' && url.includes('/myplans')) return res([{ id: 'PLAN1', name: 'Tour' }]);
    if (method === 'GET' && url.includes('/assignments/records')) {
      const m = decodeURIComponent(url.replace(/\+/g, ' ')).match(/date = "([^"]+)" && pos_id = "([^"]+)"/);
      const st = m && statuses[m[1] + '|' + m[2]];
      return res({ items: st ? [{ id: 'r-' + m[1] + m[2], crew_email: 'crew@example.com', crew_name: ME, pos_label: 'X', status: st }] : [] });
    }
    if (method === 'PATCH') { log.patches.push({ url, body }); return res({ id: 'x', status: body.status }); }
    if (method === 'POST') { log.posts.push({ url, body }); return res({ id: 'new' }); }
    return res({});
  };
}
// Fake-DOM, das sharedBody/-Title mitschreibt (der Test-Stub verwirft sonst alles).
function captureDom(){
  const els = {};
  const mk = () => ({ innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }, focus(){}, querySelector(){ return null; }, querySelectorAll(){ return []; } });
  const orig = globalThis.document.getElementById;
  globalThis.document.getElementById = id => (els[id] ||= mk());
  return { els, restore(){ globalThis.document.getElementById = orig; } };
}
const flush = () => new Promise(r => setTimeout(r, 30));

test('Popup: nur neue Vormerkungen; gesehen unterdrückt; neuer Tag nach OK zeigt nur den neuen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencilled', '2026-07-02|gl': 'pencilled' };
  setup(g, st); mock(st); const dom = captureDom();
  try {
    ok(g.userView.checkPencilInfoPopup() === true, 'zeigt beim ersten Mal');
    const html = dom.els.sharedBody.innerHTML;
    ok(html.includes('01.07.2026') && html.includes('02.07.2026'), 'beide Tage');
    ok(html.includes('OK, verstanden') && !html.includes('Absagen'), 'nur OK, kein Absagen');
    eq(dom.els.sharedTitle.textContent, 'ℹ Nur zur Information');
    g.userView.pencilInfoOk(); await flush();
    ok(g.userView.checkPencilInfoPopup() === false, 'nach OK nichts mehr');
    // neuer vorgemerkter Tag
    g.state.TOUR_DATES.push({ date: '2026-07-03', loc: '' });
    g.state.assignments['2026-07-03'] = { gl: ME };
    g.state.setStatus('2026-07-03', 'gl', { status: 'pencilled', crewName: ME });
    ok(g.userView.checkPencilInfoPopup() === true, 'neuer Tag → erneut');
    const h2 = dom.els.sharedBody.innerHTML;
    ok(h2.includes('03.07.2026') && !h2.includes('01.07.2026') && !h2.includes('02.07.2026'), 'nur der neue Tag');
  } finally { dom.restore(); }
});

test('Popup: keine Vormerkung (nur angefragt/bestätigt) → kein Popup', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'proposed', '2026-07-02|gl': 'confirmed', '2026-07-03|gl': 'pencil_declined' };
  setup(g, st); mock(st); const dom = captureDom();
  try { ok(g.userView.checkPencilInfoPopup() === false); } finally { dom.restore(); }
});

test('OK schreibt genau ein pencil_seen (planId, Name, Mail), keine Tageszeilen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencilled', '2026-07-02|gl': 'pencilled' };
  setup(g, st); mock(st); const dom = captureDom();
  try {
    g.userView.checkPencilInfoPopup(); g.userView.pencilInfoOk(); await flush();
    const seen = log.posts.filter(p => p.url.includes('activity_log'));
    eq(seen.length, 1); eq(seen[0].body.action, 'pencil_seen');
    eq(seen[0].body.plan_id, 'PLAN1'); eq(seen[0].body.crew_name, ME); eq(seen[0].body.crew_email, 'crew@example.com');
    eq(seen[0].body.date, '');
  } finally { dom.restore(); }
});

test('Popup/OK nutzen den GELADENEN Plan des Tabs, nicht den globalen Zeiger', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencilled' };
  setup(g, st); mock(st); const dom = captureDom();
  // Ein zweiter Tab hat den globalen Zeiger auf eine andere Tour umgesetzt.
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN2');
  try {
    ok(g.userView.checkPencilInfoPopup() === true);
    g.userView.pencilInfoOk(); await flush();
    const seen = log.posts.filter(p => p.url.includes('activity_log'));
    eq(seen.length, 1); eq(seen[0].body.plan_id, 'PLAN1');
    ok((globalThis.localStorage.getItem('crew_pencil_seen_PLAN1') || '').includes('2026-07-01|gl'), 'Schlüssel unter PLAN1');
    eq(globalThis.localStorage.getItem('crew_pencil_seen_PLAN2'), null);
    // Doppelklick auf OK schreibt keinen zweiten Eintrag.
    g.userView.pencilInfoOk(); await flush();
    eq(log.posts.filter(p => p.url.includes('activity_log')).length, 1);
  } finally { dom.restore(); }
});

test('Ohne geladenen Plan kein Popup und kein Log', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencilled' };
  setup(g, st); mock(st); const dom = captureDom();
  if (g.dataService._setCrewLoadedPlanId) g.dataService._setCrewLoadedPlanId('');
  try {
    ok(g.userView.checkPencilInfoPopup() === false);
    g.userView.pencilInfoOk(); await flush();
    eq(log.posts.filter(p => p.url.includes('activity_log')).length, 0);
  } finally { dom.restore(); }
});

test('Absagen → pencil_declined; Wieder vormerken → pencilled', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencilled' };
  setup(g, st); mock(st); const dom = captureDom();
  try {
    await g.userView.declineMySlot('2026-07-01', 'gl');
    eq(log.patches.length, 1); eq(log.patches[0].body.status, 'pencil_declined');
    st['2026-07-01|gl'] = 'pencil_declined';
    await g.userView.restoreMyPencil('2026-07-01', 'gl');
    eq(log.patches.length, 2); eq(log.patches[1].body.status, 'pencilled');
    eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'pencilled');
  } finally { dom.restore(); }
});

test('„Alle absagen“ trifft nur Vormerkungen, nie Anfrage/Bestätigt', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencilled', '2026-07-02|gl': 'pencilled', '2026-07-02|fa': 'proposed', '2026-07-03|gl': 'confirmed' };
  setup(g, st); mock(st); const dom = captureDom();
  const origC = globalThis.showConfirm; globalThis.showConfirm = async () => true;
  try {
    await g.userView.declineAllMyPencilled();
    eq(log.patches.length, 2);
    ok(log.patches.every(p => p.body.status === 'pencil_declined'));
    const ids = log.patches.map(p => p.url).join(',');
    ok(!ids.includes('2026-07-02fa') && !ids.includes('2026-07-03gl'), 'proposed/confirmed unberührt');
    eq(g.state.assignmentStatuses['2026-07-02'].fa.status, 'proposed');
    eq(g.state.assignmentStatuses['2026-07-03'].gl.status, 'confirmed');
  } finally { globalThis.showConfirm = origC; dom.restore(); }
});

test('Popup-Schlüssel-Logik: unseenPencilSlots', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const s = [{ date: 'a', posId: 'x' }, { date: 'b', posId: 'x' }];
  eq(g.userView.unseenPencilSlots(s, []).length, 2);
  eq(g.userView.unseenPencilSlots(s, ['a|x']).length, 1);
  eq(g.userView.unseenPencilSlots(s, ['a|x', 'b|x']).length, 0);
});

test('pencil_declined/pencilled sind keine offene Frage (getMyPendingSlots)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  const st = { '2026-07-01|gl': 'pencil_declined', '2026-07-02|gl': 'pencilled', '2026-07-03|gl': 'proposed' };
  setup(g, st);
  eq(g.userView.getMyPendingSlots().map(s => s.date).join(), '2026-07-03');
  eq(g.userView.getMyPencilDeclinedSlots().map(s => s.date).join(), '2026-07-01');
});
