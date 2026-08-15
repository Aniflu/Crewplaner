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

// Fängt Markup und Knopf-Beschriftung ab. Geöffnet wird über den ECHTEN Weg
// (openBulkStatusModal) — _bulkStatusSetMode allein tut nichts mehr, wenn die Aktion schon
// aktiv ist, und der Modulzustand überlebt zwischen den Tests.
let _knopf = '';
function fangen(fn) {
  let html = '';
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    if (id === 'bulkStatusBody') return { set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
    if (id === 'btnBulkStatusApply') return { set textContent(v) { _knopf = v; }, get textContent() { return _knopf; },
                                              disabled: false, style: {} };
    return realGet(id);
  };
  try { fn(); } finally { globalThis.document.getElementById = realGet; }
  return html;
}

const render = () => fangen(() => bulk.openBulkStatusModal());
const _knopfText = () => _knopf;

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

test('nach dem Öffnen ist NICHTS angehakt', () => {
  // v0.8.6 hakte die statuslosen automatisch an. Beim zweiten Öffnen stellte ein Klick dann
  // die halbe Tour um, ohne dass der Manager das gewählt hätte. In einem Dialog, der Zusagen
  // zurücknehmen kann, ist eine Vorauswahl die falsche Voreinstellung.
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-02': { gl: { status: 'confirmed', crewName: 'Wolf Geffenius' } } },
  });
  const z = zeilen(render());
  eq(z.length, 2, 'beide stehen zur Auswahl');
  eq(z.filter(x => x.angehakt).length, 0, 'nichts darf vorausgewählt sein');
});

test('„nur offene" hakt die statuslosen an, die bestätigten nicht', () => {
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-02': { gl: { status: 'confirmed', crewName: 'Wolf Geffenius' } } },
  });
  const z = zeilen(fangen(() => { bulk.openBulkStatusModal(); bulk._bulkStatusSelectOpen(); }));
  eq(z.find(x => x.key.includes('2026-09-01')).angehakt, true,  'der statuslose ist angehakt');
  eq(z.find(x => x.key.includes('2026-09-02')).angehakt, false, 'der bestätigte bleibt frei');
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
  // ⚠️ Seit v0.9.0 ist NICHTS vorausgewählt. Ohne dieses SelectAll liefe applyBulkStatus in
  // „Nichts ausgewählt" und der Test wäre grün, ohne je etwas geprüft zu haben.
  fangen(() => { bulk.openBulkStatusModal(); bulk._bulkStatusSelectAll(true); });
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
  // Nichts ist vorausgewählt (v0.9.0) — für diesen Test bewusst auswählen.
  fangen(() => { bulk.openBulkStatusModal(); bulk._bulkStatusSelectAll(true); });
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

test('AUSFÜHREN ohne Auswahl sagt etwas, statt still zu sein', async () => {
  // Der Auslöser der ganzen Meldung: Klick auf den Knopf, nichts passiert, keine Erklärung.
  // Der Manager hielt den Dialog für hängengeblieben.
  aufbauen({ assign: { '2026-09-01': { gl: 'Wolf Geffenius' } } });
  let gemeldet = '';
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) =>
    id === 'toast' ? { set textContent(v) { gemeldet = v; }, get textContent() { return gemeldet; }, style: {} }
                   : realGet(id);
  try {
    render();                       // öffnet, wählt nichts aus
    await bulk.applyBulkStatus();
  } finally { globalThis.document.getElementById = realGet; }
  ok(/nichts ausgewählt/i.test(gemeldet), 'kein Hinweis bei leerer Auswahl, gemeldet wurde: ' + JSON.stringify(gemeldet));
});

test('der Dialog schließt auch dann, wenn das Neuzeichnen scheitert', async () => {
  // Gemeldet zu v0.9.0: Erfolgsmeldung kam, Dialog ging nicht zu, Tabelle blieb alt — nach
  // einem Neuladen war alles korrekt gespeichert. Ursache war die Form: closeModal und
  // renderTable standen ungeschützt hintereinander. Egal was dahinter kippt, der Dialog muss
  // aufgehen — sonst hält man die Arbeit für verloren und macht sie ein zweites Mal.
  aufbauen({ assign: { '2026-09-01': { gl: 'Wolf Geffenius' } } });
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  globalThis.fetch = async (url, opts) => (opts && opts.method && opts.method !== 'GET')
    ? { status: 200, ok: true, json: async () => ({ id: 'rec1' }) }
    : { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1 }) };

  // renderTable stolpern lassen: tBody fehlt → der echte Renderer wirft.
  let geschlossen = false, gemeldet = '';
  const realGet = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    if (id === 'tBody' || id === 'tHead') return null;          // lässt renderTable werfen
    if (id === 'bulkStatusModal') return { classList: { add(){}, remove(k){ if (k === 'open') geschlossen = true; },
                                                        contains(){ return false; } } };
    if (id === 'toast') return { set textContent(v) { gemeldet += v + '|'; }, get textContent() { return gemeldet; }, style: {} };
    return realGet(id);
  };
  try {
    fangen(() => { bulk.openBulkStatusModal(); bulk._bulkStatusSelectAll(true); });
    await bulk.applyBulkStatus();
  } finally { globalThis.document.getElementById = realGet; }

  ok(geschlossen, 'der Dialog muss geschlossen worden sein, auch wenn renderTable wirft');
  // ⚠️ Der schärfere Teil: Es reicht nicht, dass der Dialog zugeht — der Fehler beim
  // Neuzeichnen muss GEMELDET werden. Sonst sieht man eine Erfolgsmeldung, eine unveränderte
  // Tabelle und hält die Arbeit für verloren. Ohne diese Zusicherung war der Test wertlos:
  // im alten Code lief closeBulkStatusModal ohnehin vor renderTable.
  ok(/nicht aktualisiert/i.test(gemeldet),
     'kein Hinweis auf die veraltete Ansicht, gemeldet wurde: ' + JSON.stringify(gemeldet));
});

// ── Die vier Aktionen sammeln je das Richtige ────────────────────────────────────────
const rendernMit = (aktion) => fangen(() => { bulk.openBulkStatusModal(); bulk._bulkStatusSetMode(aktion); });

test('jede Aktion überspringt, was schon im Zielzustand ist', () => {
  // Sonst stünde Arbeit in der Liste, die nichts bewirkt — und der Knopf zählte sie mit.
  aufbauen({
    assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } },
    status: { '2026-09-02': { gl: { status: 'pencilled', crewName: 'Wolf Geffenius' } } },
  });
  eq(zeilen(rendernMit('pencil')).length, 1, 'vormerken: der schon vorgemerkte fällt raus');
  eq(zeilen(rendernMit('confirm')).length, 2, 'bestätigen: beide, keiner ist bestätigt');
  eq(zeilen(rendernMit('request')).length, 2, 'anfragen: beide, keiner ist angefragt');
  eq(zeilen(rendernMit('remove')).length,  2, 'aufheben: immer alle Besetzten');
});

test('anfragen: ohne hinterlegte E-Mail nicht auswählbar', () => {
  // Der Hook steigt ohne crew_email still aus — die Anfrage ginge ins Leere, und niemand
  // würde es merken.
  aufbauen({ assign: { '2026-09-01': { gl: 'Ohne Adresse' } } });
  delete globalThis.__x;  // (kein Zustand nötig — crewMeta['Ohne Adresse'] existiert nicht)
  eq(zeilen(rendernMit('request')).length, 0, 'ohne Adresse steht die Person nicht zur Wahl');
  eq(zeilen(rendernMit('pencil')).length,  1, 'vormerken geht auch ohne Adresse');
});

test('Klick auf die AKTIVE Aktion verwirft die Auswahl nicht', () => {
  // Der Fehler aus v0.8.6: Ein erneuter Klick auf den aktiven Knopf setzte die Auswahl
  // zurück und hakte stillschweigend alles Offene an — das nächste AUSFÜHREN traf die
  // ganze Tour. Vom Prüfstand tools/dialog-harness.mjs zusätzlich im echten DOM geprüft.
  aufbauen({ assign: { '2026-09-01': { gl: 'Wolf Geffenius' }, '2026-09-02': { gl: 'Wolf Geffenius' } } });
  fangen(() => {
    bulk.openBulkStatusModal();
    bulk._bulkStatusToggle({ dataset: { key: 'Wolf Geffenius|2026-09-01|gl' }, checked: true });
    bulk._bulkStatusSetMode('pencil');          // erneut die AKTIVE Aktion
  });
  // Gemessen wird die Knopf-Beschriftung — das ist die Zahl, die der Manager sieht.
  // (Der no-op rendert bewusst nicht neu, deshalb taugt das Markup hier nicht als Maß.)
  ok(/1 VORMERKEN/.test(_knopfText()), 'die eine Auswahl muss erhalten bleiben, Knopf zeigt: ' + _knopfText());
});
