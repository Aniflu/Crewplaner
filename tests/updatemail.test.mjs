// Die Update-Mail wird hier WIRKLICH gebaut, nicht nur der Quelltext abgesucht (v0.9.3).
//
// Warum: Der Mail-Zweig im Hook läuft sonst erst beim ersten echten Versand — ein Tippfehler
// fiele dann bei einer Mail an die Crew auf. Der Admin hat den Pfad einmal auf der
// Test-Instanz ausgelöst (dort ohne RESEND_KEY, es ging nichts raus) und alle vier Zweige
// sauber durchlaufen sehen. Dieser Test hält das dauerhaft fest, ohne Server.
//
// Vorgehen: Der `update`-Zweig wird aus .pb_hooks/main.pb.js herausgeschnitten und mit
// Attrappen für die Hook-Helfer ausgeführt. Geprüft wird das ERGEBNIS — der fertige Body.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok, eq } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

// Den Rumpf des update-Zweigs ausschneiden (ohne `} else if (…) {` und ohne die letzte `}`).
const rumpf = (() => {
  const kopf = "} else if (type === 'update') {";
  const von = hook.indexOf(kopf);
  ok(von >= 0, 'update-Zweig nicht gefunden — Hook umgebaut?');
  const bis = hook.indexOf("} else if (type === 'staff_invite')", von);
  ok(bis > von, 'Ende des update-Zweigs nicht gefunden');
  return hook.slice(von + kopf.length, bis);
})();

// v4.30: Die Mail-Regel mailListe/MAIL_LISTE_MAX steht handler-lokal oberhalb der Zweige.
const liste = (() => {
  const von = hook.indexOf('var MAIL_LISTE_MAX');
  const bis = hook.indexOf('// Optionaler Freitext des Admins', von);
  ok(von >= 0 && bis > von, 'mailListe im Hook nicht gefunden');
  return hook.slice(von, bis);
})();

// Attrappen für alles, was der Zweig aus dem Hook-Umfeld benutzt.
function baue(slots) {
  let gesendet = null;
  const fn = new Function(
    'appUrl', 'email', 'plan', 'ePlan', 'eName', 'customMsg',
    'esc', 'fmtISO', 'noteBlock', 'mkBtn', 'wrap', 'sendMail', 'console',
    liste + rumpf
  );
  fn(
    JSON.stringify(slots), 'crew@example.com', 'Sommertour', 'Sommertour', 'Wolf', '',
    (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    (d) => String(d).slice(0, 10),
    (m) => (m ? '<p class="note">' + m + '</p>' : ''),
    (url, label, bg, fg) => '<a href="' + url + '">' + label + '</a>',
    (body) => '<html><body>' + body + '</body></html>',
    (to, subject, html) => { gesendet = { to, subject, html }; },
    { log() {}, error() {} }
  );
  return gesendet;
}

const NEU  = (d) => ({ date: d, posLabel: 'Gruppenleitung' });
const WEG  = (d, aid) => ({ kind: 'removed', date: d, posLabel: 'Licht', aid });
const VOR  = (d) => ({ kind: 'status', to: 'pencilled', date: d, posLabel: 'Ton' });
const FEST = (d) => ({ kind: 'status', to: 'confirmed', date: d, posLabel: 'Ton' });

test('Update-Mail baut fehlerfrei — alle vier Arten gemischt', () => {
  const m = baue([NEU('2026-09-01'), NEU('2026-09-02'), WEG('2026-09-03', 'a1'), VOR('2026-09-04'), FEST('2026-09-05')]);
  ok(m, 'es wurde keine Mail gebaut');
  eq(m.to, 'crew@example.com');
  ok(/ÄNDERUNG/.test(m.subject), 'Betreff passt nicht: ' + m.subject);
});

test('Update-Mail nennt Anzahl und Art, aber KEINE Datumsangaben (ab 6 Einträgen)', () => {
  // Der Kern der Änderung: Bei 20 entfallenen Tagen soll die Mail nicht 20 Zeilen lang sein.
  // v4.30: Zählung „➖ 20 entfernt" plus Satz der Regel; bis 5 Einträge eine kleine Tabelle.
  const weg = [];
  for (let i = 1; i <= 20; i++) weg.push(WEG('2026-09-' + String(i).padStart(2, '0'), 'a' + i));
  const m = baue(weg);
  ok(/➖ 20 entfernt/.test(m.html), 'die Anzahl fehlt: ' + m.html.slice(0, 300));
  ok(/mehr als 5 Einträge/.test(m.html), 'der Satz der Regel fehlt');
  ok(!/2026-09-0/.test(m.html), 'es stehen doch Datumsangaben in der Mail');
  ok(m.html.length < 3500, 'die Mail ist immer noch lang: ' + m.html.length + ' Zeichen');
});

test('Update-Mail: bis 5 Einträge eine Tabelle mit Art', () => {
  const m = baue([WEG('2026-09-03', 'a1')]);
  ok(/entfernt/.test(m.html) && /2026-09-03/.test(m.html), 'Tabelle mit Datum und Art fehlt: ' + m.html.slice(0, 400));
});

test('Update-Mail: keine Quittung per Link (v4.30), auch bei entfallenen Terminen', () => {
  // GESEHEN/ackcancel ist weg — nichts in der Mail schreibt.
  const m = baue([WEG('2026-09-03', 'a1'), WEG('2026-09-04', 'a2'), WEG('2026-09-05', 'a3')]);
  ok(!/ackcancel|action=/.test(m.html), 'Quittungs-Link steht noch in der Mail: ' + m.html);
});

test('Update-Mail: neue Termine → Hinweis auf die App, kein Bestätigen-Knopf', () => {
  const m = baue([NEU('2026-09-01')]);
  ok(!/ackcancel/.test(m.html), 'Quittung erscheint');
  ok(!/TERMINE BEST/.test(m.html), 'Bestätigen-Knopf in der Mail (v4.30: entfernt)');
  ok(/in der App bestätigen/.test(m.html), 'Hinweis auf die App fehlt');
});

test('Update-Mail: Statuswechsel bekommen KEINEN Aktions-Knopf', () => {
  // Dort ist nichts zu bestätigen — ein Knopf würde eine Handlung suggerieren, die es
  // nicht gibt.
  const m = baue([VOR('2026-09-04')]);
  ok(/vorgemerkt/.test(m.html), 'der Hinweis auf die Vormerkung fehlt');
  ok(!/ackcancel/.test(m.html) && !/TERMINE BEST/.test(m.html),
     'ein Aktions-Knopf steht bei einem reinen Statuswechsel');
});

// ── Nutzlast der Update-Mail (v0.9.6) ────────────────────────────────────────────────
// Gemeldet: Beim Senden im Plan „Provinz 2027" kam ein roter Hinweis über 5000 Zeichen.
// Die Slots landen als JSON in `crew_invites.app_url`, und das Feld ist dort zu Ende.
// Mitgeschickt wurden aber Felder, die seit Hook v4.21 niemand mehr liest: `date`, `posId`,
// `posLabel` und die Änderungstexte — Altlast aus der Zeit, als die Mail eine Terminliste
// enthielt. 59 Einsätze ergaben so ~7700 Zeichen; PocketBase wies den Datensatz ab und die
// Mail ging gar nicht erst raus.
import { loadGraph, resetState } from './_graph.mjs';

test('gesendet wird nur, was der Hook liest — und das passt ins Feld', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  resetState(g);
  g.state.setAuthState('uid-mgr', 'mgr@x.de', 'manager');
  globalThis.localStorage.setItem('pb_token', 't');
  globalThis.localStorage.setItem('tourplan_active_pb_id', 'PLAN1');
  g.plans.setActivePlanId('PLAN1'); localStorage.setItem('tourplan_pb_' + 'PLAN1', 'PLAN1');

  // 59 Einsätze wie in einer echten Tour, mit allen Altlast-Feldern in der Queue.
  const slots = [];
  for (let i = 1; i <= 40; i++)
    slots.push({ kind: 'removed', date: '2027-05-' + String(i % 28 + 1).padStart(2, '0'),
                 posId: 'lt', posLabel: 'Lichttechnik', aid: 'r' + String(i).padStart(14, '0'),
                 changes: ['Termin entfernt'] });
  for (let i = 1; i <= 19; i++)
    slots.push({ kind: 'status', to: 'pencilled', date: '2027-06-' + String(i % 28 + 1).padStart(2, '0'),
                 posId: 'gl', posLabel: 'Gruppenleitung', changes: ['Jetzt vorgemerkt'] });

  let gesendet = null;
  globalThis.fetch = async (url, opts) => {
    if ((opts && opts.method) === 'POST') gesendet = JSON.parse(opts.body || '{}');
    return { status: 200, ok: true, json: async () => ({ items: [], page: 1, perPage: 200, totalPages: 1, id: 'r1' }) };
  };
  await g.dataService.sendUpdateNotice('Wolf', 'wolf@example.com', slots);

  ok(gesendet, 'es wurde nichts gesendet');
  // Seit v0.11.0 geht die Nutzlast als `mailSlots` an POST /notify; der Hook schreibt sie
  // nach app_url und prueft dort die Feldgrenze. Die Zusage bleibt dieselbe: schlank genug,
  // und die aids muessen vollstaendig ankommen.
  const roh = JSON.stringify(gesendet.mailSlots || []);
  ok(roh.length < 5000, 'Nutzlast über der Feldgrenze: ' + roh.length + ' Zeichen');

  const raus = gesendet.mailSlots;
  eq(raus.length, 59, 'es müssen alle Einsätze mit — nur schlanker');
  ok(!/posLabel|"date"|changes/.test(roh),
     'ungenutzte Felder werden weiter mitgeschickt: ' + roh.slice(0, 200));
  // Die aids tragen die Quittung — fällt eine weg, bleibt die Absage dauerhaft offen.
  eq(raus.filter(s => s.aid).length, 40, 'aids unvollständig');
  eq(raus.filter(s => s.to === 'pencilled').length, 19, 'Statuswechsel unvollständig');
});
