// Guard: _queueGlobalCrewUpdate(desc, dates) darf NUR Slots der übergebenen Datumswerte
// in die Update-Queue legen — nicht den ganzen Plan fluten (Bug v0.17.1).
import { test, eq, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const PID = 'qtest-plan';           // _queuePlanKey bevorzugt tourplan_active_pb_id
const QKEY = 'crewplan_updates_' + PID;
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY) || '{}'); }
  catch { return {}; }
}

test('_queueGlobalCrewUpdate: queued nur die übergebenen Datumswerte', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  localStorage.removeItem(QKEY);
  localStorage.setItem('tourplan_active_pb_id', PID);
  const { TOUR_DATES, POSITIONS, crewMeta, setStatus } = g.state;
  POSITIONS.push({ id:'gl', label:'Gewerkeleitung', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  // Drei bestätigte Slots an drei Tagen — alle im Plan (TOUR_DATES), damit der Bar-Prune
  // sie nicht ohnehin entfernt.
  ['2026-07-01','2026-07-02','2026-07-03'].forEach(d => {
    TOUR_DATES.push({ date:d, loc:'X' });
    setStatus(d, 'gl', { status:'confirmed', crewName:'Wolf' });
  });

  g.userView._queueGlobalCrewUpdate('Neue Tage hinzugefügt', ['2026-07-02']);

  const q = readQueue();
  const dates = (q['Wolf']?.slots || []).map(s => s.date).sort();
  eq(dates.length, 1, 'genau ein Slot in der Queue');
  eq(dates[0], '2026-07-02', 'nur der übergebene Tag');
  ok(!dates.includes('2026-07-01') && !dates.includes('2026-07-03'), 'kein Altbestand geflutet');
});

test('_queueGlobalCrewUpdate: leere Datumsliste queued nichts', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  localStorage.removeItem(QKEY);
  localStorage.setItem('tourplan_active_pb_id', PID);
  const { TOUR_DATES, POSITIONS, crewMeta, setStatus } = g.state;
  POSITIONS.push({ id:'gl', label:'GL', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  TOUR_DATES.push({ date:'2026-07-01', loc:'X' });
  setStatus('2026-07-01', 'gl', { status:'confirmed', crewName:'Wolf' });

  g.userView._queueGlobalCrewUpdate('Neue Tage hinzugefügt', []);

  const q = readQueue();
  eq(Object.keys(q).length, 0, 'Queue bleibt leer bei leerer Datumsliste');
});
