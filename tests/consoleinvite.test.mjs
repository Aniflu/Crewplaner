// v1.5.0: Konsole – „eingeladen“ aus email_log, Status-Zählung, Einladung mit ALLEN Terminen.
// Datenformen wie live (anonymisiert, „Provinz 2027“): Oliver 46 Termine alle pencilled (Position
// sys/System); Thomas 14 Termine ohne assignmentStatuses-Eintrag; email_log-Zeilen
// {plan_id, crew_name, crew_email, email_type, sent_at, success:'true'|'false'|'skipped'}.
import { test, ok, eq } from './_assert.mjs';
import { loadGraph, resetState } from './_graph.mjs';

const dayOf = i => { const d = new Date(Date.UTC(2027, 0, 1 + i)); return d.toISOString().slice(0, 10); };

async function setup({ oliver = 46, thomas = 14 } = {}) {
  const g = await loadGraph(); if (!g) return null;
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  const ls = globalThis.localStorage;
  ls.setItem('pb_token', 't');
  ls.setItem('tourplan_plans', JSON.stringify([{ id: 'pbplan_PBY', name: 'Provinz' }]));
  ls.setItem('tourplan_pb_pbplan_PBY', 'PBY');
  g.plans.setActivePlanId('pbplan_PBY');
  const s = g.state;
  const n = Math.max(oliver, thomas);
  for (let i = 0; i < n; i++) s.TOUR_DATES.push({ date: dayOf(i), loc: 'Ort', type: 'show', typeLabel: 'Show' });
  s.POSITIONS.push({ id: 'sys', label: 'System', short: 'SY' }, { id: 'tl', label: 'TL', short: 'TL' });
  s.crew.push('Oliver', 'Thomas');
  s.crewMeta['Oliver'] = { email: 'oliver@x.de' };
  s.crewMeta['Thomas'] = { email: 'thomas@x.de' };
  for (const k of Object.keys(s.assignments)) delete s.assignments[k];
  for (const k of Object.keys(s.defaultCrew)) delete s.defaultCrew[k];
  for (const k of Object.keys(s.assignmentStatuses)) delete s.assignmentStatuses[k];
  for (let i = 0; i < oliver; i++) {
    s.assignments[dayOf(i)] = { ...(s.assignments[dayOf(i)] || {}), sys: 'Oliver' };
    s.assignmentStatuses[dayOf(i)] = { sys: { status: 'pencilled', crewName: 'Oliver' } };
  }
  for (let i = 0; i < thomas; i++)
    s.assignments[dayOf(i)] = { ...(s.assignments[dayOf(i)] || {}), tl: 'Thomas' };   // kein Statuseintrag
  return g;
}

function capture(logRows, logFails = false) {
  const posts = [], logGets = [];
  globalThis.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET';
    if (/\/notify$/.test(String(url)) && m === 'POST') {
      posts.push(JSON.parse(opts.body));
      return { status: 200, ok: true, json: async () => ({ ok: true }) };
    }
    if (/email_log/.test(String(url))) {
      logGets.push(String(url));
      if (logFails) return { status: 403, ok: false, json: async () => ({ message: 'nein' }) };
      return { status: 200, ok: true, json: async () => ({ items: logRows, page: 1, perPage: 200, totalPages: 1 }) };
    }
    return { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };
  };
  return { posts, logGets };
}

function withEls(map, fn) {
  const orig = document.getElementById;
  document.getElementById = id => map[id] || orig.call(document, id);
  return Promise.resolve().then(fn).finally(() => { document.getElementById = orig; });
}

const row = (o) => ({ plan_id: 'PBY', crew_name: 'Oliver', crew_email: 'oliver@x.de', email_type: 'invite',
                      sent_at: '2026-07-01 10:00:00.000Z', success: 'true', ...o });

test('inviteStateFromLog: Adresse, Name-Ersatz, skipped zählt, success false und update zählen nicht', async () => {
  const g = await loadGraph(); if (!g) return 'SKIP';
  const f = g.crewNotify.inviteStateFromLog;
  eq(f([row({})], 'Oliver', 'OLIVER@x.de').at, '2026-07-01 10:00:00.000Z', 'Adresse, klein verglichen');
  // abweichende Adresse, gleicher Name → Name-Ersatz
  ok(f([row({ crew_email: 'alt@x.de' })], 'Oliver', 'oliver@x.de'), 'Name-Ersatz');
  // Adress-Treffer hat Vorrang: der jüngere Namens-Treffer (andere Adresse) zählt nicht
  eq(f([row({ crew_email: 'alt@x.de', sent_at: '2026-09-01 10:00:00.000Z' }), row({})], 'Oliver', 'oliver@x.de').at,
     '2026-07-01 10:00:00.000Z', 'Adresse vor Name');
  eq(f([row({ success: 'skipped' })], 'Oliver', 'oliver@x.de').skipped, true, 'skipped zählt');
  eq(f([row({ success: 'false' })], 'Oliver', 'oliver@x.de'), null, 'success false zählt nicht');
  eq(f([row({ email_type: 'update' })], 'Oliver', 'oliver@x.de'), null, 'update zählt nicht');
  eq(f([row({ crew_name: 'Anna', crew_email: 'anna@x.de' })], 'Oliver', 'oliver@x.de'), null, 'andere Person');
  eq(f([row({ sent_at: '2026-05-01 10:00:00.000Z' }), row({ sent_at: '2026-08-01 10:00:00.000Z' })], 'Oliver', 'oliver@x.de').at,
     '2026-08-01 10:00:00.000Z', 'jüngster');
});

test('Oliver-Fall: 46 vorgemerkte Termine → Vorschau 46, Senden schickt 46 × pencilled, slots leer', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const { posts } = capture([]);
  const cn = g.crewNotify;
  eq(JSON.stringify(cn.statusCounts('Oliver')), JSON.stringify({ pencilled: 46, proposed: 0, confirmed: 0, declined: 0 }));
  const body = { innerHTML: '' };
  await withEls({ sharedBody: body, sharedTitle: {}, sendPreviewText: { value: '' } }, async () => {
    cn.openInvitePreview('Oliver', 'invite');
    ok(body.innerHTML.includes('46 Termine'), 'Vorschau nennt 46 Termine');
    ok(body.innerHTML.includes('Es gibt mehr als 5 Einträge'), 'über 5: Zählung statt Einzeldaten');
    ok(!body.innerHTML.includes('<table'), 'keine Einzelzeilen über 5');
    await cn.confirmSendPreview();
  });
  eq(posts.length, 1);
  eq(posts[0].mailSlots.length, 46); ok(posts[0].mailSlots.every(m => m.status === 'pencilled' && m.posId === 'sys' && m.posLabel === 'System' && m.date));
  eq(posts[0].slots.length, 0, 'nichts ohne Datensatz → nichts wird angefragt');
  eq(g.state.assignmentStatuses[dayOf(0)].sys.status, 'pencilled', 'Status bleibt');
});

test('Thomas-Fall: 14 Termine ohne Status → slots 14, mailSlots 14 × proposed, lokal angefragt', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  const { posts } = capture([]);
  await g.crewNotify.sendInvite('Thomas', 'invite');
  eq(posts[0].slots.length, 14); eq(posts[0].mailSlots.length, 14);
  ok(posts[0].mailSlots.every(m => m.status === 'proposed' && m.posId === 'tl'));
  eq(g.state.assignmentStatuses[dayOf(0)].tl.status, 'proposed');
});

test('bis 5 Termine zeigt die Vorschau Datum · Position · Status', async () => {
  const g = await setup({ oliver: 3, thomas: 0 }); if (!g) return 'SKIP';
  capture([]);
  const body = { innerHTML: '' };
  await withEls({ sharedBody: body, sharedTitle: {} }, async () => { g.crewNotify.openInvitePreview('Oliver', 'invite'); });
  ok(body.innerHTML.includes('<table') && body.innerHTML.includes('✎ vorgemerkt'), 'Tabelle mit Status');
});

test('0 Termine → Einladen-Knopf disabled mit Hinweis, kein notify-Aufruf', async () => {
  const g = await setup({ oliver: 46, thomas: 0 }); if (!g) return 'SKIP';
  const { posts } = capture([]);
  const host = { innerHTML: '' };
  await withEls({ h: host }, () => g.crewNotify.renderCrewNotifyInto('h'));
  const t = host.innerHTML.slice(host.innerHTML.indexOf('Thomas'));
  ok(/<button[^>]*disabled[^>]*>📧 Einladen \(0 Termine\)/.test(t), 'Knopf disabled');
  ok(t.includes('Keine Termine in der Tabelle'), 'Hinweis');
  await g.crewNotify.sendInvite('Thomas', 'invite');
  eq(posts.length, 0, 'sendInvite sendet nichts');
});

test('Badge aus Log: Eingeladen am 01.07.2026; skipped mit Test-Zusatz; Ladefehler → Status unbekannt', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  let host = { innerHTML: '' };
  let c = capture([row({})]);
  await withEls({ h: host }, () => g.crewNotify.renderCrewNotifyInto('h'));
  ok(host.innerHTML.includes('📧 Eingeladen am 01.07.2026'), 'Badge');
  ok(host.innerHTML.includes('Erneut einladen (46)'), 'Knopf Erneut einladen');
  ok(host.innerHTML.includes('Noch nicht eingeladen'), 'Thomas steht auf Noch nicht eingeladen');
  ok(host.innerHTML.includes('Einladen (14 Termine)'), 'Knopf mit Terminzahl');
  ok(/sort=-sent_at|sent_at/.test(decodeURIComponent(c.logGets[0])) && !/-created/.test(c.logGets[0]), 'Sortierung nach sent_at');
  ok(/plan_id/.test(decodeURIComponent(c.logGets[0])) && decodeURIComponent(c.logGets[0]).includes('PBY'), 'Filter plan_id');

  host = { innerHTML: '' }; capture([row({ success: 'skipped' })]);
  await withEls({ h: host }, () => g.crewNotify.renderCrewNotifyInto('h'));
  ok(host.innerHTML.includes('Test – nicht versendet'), 'skipped-Zusatz');

  host = { innerHTML: '' }; capture([], true);
  const w = console.warn; console.warn = () => {};
  try { await withEls({ h: host }, () => g.crewNotify.renderCrewNotifyInto('h')); } finally { console.warn = w; }
  ok(host.innerHTML.includes('❔ Status unbekannt'), 'Ladefehler');
  ok(!host.innerHTML.includes('Noch nicht eingeladen'), 'keine falsche Aussage bei Ladefehler');
});

test('Zählzeile: nur Arten > 0 (Oliver „✎ 46 vorgemerkt“, kein ⏳/✅/✗)', async () => {
  const g = await setup(); if (!g) return 'SKIP';
  capture([]);
  const host = { innerHTML: '' };
  await withEls({ h: host }, () => g.crewNotify.renderCrewNotifyInto('h'));
  const o = host.innerHTML.slice(host.innerHTML.indexOf('Oliver'), host.innerHTML.indexOf('Thomas'));
  ok(o.includes('✎ 46 vorgemerkt'), 'vorgemerkt');
  ok(!o.includes('angefragt') && !o.includes('bestätigt') && !o.includes('abgesagt'), 'keine leeren Arten');
  g.state.assignmentStatuses[dayOf(0)].sys.status = 'pencil_declined';
  eq(g.crewNotify.statusCounts('Oliver').declined, 1, 'pencil_declined zählt zu abgesagt');
});

test('buildInvitePayload: cancelled zählt als „kein aktiver Datensatz“, declined bleibt unberührt', async () => {
  const g = await setup({ oliver: 3, thomas: 0 }); if (!g) return 'SKIP';
  g.state.assignmentStatuses[dayOf(0)].sys.status = 'cancelled';
  g.state.assignmentStatuses[dayOf(1)].sys.status = 'declined';
  const p = g.crewNotify.buildInvitePayload('Oliver', 'oliver@x.de');
  eq(p.mailSlots.map(m => m.status).join(','), 'proposed,declined,pencilled');
  eq(p.slots.map(s => s.date).join(','), dayOf(0));
});
