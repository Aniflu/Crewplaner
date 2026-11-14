// Hook v4.30: POST /crewsave, Typ crew_changes, Guard, kompakte invite-Nutzlast.
//
// Die Route wird aus .pb_hooks/main.pb.js herausgeschnitten und mit Attrappen ($app, e, Record)
// ausgeführt (Muster tests/hookpencil.test.mjs). Die Attrappen kennen nur Felder, die der Hook
// selbst liest. Dass es auf dem Server wirkt, zeigt erst die Abnahme auf Test.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

const rStart = hook.indexOf("routerAdd('POST', '/crewsave'");
const rEnde = hook.indexOf('}, $apis.requireAuth());', rStart) + '}, $apis.requireAuth());'.length;
ok(rStart > 0 && rEnde > rStart, '/crewsave nicht gefunden — Aufbau geändert?');
const routeSrc = hook.slice(rStart, rEnde);

class Record {
  constructor(col) { this.col = col; this.f = {}; }
  set(k, v) { this.f[k] = v; }
  get(k) { return this.f[k]; }
  getString(k) { return this.f[k] == null ? '' : String(this.f[k]); }
}
const rec = (felder) => { const r = new Record('assignments'); r.f = { ...felder }; return r; };

// Plan wie plan_data ihn liefert: Max hat gl am 01.06. (defaultCrew), tourDates 01.-03.06.,
// am 02.06. ist gl per assignments-Eintrag an Eva vergeben, am 03.06. an niemanden.
const PLAN_DATA = {
  crew: ['Max', 'Eva'],
  positions: [{ id: 'gl', label: 'Licht' }, { id: 'ton', label: 'Ton' }],
  defaultCrew: { gl: 'Max', ton: 'Eva' },
  tourDates: [{ date: '2027-06-01' }, { date: '2027-06-02' }, { date: '2027-06-03' }],
  assignments: { '2027-06-02': { gl: 'Eva' }, '2027-06-03': { gl: '' } },
};

// Welt: Datensätze je Slot, Plan, Mitglieder. Liefert Route-Aufruf und Beobachtungen.
function welt({ records = [], member = 'max@x.de', planDataAlsText = true } = {}) {
  let handler = null;
  const saves = [];            // alles, was in einer Transaktion gespeichert wurde
  const gespeichert = [];      // tatsächlich committet
  const plan = new Record('plans');
  plan.f = { name: 'Sommertour', plan_data: planDataAlsText ? JSON.stringify(PLAN_DATA) : PLAN_DATA };
  plan.getString = (k) => (k === 'plan_data' && !planDataAlsText ? '' : (plan.f[k] == null ? '' : String(plan.f[k])));
  const $app = {
    findRecordById: (c, id) => { if (c === 'plans' && id === 'PLAN1') return plan; throw new Error('nf'); },
    findFirstRecordByFilter: (c, _f, p) => {
      if (c === 'crew_members') {
        if (p.p === 'PLAN1' && p.m === member) { const m = new Record(c); m.f = { name: 'Max', email: member }; return m; }
        throw new Error('nf');
      }
      if (c === 'assignments') {
        const t = records.find((r) => r.f.date === p.d && r.f.pos_id === p.q);
        if (t) return t;
        throw new Error('nf');
      }
      throw new Error('nf');
    },
    runInTransaction: (fn) => {
      const puffer = [];
      const tx = {
        findCollectionByNameOrId: (n) => n,
        save: (r) => { puffer.push(r); },
      };
      fn(tx);                          // wirft fn → nichts wird übernommen
      puffer.forEach((r) => gespeichert.push(r));
    },
  };
  // eslint-disable-next-line no-new-func — Testcode, Eingabe ist die repo-eigene Hook-Datei
  new Function('routerAdd', '$apis', '$app', 'Record', 'console', routeSrc)(
    (_m, _p, fn) => { handler = fn; }, { requireAuth: () => null }, $app, Record, { log() {}, error() {} });
  const aufruf = (body, auth = { id: 'u1', getString: (k) => (k === 'email' ? member : 'crew') }) => {
    void saves;
    const e = {
      auth,
      requestInfo: () => ({ body }),
      response: { header: () => ({ set() {} }) },
      string: (c, t) => ({ code: c, text: t }),
    };
    return handler(e);
  };
  return { aufruf, gespeichert };
}

const R = (date, pos, status, mail = 'max@x.de') =>
  rec({ plan_id: 'PLAN1', date, pos_id: pos, pos_label: pos === 'gl' ? 'Licht' : 'Ton', status, crew_email: mail, crew_name: 'Max' });
const C = (date, posId, from, to) => ({ date, posId, from, to });
const nach = (typ, g) => g.filter((r) => r.col === typ || r.f.type === typ);

test('crewsave: drei erlaubte Änderungen → ein save je Datensatz, genau ein crew_invites, drei activity_log', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'proposed'), R('2027-06-04', 'gl', 'confirmed'), R('2027-06-05', 'gl', 'pencilled')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [
    C('2027-06-01', 'gl', 'proposed', 'confirmed'),
    C('2027-06-04', 'gl', 'confirmed', 'declined'),
    C('2027-06-05', 'gl', 'pencilled', 'pencil_declined'),
  ], availability: [] });
  eq(a.code, 200);
  eq(JSON.parse(a.text).saved, 3);
  const zeilen = w.gespeichert;
  const asg = zeilen.filter((r) => r.col === 'assignments');
  eq(asg.length, 3, 'ein save je Datensatz');
  eq(asg.map((r) => r.f.status).join(','), 'confirmed,declined,pencil_declined');
  ok(asg.every((r) => r.f.changed_by === 'u1' && r.f.responded_at), 'changed_by und responded_at gesetzt');
  const inv = zeilen.filter((r) => r.col === 'crew_invites');
  eq(inv.length, 1, 'genau ein crew_invites');
  eq(inv[0].f.type, 'crew_changes');
  eq(inv[0].f.crew_email, 'max@x.de');
  eq(inv[0].f.plan_name, 'Sommertour');
  const l = JSON.parse(inv[0].f.app_url);
  eq(l.length, 3);
  eq(Object.keys(l[0]).sort().join(','), 'date,from,posLabel,to');
  const log = zeilen.filter((r) => r.col === 'activity_log');
  eq(log.length, 3, 'drei activity_log');
  eq(log.map((r) => r.f.action).join(','), 'confirmed,declined,pencil_declined');
  eq(Object.keys(log[0].f).sort().join(','), 'action,crew_email,crew_name,date,plan_id,pos_label,ts');
  eq(inv[0] === zeilen[zeilen.length - 1], true, 'Auslöser zuletzt');
});

test('crewsave: pencil_declined → pencilled wird als pencil_restored protokolliert', () => {
  const w = welt({ records: [R('2027-06-05', 'gl', 'pencil_declined')] });
  eq(w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-05', 'gl', 'pencil_declined', 'pencilled')], availability: [] }).code, 200);
  eq(w.gespeichert.filter((r) => r.col === 'activity_log')[0].f.action, 'pencil_restored');
});

test('crewsave: eine verbotene Änderung (pencilled→confirmed) → 400, kein save (alles oder nichts)', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'proposed'), R('2027-06-05', 'gl', 'pencilled')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [
    C('2027-06-01', 'gl', 'proposed', 'confirmed'),
    C('2027-06-05', 'gl', 'pencilled', 'confirmed'),
  ], availability: [] });
  eq(a.code, 400);
  eq(JSON.parse(a.text).denied.length, 1);
  eq(JSON.parse(a.text).denied[0].date, '2027-06-05');
  eq(w.gespeichert.length, 0, 'nichts geschrieben, auch nicht die erlaubte Änderung');
});

test('crewsave: from passt nicht → 409 mit stale, kein save', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'proposed'), R('2027-06-04', 'gl', 'declined')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [
    C('2027-06-01', 'gl', 'proposed', 'confirmed'),
    C('2027-06-04', 'gl', 'confirmed', 'declined'),     // Planer hat inzwischen auf declined gesetzt
  ], availability: [] });
  eq(a.code, 409);
  const s = JSON.parse(a.text).stale;
  eq(s.length, 1);
  eq(JSON.stringify(s[0]), JSON.stringify({ date: '2027-06-04', posId: 'gl', now: 'declined' }));
  eq(w.gespeichert.length, 0);
});

test('crewsave: stale wird vor denied gemeldet (beides vorhanden → 409)', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'declined'), R('2027-06-05', 'gl', 'pencilled')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [
    C('2027-06-01', 'gl', 'proposed', 'confirmed'),
    C('2027-06-05', 'gl', 'pencilled', 'confirmed'),
  ], availability: [] });
  eq(a.code, 409);
  eq(w.gespeichert.length, 0);
});

test('crewsave: fremder Datensatz → 400 denied', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'proposed', 'eva@x.de')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'proposed', 'confirmed')], availability: [] });
  eq(a.code, 400);
  eq(JSON.parse(a.text).denied[0].reason, 'fremder Termin');
  eq(w.gespeichert.length, 0);
});

test('crewsave: fremder Datensatz mit falschem from → 400 denied, KEIN now in der Antwort', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'declined', 'eva@x.de')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'proposed', 'confirmed')], availability: [] });
  eq(a.code, 400);
  ok(!/now|stale|declined/.test(a.text), 'Antwort verrät den fremden Status: ' + a.text);
  eq(JSON.parse(a.text).denied[0].reason, 'fremder Termin');
  eq(w.gespeichert.length, 0);
});

test('crewsave: Bereitschaft mit ungültigem Datum oder unbekannter Position → 400 denied, nichts geschrieben', () => {
  const faelle = [
    { date: '2027-6-1', posId: 'gl' }, { date: '<b>', posId: 'gl' }, { date: '2027-06-01', posId: 'xx' },
    { date: '2027-06-01', posId: '' }, { posId: 'gl' },
  ];
  for (const f of faelle) {
    const w = welt();
    const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'none', 'confirmed')], availability: [f] });
    eq(a.code, 400, JSON.stringify(f));
    eq(JSON.parse(a.text).denied[0].reason, 'ungültige Angabe');
    eq(w.gespeichert.length, 0);
  }
  const gut = welt();
  eq(gut.aufruf({ planId: 'PLAN1', changes: [], availability: [{ date: '2027-06-02', posId: 'ton' }] }).code, 200);
});

test('crewsave: nicht in crew_members → 404, ohne auth → 401, leer → 400', () => {
  const fremd = welt({ member: 'max@x.de' });
  eq(fremd.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'proposed', 'confirmed')], availability: [] },
    { id: 'u9', getString: (k) => (k === 'email' ? 'jemand@x.de' : 'crew') }).code, 404);
  const w = welt();
  eq(w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'proposed', 'confirmed')], availability: [] }, null).code, 401);
  const leer = w.aufruf({ planId: 'PLAN1', changes: [], availability: [] });
  eq(leer.code, 400);
  eq(leer.text, 'keine Änderungen');
  eq(w.gespeichert.length, 0);
});

test('crewsave: Slot ohne Datensatz (none) → nur confirmed/declined und nur wenn plan_data ihn dieser Person zuweist', () => {
  for (const alsText of [true, false]) {
    // 01.06. gl: defaultCrew Max → erlaubt
    const w = welt({ planDataAlsText: alsText });
    const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'none', 'confirmed')], availability: [] });
    eq(a.code, 200, 'eigener Slot (plan_data als ' + (alsText ? 'Text' : 'Objekt') + ')');
    const neu = w.gespeichert.filter((r) => r.col === 'assignments')[0];
    eq(neu.f.status, 'confirmed');
    eq(neu.f.crew_name, 'Max');
    eq(neu.f.crew_email, 'max@x.de');
    eq(neu.f.pos_label, 'Licht');
    eq(neu.f.date, '2027-06-01');
    eq(neu.f.pos_id, 'gl');
  }
  const fall = (c, grund) => {
    const w = welt();
    const a = w.aufruf({ planId: 'PLAN1', changes: [c], availability: [] });
    eq(a.code, 400, grund);
    eq(w.gespeichert.length, 0, grund);
  };
  fall(C('2027-06-02', 'gl', 'none', 'confirmed'), 'assignments-Eintrag überschreibt defaultCrew (Eva)');
  fall(C('2027-06-03', 'gl', 'none', 'confirmed'), 'assignments-Eintrag leer überschreibt defaultCrew');
  fall(C('2027-06-01', 'ton', 'none', 'confirmed'), 'defaultCrew ton ist Eva');
  fall(C('2027-06-09', 'gl', 'none', 'confirmed'), 'Datum nicht in tourDates');
  fall(C('2027-06-01', 'gl', 'none', 'pencilled'), 'none → pencilled nicht erlaubt');
  fall(C('2027-06-01', 'gl', 'none', 'cancel_acked'), 'none → cancel_acked nicht erlaubt');
});

test('crewsave: Bereitschaft auf belegtem Slot wird ignoriert, auf freiem in app_url mit to availability', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'confirmed')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [], availability: [
    { date: '2027-06-01', posId: 'gl' },      // aktiver Datensatz → ignoriert
    { date: '2027-06-02', posId: 'ton' },     // frei → Mail
  ] });
  eq(a.code, 200);
  eq(JSON.parse(a.text).saved, 1);
  const inv = w.gespeichert.filter((r) => r.col === 'crew_invites');
  eq(inv.length, 1);
  const l = JSON.parse(inv[0].f.app_url);
  eq(l.length, 1);
  eq(JSON.stringify(l[0]), JSON.stringify({ date: '2027-06-02', posLabel: 'Ton', from: 'none', to: 'availability' }));
  eq(w.gespeichert.filter((r) => r.col === 'assignments').length, 0, 'Bereitschaft schreibt keinen Datensatz');
  eq(w.gespeichert.filter((r) => r.col === 'activity_log').length, 0);
});

test('crewsave: nur ignorierte Bereitschaften → 200 saved 0, keine Mail', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'confirmed')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [], availability: [{ date: '2027-06-01', posId: 'gl' }] });
  eq(a.code, 200);
  eq(JSON.parse(a.text).saved, 0);
  eq(w.gespeichert.length, 0);
});

test('crewsave: mehr als 5 Einträge → app_url kompakt [{to}], passt auch bei 60 Änderungen', () => {
  const recs = [], ch = [];
  for (let i = 1; i <= 60; i++) {
    const d = '2027-07-' + String(i).padStart(2, '0');
    recs.push(R(d, 'gl', 'proposed'));
    ch.push(C(d, 'gl', 'proposed', 'confirmed'));
  }
  const w = welt({ records: recs });
  eq(w.aufruf({ planId: 'PLAN1', changes: ch, availability: [] }).code, 200);
  const inv = w.gespeichert.filter((r) => r.col === 'crew_invites')[0];
  ok(inv.f.app_url.length < 5000, 'app_url passt: ' + inv.f.app_url.length);
  eq(JSON.parse(inv.f.app_url).length, 60);
  eq(Object.keys(JSON.parse(inv.f.app_url)[0]).join(','), 'to');
});

test('crewsave: doppelter Eintrag für denselben Slot → denied', () => {
  const w = welt({ records: [R('2027-06-01', 'gl', 'proposed')] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'proposed', 'confirmed'), C('2027-06-01', 'gl', 'proposed', 'declined')], availability: [] });
  eq(a.code, 400);
  eq(w.gespeichert.length, 0);
});

test('crewsave: bricht die Transaktion ab, bleibt nichts übrig und die Antwort ist 500', () => {
  // Ein Datensatz, dessen set() wirft, simuliert einen Fehler mitten in der Schreibschleife.
  const kaputt = R('2027-06-05', 'gl', 'pencilled');
  kaputt.set = () => { throw new Error('boom'); };
  const w = welt({ records: [R('2027-06-01', 'gl', 'proposed'), kaputt] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'proposed', 'confirmed'), C('2027-06-05', 'gl', 'pencilled', 'pencil_declined')], availability: [] });
  eq(a.code, 500);
  eq(w.gespeichert.length, 0, 'Transaktion verwirft alles');
});

// ── Guard (Verhalten) ─────────────────────────────────────────────────────────
function createGuard(auth, status, fuer) {
  const von = hook.indexOf("throw new BadRequestError('assignment_create_denied");
  const hs = hook.lastIndexOf('onRecordCreateRequest(', von);
  const he = hook.indexOf("}, 'assignments');", von) + "}, 'assignments');".length;
  let handler = null;
  class BadRequestError extends Error {}
  const $app = { findRecordById: () => ({ getString: () => 'anderer-owner' }) };
  // eslint-disable-next-line no-new-func
  new Function('onRecordCreateRequest', 'BadRequestError', '$app', 'console', hook.slice(hs, he))(
    (fn) => { handler = fn; }, BadRequestError, $app, { log() {}, error() {} });
  const r = { get: (k) => (k === 'status' ? status : k === 'crew_email' ? fuer : 'PLAN1') };
  let weiter = false;
  try { handler({ auth, record: r, next: () => { weiter = true; } }); } catch (err) { return err instanceof BadRequestError ? 'abgelehnt' : 'FEHLER ' + err; }
  return weiter ? 'erlaubt' : 'nichts';
}
const crewAuth = { id: 'u1', getString: (k) => (k === 'email' ? 'crew@x.de' : k === 'role' ? 'crew' : '') };
const planerAuth = { id: 'u2', getString: (k) => (k === 'email' ? 'p@x.de' : k === 'role' ? 'manager' : '') };

test('Create-Guard v4.30: Crew legt nichts mehr an (auch eigener Slot als bestätigt), Planer darf', () => {
  eq(createGuard(crewAuth, 'confirmed', 'crew@x.de'), 'abgelehnt');
  eq(createGuard(crewAuth, 'declined', 'crew@x.de'), 'abgelehnt');
  eq(createGuard(planerAuth, 'proposed', 'crew@x.de'), 'erlaubt');
});

// ── Quelltext-Sperren ─────────────────────────────────────────────────────────
test('Hook enthält keine Planer-Einzelmail mehr', () => {
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/VORMERKUNG WIEDER FREI|VORMERKUNG ABGESAGT|'ABGELEHNT'|Absage-Meldung an den Planer/.test(code), 'Einzelmail an den Planer taucht im Code auf');
});

test('Hook: Version 4.30 mit Changelog-Eintrag', () => {
  ok(/^\/\/ Version: 4\.30$/m.test(hook));
  ok(/^\/\/ v4\.30 /m.test(hook));
  ok(/hook\] main\.pb\.js v4\.30 geladen/.test(hook));
});

// ── Mail crew_changes ─────────────────────────────────────────────────────────
const mvon = hook.indexOf('onRecordAfterCreateSuccess(');
const mbis = hook.indexOf("}, 'crew_invites');", mvon) + "}, 'crew_invites');".length;
const mailSrc = hook.slice(mvon, mbis);

function mailLauf(type, app_url, { adminEmail = 'admin@x.de' } = {}) {
  let handler = null;
  const mails = [];
  const felder = { crew_name: 'Wolf', crew_email: 'crew@x.de', type, plan_name: 'Sommertour', plan_id: 'PLAN1', app_url: JSON.stringify(app_url), custom_message: '' };
  const $os = { getenv: (k) => (k === 'RESEND_KEY' ? 'k' : k === 'ADMIN_EMAIL' ? adminEmail : '') };
  const $http = { send: (o) => { mails.push(JSON.parse(o.body)); return { statusCode: 200, raw: '' }; } };
  const $app = { findCollectionByNameOrId: () => ({}), save() {} };
  // eslint-disable-next-line no-new-func
  new Function('onRecordAfterCreateSuccess', '$os', '$http', '$app', 'Record', 'console', mailSrc)(
    (fn) => { handler = fn; }, $os, $http, $app, class { set() {} }, { log() {}, error() {} });
  handler({ next() {}, record: { get: (k) => felder[k] } });
  return mails;
}

test('crew_changes-Mail: bis 5 Änderungen Tabelle, an ADMIN_EMAIL, Betreff mit Name und Tour', () => {
  const m = mailLauf('crew_changes', [
    { date: '2027-06-01', posLabel: 'Licht', from: 'proposed', to: 'confirmed' },
    { date: '2027-06-02', posLabel: 'Ton', from: 'pencilled', to: 'pencil_declined' },
    { date: '2027-06-03', posLabel: 'Ton', from: 'none', to: 'availability' },
  ]);
  eq(m.length, 1);
  eq(m[0].to[0], 'admin@x.de');
  eq(m[0].subject, 'CREW-ÄNDERUNGEN · Wolf · Sommertour');
  ok(m[0].html.includes('01.06.2027') && m[0].html.includes('Licht'), 'Tabelle mit Einzeldaten');
  ok(m[0].html.includes('✅ bestätigt') && m[0].html.includes('✎✗ Vormerkung abgesagt') && m[0].html.includes('📋 Bereitschaft'));
  ok(!m[0].html.includes('mehr als 5 Einträge'));
});

test('crew_changes-Mail: 6 Änderungen → Zählung je Art, keine Einzeldaten', () => {
  const x = (to, n) => Array.from({ length: n }, () => ({ date: '2027-06-01', posLabel: 'Licht', from: 'x', to }));
  const m = mailLauf('crew_changes', [...x('confirmed', 2), ...x('declined', 1), ...x('pencil_declined', 1), ...x('pencilled', 1), ...x('cancel_acked', 1)]);
  eq(m.length, 1);
  const h = m[0].html;
  ok(h.includes('mehr als 5 Einträge'));
  ok(!h.includes('01.06.2027'));
  for (const z of ['✅ 2 bestätigt', '✗ 1 abgesagt', '✎✗ 1 Vormerkung abgesagt', '✎ 1 wieder vorgemerkt', '👁 1 Entfall gesehen']) ok(h.includes(z), z);
});

test('crew_changes-Mail: kompakte Nutzlast [{to}] (60 Einträge) zählt, nie leere Zeilen', () => {
  const m = mailLauf('crew_changes', Array.from({ length: 60 }, () => ({ to: 'confirmed' })));
  ok(m[0].html.includes('✅ 60 bestätigt'));
  const k = mailLauf('crew_changes', [{ to: 'confirmed' }, { to: 'declined' }]);   // ≤ 5 ohne Datum → trotzdem Zählung
  ok(k[0].html.includes('✅ 1 bestätigt') && !/<td[^>]*><\/td>/.test(k[0].html));
});

test('crew_changes-Mail: ohne ADMIN_EMAIL keine Mail', () => {
  eq(mailLauf('crew_changes', [{ date: '2027-06-01', posLabel: 'L', from: 'proposed', to: 'confirmed' }], { adminEmail: '' }).length, 0);
});

// ── /notify invite: kompakte Nutzlast über 5 Termine ──────────────────────────
const nRoute = (hook.split("routerAdd('POST', '/notify'")[1] || '').split('routerAdd(')[0];
const nVon = nRoute.indexOf('var nutzlast;');
const nBis = nRoute.indexOf('if (nutzlast.length > 4900)');
const nutzSrc = 'var AKTIV = { pencilled: true, pencil_declined: true, proposed: true, confirmed: true, declined: true };\n'
  + nRoute.slice(nVon, nBis) + '\nreturn nutzlast;';

function invNutzlast(anzahl, statusDb) {
  const mailSlots = Array.from({ length: anzahl }, (_, i) => ({ date: '2027-07-' + String(i + 1).padStart(2, '0'), posId: 'gl', posLabel: 'Eine ziemlich lange Positionsbezeichnung' }));
  const $app = {
    findFirstRecordByFilter: (_c, _f, p) => {
      const st = statusDb[p.d];
      if (!st) throw new Error('nf');
      return { getString: () => st };
    },
  };
  // eslint-disable-next-line no-new-func
  return new Function('$app', 'typ', 'body', 'planId', 'appUrl', 'slots', 'weg', nutzSrc)(
    $app, 'invite', { mailSlots }, 'PLAN1', '', [], []);
}

test('/notify invite: 60 Termine mit 30-Zeichen-Positionen → kompakt [{status}], unter dem 4900er-Limit', () => {
  const db = {};
  for (let i = 1; i <= 60; i++) db['2027-07-' + String(i).padStart(2, '0')] = i % 2 ? 'pencilled' : 'confirmed';
  const n = invNutzlast(60, db);
  ok(n.length <= 4900, 'passt: ' + n.length);
  const l = JSON.parse(n);
  eq(l.length, 60);
  eq(Object.keys(l[0]).join(','), 'status');
  eq(l.filter((x) => x.status === 'pencilled').length, 30);
  // Gegenprobe: genau 5 Einträge bleiben unverändert (mit date/posLabel)
  const k = JSON.parse(invNutzlast(5, db));
  eq(Object.keys(k[0]).sort().join(','), 'date,posLabel,status');
});

test('invite-Mail zählt aus der kompakten Nutzlast korrekt', () => {
  const db = {};
  for (let i = 1; i <= 60; i++) db['2027-07-' + String(i).padStart(2, '0')] = i <= 40 ? 'pencilled' : (i <= 50 ? 'confirmed' : 'declined');
  const m = mailLauf('invite', JSON.parse(invNutzlast(60, db)));
  eq(m.length, 1);
  const h = m[0].html;
  ok(h.includes('✎ 40 vorgemerkt') && h.includes('✅ 10 bestätigt') && h.includes('✗ 10 abgesagt'), 'Zählung');
  ok(h.includes('mehr als 5 Einträge'));
  ok(!h.includes('Bitte in der App bestätigen oder absagen.'), 'keine proposed → kein Anfrage-Satz');
});

// Schlussprüfung v1.5.0: entfallene Termine (cancelled/cancel_acked) zählen für from:'none' als „kein aktiver Datensatz“.
test('crewsave: cancel_acked-Datensatz + from none → confirmed aktualisiert den vorhandenen Datensatz (kein neuer)', () => {
  const alt = R('2027-06-01', 'gl', 'cancel_acked', 'eva@x.de');
  alt.f.crew_name = 'Eva';
  const w = welt({ records: [alt] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'none', 'confirmed')], availability: [] });
  eq(a.code, 200);
  const asg = w.gespeichert.filter((r) => r.col === 'assignments');
  eq(asg.length, 1);
  ok(asg[0] === alt, 'derselbe Datensatz (Unique-Index)');
  eq(alt.f.status, 'confirmed');
  eq(alt.f.crew_name, 'Max');
  eq(alt.f.crew_email, 'max@x.de');
});
test('crewsave: cancelled + from none → declined wird ebenso übernommen', () => {
  const alt = R('2027-06-01', 'gl', 'cancelled');
  const w = welt({ records: [alt] });
  eq(w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'none', 'declined')], availability: [] }).code, 200);
  eq(alt.f.status, 'declined');
});
test('crewsave: cancelled + from cancelled → cancel_acked funktioniert weiter', () => {
  const alt = R('2027-06-01', 'gl', 'cancelled');
  const w = welt({ records: [alt] });
  eq(w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-01', 'gl', 'cancelled', 'cancel_acked')], availability: [] }).code, 200);
  eq(alt.f.status, 'cancel_acked');
});
test('crewsave: cancel_acked + from none für nicht zugewiesenen Slot → 400 denied, nichts geschrieben', () => {
  const alt = R('2027-06-02', 'gl', 'cancel_acked', 'eva@x.de');
  const w = welt({ records: [alt] });
  const a = w.aufruf({ planId: 'PLAN1', changes: [C('2027-06-02', 'gl', 'none', 'confirmed')], availability: [] });
  eq(a.code, 400);
  eq(w.gespeichert.length, 0);
  eq(alt.f.status, 'cancel_acked');
});
