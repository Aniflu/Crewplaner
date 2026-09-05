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

const INVITES_KEY = 'tourplan_crew_invites';

function primePlan(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
}

test('scheitert der Mailversand, gilt die Person NICHT als eingeladen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  globalThis.localStorage.removeItem(INVITES_KEY);
  g.state.crewMeta['Neu Person'] = { email: 'neu@x.de' };

  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (m === 'GET') return { status:200, ok:true, json: async () => ({ items: [], page:1, perPage:200, totalPages:1 }) };
    return { status:429, ok:false, json: async () => ({ message:'Too many requests.' }) };
  };

  let geworfen = null;
  try { await g.crewNotify.sendInvite('Neu Person', 'invite'); }
  catch(e) { geworfen = e; }

  ok(geworfen, 'sendInvite meldet den Fehlschlag, statt still Erfolg zu suggerieren');
  eq(globalThis.localStorage.getItem(INVITES_KEY), null,
     'ohne Mail darf kein Einladungsvermerk im localStorage stehen');
});

test('geht die Mail raus, wird der Einladungsvermerk gesetzt', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  globalThis.localStorage.removeItem(INVITES_KEY);
  g.state.crewMeta['Neu Person'] = { email: 'neu@x.de' };

  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (m === 'GET') return { status:200, ok:true, json: async () => ({ items: [], page:1, perPage:200, totalPages:1 }) };
    return { status:200, ok:true, json: async () => ({ id:'inv1' }) };
  };

  await g.crewNotify.sendInvite('Neu Person', 'invite');
  const vermerk = JSON.parse(globalThis.localStorage.getItem(INVITES_KEY) || '{}');
  ok(vermerk['Neu Person'], 'nach erfolgreichem Versand steht die Person als eingeladen');
});
