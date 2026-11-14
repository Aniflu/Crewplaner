// Crew-Entwurf (v1.5.0): reines Modul + saveCrewChanges.
import { test, ok, eq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';
import * as D from '../js/crewDraft.js';

const leer = () => ({ changes: [], availability: [] });
const A = { date: '2027-06-01', posId: 'gl' };

test('setChange legt an; erneutes Ersetzen behält das ursprüngliche from', () => {
  let d = D.setChange(leer(), { ...A, from: 'proposed', to: 'confirmed' });
  d = D.setChange(d, { ...A, from: 'confirmed', to: 'declined' });
  eq(d.changes.length, 1);
  eq(d.changes[0].from, 'proposed');
  eq(d.changes[0].to, 'declined');
});

test('setChange zurück auf den Ausgang entfernt den Eintrag', () => {
  let d = D.setChange(leer(), { ...A, from: 'proposed', to: 'confirmed' });
  d = D.setChange(d, { ...A, from: 'confirmed', to: 'proposed' });
  eq(D.draftCount(d), 0);
});

test('setChange verändert den Eingang nicht', () => {
  const d0 = leer(); D.setChange(d0, { ...A, from: 'a', to: 'b' });
  eq(d0.changes.length, 0);
});

test('toggleAvailability schaltet um', () => {
  let d = D.toggleAvailability(leer(), A);
  eq(d.availability.length, 1);
  d = D.toggleAvailability(d, A);
  eq(d.availability.length, 0);
});

test('dropStale nennt genau die veralteten', () => {
  let d = D.setChange(leer(), { date: 'd1', posId: 'p', from: 'proposed', to: 'confirmed' });
  d = D.setChange(d, { date: 'd2', posId: 'p', from: 'proposed', to: 'declined' });
  const r = D.dropStale(d, (date) => date === 'd1' ? 'proposed' : 'none');
  eq(r.dropped.length, 1);
  eq(r.dropped[0].date, 'd2');
  eq(r.dropped[0].to, 'declined');
  eq(r.draft.changes.length, 1);
  eq(r.draft.changes[0].date, 'd1');
});

test('removeEntries entfernt Wechsel und Bereitschaft der Schlüssel', () => {
  let d = D.setChange(leer(), { ...A, from: 'a', to: 'b' });
  d = D.toggleAvailability(d, { date: 'd2', posId: 'p' });
  d = D.removeEntries(d, [A, { date: 'd2', posId: 'p' }]);
  eq(D.draftCount(d), 0);
});

test('effectiveStatus: Entwurf vor Basis', () => {
  const d = D.setChange(leer(), { ...A, from: 'proposed', to: 'confirmed' });
  eq(D.effectiveStatus(d, A.date, A.posId, 'proposed'), 'confirmed');
  eq(D.effectiveStatus(d, 'x', 'y', 'none'), 'none');
});

test('Persistenz-Rundweg, kaputtes JSON → leer, clear', () => {
  const d = D.setChange(leer(), { ...A, from: 'a', to: 'b' });
  D.saveDraft('P1', d);
  eq(JSON.stringify(D.loadDraft('P1')), JSON.stringify(d));
  eq(D.draftKey('P1'), 'tourplan_crew_draft_P1');
  globalThis.localStorage.setItem(D.draftKey('P1'), '{kaputt');
  eq(D.draftCount(D.loadDraft('P1')), 0);
  globalThis.localStorage.setItem(D.draftKey('P1'), '{"changes":5}');
  eq(D.draftCount(D.loadDraft('P1')), 0);
  D.saveDraft('P1', d); D.clearDraft('P1');
  eq(D.draftCount(D.loadDraft('P1')), 0);
});

test('saveCrewChanges: ein POST mit Body-Form; 409 wirft mit body.stale', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  resetState(g);
  globalThis.localStorage.setItem('pb_token', 't');
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { status: 200, ok: true, json: async () => ({ ok: true, saved: 1 }) };
  };
  const draft = D.toggleAvailability(D.setChange(leer(), { ...A, from: 'proposed', to: 'confirmed' }), { date: 'd2', posId: 'p' });
  const res = await g.dataService.saveCrewChanges('PLAN1', draft);
  eq(res.saved, 1);
  eq(calls.length, 1);
  ok(/\/crewsave$/.test(calls[0].url) && calls[0].opts.method === 'POST');
  const body = JSON.parse(calls[0].opts.body);
  eq(body.planId, 'PLAN1');
  eq(body.changes.length, 1);
  eq(body.availability.length, 1);
  eq(Object.keys(body).sort().join(), 'availability,changes,planId');

  globalThis.fetch = async () => ({ status: 409, ok: false, json: async () => ({ stale: [{ date: 'd', posId: 'p', now: 'declined' }] }) });
  let e = null;
  try { await g.dataService.saveCrewChanges('PLAN1', draft); } catch (x) { e = x; }
  ok(e && e.status === 409, 'Status am Fehler');
  eq(e.body.stale[0].now, 'declined');

  globalThis.fetch = async () => ({ status: 500, ok: false, json: async () => { throw new Error('kein JSON'); } });
  e = null;
  try { await g.dataService.saveCrewChanges('PLAN1', draft); } catch (x) { e = x; }
  ok(e && e.status === 500 && e.body === null, 'nicht lesbarer Körper → null');
});
