// Hook v4.30: /notify Typ invite teilt Status mit, ändert ihn nicht.
// Das Route-Stück wird aus .pb_hooks/main.pb.js geschnitten und mit Attrappen ausgeführt.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
const route = (hook.split("routerAdd('POST', '/notify'")[1] || '').split('routerAdd(')[0];
const start = route.indexOf('var VORMERK');
const ende = route.indexOf("var angelegt = 0");
const vorTx = route.slice(start, ende);
const txStart = route.indexOf("var col = tx.findCollectionByNameOrId('assignments');");
const txEnde = route.indexOf("for (var k = 0; k < weg.length");
const schreibSrc = route.slice(txStart, txEnde);

// statusJe: { 'datum|posId': status }; liefert Antworten, gespeicherte Datensätze, Nutzlast
function lauf(body, statusJe) {
  const gespeichert = [];
  const find = (_c, _f, p) => {
    const st = statusJe[p.d + '|' + p.q];
    if (!st) throw new Error('nf');
    const felder = { status: st };
    return { getString: (k) => felder[k] || '', set: (k, v) => { felder[k] = v; }, _f: felder, _alt: true };
  };
  const $app = { findFirstRecordByFilter: find };
  const antworten = [];
  const e = { string: (c, t) => { antworten.push([c, t]); return antworten.length; } };
  const slots = Array.isArray(body.slots) ? body.slots : [];
  class Record { constructor() { this._f = {}; } set(k, v) { this._f[k] = v; } }
  const tx = { findCollectionByNameOrId: () => ({}), findFirstRecordByFilter: find, save: (r) => gespeichert.push(r) };
  const src = 'var planName="";var appUrl="";var weg=[];var weg2=0;var name="N";var mail="n@x.de";var von="bulk";var auth={id:"u"};'
    + vorTx + '\n var angelegt=0, aktualisiert=0;\n'
    + 'if (typeof nutzlast === "undefined") {}\n'
    + schreibSrc.replace('var col = tx.findCollectionByNameOrId', 'var col = tx.findCollectionByNameOrId')
    + '\n return {nutzlast: nutzlast, slots: slots};';
  // eslint-disable-next-line no-new-func
  const fn = new Function('$app', 'e', 'body', 'typ', 'planId', 'slots', 'tx', 'Record', src);
  const r = fn($app, e, body, body.type, 'PLAN1', slots, tx, Record);
  return { antworten, gespeichert, r };
}

const S = (d, st) => ({ date: d, posId: 'gl', posLabel: 'GL', status: st });

for (const st of ['pencilled', 'pencil_declined', 'proposed', 'confirmed', 'declined']) {
  test('invite fasst ' + st + ' nicht an', () => {
    const body = { type: 'invite', slots: [S('2027-06-01')], mailSlots: [S('2027-06-01', 'proposed')] };
    const { gespeichert } = lauf(body, { '2027-06-01|gl': st });
    eq(gespeichert.length, 0, 'kein save');
  });
}

test('invite setzt cancelled/cancel_acked auf proposed', () => {
  for (const st of ['cancelled', 'cancel_acked']) {
    const body = { type: 'invite', slots: [S('2027-06-01')], mailSlots: [S('2027-06-01', 'proposed')] };
    const { gespeichert } = lauf(body, { '2027-06-01|gl': st });
    eq(gespeichert.length, 1);
    eq(gespeichert[0]._alt, true);
    eq(gespeichert[0]._f.status, 'proposed');
    eq(gespeichert[0]._f.proposed_by, 'bulk');
  }
});

test('invite legt fehlenden Slot als proposed an', () => {
  const body = { type: 'invite', slots: [S('2027-06-01')], mailSlots: [S('2027-06-01', 'proposed')] };
  const { gespeichert } = lauf(body, {});
  eq(gespeichert.length, 1);
  eq(gespeichert[0]._f.status, 'proposed');
  eq(gespeichert[0]._f.date, '2027-06-01');
});

test('invite-Mailliste behält vorgemerkte Termine und trägt den DB-Status', () => {
  const body = { type: 'invite', slots: [], mailSlots: [S('2027-06-01', 'proposed'), S('2027-06-02', 'proposed'), S('2027-06-03', 'confirmed')] };
  const { r, gespeichert } = lauf(body, { '2027-06-01|gl': 'pencilled', '2027-06-03|gl': 'cancelled' });
  const l = JSON.parse(r.nutzlast);
  eq(l.map((x) => x.status).join(','), 'pencilled,proposed,proposed');
  eq(Object.keys(l[0]).sort().join(','), 'date,posLabel,status');
  eq(gespeichert.length, 0);
});

test('invite ohne Termine → 400 keine Termine (Oliver-Fall)', () => {
  const { antworten } = lauf({ type: 'invite', slots: [], mailSlots: [] }, {});
  eq(antworten.length, 1);
  eq(antworten[0][0], 400);
  eq(antworten[0][1], 'keine Termine');
});
