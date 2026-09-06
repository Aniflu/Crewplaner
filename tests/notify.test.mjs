// Wächter über die /notify-Route (v0.11.0).
//
// ⚠️ Was diese Tests NICHT können: Hook-Code läuft in Goja auf dem PocketBase-Server, nicht
// in Node — die Suite kann die Route nicht ausführen. Hier wird die STRUKTUR belegt
// (Rechteprüfung vor dem Schreiben, Transaktion, keine Datenlecks in der Antwort). Dass der
// Endpoint WIRKT, zeigt erst die Abnahme auf der Test-Instanz; das ist ausdrücklich Teil des
// Plans und nicht durch diese Datei ersetzbar. Dasselbe Muster nutzen cors/feed/crewprivacy.
//
// Der eigentliche Schutz für die Umstellung ist der Vollständigkeits-Wächter am Ende: Solange
// irgendein Frontend-Weg noch selbst einen Mail-Auslöser anlegt, ist die Suite rot — denn mit
// gehärteter createRule fiele genau dieser Weg still aus.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
// Die Route endet am nächsten routerAdd — nur ihren eigenen Rumpf betrachten.
const route = (hook.split("routerAdd('POST', '/notify'")[1] || '').split('routerAdd(')[0];

function primePlan(g){
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_pb_default', 'PLAN1');
}

// ── Ebene 1: Struktur der Route ───────────────────────────────────────────────

test('die /notify-Route existiert und verlangt Anmeldung', () => {
  ok(route, "routerAdd('POST', '/notify' fehlt in .pb_hooks/main.pb.js");
  ok(/\$apis\.requireAuth\(\)/.test(route), 'Route ohne requireAuth — jeder käme dran');
});

test('alle sechs Mail-Typen sind in der Typ-Tabelle vertreten', () => {
  for (const t of ['invite','reminder','update','cancellation','availability','staff_invite'])
    ok(new RegExp("\\b" + t + ":").test(route), `Typ ${t} fehlt in der Typ-Tabelle`);
});

test('geschrieben wird ausschließlich in einer Transaktion', () => {
  ok(/runInTransaction/.test(route),
     'ohne Transaktion kann wieder ein halber Zustand entstehen: Termine da, Mail nie raus');
});

test('die Rechteprüfung steht VOR dem Schreiben', () => {
  const pruef   = route.search(/return e\.string\(404/);
  const schreib = route.search(/runInTransaction/);
  ok(pruef > -1, 'keine Ablehnung mit 404 gefunden');
  ok(schreib > -1 && pruef < schreib,
     'die Berechtigung muss geprüft sein, bevor irgendetwas geschrieben wird');
});

test('abgelehnt wird mit 404, nicht mit 403 (verrät nicht, ob es die Tour gibt)', () => {
  ok(!/e\.string\(403/.test(route), 'ein 403 verrät die Existenz der Tour');
});

test('die Antwort gibt weder Mailadresse noch Datensatz-ID heraus', () => {
  const antwort = (route.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) || []).join(' ');
  ok(antwort, 'keine JSON-Antwort gefunden');
  ok(!/email/i.test(antwort), 'keine Mailadresse in der Antwort');
  ok(!/\bid\b/i.test(antwort), 'keine Datensatz-ID in der Antwort');
});

test('die Crew darf Bereitschaft nur für sich selbst melden', () => {
  ok(/meineMail/.test(route),
     'ohne Abgleich mit der eigenen Adresse könnte ein Konto im Namen anderer melden');
});

// ── Ebene 2: Vollständigkeit der Umstellung ───────────────────────────────────
// Sobald crew_invites.createRule zu ist, fällt jeder übersehene Weg still aus. Deshalb ist
// „übersehen" hier ein Testfehler und keine Frage der Sorgfalt.

test('kein Frontend-Weg legt noch selbst einen Mail-Auslöser an', () => {
  const treffer = [];
  for (const f of ['admin.html','js/dataService.js','js/userView.js','js/crewNotify.js'])
    if (/crew_invites\/records/.test(readFileSync(join(root, f), 'utf8'))) treffer.push(f);
  eq(treffer.length, 0,
     'noch direkt schreibende Stellen: ' + treffer.join(', ')
     + ' — mit gehärteter createRule fallen die still aus');
});

// ── Der Client-Aufruf ─────────────────────────────────────────────────────────

test('notify() schickt EINEN POST auf /notify statt vieler Einzelanfragen', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  const aufrufe = [];
  globalThis.fetch = async (url, opts) => {
    aufrufe.push(String(url) + ' ' + ((opts && opts.method) || 'GET'));
    return { status:200, ok:true, json: async () => ({ ok:true, angelegt:25 }) };
  };
  const res = await g.dataService.notify({ type:'invite', planId:'PLAN1',
    crewName:'Neu', crewEmail:'neu@x.de', slots:[{date:'2027-06-01',posId:'gl'}] });
  eq(res.angelegt, 25, 'die Antwort des Servers kommt beim Aufrufer an');
  eq(aufrufe.length, 1, 'genau eine Anfrage — das ist der ganze Punkt');
  ok(/\/notify POST$/.test(aufrufe[0]), 'POST auf /notify, nicht GET');
});

test('notify() reicht einen Fehler mitsamt Status weiter', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  globalThis.fetch = async () => ({ status:404, ok:false, json: async () => ({}) });
  let e = null;
  try { await g.dataService.notify({ type:'invite', planId:'X', crewName:'A', crewEmail:'a@b.de' }); }
  catch(err) { e = err; }
  ok(e && e.status === 404, 'der Aufrufer muss auf den Status reagieren können');
});

test('sendCrewInvite legt keinen crew_invites-Record mehr selbst an', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  const pfade = [];
  globalThis.fetch = async (url) => {
    pfade.push(String(url));
    return { status:200, ok:true, json: async () => ({ ok:true, items:[], totalPages:1 }) };
  };
  await g.dataService.sendCrewInvite('Neu', 'neu@x.de', 'invite', [{date:'2027-06-01',posId:'gl'}]);
  ok(pfade.some(p => p.endsWith('/notify')), 'der Versand geht über /notify');
  ok(!pfade.some(p => /crew_invites\/records/.test(p)), 'kein direkt angelegter Record mehr');
});

test('sendInvite fährt keine eigene Slot-Anlage mehr vorweg', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g); primePlan(g);
  g.state.crewMeta['Neu'] = { email: 'neu@x.de' };
  g.state.POSITIONS.push({ id:'gl', label:'GL' });
  g.state.TOUR_DATES.push({ date:'2027-06-01', loc:'X' });
  g.state.assignments['2027-06-01'] = { gl: 'Neu' };
  const posts = [];
  globalThis.fetch = async (url, opts) => {
    if (((opts && opts.method) || 'GET') !== 'GET') posts.push(String(url));
    return { status:200, ok:true, json: async () => ({ ok:true, items:[], totalPages:1 }) };
  };
  await g.crewNotify.sendInvite('Neu', 'invite');
  eq(posts.filter(p => /assignments\/records/.test(p)).length, 0,
     'die Slots schreibt der Server, nicht der Browser');
  eq(g.state.assignmentStatuses['2027-06-01']?.gl?.status, 'proposed',
     'der lokale Status wird trotzdem nachgezogen, sonst stimmt die Liste nicht');
});
