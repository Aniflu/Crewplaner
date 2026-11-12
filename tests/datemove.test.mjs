// Datum eines Tour-Tags ändern (v1.1.0). Das Datum ist der Schlüssel, an dem Besetzung,
// Crew-Status (lokal UND die PB-Records), Update-Queue und Block hängen — alles muss mitwandern.
import { test, eq, ok, deepEq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';
import { checkDateMove, moveDateInPlan } from '../js/pure.js';

// ── pure: Prüfung ─────────────────────────────────────────────────────────────
const TD = () => [{ date:'2026-12-02', loc:'A' }, { date:'2026-12-04', loc:'B', blockId:'b1' }, { date:'2026-12-06', loc:'C' }];

test('checkDateMove: gültige Verschiebung → kein Grund', () =>
  eq(checkDateMove(TD(), '2026-12-04', '2026-12-03'), ''));
test('checkDateMove: Zieldatum schon belegt → belegt', () =>
  eq(checkDateMove(TD(), '2026-12-04', '2026-12-06'), 'belegt'));
test('checkDateMove: gleiches Datum → gleich', () =>
  eq(checkDateMove(TD(), '2026-12-04', '2026-12-04'), 'gleich'));
test('checkDateMove: leer/kaputt → ungueltig', () => {
  eq(checkDateMove(TD(), '2026-12-04', ''), 'ungueltig');
  eq(checkDateMove(TD(), '2026-12-04', '3.12.2026'), 'ungueltig');
});
test('checkDateMove: Ausgangstag fehlt → fehlt', () =>
  eq(checkDateMove(TD(), '2026-12-05', '2026-12-03'), 'fehlt'));

// ── pure: Anwenden ────────────────────────────────────────────────────────────
test('moveDateInPlan: Zeile behält Ort/Block und wird neu einsortiert', () => {
  const tourDates = TD();
  const r = moveDateInPlan({ tourDates }, '2026-12-04', '2026-12-07');
  ok(r.ok, 'ok');
  deepEq(tourDates.map(x => x.date), ['2026-12-02','2026-12-06','2026-12-07']);
  eq(tourDates[2].loc, 'B'); eq(tourDates[2].blockId, 'b1');
});

test('moveDateInPlan: Besetzung, Status und Queue wandern mit; Nachbartage bleiben', () => {
  const tourDates = TD();
  const assignments = { '2026-12-04': { gl:'Wolf' }, '2026-12-06': { gl:'Ida' } };
  const statuses = { '2026-12-04': { gl:{ status:'confirmed', crewName:'Wolf' } }, '2026-12-06': { gl:{ status:'proposed', crewName:'Ida' } } };
  const queue = { Wolf: { slots: [{ date:'2026-12-04', posLabel:'GL' }, { date:'2026-12-06', posLabel:'GL' }] } };
  moveDateInPlan({ tourDates, assignments, statuses, queue }, '2026-12-04', '2026-12-03');
  deepEq(Object.keys(assignments).sort(), ['2026-12-03','2026-12-06']);
  eq(assignments['2026-12-03'].gl, 'Wolf'); eq(assignments['2026-12-06'].gl, 'Ida');
  eq(statuses['2026-12-03'].gl.crewName, 'Wolf'); ok(!statuses['2026-12-04'], 'alter Schlüssel weg');
  eq(statuses['2026-12-06'].gl.crewName, 'Ida', 'Nachbartag unberührt');
  deepEq(queue.Wolf.slots.map(s => s.date), ['2026-12-03','2026-12-06']);
});

test('moveDateInPlan: belegtes Ziel → nichts verändert', () => {
  const tourDates = TD(); const assignments = { '2026-12-04': { gl:'Wolf' }, '2026-12-06': { gl:'Ida' } };
  const r = moveDateInPlan({ tourDates, assignments }, '2026-12-04', '2026-12-06');
  eq(r.ok, false); eq(r.reason, 'belegt');
  deepEq(tourDates.map(x => x.date), ['2026-12-02','2026-12-04','2026-12-06']);
  eq(assignments['2026-12-06'].gl, 'Ida', 'Ziel nicht überschrieben');
});

// ── Aufrufort: changeTourDate (Server + lokal + Crew-Update) ──────────────────
function res(body, status = 200){ return { status, ok: status < 400, json: async () => body }; }
const PID = 'dm-plan';
function setup(g){
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  localStorage.setItem('pb_token', 't');
  localStorage.setItem('tourplan_pb_default', PID);
  localStorage.setItem('tourplan_active_pb_id', PID);
  localStorage.removeItem('crewplan_updates_' + PID);
  const { TOUR_DATES, POSITIONS, crewMeta, setAssignment, setStatus } = g.state;
  POSITIONS.push({ id:'gl', label:'Gewerkeleitung', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  TOUR_DATES.push({ date:'2026-12-02', loc:'A' }, { date:'2026-12-04', loc:'B' });
  setAssignment('2026-12-04', 'gl', 'Wolf');
  setStatus('2026-12-04', 'gl', { status:'confirmed', crewName:'Wolf' });
}

test('changeTourDate: verschiebt PB-Records, lokalen Stand und stellt Crew-Update an', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const patches = []; let filter = '';
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET'; url = String(url);
    if (m === 'GET' && url.includes('/assignments/records')) { filter = decodeURIComponent(url.replace(/\+/g, ' ')); return res({ items:[{ id:'r1' }, { id:'r2' }], totalPages:1, page:1 }); }
    if (m === 'PATCH') { patches.push([url, JSON.parse(opts.body)]); return res({}); }
    return res({});
  };
  const r = await g.userView.changeTourDate('2026-12-04', '2026-12-03');
  ok(r.ok, 'ok');
  ok(filter.includes('date = "2026-12-04"') && filter.includes(PID), 'nur Records dieses Tags/Plans gesucht');
  eq(patches.length, 2, 'beide Records umgeschrieben');
  ok(patches.every(([, b]) => b.date === '2026-12-03' && Object.keys(b).length === 1), 'nur das Datum gepatcht (kein Status → keine Mail)');
  const s = g.state;
  deepEq(s.TOUR_DATES.map(x => x.date), ['2026-12-02','2026-12-03']);
  eq(s.assignments['2026-12-03'].gl, 'Wolf');
  eq(s.assignmentStatuses['2026-12-03'].gl.status, 'proposed', 'bestätigte Crew muss neu bestätigen');
  const q = JSON.parse(localStorage.getItem('crewplan_updates_' + PID) || '{}');
  const slot = q.Wolf?.slots?.[0];
  eq(slot?.date, '2026-12-03');
  ok(slot?.changes?.some(c => c.includes('04.12') && c.includes('03.12')), 'Änderung „Datum: 04.12. → 03.12." in der Queue: ' + JSON.stringify(slot?.changes));
});

test('changeTourDate: Zieldatum belegt → kein Serveraufruf, nichts verändert', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  let calls = 0; globalThis.fetch = async () => { calls++; return res({ items:[] }); };
  const r = await g.userView.changeTourDate('2026-12-04', '2026-12-02');
  eq(r.ok, false); eq(r.reason, 'belegt'); eq(calls, 0, 'kein Netzwerk');
  eq(g.state.assignments['2026-12-04'].gl, 'Wolf');
});

test('changeTourDate: Serverfehler → bereits verschobene Records zurück, lokal unverändert', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const back = [];
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET'; url = String(url);
    if (m === 'GET') return res({ items:[{ id:'r1' }, { id:'r2' }], totalPages:1, page:1 });
    if (m === 'PATCH') {
      const b = JSON.parse(opts.body);
      if (b.date === '2026-12-04') { back.push(url); return res({}); }
      if (url.endsWith('/r2')) return res({ message:'boom' }, 500);
      return res({});
    }
    return res({});
  };
  let threw = false;
  try { await g.userView.changeTourDate('2026-12-04', '2026-12-03'); } catch(_) { threw = true; }
  ok(threw, 'Fehler wird gemeldet');
  ok(back.some(u => u.endsWith('/r1')), 'r1 zurückverschoben');
  eq(g.state.assignments['2026-12-04'].gl, 'Wolf', 'lokal unverändert');
  deepEq(g.state.TOUR_DATES.map(x => x.date), ['2026-12-02','2026-12-04']);
});
