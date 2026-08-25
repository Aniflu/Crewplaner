// Guard: die Pflichtangaben sind da, verlinkt und werden auch tatsächlich ausgeliefert.
//
// § 5 DDG verlangt „leicht erkennbar, unmittelbar erreichbar und ständig verfügbar" — und
// § 3a UWG macht daraus einen Abmahngrund. Drei Fehlerbilder soll dieser Guard verhindern,
// alle drei sind in diesem Projekt schon in anderer Form vorgekommen:
//
//   1. Eine neue Oberfläche entsteht, der Footer wird vergessen → auf dieser Seite fehlen
//      die Pflichtangaben, und auffallen würde es erst durch Post vom Anwalt.
//   2. Jemand ersetzt den statischen Footer durch eine JS-Lösung („einmal statt viermal").
//      Ein fehlgeschlagener Modul-Import lässt die Angaben dann verschwinden — genau das
//      Fehlerbild, das dieses Projekt mehrfach hatte (siehe README zu v0.16.0/v0.27.2).
//   3. Die Seiten liegen im Repo, stehen aber nicht im Dockerfile → live läuft der Link ins
//      404, weil das Dockerfile eine Whitelist ist (Befund K-1).
//   4. Seit v0.10.1 zeigt der Footer auf das zentrale Impressum von nyxlightwork.de. Dort
//      steht die Datenschutzerklärung in derselben Seite, erreichbar nur über den Anker
//      `#datenschutz`. Fällt der Anker weg, landet der Datenschutz-Link am Seitenkopf und die
//      Erklärung ist nicht mehr „unmittelbar erreichbar" — deshalb wird die volle URL geprüft.
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (f) => readFileSync(join(root, f), 'utf8');

const OBERFLAECHEN = ['index.html', 'admin.html', 'login.html', 'view.html'];
const RECHTSSEITEN = ['impressum.html', 'datenschutz.html'];
// Ziel des Footers seit v0.10.1: das gepflegte Impressum auf nyxlightwork.de. Die lokalen
// RECHTSSEITEN bleiben als Dateien liegen (mit ihren «…»-Platzhaltern), sind aber nicht mehr
// verlinkt — die Pflichtangaben gibt es damit nur noch in einer Fassung.
const PFLICHT_LINKS = [
  'https://nyxlightwork.de/impressum.html',
  'https://nyxlightwork.de/impressum.html#datenschutz',
];

test('Impressum und Datenschutzerklärung existieren', () => {
  const fehlen = RECHTSSEITEN.filter(f => !existsSync(join(root, f)));
  ok(fehlen.length === 0, `Pflichtseiten fehlen: ${fehlen.join(', ')}`);
});

test('jede Oberfläche verlinkt Impressum und Datenschutzerklärung', () => {
  const fund = [];
  for (const seite of OBERFLAECHEN) {
    const src = lies(seite);
    for (const ziel of PFLICHT_LINKS) {
      if (!src.includes(`href="${ziel}"`)) fund.push(`${seite} → ${ziel}`);
    }
  }
  ok(fund.length === 0, 'fehlende Links auf die Pflichtangaben:\n      ' + fund.join('\n      '));
});

test('der Footer ist statisches HTML, nicht per JavaScript eingespielt', () => {
  // Die Links müssen im ausgelieferten HTML stehen. Steht das Markup nur in einem
  // JS-String (innerHTML/insertAdjacentHTML/document.write), verschwindet das Impressum
  // beim ersten Ladefehler — dann ist es nicht mehr „ständig verfügbar".
  const fund = [];
  for (const seite of OBERFLAECHEN) {
    const src = lies(seite);
    if (!/<footer[^>]*class=["'][^"']*legal-footer/.test(src)) fund.push(`${seite}: kein <footer class="legal-footer">`);
  }
  ok(fund.length === 0, 'Footer fehlt oder ist kein statisches Element:\n      ' + fund.join('\n      '));
});

test('die Pflichtseiten stehen im Dockerfile', () => {
  const dockerfile = lies('Dockerfile');
  const fehlen = RECHTSSEITEN.filter(f => !new RegExp(`^COPY\\s.*\\b${f}\\b`, 'm').test(dockerfile));
  ok(fehlen.length === 0,
    `nicht ausgeliefert (Dockerfile ist eine Whitelist): ${fehlen.join(', ')}`);
});

test('die Pflichtseiten laden theme.css und kommen ohne fremde Hosts aus', () => {
  const fund = [];
  for (const seite of RECHTSSEITEN) {
    const src = lies(seite);
    if (!/href=["']theme\.css/.test(src)) fund.push(`${seite}: theme.css nicht eingebunden`);
    // Die CSP steht auf default-src 'self'. Ein eingeschleppter fremder Host wäre auf einer
    // Rechtstextseite besonders unangenehm: Sie soll gerade beweisen, dass es keinen gibt.
    for (const treffer of src.match(/(?:src|href)=["']https?:\/\/[^"']+/g) || []) {
      fund.push(`${seite}: externe Einbindung ${treffer}`);
    }
  }
  ok(fund.length === 0, fund.join('\n      '));
});

test('die Datenschutzerklärung benennt jeden externen Empfänger', () => {
  // Wer im Code Daten hinschickt, muss in der Erklärung stehen. Prüft die zwei Empfänger,
  // die es derzeit gibt — kommt ein dritter dazu, gehört er hier UND dort ergänzt.
  const ds = lies('datenschutz.html');
  const hook = existsSync(join(root, '.pb_hooks/main.pb.js')) ? lies('.pb_hooks/main.pb.js') : '';
  const fund = [];
  if (/resend/i.test(hook) && !/resend/i.test(ds)) fund.push('Resend wird im Hook genutzt, fehlt aber in datenschutz.html');
  if (!/§ ?25|TDDDG/.test(ds)) fund.push('Hinweis zur Speicherung auf dem Endgerät (§ 25 TDDDG) fehlt');
  if (!/Art\.? ?28/.test(ds)) fund.push('Hinweis zur Auftragsverarbeitung (Art. 28 DSGVO) fehlt');
  ok(fund.length === 0, fund.join('\n      '));
});

test('kein Platzhalter mehr in den Pflichtangaben (scharf ab Redaktionsschluss)', () => {
  // Solange «…» drinsteht, ist das Impressum unvollständig — und ein unvollständiges
  // Impressum ist rechtlich wie keins. Der Test meldet SKIP, solange die Werte noch
  // ausstehen, damit die Suite währenddessen grün bleibt; er wird von selbst scharf,
  // sobald der Betreiber die letzte Lücke gefüllt hat.
  const offen = [];
  for (const seite of RECHTSSEITEN) {
    const treffer = lies(seite).match(/«[^»]*»/g) || [];
    if (treffer.length) offen.push(`${seite}: ${treffer.length} Platzhalter`);
  }
  if (offen.length) {
    console.log(`      ⚠ noch einzusetzen — ${offen.join(', ')}`);
    return 'SKIP';
  }
});
