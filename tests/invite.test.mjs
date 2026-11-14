// Einladen: was die App meldet, muss stimmen (v0.10.5).
//
// Gemeldet an „Provinz 2027": beim Einladen kam „Too many requests". Beim Nachlesen fiel auf,
// dass der Weg den Fehler danach ZUDECKT: sendCrewInvite fing ihn ab und warf nicht weiter,
// sendInvite lief einfach durch, schrieb die Person per _saveInvite als „eingeladen" in den
// localStorage und meldete grün „Einladung gesendet ✓". Die rote Meldung wurde von der grünen
// sofort überschrieben, und in der Liste stand danach „🟡 Eingeladen" — obwohl nie eine Mail
// rausging. Wer sich darauf verlässt, wartet auf eine Antwort, die niemand bekommen hat.
import { test, eq, ok } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const INVITES_KEY = 'tourplan_crew_invites_default';   // v1.3.0: je Plan (hier: kein Plan → default)

function primePlan(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
}

// v1.5.0: Der Vermerk „eingeladen“ liegt nicht mehr im localStorage, sondern im email_log des
// Servers. Dieser Test hält fest: Fehlschlag wirft weiter (kein Erfolgs-Toast), und bei Erfolg wird
// KEIN lokaler Vermerk mehr geschrieben, stattdessen das Log neu geladen.
function mitTermin(g){
  g.state.crewMeta['Neu Person'] = { email: 'neu@x.de' };
  g.state.POSITIONS.push({ id:'gl', label:'GL' });
  g.state.TOUR_DATES.push({ date:'2027-06-01', loc:'X' });
  g.state.assignments['2027-06-01'] = { gl: 'Neu Person' };
}

test('scheitert der Mailversand, wirft sendInvite weiter und lädt das Log nicht neu', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g); mitTermin(g);
  globalThis.localStorage.removeItem(INVITES_KEY);
  const logGets = [];
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (m === 'GET') { if (/email_log/.test(String(url))) logGets.push(String(url)); return { status:200, ok:true, json: async () => ({ items: [], page:1, perPage:200, totalPages:1 }) }; }
    return { status:429, ok:false, json: async () => ({ message:'Too many requests.' }) };
  };
  let geworfen = null;
  try { await g.crewNotify.sendInvite('Neu Person', 'invite'); }
  catch(e) { geworfen = e; }
  ok(geworfen, 'sendInvite meldet den Fehlschlag, statt still Erfolg zu suggerieren');
  eq(logGets.length, 0, 'ohne Mail kein Neuladen des Logs');
  eq(g.state.assignmentStatuses['2027-06-01'], undefined, 'lokal kein angefragter Status ohne Mail');
});

test('geht die Mail raus: kein lokaler Vermerk, email_log wird neu geladen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g); mitTermin(g);
  globalThis.localStorage.removeItem(INVITES_KEY);
  const logGets = [];
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (m === 'GET') { if (/email_log/.test(String(url))) logGets.push(String(url)); return { status:200, ok:true, json: async () => ({ items: [], page:1, perPage:200, totalPages:1 }) }; }
    return { status:200, ok:true, json: async () => ({ id:'inv1' }) };
  };
  await g.crewNotify.sendInvite('Neu Person', 'invite');
  eq(globalThis.localStorage.getItem(INVITES_KEY), null, 'v1.5.0: kein Einladungsvermerk im localStorage mehr');
  eq(logGets.length, 1, 'email_log nach dem Senden neu geladen');
  ok(/sort=-sent_at/.test(logGets[0]) || /sent_at/.test(decodeURIComponent(logGets[0])), 'Sortierung nach sent_at');
});

// Schlussprüfung v1.5.0: Ohne Plan-ID darf sendCrewInvite nicht still zurückkehren, sonst meldet
// sendInvite „Einladung gesendet ✓", obwohl nichts rausging.
test('ohne Plan-ID wirft sendInvite weiter (kein stilles Erfolgs-Toast, kein lokaler Status)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); mitTermin(g);
  g.state.setAuthState(null, null, null);
  const toasts = [];
  globalThis.showToast = (t) => toasts.push(String(t));
  globalThis.fetch = async () => ({ status:200, ok:true, json: async () => ({ items: [] }) });
  let geworfen = null;
  try { await g.crewNotify.sendInvite('Neu Person', 'invite'); }
  catch(e) { geworfen = e; }
  ok(geworfen && /Plan nicht gefunden/.test(geworfen.message), 'wirft „Plan nicht gefunden“');
  ok(!toasts.some(t => /gesendet ✓/.test(t)), 'kein „gesendet ✓“');
  eq(g.state.assignmentStatuses['2027-06-01'], undefined, 'lokal kein Status');
});
