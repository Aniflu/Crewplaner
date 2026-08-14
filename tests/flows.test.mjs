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

// ── Crew in eine Tour bekommen (v0.8.3: nur noch über den Pool) ───────────────
// Es gibt kein Freitextfeld mehr. Eine Person entsteht einmal global (createPoolMember) und
// wird von dort übernommen — beides schreibt einen crew_members-Datensatz. Ohne den bekommt
// sie keine Anfrage (der Hook steigt bei leerer crew_email still aus) und sieht die Tour
// nicht (/myplan und /myplans prüfen genau darauf).

// Der Pool-Dialog liest die Auswahl über querySelectorAll('#crewImportBody input[…][data-i]').
// Der Stub aus _setup.mjs liefert dort [] — also hier eine Auswahl vortäuschen.
function fakeAuswahl(indizes){
  const realQSA = globalThis.document.querySelectorAll;
  globalThis.document.querySelectorAll = () =>
    indizes.map(i => ({ checked: true, dataset: { i: String(i) } }));
  return () => { globalThis.document.querySelectorAll = realQSA; };
}

function fakeNeuePerson(name, email, role='crew'){
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    if (id === 'npName')  return Object.assign(realGet(id) || {}, { value: name });
    if (id === 'npEmail') return Object.assign(realGet(id) || {}, { value: email });
    if (id === 'npRole')  return Object.assign(realGet(id) || {}, { value: role });
    return realGet(id);
  };
  return () => { globalThis.document.getElementById = realGet; };
}

function alsManager(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
}

// ⚠️ Der Pool darf NUR beim Laden der Kandidatenliste geliefert werden. saveCrewLink läuft über
// pbUpsert, das zuerst SUCHT — bekäme es dieselbe Liste zurück, fände es immer einen Treffer
// und würde patchen statt anzulegen. Der Test liefe grün, ohne je einen Datensatz anzulegen.
// `POOL_GELADEN` schaltet nach dem ersten Listen-Abruf auf „nichts gefunden" um.
function mockPB(pool, onPost){
  let poolGeladen = false;
  globalThis.fetch = async (url, opts) => {
    if ((opts && opts.method) === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      return onPost ? onPost(body) : { status:200, ok:true, json: async () => ({ id:'rec1' }) };
    }
    const items = poolGeladen ? [] : (poolGeladen = true, pool);
    return { status:200, ok:true, json: async () => ({ items, page:1, perPage:200, totalPages:1 }) };
  };
}

const POOL = [
  { name:'Wolf Geffenius', email:'wolf@example.com' },
  { name:'Kerrin Gall',    email:'kerrin@example.com' },
];

test('confirmImportCrew: übernimmt Ausgewählte mit Adresse in die Tour', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); alsManager(g);
  const { crew, crewMeta } = g.state;
  const posts = [];
  // Kandidatenliste über den echten Weg füllen: loadAllKnownCrew liefert den gemockten Pool.
  mockPB(POOL, body => { posts.push(body); return { status:200, ok:true, json: async () => ({ id:'rec1' }) }; });
  await g.crew.openImportCrewModal();
  const restore = fakeAuswahl([0, 1]);
  try {
    await g.crew.confirmImportCrew();
    eq(crew.length, 2, 'beide übernommen');
    eq(crewMeta['Wolf Geffenius']?.email, 'wolf@example.com', 'Adresse mitgenommen');
    ok(posts.length >= 2, 'für jede Person ein crew_members-Datensatz geschrieben');
  } finally { restore(); }
});

test('confirmImportCrew: Fehlschlag nimmt NUR diesen Namen zurück', async () => {
  // Der teuerste Fall: Ohne Rückbau bliebe genau der Zustand zurück, den v0.8.3 beseitigt —
  // Name in der Tabelle, kein Datensatz dahinter, und niemand merkt es. Die anderen dürfen
  // deswegen aber nicht mit verlorengehen.
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); alsManager(g);
  const { crew } = g.state;
  mockPB(POOL, body => body.name === 'Kerrin Gall'
    ? { status:500, ok:false, json: async () => ({ message:'boom' }) }
    : { status:200, ok:true,  json: async () => ({ id:'rec1' }) });
  await g.crew.openImportCrewModal();
  const restore = fakeAuswahl([0, 1]);
  try {
    await g.crew.confirmImportCrew();
    ok(crew.includes('Wolf Geffenius'), 'die erfolgreiche Person bleibt');
    ok(!crew.includes('Kerrin Gall'), 'die fehlgeschlagene ist wieder draußen');
  } finally { restore(); }
});

test('createAndTakeCrew: legt im Pool an UND übernimmt in die Tour', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); alsManager(g);
  const { crew } = g.state;
  const posts = [];
  globalThis.fetch = async (url, opts) => {
    if ((opts && opts.method) === 'POST') { posts.push(JSON.parse(opts.body || '{}')); return { status:200, ok:true, json: async () => ({ id:'rec1' }) }; }
    return { status:200, ok:true, json: async () => ({ items: [], page:1, perPage:200, totalPages:1 }) };
  };
  const restore = fakeNeuePerson('Neue Person', 'Neue.Person@Example.com');
  try {
    await g.crew.createAndTakeCrew();
    eq(crew.filter(n => n==='Neue Person').length, 1, 'in der Tour');
    const pool = posts.find(p => p.plan_id === '__pool__');
    ok(pool, 'Pool-Datensatz geschrieben — sonst wäre die Person nur in dieser Tour bekannt');
    eq(pool.email, 'neue.person@example.com',
       'Adresse kleingeschrieben: PocketBases `=` ist case-sensitiv (v0.15.0)');
    ok(posts.some(p => p.plan_id !== '__pool__'), 'zusätzlich der plan-bezogene Datensatz');
  } finally { restore(); }
});

test('createAndTakeCrew: ohne Adresse entsteht NIEMAND', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); alsManager(g);
  const { crew } = g.state;
  let posted = false;
  globalThis.fetch = async (url, opts) => {
    if ((opts && opts.method) === 'POST') posted = true;
    return { status:200, ok:true, json: async () => ({ items: [], page:1, perPage:200, totalPages:1 }) };
  };
  const restore = fakeNeuePerson('Ohne Adresse', '');
  try {
    await g.crew.createAndTakeCrew();
    eq(crew.filter(n => n==='Ohne Adresse').length, 0, 'nicht in der Tour');
    eq(posted, false, 'und auch kein Datensatz angelegt');
  } finally { restore(); }
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
