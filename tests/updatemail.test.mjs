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

// Attrappen für alles, was der Zweig aus dem Hook-Umfeld benutzt.
function baue(slots) {
  let gesendet = null;
  const fn = new Function(
    'appUrl', 'email', 'plan', 'ePlan', 'eName', 'customMsg',
    'esc', 'fmtISO', 'noteBlock', 'mkBtn', 'wrap', 'sendMail', 'console',
    rumpf
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

test('Update-Mail nennt Anzahl und Art, aber KEINE Datumsangaben', () => {
  // Der Kern der Änderung: Bei 20 entfallenen Tagen soll die Mail nicht 20 Zeilen lang sein.
  const weg = [];
  for (let i = 1; i <= 20; i++) weg.push(WEG('2026-09-' + String(i).padStart(2, '0'), 'a' + i));
  const m = baue(weg);
  ok(/20 Termine sind entfallen/.test(m.html), 'die Anzahl fehlt: ' + m.html.slice(0, 300));
  ok(!/2026-09-0/.test(m.html), 'es stehen doch Datumsangaben in der Mail');
  ok(m.html.length < 3000, 'die Mail ist immer noch lang: ' + m.html.length + ' Zeichen');
});

test('Update-Mail: Einzahl wird richtig gebildet', () => {
  // „1 Termine sind entfallen" wäre schlampig und fällt jedem Leser auf.
  const m = baue([WEG('2026-09-03', 'a1')]);
  ok(/Ein Termin ist entfallen/.test(m.html), 'Einzahl stimmt nicht: ' + m.html.slice(0, 400));
});

test('Update-Mail: die Quittung trägt ALLE aids', () => {
  // Fehlt eine, bleibt diese Absage dauerhaft unbestätigt — und niemand merkt es.
  const m = baue([WEG('2026-09-03', 'a1'), WEG('2026-09-04', 'a2'), WEG('2026-09-05', 'a3')]);
  ok(/action=ackcancel&aids=a1,a2,a3/.test(m.html), 'aids unvollständig: ' + m.html);
});

test('Update-Mail: ohne entfallene Termine kein Quittungs-Knopf', () => {
  const m = baue([NEU('2026-09-01')]);
  ok(!/ackcancel/.test(m.html), 'Quittung erscheint, obwohl nichts entfallen ist');
  ok(/TERMINE BEST/.test(m.html), 'der Bestätigen-Knopf fehlt');
});

test('Update-Mail: Statuswechsel bekommen KEINEN Aktions-Knopf', () => {
  // Dort ist nichts zu bestätigen — ein Knopf würde eine Handlung suggerieren, die es
  // nicht gibt.
  const m = baue([VOR('2026-09-04')]);
  ok(/vorgemerkt/.test(m.html), 'der Hinweis auf die Vormerkung fehlt');
  ok(!/ackcancel/.test(m.html) && !/TERMINE BEST/.test(m.html),
     'ein Aktions-Knopf steht bei einem reinen Statuswechsel');
});
