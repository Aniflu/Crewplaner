// v1.4.0: Konsole – „✉ Vormerkung mitteilen“, „gesehen ✓“, Zähler „✎✗“.
// Nutzlast pencil_info (Hook v4.29): type, planId, crewName, crewEmail, planName, appUrl,
// mailSlots (nie leer, sonst 400), customMessage nur wenn gegeben; der Hook schreibt keinen Status.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');
const PI = 'tourplan_pencil_info_PBY';

async function setup(status = 'pencilled') {
  const g = await loadGraph(); if (!g) return null;
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  const ls = globalThis.localStorage;
  ls.setItem('pb_token', 't'); ls.removeItem(PI);
  ls.setItem('tourplan_plans', JSON.stringify([{ id: 'pbplan_PBX', name: 'Plan X' }, { id: 'pbplan_PBY', name: 'Plan Y' }]));
  ls.setItem('tourplan_pb_pbplan_PBX', 'PBX');
  ls.setItem('tourplan_pb_pbplan_PBY', 'PBY');
  ls.setItem('tourplan_active_pb_id', 'PBX');          // Zeiger der Touransicht: ein anderer Plan
  g.plans.setActivePlanId('pbplan_PBY');
  const s = g.state;
  s.TOUR_DATES.push({ date: '2027-06-01', loc: 'Berlin', type: 'show', typeLabel: 'Show' },
                    { date: '2027-06-02', loc: 'Hamburg', type: 'show', typeLabel: 'Show' });
  s.POSITIONS.push({ id: 'gl', label: 'GL', short: 'GL' });
  s.crew.push('Anna');
  s.defaultCrew.gl = 'Anna';
  s.crewMeta['Anna'] = { email: 'anna@x.de' };
  for (const k of Object.keys(s.assignmentStatuses)) delete s.assignmentStatuses[k];
  if (status) {
    s.assignmentStatuses['2027-06-01'] = { gl: { status, crewName: 'Anna' } };
    s.assignmentStatuses['2027-06-02'] = { gl: { status: 'pencil_declined', crewName: 'Anna' } };
  }
  return g;
}

function capture(activityRows = []) {
  const posts = [], gets = [];
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (/\/notify$/.test(String(url)) && m === 'POST') {
      posts.push(JSON.parse(opts.body));
      return { status: 200, ok: true, json: async () => ({ ok: true }) };
    }
    if (/activity_log/.test(String(url))) {
      gets.push(String(url));
      return { status: 200, ok: true, json: async () => ({ items: activityRows, page: 1, perPage: 200, totalPages: 1 }) };
    }
    return { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };
  };
  return { posts, gets };
}

function hostCapture() {
  const host = { innerHTML: '', style: {} };
  const orig = globalThis.document.getElementById;
  globalThis.document.getElementById = id => id === 'host' ? host : orig(id);
  return { host, restore: () => { globalThis.document.getElementById = orig; } };
}

test('pencil_info: Nutzlast trägt den Konsolen-Plan, nicht den Zeiger der Touransicht', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const { posts } = capture();
  await g.crewNotify.sendPencilInfoTo('Anna');
  eq(posts.length, 1, 'genau ein notify-POST');
  const b = posts[0];
  eq(b.type, 'pencil_info'); eq(b.planId, 'PBY', 'planId ist der Konsolen-Plan, nicht PBX');
  eq(b.crewName, 'Anna'); eq(b.crewEmail, 'anna@x.de');
  eq(Object.keys(b).sort().join(','), 'appUrl,crewEmail,crewName,mailSlots,planId,planName,type', 'Feldmenge ohne customMessage');
  eq(b.mailSlots.length, 1, 'nur der vorgemerkte Tag, nicht der abgesagte');
  eq(JSON.stringify(b.mailSlots[0]), JSON.stringify({ date: '2027-06-01', posLabel: 'GL' }));
  ok(JSON.parse(globalThis.localStorage.getItem(PI)).Anna, 'Vermerk „mitgeteilt“ je Plan gespeichert');
  eq(globalThis.localStorage.getItem('tourplan_pencil_info_PBX'), null, 'nicht im Schlüssel des Zeiger-Plans');
});

test('pencil_info: customMessage nur wenn gegeben', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const { posts } = capture();
  await g.crewNotify.sendPencilInfoTo('Anna', 'Hallo Anna');
  eq(posts[0].customMessage, 'Hallo Anna');
});

test('pencil_info: ohne vorgemerkte Tage kein POST und kein Vermerk', async () => {
  const g = await setup('confirmed'); if (!g) return 'SKIP';
  const { posts } = capture();
  await g.crewNotify.sendPencilInfoTo('Anna');
  eq(posts.length, 0); eq(globalThis.localStorage.getItem(PI), null);
});

test('Vorschau abbrechen sendet nichts', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const { posts } = capture();
  g.crewNotify.openPencilInfoPreview('Anna');
  g.crewNotify.closeSendPreview();
  await g.crewNotify.confirmSendPreview();          // Kontext ist weg → nichts zu senden
  eq(posts.length, 0); eq(globalThis.localStorage.getItem(PI), null);
});

test('Vorschau bestätigen sendet pencil_info mit Freitext', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const { posts } = capture();
  const orig = globalThis.document.getElementById;
  globalThis.document.getElementById = id => id === 'sendPreviewText' ? { value: ' Text ' } : orig(id);
  try {
    g.crewNotify.openPencilInfoPreview('Anna');
    await g.crewNotify.confirmSendPreview();
  } finally { globalThis.document.getElementById = orig; }
  eq(posts.length, 1); eq(posts[0].type, 'pencil_info'); eq(posts[0].customMessage, 'Text');
});

test('Liste: Knopf nur mit vorgemerkten Tagen; Zähler ✎✗; gesehen ✓ aus activity_log', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const rows = [
    { action: 'pencil_seen', crew_email: 'anna@x.de', crew_name: 'Anna', ts: '2027-01-05T10:00:00Z' },
    { action: 'pencil_seen', crew_email: 'anna@x.de', crew_name: 'Anna', ts: '2027-01-02T10:00:00Z' },
    { action: 'pencil_seen', crew_email: 'bob@x.de', crew_name: 'Bob', ts: '2027-01-09T10:00:00Z' },
  ];
  const { gets } = capture(rows);
  const h = hostCapture();
  try {
    await g.crewNotify.renderCrewNotifyInto('host');
    ok(h.host.innerHTML.includes('✉ Vormerkung mitteilen'), 'Knopf bei vorgemerktem Tag');
    ok(/gesehen ✓ 05\.01\.2027/.test(h.host.innerHTML), 'jüngster Eintrag der Person: ' + h.host.innerHTML.slice(0, 0));
    ok(!h.host.innerHTML.includes('09.01.2027'), 'Eintrag einer anderen Person zählt nicht');
    ok(/✎✗ 1 Vormerkung abgesagt/.test(h.host.innerHTML), 'Zähler');
    ok(gets.some(u => /plan_id/.test(decodeURIComponent(u)) && /PBY/.test(u) && /pencil_seen/.test(u)), 'Filter plan_id+action');
    ok(gets.some(u => /sort=-ts/.test(u)), 'sortiert nach ts absteigend');
    // keine Vormerkung mehr → kein Knopf
    g.state.assignmentStatuses['2027-06-01'].gl.status = 'confirmed';
    await g.crewNotify.renderCrewNotifyInto('host');
    ok(!h.host.innerHTML.includes('Vormerkung mitteilen'), 'kein Knopf ohne vorgemerkte Tage');
  } finally { h.restore(); }
});

test('admin.html: Aktivitäts-Labels für pencil_seen/declined/restored', () => {
  for (const k of ['pencil_seen', 'pencil_declined', 'pencil_restored'])
    ok(new RegExp(k + ':\\s*\\{ txt:').test(admin), k + ' fehlt in ACTIVITY_LABEL');
  ok(/hat die Vormerkung gesehen/.test(admin));
});
