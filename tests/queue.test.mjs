// Guard: _queueGlobalCrewUpdate(desc, dates) befüllt die Update-Queue für NEUE Tage aus
// getVal (defaultCrew/Overrides) — nicht aus assignmentStatuses (dort hat ein frischer
// Tag keine Records). Sonst bliebe die Queue leer und die „Updates"-Bar erschiene nie
// (Regression v0.17.1 → Fix v0.17.2). Plus: Self-Heal in _updateCrewUpdateBar.
import { test, eq, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const PID = 'qtest-plan';           // _queuePlanKey bevorzugt tourplan_active_pb_id
const QKEY = 'crewplan_updates_' + PID;
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY) || '{}'); }
  catch { return {}; }
}
function setup(g) {
  resetState(g);
  localStorage.removeItem(QKEY);
  localStorage.setItem('tourplan_active_pb_id', PID);
}

test('_queueGlobalCrewUpdate: befüllt aus getVal nur die übergebenen Tage', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { TOUR_DATES, POSITIONS, crewMeta, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'Gewerkeleitung', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  // Zwei Tage, beide mit Wolf belegt — aber nur EINER wird übergeben.
  ['2026-07-01','2026-07-02'].forEach(d => {
    TOUR_DATES.push({ date:d, loc:'X' });
    setAssignment(d, 'gl', 'Wolf');
  });

  g.userView._queueGlobalCrewUpdate('Neue Tage hinzugefügt', ['2026-07-02']);

  const q = readQueue();
  const dates = (q['Wolf']?.slots || []).map(s => s.date).sort();
  eq(dates.length, 1, 'genau ein Slot in der Queue');
  eq(dates[0], '2026-07-02', 'nur der übergebene Tag');
  ok(q['Wolf'].informational === true, 'als informational markiert');
  ok((q['Wolf'].slots[0].posId) === 'gl', 'posId für Self-Heal gespeichert');
});

test('_queueGlobalCrewUpdate: leere Datumsliste queued nichts', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { TOUR_DATES, POSITIONS, crewMeta, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'GL', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  TOUR_DATES.push({ date:'2026-07-01', loc:'X' });
  setAssignment('2026-07-01', 'gl', 'Wolf');

  g.userView._queueGlobalCrewUpdate('Neue Tage hinzugefügt', []);

  eq(Object.keys(readQueue()).length, 0, 'Queue bleibt leer bei leerer Datumsliste');
});

test('_updateCrewUpdateBar: Self-Heal — entfernter Name fällt aus der Queue', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { TOUR_DATES, POSITIONS, crewMeta, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'GL', short:'GL' }, { id:'st', label:'Stage', short:'ST' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  crewMeta['Oliver'] = { email:'o@x.de' };
  TOUR_DATES.push({ date:'2026-07-01', loc:'X' });
  setAssignment('2026-07-01', 'gl', 'Wolf');
  setAssignment('2026-07-01', 'st', 'Oliver');

  g.userView._queueGlobalCrewUpdate('Neue Tage hinzugefügt', ['2026-07-01']);
  eq(Object.keys(readQueue()).length, 2, 'erst 2 Personen gequeued');

  // Oliver wieder aus dem Tag herausnehmen → Self-Heal beim nächsten Bar-Refresh.
  setAssignment('2026-07-01', 'st', '');
  g.userView._updateCrewUpdateBar();

  const q = readQueue();
  ok(q['Wolf'], 'Wolf bleibt (noch eingeplant)');
  ok(!q['Oliver'], 'Oliver fällt raus (nicht mehr eingeplant)');
});
