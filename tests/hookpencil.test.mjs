// Hook v4.29 (Vormerkung als Information): das Verhalten der neuen Regeln, nicht nur ihre Form.
//
// Hook-Code läuft in Goja, nicht in Node. Hier werden die betreffenden Stücke aus der Datei
// geschnitten und mit kleinen Attrappen ($app, e) ausgeführt — Attrappen erfinden keine Felder,
// die der Hook nicht selbst liest. Dass der Hook auf dem Server wirkt, zeigt erst die Abnahme
// auf Test (docs/admin-auftrag-hook-v4.29.md).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

// ── Statuswächter (Update-Request-Handler auf assignments) ────────────────────
const tStart = hook.indexOf('var CREW_STATUS_TRANSITIONS');
const hStart = hook.lastIndexOf('onRecordUpdateRequest(', tStart);
const hEnd   = hook.indexOf("}, 'assignments');", tStart);
const guardSrc = hook.slice(hStart, hEnd + "}, 'assignments');".length);

function guard(alt, neu) {
  let handler = null;
  class BadRequestError extends Error {}
  const $app = { findRecordById: () => ({ getString: () => 'anderer-owner' }) };
  const onRecordUpdateRequest = (fn) => { handler = fn; };
  // eslint-disable-next-line no-new-func — Testcode, Eingabe ist die repo-eigene Hook-Datei
  new Function('onRecordUpdateRequest', 'BadRequestError', '$app', 'console', guardSrc)(
    onRecordUpdateRequest, BadRequestError, $app, { log() {}, error() {} });
  const auth = { id: 'u1', getString: (k) => (k === 'email' ? 'crew@x.de' : k === 'role' ? 'crew' : '') };
  const rec = {
    id: 'a1',
    get: (k) => (k === 'status' ? neu : k === 'crew_email' ? 'crew@x.de' : 'PLAN1'),
    original: () => ({ get: () => alt }),
  };
  let weiter = false;
  try { handler({ auth, record: rec, next: () => { weiter = true; } }); }
  catch (err) { return err instanceof BadRequestError ? 'abgelehnt' : 'FEHLER ' + err; }
  return weiter ? 'erlaubt' : 'nichts';
}

test('Hook-Wächter: Absage einer Vormerkung (neu pencil_declined, alt declined) wird angenommen', () => {
  eq(guard('pencilled', 'pencil_declined'), 'erlaubt');
  eq(guard('pencilled', 'declined'), 'erlaubt');
});

test('Hook-Wächter: eigene Vormerkungs-Absage zurücknehmen geht', () =>
  eq(guard('pencil_declined', 'pencilled'), 'erlaubt'));

test('Hook-Wächter: declined → pencilled und pencil_declined → confirmed lehnt der Hook ab', () => {
  eq(guard('declined', 'pencilled'), 'abgelehnt');
  eq(guard('pencil_declined', 'confirmed'), 'abgelehnt');
  eq(guard('pencilled', 'confirmed'), 'abgelehnt');
  eq(guard('confirmed', 'pencilled'), 'abgelehnt');
});

// ── /notify: Vormerkung bleibt Vormerkung ─────────────────────────────────────
const route = (hook.split("routerAdd('POST', '/notify'")[1] || '').split('routerAdd(')[0];
const vStart = route.indexOf('var VORMERK');
const vEnd   = route.indexOf('slots = offen;') + 'slots = offen;'.length + route.slice(route.indexOf('slots = offen;') + 14).search(/\}/) + 1;
const filterSrc = route.slice(vStart, vEnd);

function filtere(statusJeSlot, slots, typ = 'reminder') {   // v4.30: invite hat eigene Regeln (hooknotifyinvite)
  const $app = {
    findFirstRecordByFilter: (_c, _f, p) => {
      const st = statusJeSlot[p.d + '|' + p.q];
      if (!st) throw new Error('not found');
      return { getString: () => st };
    },
  };
  // eslint-disable-next-line no-new-func
  return new Function('$app', 'planId', 'slots', 'typ', 'body', 'e', filterSrc + '; return slots;')($app, 'PLAN1', slots, typ, {}, {});
}

test('/notify: vorgemerkte und vorgemerkt-abgesagte Tage kommen nicht in die Slot-Liste', () => {
  const slots = [
    { date: '2027-06-01', posId: 'gl' },   // vorgemerkt   → raus
    { date: '2027-06-02', posId: 'gl' },   // pencil_declined → raus
    { date: '2027-06-03', posId: 'gl' },   // angefragt    → bleibt
    { date: '2027-06-04', posId: 'gl' },   // ohne Record  → bleibt
  ];
  const rest = filtere({
    '2027-06-01|gl': 'pencilled', '2027-06-02|gl': 'pencil_declined', '2027-06-03|gl': 'proposed',
  }, slots);
  eq(rest.map((s) => s.date).join(','), '2027-06-03,2027-06-04');
});

test('/notify: der Filter steht VOR der Mail-Liste und der Schreibschleife, plus Absicherung in der Transaktion', () => {
  const f = route.indexOf('var VORMERK');
  ok(f > -1 && f < route.indexOf('var liste = []'), 'Filter muss vor der Mail-Liste stehen');
  ok(f < route.indexOf('runInTransaction'), 'Filter muss vor dem Schreiben stehen');
  ok(/if \(da && SPERRE\[da\.getString\('status'\)\]\) continue;/.test(route),
     'Absicherung gegen Wettlauf in der Transaktion fehlt');
  ok(route.indexOf("r.set('status', 'proposed')") > route.indexOf('if (da && SPERRE['),
     'proposed darf erst nach der Vormerk-Prüfung gesetzt werden');
});

test('/notify: pencil_info ist eingetragen, schreibt aber keine Slots und löscht nichts', () => {
  ok(/pencil_info:\s*\{ wer: 'owner', slots: false, loeschen: false \}/.test(route),
     "pencil_info muss owner-only sein und weder Slots schreiben noch löschen");
});

test('Mail-Hook: Vorlage pencil_info hat den Spec-Text, keinen Bestätigen-Knopf', () => {
  const b = hook.slice(hook.indexOf("type === 'pencil_info'"), hook.indexOf('catch(outerErr)'));
  ok(b.includes('Vormerkung – nur Information · '), 'Betreff');
  ok(/keine Anfrage/.test(b) && /Halte dir die Tage bitte frei/.test(b), 'Kerntext');
  ok(/sag bitte in der App ab/.test(b), 'Absage-Hinweis');
  ok(!/BESTÄTIGEN|confirmUrl/i.test(b), 'kein Bestätigen-Knopf');
});

test('Admin-Mail: pencil_declined → VORMERKUNG ABGESAGT, Rücknahme → VORMERKUNG WIEDER FREI, ABGELEHNT nur bei declined', () => {
  ok(/status === 'pencil_declined'\)[\s\S]{0,200}mBetreff = 'VORMERKUNG ABGESAGT'/.test(hook));
  ok(/vorher !== 'pencil_declined'\) return;[\s\S]{0,120}mBetreff = 'VORMERKUNG WIEDER FREI'/.test(hook));
  ok(/status === 'declined'\) \{\s*mBetreff = 'ABGELEHNT'/.test(hook));
});

test('/planstatus filtert pencil_declined nicht weg (die Crew muss zurücknehmen können)', () => {
  const p = hook.split("routerAdd('GET', '/planstatus/{id}'")[1].split('routerAdd(')[0];
  const f = p.match(/'plan_id = \{:p\} && status != [^']*'/)[0];
  ok(!/pencil_declined|pencilled/.test(f), 'Filter darf Vormerk-Stati nicht ausschließen: ' + f);
});

// ── Review-Fixes (Runde 1) ────────────────────────────────────────────────────
const mIdx = hook.indexOf('var mBetreff');
const aStart = hook.lastIndexOf('onRecordAfterUpdateSuccess(', mIdx);
const aEnd = hook.indexOf("}, 'assignments');", mIdx) + "}, 'assignments');".length;
const afterSrc = hook.slice(aStart, aEnd);

function nachUpdate(alt, neu) {
  let handler = null; let mails = 0;
  const env = { RESEND_KEY: 'k', ADMIN_EMAIL: 'admin@example.invalid' };
  const $http = { send: () => { mails++; return { statusCode: 200 }; } };
  const rec = {
    id: 'a1',
    get: (k) => ({ status: neu, date: '2027-06-01', pos_id: 'gl', pos_label: 'GL', crew_name: 'Max', crew_email: 'm@example.invalid' }[k]),
    original: () => ({ get: () => alt }),
  };
  // eslint-disable-next-line no-new-func
  new Function('onRecordAfterUpdateSuccess', '$os', '$http', 'console', afterSrc)(
    (fn) => { handler = fn; }, { getenv: (k) => env[k] }, $http, { log() {}, error() {} });
  handler({ next() {}, record: rec });
  return mails;
}

test('Admin-Mail: erneutes Speichern ohne Statuswechsel mailt NICHT noch einmal', () => {
  eq(nachUpdate('pencil_declined', 'pencil_declined'), 0, 'pencil_declined unverändert');
  eq(nachUpdate('declined', 'declined'), 0, 'declined unverändert');
});

test('Admin-Mail: ein echter Wechsel mailt genau einmal', () => {
  eq(nachUpdate('pencilled', 'pencil_declined'), 1);
  eq(nachUpdate('proposed', 'declined'), 1);
  eq(nachUpdate('pencil_declined', 'pencilled'), 1);
  eq(nachUpdate('pencilled', 'pencilled'), 0);
});

// fmtISO beider Kopien
test('fmtISO: nur echte ISO-Daten, alles andere wird maskiert', () => {
  const kopien = [...hook.matchAll(/var fmtISO = function\(s\) \{[\s\S]*?\n  \};/g)].map((m) => m[0]);
  eq(kopien.length, 2, 'beide Kopien');
  for (const k of kopien) {
    // eslint-disable-next-line no-new-func
    const f = new Function('esc', k + '; return fmtISO;')((x) => String(x || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    eq(f('2027-06-01'), '01.06.2027');
    eq(f('2027-06-01<img src=x>'), '2027-06-01&lt;img src=x&gt;');
    eq(f('<b>-01-02'), '&lt;b&gt;-01-02');
  }
});

// /notify: mailSlots-Filter, Skip, pencil_info
function notify(body, statusJe) {
  const rs = route;
  const start = rs.indexOf('var VORMERK');
  const ende = rs.indexOf("return e.string(400, 'mailSlots fehlen');") + "return e.string(400, 'mailSlots fehlen');".length;
  const src = rs.slice(start, ende);
  const $app = {
    findFirstRecordByFilter: (_c, _f, p) => {
      const st = statusJe[p.d + '|' + p.q];
      if (!st) throw new Error('nf');
      return { getString: (k) => (k === 'status' ? st : 'GL') };
    },
  };
  const antworten = [];
  const e = { string: (c, t) => { antworten.push([c, t]); return antworten.length; } };
  const slots = Array.isArray(body.slots) ? body.slots : [];
  // eslint-disable-next-line no-new-func
  const fn = new Function('$app', 'e', 'body', 'typ', 'planId', 'slots',
    'return (function(){ ' + src + '\n return {slots: slots}; })();');
  const r = fn($app, e, body, body.type, 'PLAN1', slots);
  return { r, antworten, body };
}

test('/notify: mailSlots werden wie slots um Vormerkungen bereinigt (v4.30: reminder, invite filtert nicht mehr)', () => {
  const body = { type: 'reminder', slots: [{ date: '2027-06-01', posId: 'gl', posLabel: 'GL' }, { date: '2027-06-02', posId: 'gl', posLabel: 'GL' }],
    mailSlots: [{ date: '2027-06-01', posLabel: 'GL' }, { date: '2027-06-02', posLabel: 'GL' }] };
  const { body: b } = notify(body, { '2027-06-01|gl': 'pencilled' });
  eq(b.mailSlots.map((m) => m.date).join(','), '2027-06-02');
});

test('/notify: Erinnerung, deren einziger Tag vorgemerkt ist → 200 skipped, keine Mail (v4.30: nicht mehr invite)', () => {
  const body = { type: 'reminder', slots: [{ date: '2027-06-01', posId: 'gl' }], mailSlots: [{ date: '2027-06-01', posLabel: 'GL' }] };
  const { antworten } = notify(body, { '2027-06-01|gl': 'pencil_declined' });
  eq(antworten.length, 1);
  eq(antworten[0][0], 200);
  ok(/keine Termine/.test(antworten[0][1]));
});

test('/notify: pencil_info ohne mailSlots → 400', () => {
  eq(notify({ type: 'pencil_info' }, {}).antworten[0][0], 400);
  eq(notify({ type: 'pencil_info', mailSlots: [] }, {}).antworten[0][0], 400);
  eq(notify({ type: 'pencil_info', mailSlots: [{ date: '2027-06-01', posLabel: 'GL' }] }, {}).antworten.length, 0);
});

test('/notify update: Statuszeile (kind status, to pencilled) auf vorgemerktem Datensatz bleibt in der Mail', () => {
  const body = { type: 'update', slots: [{ date: '2027-06-01', posId: 'gl' }, { date: '2027-06-02', posId: 'gl' }],
    mailSlots: [{ kind: 'status', to: 'pencilled', date: '2027-06-01', posLabel: 'GL' },
                { kind: 'removed', aid: 'x', date: '2027-06-01', posLabel: 'GL' },
                { date: '2027-06-01', posLabel: 'GL' }, { date: '2027-06-02', posLabel: 'GL' }] };
  const { body: b } = notify(body, { '2027-06-01|gl': 'pencilled' });
  eq(b.mailSlots.map((m) => (m.kind || 'neu') + ':' + m.date).join(','),
     'status:2027-06-01,removed:2027-06-01,neu:2027-06-02');
});
