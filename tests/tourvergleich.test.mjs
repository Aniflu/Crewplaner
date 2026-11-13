// Tourvergleich (v1.2.0): reine Vergleichslogik zweier Touren — Raster, Konflikte, Umsetzen.
import './_setup.mjs';
import { test, eq, deepEq, ok } from './_assert.mjs';
import { OFFEN } from '../js/state.js';
import { loadGraph, resetState } from './_graph.mjs';
import { queueAddRemoved } from '../js/pure.js';
import {
  isPerson, effective, overlapDays, slotsOf, personMatrix, dayDemand,
  candidates, applySlot, planAssign
} from '../js/tourvergleich.js';

// Echte PB-Form: JSON-String geparst wie in loadSelectedPlan
const A = () => JSON.parse(JSON.stringify({ version:3, crew:['Anna Bauer','Tom Richter','Max Mustermann'],
  positions:[{id:'gl',label:'GL',short:'GL'},{id:'lt1',label:'Licht 1',short:'Licht 1'}],
  defaultCrew:{ gl:'Anna Bauer', lt1:'Tom Richter' },
  tourDates:[{date:'2026-07-08',type:'show',typeLabel:'Show',loc:'X'},{date:'2026-07-09',type:'show',typeLabel:'Show',loc:'Y'}],
  assignments:{ '2026-07-08':{ lt1:'__offen__' } } }));
const B = () => JSON.parse(JSON.stringify({ version:3, crew:['anna bauer ','Sara Klein','Tom Richter'],
  positions:[{id:'gl',label:'GL',short:'GL'},{id:'sys',label:'System',short:'Sys'}],
  defaultCrew:{ gl:'Sara Klein', sys:'Tom Richter' },
  tourDates:[{date:'2026-07-09',type:'show',typeLabel:'Show',loc:'Y'},{date:'2026-07-10',type:'show',typeLabel:'Show',loc:'Z'}],
  assignments:{ '2026-07-09':{ gl:'anna bauer ' } } }));

const DAYS = ['2026-07-08','2026-07-09','2026-07-10'];

test('isPerson: Platzhalter und leer sind keine Personen', () => {
  ok(isPerson('Anna Bauer'));
  ok(!isPerson('')); ok(!isPerson('__offen__')); ok(!isPerson('__offday__'));
  ok(!isPerson('__reise_tag__')); ok(!isPerson('__ausschreiben__'));
});
test('effective: Abweichung (auch leer) vor Stammbesetzung', () => {
  const a = A();
  eq(effective(a, '2026-07-08', 'lt1'), '__offen__');
  eq(effective(a, '2026-07-09', 'gl'), 'Anna Bauer');
  a.assignments['2026-07-09'] = { gl:'' };
  eq(effective(a, '2026-07-09', 'gl'), '');
});
test('overlapDays: nur gemeinsame Tage', () => deepEq(overlapDays(A(), B()), ['2026-07-09']));
test('personMatrix: Konflikt über Abweichung (B) + Stammbesetzung (A)', () => {
  const c = personMatrix(A(), B(), { days:DAYS, onlyShared:false }).cells['Anna Bauer']['2026-07-09'];
  eq(c.state, 'conflict'); deepEq(c.aPos, ['gl']); deepEq(c.bPos, ['gl']);
});
test('personMatrix: Konflikt über zwei Stammbesetzungen', () => {
  const c = personMatrix(A(), B(), { days:DAYS, onlyShared:false }).cells['Tom Richter']['2026-07-09'];
  eq(c.state, 'conflict'); deepEq(c.aPos, ['lt1']); deepEq(c.bPos, ['sys']);
});
test('personMatrix: Platzhalter ist keine Person', () => {
  const c = personMatrix(A(), B(), { days:['2026-07-08'], onlyShared:false }).cells['Tom Richter']['2026-07-08'];
  ok(c.state === 'freeA' || c.state === 'freeBoth'); ok(c.state !== 'A');
});
test('personMatrix: Name normalisiert, gemeinsam zuerst', () => {
  const m = personMatrix(A(), B(), { days:DAYS, onlyShared:false });
  deepEq(m.people.slice(0, 2).map(p => p.name), ['Anna Bauer', 'Tom Richter']);
  ok(m.people[0].inA && m.people[0].inB && m.people[1].inA && m.people[1].inB);
  ok(!m.people.some(p => p.name === 'anna bauer '));
  ok(!('anna bauer ' in m.cells));
  // Einzelne danach, in Crew-Reihenfolge
  deepEq(m.people.slice(2).map(p => p.name), ['Max Mustermann', 'Sara Klein']);
});
test('personMatrix: onlyShared filtert', () => {
  const names = personMatrix(A(), B(), { days:DAYS, onlyShared:true }).people.map(p => p.name);
  ok(!names.includes('Max Mustermann')); ok(!names.includes('Sara Klein')); eq(names.length, 2);
});
test('personMatrix: Zustände A / B / freeB / none', () => {
  const m = personMatrix(A(), B(), { days:DAYS, onlyShared:false });
  eq(m.cells['Max Mustermann']['2026-07-09'].state, 'freeBoth');
  eq(m.cells['Max Mustermann']['2026-07-10'].state, 'freeB');
  eq(m.cells['Max Mustermann']['2026-07-08'].state, 'freeA');
  eq(m.cells['Sara Klein']['2026-07-10'].state, 'B');
  deepEq(m.cells['Sara Klein']['2026-07-10'].bPos, ['gl']);
  const a = A(); a.tourDates = [];
  eq(personMatrix(a, B(), { days:['2026-07-08'], onlyShared:false }).cells['Tom Richter']['2026-07-08'].state, 'none');
});
test('personMatrix: Person doppelt in A am selben Tag → beide Positionen', () => {
  const a = A(); a.assignments['2026-07-09'] = { lt1:'Anna Bauer' };
  const c = personMatrix(a, B(), { days:['2026-07-09'], onlyShared:false }).cells['Anna Bauer']['2026-07-09'];
  deepEq(c.aPos, ['gl', 'lt1']);
});
test('slotsOf: nach normalisiertem Namen', () => deepEq(slotsOf(B(), '2026-07-09', 'ANNA bauer'), ['gl']));
test('dayDemand: OFFEN zählt offen, Tag fehlt → 0/0', () => {
  deepEq(dayDemand(A(), '2026-07-08'), { total:2, open:1 });
  deepEq(dayDemand(A(), '2026-07-10'), { total:0, open:0 });
});
test('dayDemand: OFFDAY/REISE_TAG zählen nicht als offen, leer und AUSSCHREIBEN schon', () => {
  const a = A(); a.assignments['2026-07-09'] = { gl:'__offday__', lt1:'__ausschreiben__' };
  deepEq(dayDemand(a, '2026-07-09'), { total:2, open:1 });
  a.assignments['2026-07-09'] = { gl:'', lt1:'__reise_tag__' };
  deepEq(dayDemand(a, '2026-07-09'), { total:2, open:1 });
});
test('candidates: frei vor anderer Tour vor gleicher Tour', () => {
  const a = applySlot(A(), '2026-07-09', 'gl', '');
  const c = candidates(a, B(), '2026-07-09', 'gl');
  deepEq(c.map(x => x.kind), ['free', 'other', 'same']);
  deepEq(c.map(x => x.name), ['Max Mustermann', 'Anna Bauer', 'Tom Richter']);
  deepEq(c[1].otherPos, ['gl']);
});
test('candidates: aktuelle Besetzung des Slots fehlt', () => {
  ok(!candidates(A(), B(), '2026-07-09', 'gl').some(x => x.name === 'Anna Bauer'));
});
test('applySlot: Rückkehr zur Stammbesetzung löscht Abweichung', () => {
  const a = A(), snap = JSON.stringify(a);
  const r = applySlot(a, '2026-07-08', 'lt1', 'Tom Richter');
  eq(r.assignments['2026-07-08'], undefined);
  eq(JSON.stringify(a), snap);
});
test('applySlot: setzt Abweichung, behält andere Einträge', () => {
  const a = A(); a.assignments['2026-07-08'].gl = 'Max Mustermann';
  const r = applySlot(a, '2026-07-08', 'lt1', 'Max Mustermann');
  eq(r.assignments['2026-07-08'].gl, 'Max Mustermann'); eq(r.assignments['2026-07-08'].lt1, 'Max Mustermann');
  const r2 = applySlot(A(), '2026-07-09', 'gl', 'Max Mustermann');
  eq(r2.assignments['2026-07-09'].gl, 'Max Mustermann');
});
test('planAssign: zieht Person aus anderer Tour ab', () => {
  const steps = planAssign({ self:A(), other:B(), selfTour:'A', date:'2026-07-09', posId:'lt1', name:'Tom Richter' });
  deepEq(steps, [{ tour:'A', posId:'lt1', value:'Tom Richter' }, { tour:'B', posId:'sys', value:OFFEN }]);
});
test('planAssign: null = Stammbesetzung, OFFEN erlaubt', () => {
  deepEq(planAssign({ self:A(), other:B(), selfTour:'A', date:'2026-07-09', posId:'gl', name:null }),
    [{ tour:'A', posId:'gl', value:'Anna Bauer' }]);
  deepEq(planAssign({ self:A(), other:B(), selfTour:'B', date:'2026-07-09', posId:'gl', name:OFFEN }),
    [{ tour:'B', posId:'gl', value:OFFEN }]);
});
test('robust: leere Pläne', () => {
  const empty = { crew:[], positions:[], tourDates:[] };
  const m = personMatrix(empty, B(), { days:DAYS, onlyShared:false });
  ok(m.people.length > 0);
  deepEq(dayDemand({}, '2026-07-09'), { total:0, open:0 });
  deepEq(overlapDays({}, B()), []);
  eq(effective({}, '2026-07-09', 'gl'), '');
  deepEq(candidates({}, B(), '2026-07-09', 'gl'), []);
  deepEq(applySlot({}, '2026-07-09', 'gl', 'X').assignments, { '2026-07-09':{ gl:'X' } });
});

// ── Task 2: Herausnehmen plan-bezogen (explizites planId) ───────────────────────
function res(body, status = 200){ return { status, ok: status < 400, json: async () => body }; }
function mockFetch(handler){ globalThis.fetch = async (url, opts) => handler(String(url), (opts && opts.method) || 'GET', opts); }
function primeMgr(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
}

test('removeAssignmentSlot mit planId: patcht Record des angegebenen Plans auf cancelled', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeMgr(g);
  g.state.setStatus('2026-07-09', 'gl', { status:'confirmed', crewName:'Wolf' });   // Global (anderer Plan) bleibt
  const statuses = { '2026-07-09': { gl:{ status:'confirmed', crewName:'Anna Bauer' } } };
  let filter = '', patchBody = null;
  mockFetch((url, method, opts) => {
    if (method === 'GET' && url.includes('/assignments/records')) { filter = decodeURIComponent(url); return res({ items:[{ id:'recB', crew_name:'Anna Bauer' }] }); }
    if (method === 'PATCH') { patchBody = JSON.parse(opts.body); return res({ id:'recB' }); }
    return res({});
  });
  const r = await g.dataService.removeAssignmentSlot('2026-07-09', 'gl', { planId:'PB_B', statuses });
  ok(filter.includes('PB_B'), 'Filter enthält PB_B');
  ok(!filter.includes('PLAN1'), 'nicht der aktive Plan');
  eq(patchBody.status, 'cancelled');
  eq(r.wasActive, true); eq(r.rec.id, 'recB'); eq(r.crewName, 'Anna Bauer');
  eq(statuses['2026-07-09'].gl, undefined, 'opts.statuses bereinigt');
  eq(g.state.assignmentStatuses['2026-07-09'].gl.crewName, 'Wolf', 'globale Status unberührt');
});

test('removeAssignmentSlot mit planId: vorgemerkt → DELETE, wasActive false', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeMgr(g);
  g.state.setStatus('2026-07-09', 'gl', { status:'confirmed', crewName:'Wolf' });
  const statuses = { '2026-07-09': { gl:{ status:'pencilled', crewName:'Anna Bauer' } } };
  let deleted = false, patched = false, filter = '';
  mockFetch((url, method) => {
    if (method === 'GET' && url.includes('/assignments/records')) { filter = decodeURIComponent(url); return res({ items:[{ id:'recB' }] }); }
    if (method === 'DELETE') { deleted = true; return res({}, 204); }
    if (method === 'PATCH') { patched = true; return res({}); }
    return res({});
  });
  const r = await g.dataService.removeAssignmentSlot('2026-07-09', 'gl', { planId:'PB_B', statuses });
  ok(filter.includes('PB_B'));
  ok(deleted && !patched, 'hart gelöscht');
  eq(r.wasActive, false);
  eq(statuses['2026-07-09'].gl, undefined);
  eq(g.state.assignmentStatuses['2026-07-09'].gl.crewName, 'Wolf', 'globale Status unberührt');
});

test('queueAddRemoved: Form und Dedupe', () => {
  const q = {};
  queueAddRemoved(q, 'Anna', 'a@x.de', '2026-07-09', 'gl', 'GL', 'rec1');
  const r = queueAddRemoved(q, 'Anna', 'a@x.de', '2026-07-09', 'gl', 'GL', 'rec1');
  eq(r, q, 'liefert q');
  deepEq(q, { Anna:{ email:'a@x.de', slots:[{ kind:'removed', date:'2026-07-09', posId:'gl', posLabel:'GL', aid:'rec1', changes:['Termin entfernt'] }] } });
  const q2 = {};
  queueAddRemoved(q2, 'Anna', '', '2026-07-09', 'gl', 'GL', 'rec1');
  deepEq(q2, {});
});

test('removeAssignmentSlot mit leerem planId: wirft, kein PATCH/DELETE (kein Fallback auf aktiven Plan)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeMgr(g);
  const statuses = { '2026-07-09': { gl:{ status:'confirmed', crewName:'Anna Bauer' } } };
  let writes = 0;
  mockFetch((url, method) => { if (method !== 'GET') writes++; return res({ items:[{ id:'recX' }] }); });
  let threw = false;
  try { await g.dataService.removeAssignmentSlot('2026-07-09', 'gl', { planId:'', statuses }); } catch(_) { threw = true; }
  ok(threw, 'wirft');
  eq(writes, 0, 'keine Schreibzugriffe');
  ok(statuses['2026-07-09'].gl, 'Status unverändert');
});

// ── Struktursperren Admin-Tab (Task 3) ─────────────────────────────────────────
import { readFileSync as _rf } from 'node:fs';
const _ui = () => _rf(new URL('../js/tourvergleich-ui.js', import.meta.url), 'utf8');
const _admin = () => _rf(new URL('../admin.html', import.meta.url), 'utf8');

test('UI ruft removeAssignmentSlot mit planId', () => {
  ok(/removeAssignmentSlot\([^)]*\{\s*planId/.test(_ui()), 'Aufruf mit { planId');
});
test('UI kopiert keine Herausnahme', () => {
  const s = _ui();
  ok(!/status:\s*'cancelled'/.test(s), 'kein eigenes cancelled');
  ok(!/\/api\/collections\/assignments\/records\/[^;]*(pbPatch|pbDelete)|(pbPatch|pbDelete)\([^)]*collections\/assignments/.test(s), 'kein PATCH/DELETE auf assignments');
});
test('UI verschickt keine Mails', () => {
  ok(!/notify\(|send[A-Z]\w*Notice|sendCrewInvite/.test(_ui()));
});
// Rumpf von tvSave (bis zur nächsten Top-Level-Funktion)
const _save = () => { const s = _ui(); const i = s.indexOf('export async function tvSave'); const j = s.indexOf('\nfunction queueRemoved'); return { s, i, j, body: s.slice(i, j) }; };
test('UI liest Plan vor dem Patch frisch (tvSave)', () => {
  const { i, body } = _save();
  ok(i >= 0, 'tvSave vorhanden');
  const g = body.indexOf('pbGet('), p = body.indexOf('pbPatch(');
  ok(g >= 0 && p >= 0 && g < p, 'pbGet vor pbPatch');
});
test('UI schreibt nur in tvSave: pbPatch und removeAssignmentSlot nirgends sonst, genau ein Patch-Aufruf', () => {
  const { s, i, j } = _save();
  const outside = s.slice(0, i) + s.slice(j);
  ok(!/pbPatch\(|removeAssignmentSlot\(/.test(outside), 'kein Schreibaufruf außerhalb von tvSave');
  eq((s.match(/pbPatch\(/g) || []).length, 1, 'genau ein pbPatch-Aufruf');
  ok(/removeAssignmentSlot\([^)]*\{\s*planId/.test(_save().body), 'Absage mit { planId in tvSave');
  ok(!/pbPost\(|pbDelete\(/.test(s), 'kein POST/DELETE');
});
test('UI: in tvSave kommt der Plan-Patch vor der Absage; Fehlerpfad lädt nur geschriebene Touren', () => {
  const { body } = _save();
  ok(body.indexOf('pbPatch(') < body.indexOf('removeAssignmentSlot('), 'pbPatch vor removeAssignmentSlot');
  ok(/reloadBundles\(written\)/.test(body) && !/reloadBundles\(\)/.test(body), 'nur geschriebene Touren');
  ok(/konnte nicht vermerkt werden/.test(body));
});
test('UI: Entwurf – Schutzprüfung staleSlots vor dem Patch, Meldung bei Fremdänderung', () => {
  const { body } = _save();
  ok(/staleSlots\(/.test(body) && body.indexOf('staleSlots(') < body.indexOf('pbPatch('));
  ok(/wurde zwischendurch geändert/.test(body) && /bitte neu vergleichen/.test(body));
});
test('UI: Rückfragen bei ungespeicherten Änderungen (Compare, Select, Tab, beforeunload)', () => {
  const s = _ui();
  ok(/export async function tvCompare[\s\S]*?confirmDiscard\(\)/.test(s), 'tvCompare');
  ok(/export function tvSelChange/.test(s) && /tvLeaveCheck/.test(s) && /beforeunload/.test(s));
  ok(/Ungespeicherte Änderungen verwerfen\?/.test(s));
  const h = _admin();
  ok(/tvSelChange\(\)/.test(h) && /function switchTab\(name\) \{\s*if \(window\.tvLeaveCheck/.test(h), 'admin.html Hooks');
});
test('UI verweigert gleiche Tour', () => {
  ok(/Bitte zwei verschiedene Touren/.test(_ui()));
});
test('admin.html hat Tab und Abschnitt', () => {
  const h = _admin();
  ok(h.includes('data-tab="tourvergleich"'));
  ok(h.includes('id="tabTourvergleich"'));
});

test('UI meldet Update-Liste nur, wenn die Queue-Funktion true liefert', () => {
  const s = _ui();
  ok(/if \(queueRemoved\(/.test(s), 'Hinweis hängt am Rückgabewert');
  ok(/Keine Mailadresse für/.test(s), 'Warnung ohne Mailadresse');
  ok(/return true;/.test(s.slice(s.indexOf('function queueRemoved'))), 'liefert true');
});
test('UI sammelt Hinweise statt sie zu überschreiben', () => {
  const s = _ui();
  ok(/S\.notices\.push\(/.test(s) && !/S\.notice\s*=[^=]/.test(s));
  ok(/function render\(\)[\s\S]*?noticeHtml\(\)/.test(s), 'Hinweise auch ohne Tagestafel im Raster');
});
test('UI sperrt Doppelklick: busy wird in finally zurückgesetzt', () => {
  const b = _save().body;
  ok(/if \(S\.busy\) return;/.test(b));
  ok(/finally\s*\{[^}]*S\.busy = false/.test(b));
});
test('Mini-Menü nutzt display flex', () => {
  ok(/m\.style\.display = 'flex'/.test(_ui()));
});

test('UI lädt Status und Crew über pbListAll (alle Seiten), kein perPage=500', () => {
  const s = _ui();
  const b = s.slice(s.indexOf('function loadBundle'), s.indexOf('function reloadBundles'));
  ok(/pbListAll\('assignments'/.test(b) && /pbListAll\('crew_members'/.test(b));
  ok(!/perPage=500/.test(s));
  ok(!/JSON\.parse\(rec\.plan_data/.test(s), 'ein gemeinsamer Parser');
});
test('loadBundle: Status von Seite 2 sind vorhanden', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primeMgr(g);
  const { loadBundle } = await import('../js/tourvergleich-ui.js');
  const mk = (n, off) => Array.from({ length: n }, (_, i) => ({ id:'r'+(off+i), date:'2026-07-09', pos_id:'p'+(off+i), status:'confirmed', crew_name:'N'+(off+i) }));
  mockFetch((url) => {
    if (url.includes('/collections/plans/records/')) return res({ id:'P', name:'T', plan_data: { crew:[] } });
    if (url.includes('/collections/crew_members/')) return res({ items:[], totalPages:1 });
    const page = Number(new URL(url, 'http://x').searchParams.get('page') || 1);
    return res({ items: page === 1 ? mk(200, 0) : mk(50, 200), totalPages: 2, page });
  });
  const b = await loadBundle('P');
  ok(b.statuses['2026-07-09'].p249, 'Eintrag von Seite 2');
  ok(b.statuses['2026-07-09'].p0, 'Eintrag von Seite 1');
});

// ---- v1.2.1: planSwitch, diffPlans, staleSlots ----
import { planSwitch, diffPlans, staleSlots } from '../js/tourvergleich.js';
const J = o => JSON.parse(JSON.stringify(o));
// Konflikt: X ist Stamm auf A/gl und B/lt1, beide Touren am selben Tag
const SA = () => J({ version:3, crew:['X Person','Y Person'], positions:[{id:'gl',label:'GL',short:'GL'},{id:'lt1',label:'L1',short:'L1'}],
  defaultCrew:{ gl:'X Person', lt1:'Y Person' }, tourDates:[{date:'2026-08-01',type:'show',typeLabel:'Show',loc:'Q'}], assignments:{} });
const SB = () => J({ version:3, crew:['X Person','Z Person'], positions:[{id:'lt1',label:'L1',short:'L1'},{id:'sys',label:'Sys',short:'Sys'}],
  defaultCrew:{ lt1:'X Person', sys:'Z Person' }, tourDates:[{date:'2026-08-01',type:'show',typeLabel:'Show',loc:'Q'}], assignments:{} });
const D1 = '2026-08-01';
const run = (a, b, steps) => { steps.forEach(s => { if(s.tour === 'A') a = applySlot(a, D1, s.posId, s.value); else b = applySlot(b, D1, s.posId, s.value); }); return { a, b }; };

test('planSwitch: A→B→A ergibt wieder den Ausgangszustand, Diff leer', () => {
  // Ausgang: X nur in A (in B ist ihr Stammplatz per Abweichung OFFEN) – ein Konflikt selbst ist nicht herstellbar,
  // weil jeder Wechsel einen der beiden Plätze OFFEN macht.
  const a0 = SA(), b0 = SB(); b0.assignments[D1] = { lt1:OFFEN };
  let a = J(a0), b = J(b0);
  let r = planSwitch({ a, b, date:D1, name:'X Person', to:'B' });   // B/lt1 zurück auf Stamm, A/gl OFFEN
  eq(r.needsPick, false);
  ({ a, b } = run(a, b, r.steps));
  eq(effective(a, D1, 'gl'), OFFEN); eq(effective(b, D1, 'lt1'), 'X Person');
  r = planSwitch({ a, b, date:D1, name:'X Person', to:'A' });       // zurück: B-Platz OFFEN, A/gl Stamm
  ({ a, b } = run(a, b, r.steps));
  deepEq(a, a0); deepEq(b, b0);
  deepEq(diffPlans(a0, a), []); deepEq(diffPlans(b0, b), []);
});
test('planSwitch: Person schon in to → nur Schritte der anderen Tour', () => {
  const r = planSwitch({ a:SA(), b:SB(), date:D1, name:'X Person', to:'B' });
  deepEq(r, { steps:[{ tour:'A', posId:'gl', value:OFFEN }], needsPick:false });
});
test('planSwitch: keine freie Stammposition in to → needsPick, kein Schritt für to', () => {
  const b = SB(); b.assignments[D1] = { lt1:'Z Person' }; b.defaultCrew = { lt1:'Z Person', sys:'Z Person' };
  const a = SA();   // X nur in A
  const r = planSwitch({ a, b, date:D1, name:'X Person', to:'B' });
  eq(r.needsPick, true);
  deepEq(r.steps, [{ tour:'A', posId:'gl', value:OFFEN }]);
  ok(!r.steps.some(s => s.tour === 'B'));
});
test('planSwitch: Person auf zwei Positionen in der anderen Tour → beide OFFEN', () => {
  const a = SA(); a.assignments[D1] = { lt1:'X Person' };
  const r = planSwitch({ a, b:SB(), date:D1, name:'x person ', to:'B' });
  deepEq(r.steps.map(s => s.posId).sort(), ['gl','lt1']);
  ok(r.steps.every(s => s.tour === 'A' && s.value === OFFEN));
});
test('planSwitch: Stammposition mit OFFEN belegt gilt als frei, Wert = Stammname', () => {
  const b = SB(); b.assignments[D1] = { lt1:OFFEN };
  const a = SA(); a.assignments[D1] = { gl:'Y Person' };  // X nur in B-Stamm? nein: X nicht in A
  const r = planSwitch({ a, b, date:D1, name:'X Person', to:'B' });
  deepEq(r, { steps:[{ tour:'B', posId:'lt1', value:'X Person' }], needsPick:false });
});
test('diffPlans: ein geänderter Slot → genau ein Eintrag; Abweichung = Stamm zählt nicht', () => {
  const o = SA(), d = applySlot(o, D1, 'gl', OFFEN);
  deepEq(diffPlans(o, d), [{ date:D1, posId:'gl', before:'X Person', after:OFFEN }]);
  const same = J(o); same.assignments[D1] = { gl:'X Person' };
  deepEq(diffPlans(o, same), []);
});
test('staleSlots: Fremdänderung am Diff-Slot erkannt, an anderem Slot ignoriert', () => {
  const o = SA(), d = applySlot(o, D1, 'gl', OFFEN), diffs = diffPlans(o, d);
  deepEq(staleSlots(o, applySlot(o, D1, 'gl', 'Y Person'), diffs), diffs);
  deepEq(staleSlots(o, applySlot(o, D1, 'lt1', OFFEN), diffs), []);
});
test('planSwitch/diffPlans/staleSlots mutieren Eingaben nicht', () => {
  const a = SA(), b = SB(), a0 = J(a), b0 = J(b);
  const r = planSwitch({ a, b, date:D1, name:'X Person', to:'B' });
  const d = applySlot(a, D1, 'gl', OFFEN), d0 = J(d);
  const df = diffPlans(a, d), df0 = J(df);
  staleSlots(a, b, df);
  deepEq(a, a0); deepEq(b, b0); deepEq(d, d0); deepEq(df, df0); ok(r.steps.length === 1);
});
