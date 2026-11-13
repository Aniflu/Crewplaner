// v1.3.0: EIN Einlade-Weg. Die Konsole (admin.html) ruft js/crewNotify.js auf; die frühere
// Inline-Logik (sendAdminInvite & Co.) ist gelöscht. Dieser Test hält fest,
//  (1) was der Hook pro Typ bekommt (Nutzlast, Feldmenge) — der Hook wird NICHT geändert,
//  (2) dass die planId der Plan ist, den die Konsole geladen hat (tourplan_pb_<lokaler Plan>),
//      nicht der Zeiger der Touransicht (tourplan_active_pb_id),
//  (3) dass die Konsole die Duplikate nicht mehr enthält.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = readFileSync(join(root, 'admin.html'), 'utf8');

test('admin.html: keine eigene Einlade-Logik mehr, die Karte ruft die Module', () => {
  for (const n of ['renderAdminNotify', 'sendAdminInvite', 'sendAdminEmail', 'sendAdminUpdate',
                   'openAdminCancellation', 'openEmailPreview', 'cancelSelectNext'])
    ok(!admin.includes(n), n + ' darf nicht mehr in admin.html stehen (zweiter Einlade-Weg)');
  ok(/renderCrewNotifyInto\('wrkCrewNotify'\)/.test(admin), 'Karte rendert die Einladeliste über das Modul');
  ok(!/notify\(\{\s*type:\s*(type|'invite'|'reminder'|'update'|'cancellation')/.test(admin),
     'admin.html baut keine eigene notify-Nutzlast für Einladung/Erinnerung/Update/Absage');
});

const INV = 'tourplan_crew_invites';
const CANC = 'tourplan_pending_cancellations';

async function setup() {
  const g = await loadGraph(); if (!g) return null;
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  const ls = globalThis.localStorage;
  ls.setItem('pb_token', 't');
  ls.removeItem(INV); ls.removeItem(CANC);
  // Touransicht zeigt auf X, die Konsole hat Y geladen (lokale ID pbplan_PBY).
  ls.setItem('tourplan_plans', JSON.stringify([{ id: 'pbplan_PBX', name: 'Plan X' }, { id: 'pbplan_PBY', name: 'Plan Y' }]));
  ls.setItem('tourplan_pb_pbplan_PBX', 'PBX');
  ls.setItem('tourplan_pb_pbplan_PBY', 'PBY');
  ls.setItem('tourplan_active_pb_id', 'PBX');
  g.plans.setActivePlanId('pbplan_PBY');
  const s = g.state;
  s.TOUR_DATES.push({ date: '2027-06-01', loc: 'Berlin', type: 'show', typeLabel: 'Show' },
                    { date: '2027-06-02', loc: 'Hamburg', type: 'show', typeLabel: 'Show' });
  s.POSITIONS.push({ id: 'gl', label: 'GL', short: 'GL' });
  s.crew.push('Anna');
  s.defaultCrew.gl = 'Anna';
  s.crewMeta['Anna'] = { email: 'anna@x.de' };
  return g;
}

function capture() {
  const posts = [];
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (/\/notify$/.test(String(url)) && m === 'POST') {
      posts.push(JSON.parse(opts.body));
      return { status: 200, ok: true, json: async () => ({ ok: true }) };
    }
    return { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };
  };
  return posts;
}

const keys = o => Object.keys(o).sort().join(',');

test('Einladung: Nutzlast trägt den Konsolen-Plan (PBY), nicht den Zeiger der Touransicht (PBX)', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  await cn.sendInvite('Anna', 'invite');
  eq(posts.length, 1, 'genau ein notify-POST');
  const b = posts[0];
  eq(b.type, 'invite'); eq(b.planId, 'PBY', 'planId ist der geladene Plan, nicht PBX');
  eq(b.crewName, 'Anna'); eq(b.crewEmail, 'anna@x.de');
  eq(keys(b), 'appUrl,crewEmail,crewName,planId,planName,slots,type', 'Feldmenge der Einladung');
  ok(/^Plan Y · 01\.06\.27–02\.06\.27$/.test(b.planName), 'planName mit Zeitraum: ' + b.planName);
  eq(b.slots.length, 2, 'alle eingeplanten, nicht bestätigten Termine (getVal inkl. defaultCrew)');
  eq(keys(b.slots[0]), 'crewEmail,crewName,date,dateLabel,loc,posId,posLabel', 'Feldmenge eines Slots');
  eq(b.slots[0].date, '2027-06-01'); eq(b.slots[0].posId, 'gl'); eq(b.slots[0].dateLabel, '01.06.2027');
});

test('Einladung: bestätigte Termine werden nicht erneut angefragt', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  g.state.assignmentStatuses['2027-06-01'] = { gl: { status: 'confirmed', crewName: 'Anna' } };
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  await cn.sendInvite('Anna', 'invite');
  eq(posts[0].slots.map(s => s.date).join(','), '2027-06-02');
});

test('Erinnerung: gleiche Nutzlast wie Einladung, type reminder, Plan PBY', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  await cn.sendInvite('Anna', 'reminder');
  eq(posts.length, 1);
  eq(posts[0].type, 'reminder'); eq(posts[0].planId, 'PBY');
  eq(keys(posts[0]), 'appUrl,crewEmail,crewName,planId,planName,slots,type');
});

test('Update: type update, proposedBy update, slots (schreiben) und mailSlots (schlank), Plan PBY', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  await cn.sendUpdate('Anna');
  eq(posts.length, 1);
  const b = posts[0];
  eq(b.type, 'update'); eq(b.planId, 'PBY'); eq(b.proposedBy, 'update');
  eq(keys(b), 'crewEmail,crewName,mailSlots,planId,planName,proposedBy,slots,type');
  eq(b.slots.length, 2, 'Schreib-Slots = neue Termine');
  ok(b.mailSlots.every(m => !('date' in m) && !('posLabel' in m)), 'mailSlots sind schlank (nur kind/to/aid)');
});

test('Update aus der Warteschlange (sendUpdateNotice): Plan PBY, Freitext nur wenn gesetzt', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  await g.dataService.sendUpdateNotice('Anna', 'anna@x.de', [{ kind: 'moved', to: 'X', aid: 'a1', date: 'zz' }], undefined, []);
  await g.dataService.sendUpdateNotice('Anna', 'anna@x.de', [{ kind: 'moved', aid: 'a1' }], 'Hallo', []);
  eq(posts.length, 2);
  eq(posts[0].planId, 'PBY');
  eq(keys(posts[0]), 'crewEmail,crewName,mailSlots,planId,planName,proposedBy,slots,type');
  eq(JSON.stringify(posts[0].mailSlots), '[{"kind":"moved","to":"X","aid":"a1"}]', 'nur kind/to/aid');
  eq(posts[1].customMessage, 'Hallo');
});

test('Absage aus der Sammelliste: removeSlots aus der Warteschlange, Plan PBY, Queue wird geleert', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  cn._storePendingCancellation('Anna', 'anna@x.de', '2027-06-01', 'GL');
  await cn.sendCancellationSummary('Anna');
  eq(posts.length, 1);
  const b = posts[0];
  eq(b.type, 'cancellation'); eq(b.planId, 'PBY');
  eq(keys(b), 'crewEmail,crewName,planId,planName,removeSlots,type');
  eq(JSON.stringify(b.removeSlots), '[{"date":"2027-06-01","posLabel":"GL"}]');
  eq(globalThis.localStorage.getItem(CANC), '{}', 'Queue geleert');
});

test('Absage aktiver Einsätze (aus der Konsole in das Modul gewandert): Nutzlast wie zuvor inline', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  await g.dataService.sendCancellationNotice('Anna', 'anna@x.de',
    [{ date: '2027-06-01', posId: 'gl', posLabel: 'GL' }]);
  await g.dataService.sendCancellationNotice('Anna', 'anna@x.de',
    [{ date: '2027-06-01', posId: 'gl', posLabel: 'GL' }], 'Sorry');
  eq(keys(posts[0]), 'crewEmail,crewName,planId,planName,removeSlots,type', 'ohne Freitext kein customMessage-Feld');
  eq(posts[0].planId, 'PBY');
  eq(JSON.stringify(posts[0].removeSlots), '[{"date":"2027-06-01","posId":"gl","posLabel":"GL"}]');
  eq(posts[1].customMessage, 'Sorry');
});

test('Absage aktiver Einsätze: Zeile der Person bietet 🚫 und die Funktionen sind auf window', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const cn = await import('../js/crewNotify.js');
  for (const f of ['openCancelSelect', 'closeCancelSelect', 'cxlAddManual', 'sendSelectedCancellation'])
    ok(typeof cn[f] === 'function', f + ' exportiert');
  const app = readFileSync(join(root, 'js/app.js'), 'utf8'), adm = readFileSync(join(root, 'js/admin-app.js'), 'utf8');
  for (const f of ['openCancelSelect', 'sendSelectedCancellation', 'cxlAddManual', 'closeCancelSelect'])
    ok(app.includes(f) && adm.includes(f), f + ' in app.js und admin-app.js verdrahtet');
});
