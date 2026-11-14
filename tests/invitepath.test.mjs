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

const INV = 'tourplan_crew_invites_PBY';   // v1.3.0: je Plan
const CANC = 'tourplan_pending_cancellations_PBY';

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
  // v1.5.0: bis 5 Einträge gehen date/posLabel mit (Tabelle in der Mail); darüber schlank (siehe hookmail.test.mjs)
  ok(b.mailSlots.length <= 5 || b.mailSlots.every(m => !('date' in m) && !('posLabel' in m)), 'mailSlots über 5 sind schlank');
});

test('Update aus der Warteschlange (sendUpdateNotice): Plan PBY, Freitext nur wenn gesetzt', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  await g.dataService.sendUpdateNotice('Anna', 'anna@x.de', [{ kind: 'moved', to: 'X', aid: 'a1', date: 'zz' }], undefined, []);
  await g.dataService.sendUpdateNotice('Anna', 'anna@x.de', [{ kind: 'moved', aid: 'a1' }], 'Hallo', []);
  eq(posts.length, 2);
  eq(posts[0].planId, 'PBY');
  eq(keys(posts[0]), 'crewEmail,crewName,mailSlots,planId,planName,proposedBy,slots,type');
  eq(JSON.stringify(posts[0].mailSlots), '[{"kind":"moved","to":"X","aid":"a1","date":"zz"}]', 'kind/to/aid + date (<= 5, v1.5.0)');
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

// ── Fix-Runde 1: Vorschau mit Freitext, Erinnerung, Queue-Schlüssel ───────────────
// Freitext geht als `customMessage` an den Hook — derselbe Feldname wie in der alten
// Konsolen-Logik (git show be0cdd2:admin.html, openEmailPreview/sendAdmin*). Ohne Freitext fehlt
// das Feld ganz (nicht leer), wie zuvor.
test('Freitext: customMessage in Einladung, Erinnerung, Update und Absage (Feldname festgenagelt)', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  await cn.sendInvite('Anna', 'invite', 'Hallo A');
  await cn.sendInvite('Anna', 'reminder', 'Hallo B');
  Object.keys(g.state.assignmentStatuses).forEach(k => delete g.state.assignmentStatuses[k]);  // Einladung hat sie angefragt
  await cn.sendUpdate('Anna', 'Hallo C');
  await g.dataService.sendCancellationNotice('Anna', 'anna@x.de', [{ date: '2027-06-01', posId: 'gl', posLabel: 'GL' }], 'Hallo D');
  eq(posts.map(p => p.type).join(','), 'invite,reminder,update,cancellation');
  eq(posts.map(p => p.customMessage).join(','), 'Hallo A,Hallo B,Hallo C,Hallo D', 'Feldname customMessage');
  ok(posts.every(p => p.planId === 'PBY'));
});

function withEls(map, fn) {
  const orig = document.getElementById;
  document.getElementById = id => map[id] || orig.call(document, id);
  return Promise.resolve().then(fn).finally(() => { document.getElementById = orig; });
}

test('Vorschau: Abbrechen sendet nichts, Senden schickt den Freitext aus dem Feld', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  const ta = { value: '  Bitte kurz melden  ' };
  await withEls({ sendPreviewText: ta }, async () => {
    cn.openInvitePreview('Anna', 'invite');
    cn.closeSendPreview();
    eq(posts.length, 0, 'Abbrechen: kein POST');
    cn.openInvitePreview('Anna', 'invite');
    await cn.confirmSendPreview();
    eq(posts.length, 1, 'Senden: genau ein POST');
    eq(posts[0].customMessage, 'Bitte kurz melden', 'Freitext getrimmt im Feld customMessage');
    ta.value = '';
    Object.keys(g.state.assignmentStatuses).forEach(k => delete g.state.assignmentStatuses[k]);
    cn.openUpdatePreview('Anna');
    await cn.confirmSendPreview();
    eq(posts.length, 2);
    ok(!('customMessage' in posts[1]), 'leerer Freitext: Feld fehlt');
    eq(posts[1].type, 'update');
  });
});

test('Liste: Erinnerung für eingeladene Person auch bei neuen Terminen (Update zusätzlich)', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  globalThis.localStorage.setItem(INV, JSON.stringify({ Anna: new Date().toISOString() }));
  g.state.assignmentStatuses['2027-06-01'] = { gl: { status: 'proposed', crewName: 'Anna' } };  // 06-02 ist neu
  const host = { innerHTML: '' };
  const cn = await import('../js/crewNotify.js');
  await withEls({ hostX: host }, () => cn.renderCrewNotifyInto('hostX'));
  ok(host.innerHTML.includes('Erinnerung'), 'Erinnerung fehlt');
  ok(/Update \(1\)/.test(host.innerHTML), 'Update fehlt');
  ok(host.innerHTML.includes('openInvitePreview') && !/onclick="sendInvite\(/.test(host.innerHTML), 'Knöpfe öffnen die Vorschau');
});

test('Update-Liste der Konsole: Schlüssel crewplan_updates_<PB-ID> (PBY), nicht die lokale ID', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  resetState(g); g.planSync.clearPlanBases();
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  const ls = globalThis.localStorage; ls.clear();
  ls.setItem('pb_token', 't');
  ls.setItem('tourplan_plans', JSON.stringify([{ id: 'pbplan_PBX', name: 'X' }]));
  ls.setItem('tourplan_pb_pbplan_PBX', 'PBX'); ls.setItem('tourplan_active_pb_id', 'PBX');
  g.plans.setActivePlanId('pbplan_PBX');
  const planY = { version: 3, crew: ['Anna'], positions: [{ id: 'gl', label: 'GL', short: 'GL' }], defaultCrew: {},
    tourDates: [{ date: '2027-06-01', loc: 'Berlin', type: 'show', typeLabel: 'Show' }], assignments: {} };
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const m = String(url).match(/plans\/records\/([^/?]+)$/);
    const b = m ? { id: m[1], name: 'Y', plan_data: JSON.stringify(planY) } : { items: [] };
    return { ok: true, status: 200, json: async () => b };
  };
  try {
    const cp = await import('../js/consoleplan.js');
    ok(await cp.activateConsolePlan('PBY', 'Y'));
    g.userView._queueRemovedSlot('Anna', 'anna@x.de', '2027-06-01', 'gl', 'GL', 'aid1');
    ok(ls.getItem('crewplan_updates_PBY'), 'Eintrag liegt unter crewplan_updates_PBY');
    ok(!ls.getItem('crewplan_updates_pbplan_PBY'), 'nicht unter der lokalen ID');
    ok(!ls.getItem('crewplan_updates_PBX'), 'nicht beim vorher aktiven Plan');
    const body = { innerHTML: '' };
    await withEls({ crewUpdateModalBody: body }, () => g.userView._openUpdateQueueModal());
    ok(body.innerHTML.includes('Anna'), 'Modal liest die Queue von PBY');
  } finally { globalThis.fetch = orig; }
});

// ── Review-Funde v1.3.0 (M3, M5, M6) ────────────────────────────────────────────────
function toastEl(log) {
  return { style: {}, set textContent(v) { log.push(v); }, get textContent() { return log[log.length - 1] || ''; } };
}

test('M3: eine für Plan X vorgemerkte Absage ist in Plan Y nicht sichtbar und wird dort nicht gesendet', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  g.plans.setActivePlanId('pbplan_PBX');
  cn._storePendingCancellation('Anna', 'anna@x.de', '2027-06-01', 'GL');          // im Tab von Plan X vorgemerkt
  eq(globalThis.localStorage.getItem('tourplan_pending_cancellations_PBX') !== null, true, 'liegt unter dem Schlüssel von X');
  g.plans.setActivePlanId('pbplan_PBY');
  await cn.sendCancellationSummary('Anna');
  eq(posts.length, 0, 'für Plan Y wird nichts gesendet');
  g.plans.setActivePlanId('pbplan_PBX');
  await cn.sendCancellationSummary('Anna');
  eq(posts.length, 1, 'in Plan X ist sie da');
  eq(posts[0].planId, 'PBX');
});

test('M5: Person ohne eingeplante Termine — keine Vorschau, Hinweis statt Versand', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  g.state.crewMeta['Bob'] = { email: 'bob@x.de' };      // in der Crew, aber nirgends eingeplant
  const cn = await import('../js/crewNotify.js');
  const log = []; const body = { innerHTML: '' };
  await withEls({ toast: toastEl(log), sharedBody: body, sharedTitle: {} }, async () => {
    cn.openInvitePreview('Bob', 'invite');
    cn.openInvitePreview('Bob', 'reminder');
  });
  eq(body.innerHTML, '', 'keine Vorschau geöffnet');
  ok(log.includes('Keine eingeplanten Termine'), 'Hinweis „Keine eingeplanten Termine": ' + JSON.stringify(log));
});

test('M6: schlägt der Versand mit 429 fehl, bleibt die konkrete Meldung stehen', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  globalThis.fetch = async (url, opts) => ((opts && opts.method) === 'POST')
    ? { status: 429, ok: false, json: async () => ({ message: 'Too many requests.' }) }
    : { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };
  const cn = await import('../js/crewNotify.js');
  const log = []; const w = console.warn; console.warn = () => {};
  try {
    await withEls({ toast: toastEl(log), sendPreviewText: { value: '' }, sharedBody: { innerHTML: '' }, sharedTitle: {} }, async () => {
      cn.openInvitePreview('Anna', 'invite');
      await cn.confirmSendPreview();
    });
  } finally { console.warn = w; }
  ok(log.length > 0, 'es gab eine Meldung');
  ok(/halbe Minute/.test(log[log.length - 1]), 'letzte Meldung ist die 429-Erklärung, war: ' + log[log.length - 1]);
});

// ── Übernahme alter globaler Schlüssel beim Lesen (M3-Nachtrag) ─────────────────────────
test('Migration Einlade-Vermerk: Plan mit Anna übernimmt ihn (→ Erinnerung), Plan ohne Anna nicht', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const ls = globalThis.localStorage;
  ls.setItem('tourplan_crew_invites', JSON.stringify({ Anna: '2027-01-01T00:00:00.000Z' }));
  g.state.assignmentStatuses['2027-06-01'] = { gl: { status: 'proposed', crewName: 'Anna' } };
  const cn = await import('../js/crewNotify.js');
  // Plan Y OHNE Anna in der Crew
  const crewBak = g.state.crew.splice(0);
  await withEls({ hostY: { innerHTML: '' } }, () => cn.renderCrewNotifyInto('hostY'));
  eq(ls.getItem('tourplan_crew_invites_PBY'), null, 'Plan ohne Anna übernimmt nichts');
  g.state.crew.push(...crewBak);
  const host = { innerHTML: '' };
  await withEls({ hostX: host }, () => cn.renderCrewNotifyInto('hostX'));
  ok(JSON.parse(ls.getItem('tourplan_crew_invites_PBY')).Anna, 'Vermerk im Plan-Schlüssel');
  ok(host.innerHTML.includes('Erinnerung') && !host.innerHTML.includes('data-type="invite"'), 'Anna gilt als eingeladen (kein Doppel-Einladen)');
});

test('Migration offene Absage: erscheint einmal im Plan mit dem Datum, fehlt global und im anderen Plan', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const ls = globalThis.localStorage;
  ls.setItem('tourplan_pending_cancellations', JSON.stringify({
    Anna: { email: 'anna@x.de', slots: [{ date: '2027-06-01', posLabel: 'GL' }] },
    Fremd: { email: 'f@x.de', slots: [{ date: '2027-06-01', posLabel: 'GL' }] } }));   // Fremd ist nicht in der Crew
  const posts = capture();
  const cn = await import('../js/crewNotify.js');
  g.plans.setActivePlanId('pbplan_PBX');
  g.state.TOUR_DATES.length = 0; g.state.TOUR_DATES.push({ date: '2027-06-01', loc: 'B', type: 'show', typeLabel: 'Show' });
  await cn.sendCancellationSummary('Anna');
  eq(posts.length, 1, 'einmal gesendet');
  eq(posts[0].planId, 'PBX');
  eq(JSON.stringify(posts[0].removeSlots), '[{"date":"2027-06-01","posLabel":"GL"}]');
  const rest = JSON.parse(ls.getItem('tourplan_pending_cancellations'));
  ok(!rest.Anna, 'Anna aus dem globalen Schlüssel entfernt');
  ok(rest.Fremd, 'Rest bleibt global liegen');
  g.plans.setActivePlanId('pbplan_PBY');
  await cn.sendCancellationSummary('Anna');
  eq(posts.length, 1, 'in Plan Y kein zweites Mal');
});
