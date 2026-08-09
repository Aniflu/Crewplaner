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
  resetState(g); primeCrew(g, 'crew@example.com');
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
  resetState(g); primeCrew(g, 'crew@example.com');
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Marco Hoch' });
  let patched = false;
  mockFetch((url, method) => {
    if (method === 'GET' && url.includes('/crew_members/records')) return res({ items: [{ plan_id: 'PLAN1' }] });
    if (method === 'GET' && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1', crew_email: 'crew@example.com' }] });
    if (method === 'PATCH') { patched = true; return res({ id: 'rec1', status: 'confirmed' }); }
    return res({});
  });
  await g.dataService.confirmAssignment('2026-07-01', 'gl');
  ok(patched, 'eigener Slot wird bestätigt');
  eq(g.state.assignmentStatuses['2026-07-01'].gl.status, 'confirmed', 'lokal confirmed');
});

// ── Crew-Plan-Umschalter (v0.21.0): loadCrewPlans ────────────────────────────
test('loadCrewPlans: holt die Touren über die Route /myplans (nicht über plans-REST)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g, 'oliver@x.de');
  const gesehen = [];
  mockFetch((url, method) => {
    gesehen.push(url);
    if (url.includes('/myplans'))
      return res([{ id: 'P_AMK', name: 'AMK Tour 2026' }, { id: 'P_PROV', name: 'Provinz 2027' }]);
    return res({});
  });
  const plans = await g.dataService.loadCrewPlans();
  eq(plans.length, 2, 'Liste der Route wird durchgereicht');
  eq(plans[0].name, 'AMK Tour 2026');
  // Der entscheidende Punkt: die plans-Collection wird NICHT mehr angefasst — dort käme
  // der view_token mit zurück. Dubletten-Entfernung, Sortierung und das Überspringen
  // gelöschter Pläne liegen seit v4.16 im Hook (unter Node nicht ausführbar).
  ok(!gesehen.some(u => u.includes('/collections/plans/')),
     'kein Zugriff auf die plans-REST-API: ' + gesehen.join(', '));
});

test('loadCrewPlans: Fehler der Route → leere Liste statt Absturz', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g, 'oliver@x.de');
  mockFetch(() => res({ message: 'not found' }, 404));
  const plans = await g.dataService.loadCrewPlans();
  eq(plans.length, 0, 'leere Liste, kein Wurf');
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

test('softCancelAssignment: patcht status=cancelled statt zu löschen, liefert Record', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  localStorage.setItem('tourplan_active_pb_id','plan1');
  g.state.setStatus('2026-08-01','gl',{status:'confirmed',crewName:'Pascal'});
  const calls = [];
  mockFetch((url, method) => {
    calls.push({ url:String(url), method:method||'GET' });
    if (method === 'GET' && String(url).includes('/assignments/records')) return res({ items:[{ id:'rec1', status:'confirmed', crew_name:'Pascal' }] });
    if (method === 'PATCH') return res({ id:'rec1', status:'cancelled' });
    return res({});
  });
  const rec = await g.dataService.softCancelAssignment('2026-08-01','gl');
  ok(rec && rec.id==='rec1', 'liefert den Record');
  ok(calls.some(c=>c.method==='PATCH'), 'PATCH statt DELETE');
  ok(!calls.some(c=>c.method==='DELETE'), 'kein DELETE');
  eq(g.state.assignmentStatuses['2026-08-01']?.gl, undefined, 'clearStatus leert den Cache');
});

test('ackCancelledAssignments: quittiert NUR Records mit status=cancelled', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeCrew(g, 'pascal@test.de');
  const patched = [], posts = [];
  mockFetch((url, method) => {
    const u = String(url);
    if ((method||'GET')==='GET' && u.includes('/rec_c')) return res({ id:'rec_c', status:'cancelled', crew_email:'pascal@test.de', date:'2026-08-01', pos_label:'GL', crew_name:'Pascal', plan_id:'plan1' });
    if ((method||'GET')==='GET' && u.includes('/rec_p')) return res({ id:'rec_p', status:'proposed', crew_email:'pascal@test.de' });
    if ((method||'GET')==='PATCH') { patched.push(u); return res({}); }
    if ((method||'GET')==='POST') { posts.push(u); return res({}); }
    return res({});
  });
  const n = await g.dataService.ackCancelledAssignments(['rec_c','rec_p']);
  await new Promise(r=>setTimeout(r,0));  // fire-and-forget logActivity
  eq(n, 1, 'nur der cancelled-Record wird quittiert');
  ok(patched.length===1 && patched[0].includes('rec_c'), 'PATCH nur auf rec_c');
  ok(posts.some(u=>u.includes('activity_log')), 'logActivity POST abgesetzt');
});
