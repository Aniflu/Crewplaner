// Hook v4.30: Mail-Regel „Liste oder Zählung" (mehr als 5 Einträge → nur Zählung), Einladung mit
// Status, keine Schreib-Knöpfe in Mails, email_log auch ohne RESEND_KEY.
//
// Der crew_invites-Mail-Hook wird aus .pb_hooks/main.pb.js herausgeschnitten und mit Attrappen
// ($os, $http, $app, Record) in Node ausgeführt (Muster tests/hookpencil.test.mjs). Abgefangen
// wird das fertige Mail-HTML, das an Resend gehen würde. Attrappen erfinden keine Felder, die
// der Hook nicht selbst liest.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

const von = hook.indexOf('onRecordAfterCreateSuccess(');
const bisMarke = "}, 'crew_invites');";
const bis = hook.indexOf(bisMarke, von);
ok(von >= 0 && bis > von, 'crew_invites-Mail-Hook nicht gefunden — Aufbau geändert?');
const src = hook.slice(von, bis + bisMarke.length);

// Führt den Hook für einen crew_invites-Datensatz aus; Rückgabe: {mails, logs}
function lauf(type, slots, { key = 'k', adminEmail = 'admin@x.de' } = {}) {
  let handler = null;
  const mails = [], logs = [];
  const felder = {
    crew_name: 'Wolf', crew_email: 'crew@x.de', type, plan_name: 'Sommertour', plan_id: 'PLAN1',
    app_url: typeof slots === 'string' ? slots : JSON.stringify(slots), custom_message: '',
  };
  const $os = { getenv: (k) => (k === 'RESEND_KEY' ? key : k === 'ADMIN_EMAIL' ? adminEmail : '') };
  const $http = { send: (o) => { mails.push({ ...JSON.parse(o.body), url: o.url }); return { statusCode: 200, raw: '' }; } };
  const $app = {
    findCollectionByNameOrId: (n) => ({ name: n }),
    save: (rec) => { logs.push(rec._werte); },
  };
  class Record { constructor(col) { this.col = col; this._werte = {}; } set(k, v) { this._werte[k] = v; } }
  // eslint-disable-next-line no-new-func — Testcode, Eingabe ist die repo-eigene Hook-Datei
  new Function('onRecordAfterCreateSuccess', '$os', '$http', '$app', 'Record', 'console', src)(
    (fn) => { handler = fn; }, $os, $http, $app, Record, { log() {}, error() {} });
  handler({ next() {}, record: { get: (k) => felder[k] } });
  return { mails, logs };
}

const TAGE = ['2027-05-13', '2027-05-14', '2027-05-15', '2027-05-16', '2027-05-17', '2027-05-18'];
const fuenf = (fn) => TAGE.slice(0, 5).map(fn);
const sechs = (fn) => TAGE.map(fn);
const DATEN5 = ['13.05.2027', '14.05.2027', '15.05.2027', '16.05.2027', '17.05.2027'];

function html(type, slots, opt) {
  const { mails } = lauf(type, slots, opt);
  eq(mails.length, 1, type + ': erwartet genau eine Mail');
  return mails[0].html;
}

const REGEL = 'mehr als 5 Einträge';
function pruefeFall(type, mk, tabellenText, zahlen) {
  const t5 = html(type, fuenf(mk));
  for (const d of DATEN5) ok(t5.includes(d), type + ' (5): ' + d + ' fehlt');
  ok(!t5.includes(REGEL), type + ' (5): Zählsatz steht bei 5 Einträgen');
  if (tabellenText) ok(t5.includes(tabellenText), type + ' (5): ' + tabellenText + ' fehlt');
  const t6 = html(type, sechs(mk));
  ok(t6.includes(REGEL), type + ' (6): Satz der Regel fehlt');
  ok(!/13\.05\.2027|2027-05-13/.test(t6), type + ' (6): Einzeldaten stehen in der Zählmail');
  for (const z of zahlen) ok(t6.includes(z), type + ' (6): Zählung „' + z + '" fehlt');
}

// ── invite ─────────────────────────────────────────────────────────────────────
const INV = (d, i) => ({ date: d, posLabel: 'Licht', status: i < 4 ? 'pencilled' : 'proposed' });

test('invite mit 5 Terminen zeigt Tabelle mit Statustexten', () => {
  const h = html('invite', fuenf(INV));
  for (const d of DATEN5) ok(h.includes(d), d + ' fehlt');
  ok(h.includes('Vorgemerkt – nur Info'), 'Statustext Vorgemerkt fehlt');
  ok(h.includes('Angefragt – bitte bestätigen'), 'Statustext Angefragt fehlt');
  ok(!h.includes(REGEL), 'Zählsatz bei 5 Einträgen');
});

test('invite mit 6 Terminen zeigt nur Zählung je Status', () => {
  const h = html('invite', sechs(INV));
  ok(h.includes(REGEL), 'Satz der Regel fehlt');
  ok(!/13\.05\.2027/.test(h), 'Einzeldaten in der Zählmail');
  ok(h.includes('✎ 4 vorgemerkt'), 'Zählung vorgemerkt: ' + h.slice(0, 0));
  ok(h.includes('⏳ 2 angefragt'), 'Zählung angefragt');
});

test('invite: alle Statustexte und Zählgruppen (confirmed, declined, pencil_declined)', () => {
  const h = html('invite', ['confirmed', 'declined', 'pencil_declined'].map((s, i) => ({ date: TAGE[i], posLabel: 'Ton', status: s })));
  ok(h.includes('Bestätigt'), 'Bestätigt fehlt');
  eq((h.match(/Abgesagt/g) || []).length, 2, 'declined und pencil_declined → „Abgesagt"');
  const z = html('invite', [...sechs((d) => ({ date: d, posLabel: 'Ton', status: 'confirmed' }))]);
  ok(z.includes('✅ 6 bestätigt'), 'Zählung bestätigt');
  const z2 = html('invite', sechs((d, i) => ({ date: d, posLabel: 'Ton', status: i < 3 ? 'declined' : 'pencil_declined' })));
  ok(z2.includes('✗ 6 abgesagt'), 'declined + pencil_declined zählen zusammen als abgesagt');
});

test('invite ohne angefragte Termine hat keinen Bestätigen-Satz', () => {
  const nur = html('invite', fuenf((d) => ({ date: d, posLabel: 'Licht', status: 'pencilled' })));
  ok(!nur.includes('in der App bestätigen oder absagen'), 'Satz steht ohne angefragte Termine');
  const mit = html('invite', fuenf(INV));
  ok(mit.includes('Bitte in der App bestätigen oder absagen.'), 'Satz fehlt bei angefragten Terminen');
});

test('invite: Status fehlt (ältere Aufrufer) → proposed', () => {
  const h = html('invite', [{ date: '2027-05-13', posLabel: 'Licht' }]);
  ok(h.includes('Angefragt – bitte bestätigen'), 'fehlender Status wird nicht als proposed behandelt');
  ok(h.includes('Bitte in der App bestätigen oder absagen.'), 'Bestätigen-Satz fehlt');
});

test('invite: einziger Knopf APP ÖFFNEN + Anleitung, kein Schreib-Link', () => {
  const h = html('invite', fuenf(INV));
  ok(/APP &Ouml;FFNEN/.test(h) && /ANLEITUNG/.test(h), 'Knöpfe fehlen');
  ok(!/BEST&Auml;TIGEN/.test(h), 'alter Bestätigen-Knopf steht noch da');
  ok(!/action=/.test(h), 'Aktions-Link in der Mail');
});

// ── update / cancellation / pencil_info / availability ────────────────────────
test('update: 5 → Tabelle, 6 → Zählung neu/entfernt/geändert', () => {
  const mk = (d, i) => (i === 0 ? { kind: 'removed', date: d, posLabel: 'Licht', aid: 'a' + i }
    : i === 1 ? { kind: 'status', to: 'pencilled', date: d, posLabel: 'Licht' }
      : { date: d, posLabel: 'Licht' });
  pruefeFall('update', mk, null, ['➕ 4 neu', '➖ 1 entfernt', '↻ 1 geändert']);
});

test('cancellation: 5 → Tabelle, 6 → Zählung', () =>
  pruefeFall('cancellation', (d) => ({ date: d, posLabel: 'Licht' }), 'Licht', ['✗ 6 Absagen']));

test('pencil_info: 5 → Tabelle, 6 → Zählung', () =>
  pruefeFall('pencil_info', (d) => ({ date: d, posLabel: 'Licht' }), 'Licht', ['✎ 6 vorgemerkt']));

test('availability: 5 → Tabelle, 6 → Zählung', () =>
  pruefeFall('availability', (d) => ({ date: d, posLabel: 'Licht' }), 'Licht', ['📋 6 Termine']));

// ── keine Schreib-Knöpfe in Mails (Quelltext) ─────────────────────────────────
test('ANFRAGE-Mail enthält kein action=confirm/decline, update-Mail kein action=ackcancel', () => {
  ok(!/action=(confirm|decline|ackcancel)/.test(hook), 'Schreib-Link action=… steht noch im Hook');
});

// ── email_log auch ohne RESEND_KEY ────────────────────────────────────────────
test('ohne RESEND_KEY entsteht email_log mit success skipped (und keine Mail)', () => {
  const { mails, logs } = lauf('invite', fuenf(INV), { key: '' });
  eq(mails.length, 0, 'ohne Key darf nichts an Resend gehen');
  eq(logs.length, 1, 'es fehlt die email_log-Zeile');
  eq(logs[0].success, 'skipped');
  eq(logs[0].email_type, 'invite');
  eq(logs[0].crew_email, 'crew@x.de');
});

test('mit RESEND_KEY bleibt success true', () => {
  const { logs } = lauf('invite', fuenf(INV));
  eq(logs[0].success, 'true');
});

// ── Fix v4.30: update-Mail mit der ECHTEN Nutzlast des Clients (_schlankeSlots) ─────────
import { loadGraph, resetState } from './_graph.mjs';

async function echteNutzlast(n) {
  const g = await loadGraph(); if (!g) return null;
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  g.plans.setActivePlanId('PLAN1'); localStorage.setItem('tourplan_pb_' + 'PLAN1', 'PLAN1');
  const slots = [];
  for (let i = 0; i < n; i++)
    slots.push({ kind: i % 2 ? 'removed' : 'status', to: 'pencilled', date: '2027-05-' + String(13 + i),
                 posId: 'lt', posLabel: 'Lichttechnik', aid: 'r' + i, changes: ['x'] });
  let gesendet = null;
  globalThis.fetch = async (url, opts) => {
    if ((opts && opts.method) === 'POST') gesendet = JSON.parse(opts.body || '{}');
    return { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1, id: 'r1' }) };
  };
  await g.dataService.sendUpdateNotice('Wolf', 'wolf@example.com', slots);
  return gesendet && gesendet.mailSlots;
}

test('update-Mail mit echter Client-Nutzlast: 5 → echte Daten, 6 → nur Zählung', async () => {
  const n5 = await echteNutzlast(5); if (!n5) return 'SKIP';
  const h5 = html('update', n5);
  ok(/13\.05\.2027/.test(h5) && /17\.05\.2027/.test(h5), '5 Einträge: echte Daten fehlen');
  ok(!h5.includes('–') && !h5.includes('&ndash;'), '5 Einträge: Platzhalter-Zeilen');
  const n6 = await echteNutzlast(6);
  ok(!n6.some((x) => x.date || x.posLabel), 'ab 6 muss die Nutzlast schlank bleiben');
  const h6 = html('update', n6);
  ok(h6.includes('mehr als 5 Einträge') && !/\d{2}\.05\.2027/.test(h6), '6 Einträge: nur Zählung');
});

test('update-Mail: fehlt irgendwo das Datum, gibt es nie leere Zeilen, sondern die Zählung', () => {
  const h = html('update', [{ date: '2027-05-13', posLabel: 'Licht' }, { kind: 'removed', aid: 'a1' }]);
  ok(!h.includes('&ndash;') && !/13\.05\.2027/.test(h), 'Tabelle mit Lücken statt Zählung');
  ok(h.includes('➕ 1 neu') && h.includes('➖ 1 entfernt'), 'Zählung fehlt');
});

test('invite: null-Element in der Terminliste wirft nicht', () => {
  const h = html('invite', [null, { date: '2027-05-13', posLabel: 'Licht', status: 'pencilled' }]);
  ok(h.includes('13.05.2027'), 'Mail wurde nicht gebaut');
});
