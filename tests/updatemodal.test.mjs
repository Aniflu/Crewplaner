// Update-Fenster, Update-Mail und die Crew-Sicht auf entfallene Tage (v0.9.3).
//
// Auslöser: Beim Versenden von Updates mit vielen Terminen war der Senden-Knopf nicht
// erreichbar und das Fenster ließ sich nicht scrollen — die Box hatte `max-height:80vh` MIT
// `overflow:hidden` und der Inhalt zusätzlich ein festes `max-height:60vh`. Zusammen mit Kopf-,
// Auswahl- und Fußzeile überschritt das die Boxhöhe; der Knopf wurde abgeschnitten, und weil
// die Box `hidden` war, kam man auch nicht heran.
//
// Zugleich zählt die Update-Mail keine Termine mehr auf. Das ist nur vertretbar, weil die Crew
// nach dem Einloggen sieht, was sich geändert hat — auch die ENTFALLENEN Tage, die in keinem
// plan_data mehr stehen. Diese drei Dinge hängen zusammen und werden deshalb hier gemeinsam
// festgehalten.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
const userView = readFileSync(join(root, 'js/userView.js'), 'utf8');

// Den Modal-Block ausschneiden — sonst prüft der Guard versehentlich ein anderes Fenster.
// ⚠️ HTML-Kommentare entfernen: Die Erklärung im Markup nennt die alten Werte absichtlich
// („vorher hatte die Box overflow:hidden") und würde den Guard sonst anschlagen lassen.
// Genau diese Falle ist heute schon dreimal zugeschnappt.
const modal = (() => {
  const von = html.indexOf('<div id="crewUpdateModal"');
  ok(von >= 0, 'crewUpdateModal nicht in index.html gefunden');
  return html.slice(von, html.indexOf('id="bulkStatusModal"', von))
             .replace(/<!--[\s\S]*?-->/g, ' ');
})();

test('Update-Fenster: Flex-Spalte, damit der Senden-Knopf immer sichtbar bleibt', () => {
  const box = modal.slice(0, modal.indexOf('id="crewUpdateModalBody"'));
  ok(/flex-direction:\s*column/.test(box),
     'die Box ist keine Flex-Spalte — dann kann der Inhalt die Fußzeile hinausdrängen');
  ok(!/overflow:\s*hidden/.test(box),
     'overflow:hidden an der Box — damit ist ein abgeschnittener Knopf unerreichbar');
});

test('Update-Fenster: der Listenbereich schrumpft und scrollt', () => {
  const zeile = (modal.match(/<div id="crewUpdateModalBody"[^>]*>/) || [''])[0];
  ok(/min-height:\s*0/.test(zeile),
     'min-height:0 fehlt — ein Flex-Kind schrumpft sonst nicht und der Bereich scrollt nicht');
  ok(/overflow-y:\s*auto|overflow-y:\s*scroll/.test(zeile), 'der Bereich scrollt nicht');
  ok(!/max-height/.test(zeile),
     'festes max-height am Listenbereich — genau das hat die Fußzeile hinausgedrängt');
});

test('Update-Fenster: der Senden-Knopf liegt AUSSERHALB des scrollenden Bereichs', () => {
  // Läge er darin, wäre er bei langer Liste wieder nur nach Scrollen erreichbar.
  const bodyEnde = modal.indexOf('</div>', modal.indexOf('id="crewUpdateModalBody"'));
  const knopf = modal.indexOf('id="btnSendUpdates"');
  ok(knopf > bodyEnde, 'der Sende-Knopf steht im scrollenden Listenbereich');
});

// ── Update-Mail: kurz, aber mit den Aktions-Knöpfen ──────────────────────────────────
const updateZweig = (() => {
  const von = hook.indexOf("} else if (type === 'update')");
  ok(von >= 0, 'update-Zweig im Hook nicht gefunden');
  return hook.slice(von, hook.indexOf("} else if (type === 'staff_invite')", von));
})();

test('Update-Mail zählt keine Termine mehr auf', () => {
  // Bei einer 60-Tage-Tour war die Mail unlesbar lang — und sie veraltet ohnehin: Wer sie
  // später öffnet, liest einen Stand von gestern. Der verlässliche Ort ist die App.
  ok(!/upTable/.test(updateZweig), 'die Terminliste (upTable) ist zurück');
  ok(!/DATUM/.test(updateZweig), 'eine Datumstabelle steht wieder in der Mail');
});

test('Update-Mail behält die Aktions-Knöpfe und den Weg in die App', () => {
  // Der GESEHEN-Knopf trägt die aids und ist die Quittung — ohne ihn bleibt die Absage
  // dauerhaft unbestätigt.
  ok(/action=ackcancel/.test(updateZweig), 'die Quittung für entfallene Termine fehlt');
  ok(/TERMINE BEST/.test(updateZweig), 'der Bestätigen-Knopf für neue Termine fehlt');
  ok(/einloggen|Einloggen|eingeloggt/.test(updateZweig),
     'kein Hinweis, wo die Details stehen — ohne den ist die kurze Mail eine Sackgasse');
});

// ── Crew sieht entfallene Tage ───────────────────────────────────────────────────────
test('Hook liefert der Crew die EIGENEN entfallenen Einsätze', () => {
  const von = hook.indexOf("routerAdd('GET', '/planstatus/{id}'");
  const route = hook.slice(von, hook.indexOf('routerAdd', von + 10));
  ok(/status = "cancelled"/.test(route), 'die entfallenen Einsätze werden nicht geliefert');
  ok(/crew_email = \{:m\}/.test(route),
     'die Abfrage ist nicht auf das anfragende Konto begrenzt — das wären fremde Absagen');
  ok(/cancelled:/.test(route), 'das Feld fehlt in der Antwort');
});

test('das Crew-Popup öffnet auch bei ausschließlich entfallenen Tagen', () => {
  const fn = (userView.match(/export function checkAndOpenMySchedule\([\s\S]*?\n}/) || [''])[0];
  ok(/meineEntfallenen\.length/.test(fn),
     'öffnet nur bei offenen Slots — ein entfallener Tag wäre dann nirgends zu sehen');
});

test('das Crew-Popup zeigt die entfallenen Tage samt Quittung', () => {
  ok(/_ackMeineEntfallenen/.test(userView), 'kein „Gesehen"-Weg im Popup');
  ok(/ackCancelledAssignments/.test(userView),
     'die Quittung läuft nicht über den geprüften Weg (Server prüft dort die Adresse)');
});

// ── Jedes Dialogfenster muss sich begrenzen ──────────────────────────────────────────
// Zweimal hintereinander dasselbe Muster: ein Fenster mit EIGENEM Kasten statt der Klasse
// `modal-box` — und damit ohne deren `max-height:90vh; overflow-y:auto`. Bei vielen Einträgen
// wächst so ein Kasten über den Bildschirm hinaus; weil das Overlay mittig zentriert, ragt er
// oben UND unten heraus, lässt sich nicht rollen und die Knöpfe sind unerreichbar.
// Betroffen waren crewUpdateModal (v0.9.3) und updatePreviewModal (v0.9.5) — beim ersten Mal
// habe ich das zweite übersehen. Dieser Guard prüft deshalb ALLE auf einmal.
test('jedes Dialogfenster begrenzt seine Höhe und kann rollen', () => {
  // Per CSS gedeckelt statt inline — geprüft und in Ordnung, deshalb hier benannt statt
  // stillschweigend übergangen.
  const PER_CSS = {
    tbModal: '#tbInner in styles.css (max-height:92vh; overflow-y:auto)',
  };

  // ⚠️ Kommentare VOR dem Ausschneiden entfernen, nicht danach: Ein ausführlicher
  // Erklär-Kommentar zwischen Overlay und Kasten verbrauchte sonst das Messfenster.
  const ohneKommentare = html.replace(/<!--[\s\S]*?-->/g, ' ');

  // Je Fenster den ganzen Block betrachten (bis zum nächsten Fenster), nicht ein festes
  // Zeichenfenster — die Knopfleisten sind lang, ein 700-Zeichen-Ausschnitt reichte nicht
  // einmal bis zum Rollbereich und meldete deshalb Fehlalarm.
  const treffer = [...ohneKommentare.matchAll(/id="([a-zA-Z]*[Mm]odal)"/g)];
  const fund = [];
  treffer.forEach((m, i) => {
    const id = m[1];
    if (PER_CSS[id]) return;
    const block = ohneKommentare.slice(m.index, i + 1 < treffer.length ? treffer[i + 1].index : m.index + 6000);
    if (/class="modal-box"/.test(block)) return;      // Klasse deckelt und rollt bereits

    // 1) Der Kasten selbst — das erste <div> NACH dem Overlay — muss die Höhe begrenzen.
    const nachOverlay = block.slice(block.indexOf('>') + 1);
    const kasten = (nachOverlay.match(/<div[^>]*>/) || [''])[0];
    const gedeckelt = /max-height/.test(kasten);

    // 2) Irgendwo im Fenster muss ein Bereich rollen können.
    const rollt = /overflow-y:\s*(auto|scroll)/.test(block);

    if (!gedeckelt || !rollt) fund.push(id + (gedeckelt ? ' (rollt nicht)' : ' (keine Höhengrenze)'));
  });

  ok(fund.length === 0,
    'ohne Höhenbegrenzung und Rollbereich: ' + fund.join(', ') +
    ' — entweder class="modal-box" verwenden oder max-height + overflow selbst setzen');
});

test('die E-Mail-Vorschau zeigt, was WIRKLICH in der Mail steht', () => {
  // Seit v0.9.3 zählt die Mail keine Tage mehr auf. Die Vorschau zeigte aber weiter eine
  // Datumstabelle und versprach damit etwas, das beim Empfänger nicht ankommt.
  const uv = readFileSync(join(root, 'js/userView.js'), 'utf8');
  const fn = (uv.match(/function _openUpdatePreview\([\s\S]*?\n}/) || [''])[0];
  ok(/SO KOMMT DIE MAIL AN/.test(fn), 'die Vorschau zeigt die Mail-Zusammenfassung nicht');
  ok(/NICHT IN DER MAIL/.test(fn),
     'die Tagesliste ist nicht als „nur für dich" gekennzeichnet — sie sieht sonst aus wie Mail-Inhalt');
});
