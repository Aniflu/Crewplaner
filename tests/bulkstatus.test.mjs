// Sammel-Vormerken (js/bulkStatus.js).
//
// Bis v0.8.5 sammelte der Dialog im Modus „vormerken" nur Einsätze mit Status `confirmed`.
// Frisch geplante Zellen ohne Statusdatensatz erschienen gar nicht — also genau die, die man
// bei einer neuen Tour am Stück vormerken will. Übrig blieb das Zelle-für-Zelle-Klicken, das
// dieser Dialog eigentlich abschaffen sollte.
//
// Seit v0.8.6 zählt jede besetzte Zelle. Das macht den Dialog mächtiger und damit gefährlicher:
// Ein grauer Einsatz ist harmlos, ein grüner nicht — dort hat jemand fest zugesagt und erfährt
// von der Rücknahme nichts, denn es geht keine Mail raus. Deshalb prüfen die Tests hier nicht
// nur „findet er sie", sondern auch „hakt er nur an, was gefahrlos ist" und „schweigt er über
// Tage, die nie kommuniziert wurden".
import { test, eq, ok } from './_assert.mjs';
import './_setup.mjs';

const state = await import('../js/state.js');
const bulk  = await import('../js/bulkStatus.js');

// bulkStatus hält seine Auswahl im Modulzustand; _collect ist nicht exportiert. Gemessen wird
// deshalb über das gerenderte Markup — dasselbe, was der Manager sieht.
function aufbauen({ status = {}, assign = {}, defaults = {} } = {}) {
  state.TOUR_DATES.length = 0;
  state.POSITIONS.length = 0;
  for (const o of [state.assignments, state.assignmentStatuses, state.defaultCrew, state.crewMeta])
    Object.keys(o).forEach(k => delete o[k]);

  state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  state.TOUR_DATES.push(
    { date: '2026-09-01', type: 'show', typeLabel: 'Show', loc: 'A', blockId: 'B1', blockName: 'Block 1' },
    { date: '2026-09-02', type: 'show', typeLabel: 'Show', loc: 'B', blockId: 'B1', blockName: 'Block 1' },
  );
  state.POSITIONS.push({ id: 'gl', label: 'Gruppenleitung' });
  Object.assign(state.assignments, assign);
  Object.assign(state.assignmentStatuses, status);
  Object.assign(state.defaultCrew, defaults);
  state.crewMeta['Wolf Geffenius'] = { email: 'wolf@example.com' };
}

// Fängt das gerenderte Markup des Dialogs ab.
function render() {
  let html = '';
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    if (id === 'bulkStatusBody') return { set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
    return realGet(id);
  };
  try { bulk._bulkStatusSetMode('pencil'); } finally { globalThis.document.getElementById = realGet; }
  return html;
}

const zeilen = (html) => [...html.matchAll(/data-key="([^"]+)"([^>]*)/g)]
  .map(m => ({ key: m[1], angehakt: /checked/.test(m[2]) }));

test('vormerken: findet Einsätze OHNE Statusdatensatz', () => {
  aufbauen({ assign: { '2026-09-01': { gl: 'Wolf Geffenius' } } });
  const z = zeilen(render());
  eq(z.length, 1, 'der geplante, statuslose Einsatz muss auftauchen');
  ok(z[0].key.startsWith('Wolf Geffenius|2026-09-01|gl'), 'richtiger Slot');
});

test('vormerken: findet auch Einsätze aus der Standard-Besetzung', () => {
  // getVal löst defaultCrew mit auf. Käme die Besetzung aus assignmentStatuses, wären diese
  // Tage unsichtbar — obwohl sie im Plan besetzt AUSSEHEN.
  aufbauen({ defaults: { gl: 'Wolf Geffenius' } });
  eq(zeilen(render()).length, 2, 'beide Tourtage über defaultCrew besetzt');
});

test('vormerken: bereits vorgemerkte Einsätze erscheinen NICHT', () => {
  // Sonst stünde in der Liste Arbeit, die nichts bewirkt — und „N VORMERKEN" zählte sie mit.
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-01': { gl: { status: 'pencilled', crewName: 'Wolf Geffenius' } } },
  });
  const z = zeilen(render());
  eq(z.length, 1, 'nur der noch nicht vorgemerkte Tag');
  ok(z[0].key.includes('2026-09-02'), 'der schon vorgemerkte fehlt');
});

test('vormerken: offene Zellen zählen nicht als besetzt', () => {
  aufbauen({ assign: { '2026-09-01': { gl: state.OFFEN } } });
  eq(zeilen(render()).length, 0, 'OFFEN ist keine Person');
});

test('Vorauswahl: nur statuslose angehakt, bestätigte NICHT', () => {
  // Der teure Fall: Wäre alles vorausgewählt, wäre einmal Öffnen und Anwenden ein stiller
  // Rückzug aller Zusagen der Tour — ohne dass irgendjemand davon erfährt.
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-02': { gl: { status: 'confirmed', crewName: 'Wolf Geffenius' } } },
  });
  const z = zeilen(render());
  eq(z.length, 2, 'beide stehen zur Auswahl');
  const ohneStatus = z.find(x => x.key.includes('2026-09-01'));
  const bestaetigt = z.find(x => x.key.includes('2026-09-02'));
  eq(ohneStatus.angehakt, true,  'der statuslose ist vorausgewählt');
  eq(bestaetigt.angehakt, false, 'der bestätigte muss bewusst dazugewählt werden');
});

test('Anzeige: jeder Einsatz trägt sein Zustandszeichen', () => {
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-02': { gl: { status: 'confirmed', crewName: 'Wolf Geffenius' } } },
  });
  const html = render();
  ok(html.includes('geplant, noch nicht angefragt'), 'Zeichen für „ohne Status" fehlt');
  ok(html.includes('bestätigt'), 'Zeichen für „bestätigt" fehlt');
});

// ── Benachrichtigung: nur über das reden, was die Person kennt ───────────────────────
// applyBulkStatus reihte bis v0.8.5 JEDEN umgestellten Einsatz in die Update-Queue („Jetzt
// vorgemerkt"). Bei einem Einsatz ohne Status ist nie eine Mail rausgegangen — die Person
// kennt den Tag gar nicht und bekäme eine Meldung über die Änderung an etwas, von dem sie nie
// wusste. Der Einzelklick im Zellen-Menü reiht dort ebenfalls nichts ein.
async function anwenden() {
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  globalThis.localStorage.removeItem('crewplan_updates_PLAN1');
  globalThis.fetch = async (url, opts) => ((opts && opts.method) === 'POST' || (opts && opts.method) === 'PATCH')
    ? { status: 200, ok: true, json: async () => ({ id: 'rec1' }) }
    : { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };
  render();                       // Modus pencil + Vorauswahl
  await bulk.applyBulkStatus();
  try { return JSON.parse(globalThis.localStorage.getItem('crewplan_updates_PLAN1') || '{}'); }
  catch { return {}; }
}

test('statusloser Einsatz landet NICHT in der Update-Queue', async () => {
  aufbauen({ assign: { '2026-09-01': { gl: 'Wolf Geffenius' } } });
  const q = await anwenden();
  eq(Object.keys(q).length, 0,
     'niemand darf über einen Tag benachrichtigt werden, von dem er nie erfahren hat');
});

test('vorher bestätigter Einsatz landet SCHON in der Update-Queue', async () => {
  // Gegenrichtung: Wer zugesagt hatte, muss von der Rücknahme erfahren können.
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-01': { gl: { status: 'confirmed', crewName: 'Wolf Geffenius' } } },
  });
  // Der bestätigte ist NICHT vorausgewählt — für diesen Test bewusst dazuwählen.
  bulk._bulkStatusSelectAll(true);
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  globalThis.localStorage.removeItem('crewplan_updates_PLAN1');
  globalThis.fetch = async (url, opts) => ((opts && opts.method) === 'POST' || (opts && opts.method) === 'PATCH')
    ? { status: 200, ok: true, json: async () => ({ id: 'rec1' }) }
    : { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };
  await bulk.applyBulkStatus();
  const q = JSON.parse(globalThis.localStorage.getItem('crewplan_updates_PLAN1') || '{}');
  ok(q['Wolf Geffenius'], 'die Person fehlt in der Queue');
  eq(q['Wolf Geffenius'].slots.length, 1, 'ein Slot eingereiht');
});

test('bestätigen-Modus sammelt unverändert nur vorgemerkte', () => {
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-02': { gl: { status: 'pencilled', crewName: 'Wolf Geffenius' } } },
  });
  let html = '';
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) =>
    id === 'bulkStatusBody' ? { set innerHTML(v) { html = v; }, get innerHTML() { return html; } } : realGet(id);
  try { bulk._bulkStatusSetMode('confirm'); } finally { globalThis.document.getElementById = realGet; }
  const z = zeilen(html);
  eq(z.length, 1, 'nur der vorgemerkte Einsatz');
  ok(z[0].key.includes('2026-09-02'));
  eq(z[0].angehakt, false, 'im bestätigen-Modus wird nichts vorausgewählt');
});
