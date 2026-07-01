// Flow-Tests: Admin- & Crew-Logik gegen den echten Modulgraphen (headless).
// Deckt: Crew anlegen/eintragen/löschen, Slot-Diffing (anfragen/update),
// Namens-Verknüpfung, Plan-Persistenz. Backend/E-Mail = separat (Playwright).
import { test, eq, ok, deepEq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

// ── Crew in Daten eintragen ───────────────────────────────────────────────────
test('setAssignment + getVal: Crew in Slot eintragen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const { setAssignment, clearAssignmentSlot } = g.state;
  const { getVal } = g.utils;
  setAssignment('2026-07-01', 'gl', 'Wolf Geffenius');
  eq(getVal('2026-07-01','gl'), 'Wolf Geffenius', 'eingetragen');
  clearAssignmentSlot('2026-07-01', 'gl');
  eq(getVal('2026-07-01','gl'), '', 'nach Entfernen leer');
});

// ── Crew löschen (mit Cleanup der Zuweisungen) ────────────────────────────────
test('removeCrew: entfernt Person + räumt Zuweisungen auf', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const { crew, assignments, setAssignment } = g.state;
  crew.push('Wolf Geffenius', 'Oliver Thomas');
  setAssignment('2026-07-01','gl','Wolf Geffenius');
  setAssignment('2026-07-01','st','Oliver Thomas');
  g.crew.removeCrew(0); // Wolf (Index 0)
  ok(!crew.includes('Wolf Geffenius'), 'Wolf entfernt');
  ok(crew.includes('Oliver Thomas'), 'Oliver bleibt');
  eq(assignments['2026-07-01']?.gl, undefined, 'Wolfs Zuweisung entfernt');
  eq(assignments['2026-07-01']?.st, 'Oliver Thomas', 'Olivers Zuweisung bleibt');
});

// ── Crew anlegen + Duplikat-Schutz ────────────────────────────────────────────
test('addCrew: legt Person an, verhindert Duplikate', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const { crew } = g.state;
  const realGet = globalThis.document.getElementById;
  // nur das Namensfeld faken — andere IDs (z.B. crewList in renderCrew) normal lassen
  globalThis.document.getElementById = (id) =>
    id === 'newCrewName' ? Object.assign(realGet(id), { value:'Neue Person' }) : realGet(id);
  try {
    g.crew.addCrew();
    eq(crew.filter(n => n==='Neue Person').length, 1, 'einmal angelegt');
    g.crew.addCrew(); // gleicher Name → kein Duplikat
    eq(crew.filter(n => n==='Neue Person').length, 1, 'kein Duplikat');
  } finally {
    globalThis.document.getElementById = realGet;
  }
});

// ── Slot-Diffing: welche Slots sind für Crew NEU (anfragen/update) ────────────
test('_getNewSlotsForCrew: neu = ohne Status ODER declined', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const { TOUR_DATES, POSITIONS, setAssignment, setStatus } = g.state;
  POSITIONS.push({ id:'gl', label:'Gewerkeleitung', short:'GL' });
  ['2026-07-01','2026-07-02','2026-07-03','2026-07-04'].forEach(d => {
    TOUR_DATES.push({ date:d, loc:'X' });
    setAssignment(d, 'gl', 'Wolf');
  });
  setStatus('2026-07-01','gl', { status:'confirmed', crewName:'Wolf' }); // nicht neu
  setStatus('2026-07-02','gl', { status:'proposed',  crewName:'Wolf' }); // nicht neu
  setStatus('2026-07-03','gl', { status:'declined',  crewName:'Wolf' }); // NEU (re-propose)
  // 2026-07-04 ohne Status → NEU
  const neu = g.crewNotify._getNewSlotsForCrew('Wolf', 'w@x.de').map(s => s.date).sort();
  deepEq(neu, ['2026-07-03','2026-07-04'], 'nur declined + ohne Status');
});

// ── Crew-Bestätigung: offene Slots = was ich SEHE (getVal), nicht nur proposed-Records ─
test('getMyPendingSlots: getVal-geplant, nicht-confirmed (inkl. defaultCrew ohne Record)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const { TOUR_DATES, POSITIONS, crewMeta, defaultCrew, setStatus, setAuthState } = g.state;
  POSITIONS.push({ id:'gl', label:'GL', short:'GL' });
  crewMeta['Wolf'] = { email:'w@x.de' };
  setAuthState('uid-w', 'w@x.de', 'crew');
  ['2026-07-01','2026-07-02','2026-07-03'].forEach(d => TOUR_DATES.push({ date:d, loc:'X' }));
  defaultCrew['gl'] = 'Wolf';                                  // an ALLEN Tagen eingeplant (kein Record)
  setStatus('2026-07-02','gl', { status:'confirmed', crewName:'Wolf' }); // dieser fällt raus

  const dates = g.userView.getMyPendingSlots().map(s => s.date).sort();
  deepEq(dates, ['2026-07-01','2026-07-03'], 'nur offene, defaultCrew-Slots ohne Record inklusive; confirmed raus');
});

// ── Crew-Verknüpfung: getMyCrewName (case-insensitiv + per userId) ───────────
test('getMyCrewName: matcht per E-Mail (case-insensitiv) und userId', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const { crewMeta, setAuthState } = g.state;
  crewMeta['Wolf Geffenius'] = { email:'wolf@x.de' };
  crewMeta['Oliver Thomas']  = { userId:'uid-oliver' };
  setAuthState('uid-x', 'WOLF@X.DE', 'crew');           // andere Schreibweise
  eq(g.userView.getMyCrewName(), 'Wolf Geffenius', 'per E-Mail, case-insensitiv');
  setAuthState('uid-oliver', 'kein@treffer.de', 'crew'); // match per userId
  eq(g.userView.getMyCrewName(), 'Oliver Thomas', 'per userId');
});

// ── Plan-Persistenz: speichern → State zerstören → laden ─────────────────────
test('_savePlanToLS/_loadPlanFromLS: Roundtrip stellt State wieder her', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  const s = g.state;
  s.crew.push('Wolf', 'Oliver');
  s.POSITIONS.push({ id:'gl', label:'GL', short:'GL' });
  s.TOUR_DATES.push({ date:'2026-07-01', loc:'Berlin', type:'show', typeLabel:'Show' });
  s.defaultCrew['gl'] = 'Wolf';
  s.setAssignment('2026-07-01','gl','Oliver');

  const warn = console.warn; console.warn = () => {}; // PB-Sync-Warnung unterdrücken
  try { g.plans._savePlanToLS('test-plan-1'); } finally { console.warn = warn; }

  // State zerstören
  s.crew.length = 0; s.TOUR_DATES.length = 0;
  Object.keys(s.assignments).forEach(k => delete s.assignments[k]);
  Object.keys(s.defaultCrew).forEach(k => delete s.defaultCrew[k]);

  const okLoad = g.plans._loadPlanFromLS('test-plan-1');
  ok(okLoad, 'Laden erfolgreich');
  deepEq(s.crew, ['Wolf','Oliver'], 'crew wiederhergestellt');
  eq(s.TOUR_DATES.length, 1, 'TOUR_DATES wiederhergestellt');
  eq(s.TOUR_DATES[0].loc, 'Berlin', 'Datum-Detail erhalten');
  eq(s.defaultCrew['gl'], 'Wolf', 'defaultCrew wiederhergestellt');
  eq(s.assignments['2026-07-01']?.gl, 'Oliver', 'Zuweisung wiederhergestellt');
});
