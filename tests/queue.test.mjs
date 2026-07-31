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

test('Live-Erkennung: eingeplanter, unbestätigter Tag erscheint OHNE vorheriges Queueing', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { TOUR_DATES, POSITIONS, crewMeta, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'GL', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  TOUR_DATES.push({ date:'2026-07-01', loc:'X' });
  setAssignment('2026-07-01', 'gl', 'Wolf');   // eingeplant, aber kein PB-Record (unbestätigt)

  // KEIN _queueGlobalCrewUpdate — das Modal-Öffnen muss den Live-Slot selbst erkennen.
  g.userView._openUpdateQueueModal();

  const q = readQueue();
  ok(q['Wolf'], 'Wolf live erkannt');
  eq(q['Wolf'].slots[0].date, '2026-07-01', 'der eingeplante Tag');
  ok(q['Wolf'].informational === true, 'als informational gemergt');
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

// ── Statuswechsel-Slots (v0.50.0: bestätigt ⇄ vorgemerkt) ─────────────────────
test('_queueStatusSlot: legt kind=status mit Richtung an und überlebt den Self-Heal', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { POSITIONS, TOUR_DATES, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'GL' });
  TOUR_DATES.push({ date:'2026-08-01', type:'show', typeLabel:'Show' });
  setAssignment('2026-08-01', 'gl', 'Wolf');   // Person steht weiter in der Zelle
  g.state.setAuthState('u1','a@test.de','superadmin');

  g.userView._queueStatusSlot('Wolf','w@x.de','2026-08-01','gl','GL','pencilled');
  g.userView._updateCrewUpdateBar();

  const q = readQueue();
  ok(q['Wolf'], 'Eintrag existiert nach Self-Heal noch');
  eq(q['Wolf'].slots[0].kind, 'status', 'kind=status gespeichert');
  eq(q['Wolf'].slots[0].to, 'pencilled', 'Richtung gespeichert');
});

test('Self-Heal entfernt einen status-Slot, wenn die Person nicht mehr in der Zelle steht', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { POSITIONS, TOUR_DATES, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'GL' });
  TOUR_DATES.push({ date:'2026-08-01', type:'show', typeLabel:'Show' });
  setAssignment('2026-08-01', 'gl', 'Wolf');
  g.state.setAuthState('u1','a@test.de','superadmin');

  g.userView._queueStatusSlot('Wolf','w@x.de','2026-08-01','gl','GL','pencilled');
  setAssignment('2026-08-01', 'gl', '');       // Manager nimmt Wolf ganz raus
  g.userView._updateCrewUpdateBar();

  ok(!readQueue()['Wolf'], 'status-Slot geheilt — der Entfernen-Pfad queued stattdessen removed');
});

// Der teuerste denkbare Fehler: der Versand patcht die eben gesetzte Vormerkung wieder
// auf 'proposed' zurück (und löst dabei eine Anfrage-Mail aus). status-Slots müssen —
// wie removed-Slots — vom „auf proposed setzen"-Zweig ausgenommen bleiben.
test('_sendPendingUpdates: status-Slots werden NICHT auf proposed gepatcht', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { POSITIONS, TOUR_DATES, setAssignment } = g.state;
  POSITIONS.push({ id:'gl', label:'GL' });
  TOUR_DATES.push({ date:'2026-08-01', type:'show', typeLabel:'Show' });
  setAssignment('2026-08-01', 'gl', 'Wolf');
  g.state.setStatus('2026-08-01', 'gl', { status:'pencilled', crewName:'Wolf' });
  g.state.setAuthState('u1','a@test.de','superadmin');
  localStorage.setItem('pb_token', 't');

  g.userView._queueStatusSlot('Wolf','w@x.de','2026-08-01','gl','GL','pencilled');

  const patched = [];           // alle PATCH-Bodies
  const invites = [];           // alle crew_invites-Mails
  globalThis.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    let body = {}; try { body = JSON.parse(opts?.body || '{}'); } catch(_) {}
    if (method === 'PATCH') patched.push(body);
    if (method === 'POST' && String(url).includes('crew_invites')) invites.push(body);
    return { status:200, ok:true, json: async () => ({ items: [], id:'rec1' }) };
  };

  await g.userView._sendPendingUpdates();

  ok(!patched.some(b => b.status === 'proposed'), 'kein PATCH auf proposed');
  eq(invites.length, 1, 'genau eine Update-Mail');
  const slots = JSON.parse(invites[0].app_url || '[]');
  eq(slots.length, 1, 'ein Slot in der Mail');
  eq(slots[0].kind, 'status', 'als Statuswechsel markiert');
  eq(slots[0].to, 'pencilled', 'Richtung geht an den Hook mit');
});

test('removed-Slots überleben den Self-Heal (getVal ist für sie leer)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  setup(g);
  const { POSITIONS, TOUR_DATES } = g.state;
  POSITIONS.push({ id:'gl', label:'GL' });
  TOUR_DATES.push({ date:'2026-08-01', type:'show', typeLabel:'Show' });
  g.state.setAuthState('u1','a@test.de','superadmin');

  g.userView._queueRemovedSlot('Pascal','pascal@test.de','2026-08-01','gl','GL','rec1');
  g.userView._updateCrewUpdateBar();   // Self-Heal läuft hier

  const q = readQueue();
  ok(q['Pascal'], 'Eintrag existiert nach Self-Heal noch');
  eq(q['Pascal'].slots[0].kind, 'removed', 'kind=removed gespeichert');
  eq(q['Pascal'].slots[0].aid, 'rec1', 'aid für GESEHEN-Button gespeichert');
});
