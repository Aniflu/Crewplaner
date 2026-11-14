// v1.5.0: Crew sammelt Änderungen im Entwurf und speichert gesammelt (/crewsave).
// Echte Datenformen (crewMeta, assignmentStatuses, entfallen mit aid), fetch gemockt; nichts
// geht einzeln an assignments. Der Manager-Pfad schreibt weiter direkt.
import { test, eq, ok } from './_assert.mjs';
import { clearDraft } from '../js/crewDraft.js';
import { loadGraph, resetState } from './_graph.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, f), 'utf8');

function res(body, status = 200) { return { status, ok: status < 400, json: async () => body }; }
const ME = 'Marco Hoch';
const KEY = 'tourplan_crew_draft_PLAN1';

// ── Struktursperre: Crew-Dateien rufen pbPatch/pbPost nicht mehr auf assignments auf ──
// Geprüft wird der AUFRUF (Name + `(` + Pfad), nicht der bloße Name. Kommentare zählen nicht.
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
export const SPERRE_DATEIEN = ['js/userView.js', 'js/render.js', 'js/authService.js'];
export const SPERRE_MUSTER = /pb(Patch|Post)\(\s*['"`]\/api\/collections\/assignments/;
export const SPERRE_SOFORT = /\b(confirmAssignment|declineAssignment|restorePencilled|ackCancelledAssignments|sendAvailabilityNotice)\s*\(/;
export function verstoesse(quelle, muster) { return muster.test(strip(quelle)); }

test('Struktursperre: userView/render/authService rufen pbPatch/pbPost auf assignments nicht auf', () => {
  for (const f of SPERRE_DATEIEN) {
    ok(!verstoesse(src(f), SPERRE_MUSTER), f + ' schreibt noch direkt auf assignments (pbPatch/pbPost)');
    ok(!verstoesse(src(f), SPERRE_SOFORT), f + ' ruft noch einen sofort schreibenden Crew-Weg auf (confirm/decline/restore/ack/availability)');
  }
});

test('Struktursperre erkennt einen Verstoß (Rot-Nachweis: Muster greift auf Aufruf, nicht auf Kommentar)', () => {
  ok(verstoesse("await pbPatch('/api/collections/assignments/records/' + id, p);", SPERRE_MUSTER), 'Aufruf nicht erkannt');
  ok(verstoesse('await pbPost(`/api/collections/assignments/records`, p);', SPERRE_MUSTER), 'Template-Aufruf nicht erkannt');
  ok(verstoesse('await declineAssignment(d, p);', SPERRE_SOFORT), 'declineAssignment( nicht erkannt');
  ok(!verstoesse("// pbPatch('/api/collections/assignments/x')", SPERRE_MUSTER), 'Kommentar darf nicht zählen');
});

// ── Aufbau ──────────────────────────────────────────────────────────────────────
function setup(g, statuses) {
  resetState(g);
  g.state.setAuthState('uid-crew', 'crew@example.com', 'crew');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  clearDraft('PLAN1');   // Speicher + Arbeitsspeicher
  g.dataService._setCrewLoadedPlanId('PLAN1');
  g.state.crewMeta[ME] = { email: 'crew@example.com', userId: 'uid-crew' };
  g.state.POSITIONS.push({ id: 'gl', label: 'Gruppenleitung' }, { id: 'fa', label: 'Fahrer' });
  Object.entries(statuses).forEach(([k, st]) => {
    const [date, pos] = k.split('|');
    if (!g.state.TOUR_DATES.find(d => d.date === date)) g.state.TOUR_DATES.push({ date, loc: 'Berlin' });
    g.state.assignments[date] = Object.assign(g.state.assignments[date] || {}, { [pos]: ME });
    g.state.setStatus(date, pos, { status: st, crewName: ME });
  });
}
// Alle Netzaufrufe protokollieren; /crewsave und /planstatus lassen sich steuern.
function mock(opts = {}) {
  const calls = [];
  globalThis.fetch = async (url, o) => {
    url = String(url); const method = (o && o.method) || 'GET';
    const body = o && o.body ? JSON.parse(o.body) : null;
    calls.push({ url, method, body });
    if (url.includes('/myplans')) return res([{ id: 'PLAN1', name: 'Tour' }]);
    if (url.includes('/planstatus/')) return res({ statuses: opts.statuses || {}, cancelled: opts.cancelled || [] });
    if (url.includes('/crewsave')) return opts.crewsave ? opts.crewsave(body) : res({ ok: true, saved: 1 });
    if (opts.get && method === 'GET') { const r = opts.get(url); if (r) return r; }
    return res({});
  };
  return { calls, saves: () => calls.filter(c => c.url.includes('/crewsave')),
           assignWrites: () => calls.filter(c => c.method !== 'GET' && c.url.includes('/assignments/')) };
}
function captureDom() {
  const els = {};
  const mk = () => ({ innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, focus() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const orig = globalThis.document.getElementById;
  globalThis.document.getElementById = id => (els[id] ||= mk());
  return { els, restore() { globalThis.document.getElementById = orig; } };
}
const flush = () => new Promise(r => setTimeout(r, 30));
const draftNow = () => JSON.parse(globalThis.localStorage.getItem(KEY) || '{"changes":[],"availability":[]}');

test('Crew klickt Absagen → kein Netzaufruf, Entwurf 1, Leiste sichtbar', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'confirmed' }); const net = mock(); const dom = captureDom();
  try {
    g.userView.toggleCancellation('2026-07-01', 'gl');
    await flush();
    eq(net.calls.length, 0, 'kein Netzaufruf');
    const d = draftNow();
    eq(d.changes.length, 1); eq(d.changes[0].from, 'confirmed'); eq(d.changes[0].to, 'declined');
    eq(dom.els.crewSaveBar.style.display, 'flex', 'Leiste sichtbar');
    ok(/1 ungespeicherte Änderung$/.test(dom.els.crewSaveCount.textContent), dom.els.crewSaveCount.textContent);
    // erneut klicken nimmt die Absage zurück → Leiste weg
    g.userView.toggleCancellation('2026-07-01', 'gl');
    eq(draftNow().changes.length, 0);
    eq(dom.els.crewSaveBar.style.display, 'none');
  } finally { dom.restore(); }
});

test('Zelle trägt draft-changed + „● ungespeichert“ (Tabelle zeigt den Entwurf)', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'confirmed', '2026-07-02|gl': 'confirmed' }); mock(); const dom = captureDom();
  try {
    g.userView.toggleCancellation('2026-07-01', 'gl');
    const html = dom.els.tBody.innerHTML;
    eq((html.match(/draft-changed/g) || []).length, 1, 'genau eine markierte Zelle');
    ok(html.includes('● ungespeichert'), 'Beschriftung fehlt');
    ok(html.includes('Absagen?'), 'Entwurf (Absage) nicht angezeigt');
  } finally { dom.restore(); }
});

test('Speichern → genau ein /crewsave-Aufruf mit allen Einträgen; Entwurf danach leer', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'proposed', '2026-07-02|gl': 'pencilled' }); const net = mock(); const dom = captureDom();
  try {
    g.userView.confirmMySlot('2026-07-01', 'gl');
    g.userView.declineMySlot('2026-07-02', 'gl');
    g.userView.meinesMelden('2026-07-05', 'fa');
    eq(net.calls.length, 0, 'bis hierher kein Netzaufruf');
    await g.userView.saveMyChanges();
    eq(net.saves().length, 1, 'genau ein /crewsave');
    const b = net.saves()[0].body;
    eq(net.saves()[0].method, 'POST'); eq(b.planId, 'PLAN1');
    eq(b.changes.length, 2); eq(b.availability.length, 1);
    ok(b.changes.some(c => c.date === '2026-07-01' && c.from === 'proposed' && c.to === 'confirmed'));
    ok(b.changes.some(c => c.date === '2026-07-02' && c.from === 'pencilled' && c.to === 'pencil_declined'));
    eq(net.assignWrites().length, 0, 'nichts direkt auf assignments');
    eq(globalThis.localStorage.getItem(KEY), null, 'Entwurf geleert');
    eq(dom.els.crewSaveBar.style.display, 'none');
  } finally { dom.restore(); }
});

test('Speichern scheitert (400 denied) → Entwurf unverändert', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'proposed' });
  mock({ crewsave: () => res({ denied: [{ date: '2026-07-01', posId: 'gl', reason: 'fremder Termin' }] }, 400) });
  const dom = captureDom();
  try {
    g.userView.confirmMySlot('2026-07-01', 'gl');
    const vorher = globalThis.localStorage.getItem(KEY);
    await g.userView.saveMyChanges();
    eq(globalThis.localStorage.getItem(KEY), vorher, 'Entwurf unverändert');
    ok(/fremder Termin/.test(dom.els.toast.textContent), 'Grund im Toast: ' + dom.els.toast.textContent);
  } finally { dom.restore(); }
});

test('409 → nur stale entfernt, showAlert aufgerufen, Rest bleibt', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'proposed', '2026-07-02|gl': 'proposed' });
  mock({ crewsave: () => res({ stale: [{ date: '2026-07-01', posId: 'gl', now: 'confirmed' }] }, 409),
         statuses: { '2026-07-01': { gl: { status: 'confirmed', crewName: ME } }, '2026-07-02': { gl: { status: 'proposed', crewName: ME } } } });
  const dom = captureDom();
  const meldungen = []; const orig = globalThis.showAlert; globalThis.showAlert = async m => { meldungen.push(m); };
  try {
    g.userView.confirmMySlot('2026-07-01', 'gl');
    g.userView.confirmMySlot('2026-07-02', 'gl');
    await g.userView.saveMyChanges();
    eq(meldungen.length, 1, 'showAlert einmal');
    ok(meldungen[0].includes('Der Planer hat inzwischen geändert') && meldungen[0].includes('01.07.2026'), meldungen[0]);
    const d = draftNow();
    eq(d.changes.length, 1, 'Rest bleibt'); eq(d.changes[0].date, '2026-07-02');
  } finally { globalThis.showAlert = orig; dom.restore(); }
});

test('Verwerfen → showConfirm, danach Entwurf leer; Abbrechen lässt ihn stehen', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'proposed' }); const net = mock(); const dom = captureDom();
  const fragen = []; const orig = globalThis.showConfirm;
  try {
    g.userView.declineMySlot('2026-07-01', 'gl');
    globalThis.showConfirm = async (m, l) => { fragen.push([m, l]); return false; };
    await g.userView.discardMyChanges();
    eq(fragen.length, 1); eq(draftNow().changes.length, 1, 'Abbrechen: bleibt');
    globalThis.showConfirm = async (m, l) => { fragen.push([m, l]); return true; };
    await g.userView.discardMyChanges();
    eq(fragen.length, 2); eq(draftNow().changes.length, 0, 'verworfen');
    eq(net.calls.length, 0);
    eq(dom.els.crewSaveBar.style.display, 'none');
  } finally { globalThis.showConfirm = orig; dom.restore(); }
});

test('Öffnen mit Entwurf → showConfirm; veralteter Eintrag verworfen und genannt', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  // Server-Stand jetzt: 07-01 pencilled (Entwurf ok), 07-02 inzwischen confirmed (Entwurf kennt proposed → veraltet)
  setup(g, { '2026-07-01|gl': 'pencilled', '2026-07-02|gl': 'confirmed' }); mock(); const dom = captureDom();
  globalThis.localStorage.setItem(KEY, JSON.stringify({
    changes: [{ date: '2026-07-01', posId: 'gl', from: 'pencilled', to: 'pencil_declined' },
              { date: '2026-07-02', posId: 'gl', from: 'proposed', to: 'declined' }],
    availability: [] }));
  const fragen = []; const orig = globalThis.showConfirm;
  globalThis.showConfirm = async (m, l) => { fragen.push([m, l]); return false; };
  try {
    await g.userView.checkCrewDraftOnOpen();
    ok(fragen.length >= 1, 'showConfirm nicht aufgerufen');
    ok(fragen[0][0].includes('Du hast ungespeicherte Änderungen (1)'), fragen[0][0]);
    ok(fragen[0][0].includes('02.07.2026'), 'Verworfenes nicht genannt: ' + fragen[0][0]);
    eq(fragen[0][1], 'Speichern');
    const d = draftNow();
    eq(d.changes.length, 1); eq(d.changes[0].date, '2026-07-01');
  } finally { globalThis.showConfirm = orig; dom.restore(); }
});

test('Öffnen mit Entwurf: „Speichern“ schickt /crewsave', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'pencilled' }); const net = mock(); const dom = captureDom();
  globalThis.localStorage.setItem(KEY, JSON.stringify({
    changes: [{ date: '2026-07-01', posId: 'gl', from: 'pencilled', to: 'pencil_declined' }], availability: [] }));
  const orig = globalThis.showConfirm; globalThis.showConfirm = async () => true;
  try {
    await g.userView.checkCrewDraftOnOpen();
    eq(net.saves().length, 1); eq(globalThis.localStorage.getItem(KEY), null);
  } finally { globalThis.showConfirm = orig; dom.restore(); }
});

test('Mail-Link action=confirm → Entwurf statt PATCH', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  const auth = await import('../js/authService.js');
  setup(g, { '2026-07-01|gl': 'proposed' });
  const net = mock({ get: url => url.includes('/assignments/records/a1')
    ? res({ id: 'a1', plan_id: 'PLAN1', crew_email: 'crew@example.com', date: '2026-07-01', pos_id: 'gl', status: 'proposed' }) : null });
  const dom = captureDom();
  const oLoc = globalThis.location.search, oHist = globalThis.history;
  globalThis.location.search = '?action=confirm&aid=a1';
  globalThis.history = { replaceState() {} };
  try {
    await auth._handleEmailAction();
    eq(net.assignWrites().length, 0, 'kein PATCH/POST auf assignments');
    const d = draftNow();
    eq(d.changes.length, 1); eq(d.changes[0].to, 'confirmed'); eq(d.changes[0].from, 'proposed');
    eq(dom.els.crewSaveBar.style.display, 'flex');
  } finally { globalThis.location.search = oLoc; globalThis.history = oHist; dom.restore(); }
});

test('Mail-Link action=ackcancel → cancel_acked je aid im Entwurf', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  const auth = await import('../js/authService.js');
  setup(g, {});
  g.state.meineEntfallenen.push({ date: '2026-07-03', posId: 'gl', posLabel: 'Gruppenleitung', aid: 'c1' },
                                { date: '2026-07-04', posId: 'gl', posLabel: 'Gruppenleitung', aid: 'c2' });
  const net = mock(); const dom = captureDom();
  const oLoc = globalThis.location.search, oHist = globalThis.history;
  globalThis.location.search = '?action=ackcancel&aids=c1,c2';
  globalThis.history = { replaceState() {} };
  try {
    await auth._handleEmailAction();
    eq(net.assignWrites().length, 0);
    const d = draftNow();
    eq(d.changes.length, 2);
    ok(d.changes.every(c => c.from === 'cancelled' && c.to === 'cancel_acked'));
  } finally { globalThis.location.search = oLoc; globalThis.history = oHist; g.state.meineEntfallenen.length = 0; dom.restore(); }
});

test('Manager bestätigt weiter direkt (confirmAssignment) — Entwurf gibt es für ihn nicht', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
  g.state.setStatus('2026-07-01', 'gl', { status: 'proposed', crewName: 'Wolf' });
  const patches = [];
  globalThis.fetch = async (url, o) => {
    const method = (o && o.method) || 'GET'; url = String(url);
    if (method === 'GET' && url.includes('/assignments/records')) return res({ items: [{ id: 'rec1' }] });
    if (method === 'PATCH') { patches.push(url); return res({ id: 'rec1', status: 'confirmed' }); }
    return res({});
  };
  await g.dataService.confirmAssignment('2026-07-01', 'gl');
  eq(patches.length, 1, 'Planer-Pfad schreibt direkt');
  eq(g.userView.queueCrewChange('2026-07-01', 'gl', 'declined'), false, 'Entwurf nur für Crew');
  eq(g.userView.getCrewDraft().changes.length, 0);
});

test('Leiste: index.html hat #crewSaveBar mit Speichern/Verwerfen, die alten Leisten sind weg; Handy-Regel vorhanden', () => {
  const idx = src('index.html'), css = src('styles.css'), app = src('js/app.js');
  ok(idx.includes('id="crewSaveBar"') && idx.includes('saveMyChanges()') && idx.includes('discardMyChanges()'));
  ok(idx.includes('💾 Änderungen speichern') && idx.includes('↩ Verwerfen'));
  ok(!idx.includes('btnSendCancellations') && !idx.includes('meldungSubmitBar'), 'alte Leisten noch da');
  ok(/#crewSaveBar\s*{[^}]*position\s*:\s*fixed/.test(css) && /#crewSaveBar\s*{[^}]*bottom\s*:\s*0/.test(css), 'Leiste nicht fest unten');
  ok(/\.draft-changed\s*{[^}]*dashed/.test(css), 'gestrichelter Rahmen fehlt');
  const mq = css.slice(css.lastIndexOf('@media (max-width:768px)'));
  ok(/#crewSaveBar/.test(mq), 'kein Handy-Layout für die Leiste');
  ok(/window\.saveMyChanges\s*=/.test(app) && /window\.discardMyChanges\s*=/.test(app), 'window-Bindung fehlt');
});

test('Speichern entfernt nur gesendete Einträge: Klick während der Anfrage bleibt', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'proposed', '2026-07-02|gl': 'proposed' });
  let freigabe; const warten = new Promise(r => { freigabe = r; });
  mock({ crewsave: async () => { await warten; return res({ ok: true, saved: 1 }); } });
  const dom = captureDom();
  try {
    g.userView.confirmMySlot('2026-07-01', 'gl');
    const lauf = g.userView.saveMyChanges();
    await flush();
    g.userView.confirmMySlot('2026-07-02', 'gl');   // Klick MITTEN in der Anfrage
    freigabe(); await lauf;
    const d = draftNow();
    eq(d.changes.length, 1, 'nur der neue Klick bleibt');
    eq(d.changes[0].date, '2026-07-02');
  } finally { dom.restore(); }
});

test('Slot-Modal escaped Position und Ort', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  setup(g, { '2026-07-01|gl': 'proposed' });
  g.state.POSITIONS[0].label = '<img src=x onerror=1>';
  g.state.TOUR_DATES[0].loc = '<b>Ort</b>';
  mock(); const dom = captureDom();
  try {
    g.userView.openSlotConfirmModal('2026-07-01', 'gl');
    const h = dom.els.sharedBody.innerHTML;
    ok(!h.includes('<img') && !h.includes('<b>Ort'), h);
    ok(h.includes('&lt;img'), 'nicht escaped: ' + h);
  } finally { dom.restore(); }
});
