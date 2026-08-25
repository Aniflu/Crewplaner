// Guard: die Pflichtangaben sind von jeder Oberfläche aus erreichbar — und es gibt sie nur
// in EINER Fassung.
//
// § 5 DDG verlangt „leicht erkennbar, unmittelbar erreichbar und ständig verfügbar", § 3a UWG
// macht daraus einen Abmahngrund. Crewplanner wird mit nyx lightwork vertrieben, es gilt das
// zentrale Impressum auf nyxlightwork.de; gepflegt wird dort, nicht hier im Repo (v0.10.1/v0.10.2).
//
// Fünf Fehlerbilder soll dieser Guard verhindern, die ersten drei sind hier schon vorgekommen:
//
//   1. Eine neue Oberfläche entsteht, der Footer wird vergessen → auf dieser Seite fehlen
//      die Pflichtangaben, und auffallen würde es erst durch Post vom Anwalt.
//   2. Jemand ersetzt den statischen Footer durch eine JS-Lösung („einmal statt viermal").
//      Ein fehlgeschlagener Modul-Import lässt die Angaben dann verschwinden — genau das
//      Fehlerbild, das dieses Projekt mehrfach hatte (siehe README zu v0.16.0/v0.27.2).
//   3. Auslieferung und Repo laufen auseinander → das Dockerfile ist eine Whitelist (Befund K-1).
//   4. Der Anker `#datenschutz` fällt weg. Die Erklärung steht in derselben Seite wie das
//      Impressum; ohne Anker landet der Link am Seitenkopf und die Erklärung ist nicht mehr
//      „unmittelbar erreichbar" — deshalb wird die volle URL geprüft, nicht nur die Domain.
//   5. Eine lokale Zweitfassung kehrt zurück. Genau das war der Zustand bis v0.10.2:
//      impressum.html/datenschutz.html lagen unverlinkt, voller «…»-Platzhalter, aber live
//      abrufbar im Container — ein unvollständiges Impressum, das jemand für das geltende
//      halten könnte. Ein unvollständiges Impressum ist rechtlich wie keins.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (f) => readFileSync(join(root, f), 'utf8');

const OBERFLAECHEN = ['index.html', 'admin.html', 'login.html', 'view.html'];
// Die geltenden Pflichtangaben. Beide URLs vollständig, der Anker gehört dazu (Fehlerbild 4).
const PFLICHT_LINKS = [
  'https://nyxlightwork.de/impressum.html',
  'https://nyxlightwork.de/impressum.html#datenschutz',
];
// Die abgeschafften Zweitfassungen (Fehlerbild 5).
const ALTSEITEN = ['impressum.html', 'datenschutz.html'];

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

test('der Footer öffnet die Pflichtangaben sicher (rel=noopener)', () => {
  // target="_blank" ohne rel="noopener" gibt der Zielseite window.opener und damit Zugriff
  // auf die Navigation der App — auf dem Weg zum Impressum ausgerechnet.
  const fund = [];
  for (const seite of OBERFLAECHEN) {
    for (const a of lies(seite).match(/<a\s[^>]*nyxlightwork\.de\/impressum[^>]*>/g) || []) {
      if (/target=["']_blank["']/.test(a) && !/rel=["'][^"']*noopener/.test(a)) fund.push(`${seite}: ${a}`);
    }
  }
  ok(fund.length === 0, 'target="_blank" ohne noopener:\n      ' + fund.join('\n      '));
});

test('keine lokale Zweitfassung der Pflichtangaben', () => {
  // Fehlerbild 5. Zwei Fassungen heißt: eine davon ist veraltet, und welche live steht,
  // entscheidet der Zufall. Gepflegt wird ausschließlich auf nyxlightwork.de.
  const da = ALTSEITEN.filter(f => existsSync(join(root, f)));
  ok(da.length === 0,
    `lokale Rechtstexte sind wieder da: ${da.join(', ')} — gepflegt wird nur nyxlightwork.de`);
});

test('das Dockerfile liefert keine Rechtstexte mehr aus', () => {
  // Die Datei kann im Repo fehlen und trotzdem im COPY stehen — dann bricht erst der
  // Coolify-Build ab, also nach dem Push.
  const dockerfile = lies('Dockerfile');
  const aktiv = dockerfile.split('\n').filter(z => !z.trim().startsWith('#')).join('\n');
  const fund = ALTSEITEN.filter(f => new RegExp(`^COPY\\s.*\\b${f}\\b`, 'm').test(aktiv));
  ok(fund.length === 0, `Dockerfile kopiert abgeschaffte Rechtstexte: ${fund.join(', ')}`);
});

test('kein unbekannter externer Empfänger — sonst muss nyxlightwork.de nachgezogen werden', () => {
  // Wer im Code Daten an einen fremden Host schickt, muss in der Datenschutzerklärung stehen.
  // Die liegt jetzt außerhalb dieses Repos und lässt sich hier nicht mehr gegenlesen — prüfbar
  // bleibt die Gegenrichtung: Taucht ein Host auf, der beim Schreiben der Erklärung noch nicht
  // bekannt war, ist die Erklärung ab sofort unvollständig. Dann gehört er DORT ergänzt.
  //
  // ⚠️ Ein fremder Host kippt außerdem die Banner-Freiheit: § 25 Abs. 2 Nr. 2 TDDDG trägt nur,
  // solange nichts Fremdes geladen wird (siehe README „Rechtliches", docs/security.md).
  const BEKANNT = [
    'api.resend.com',                       // Mailversand, USA — in der Erklärung benannt
    'api.crewplanner.nyxlightwork.de',      // eigene Live-API
    'api-test.crewplanner.nyxlightwork.de', // eigene Test-API
    'crewplanner.nyxlightwork.de', 'www.crewplanner.nyxlightwork.de',
    'nyxlightwork.de',                      // Sitz der Pflichtangaben
    'aniflu.github.io',                     // Testumgebung (v0.31.0)
    'pocketbase.io',                        // nur Doku-Verweise im Hook
    'localhost', '127.0.0.1',
  ];
  const quellen = [
    ...readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    '.pb_hooks/main.pb.js',
  ].filter(f => existsSync(join(root, f)));

  const fund = [];
  for (const datei of quellen) {
    for (const treffer of lies(datei).match(/https?:\/\/[a-zA-Z0-9.-]+/g) || []) {
      const host = treffer.replace(/^https?:\/\//, '');
      if (!BEKANNT.includes(host)) fund.push(`${datei}: ${host}`);
    }
  }
  ok(fund.length === 0,
    'neuer externer Host — in der Erklärung auf nyxlightwork.de ergänzen und die\n      ' +
    'Banner-Freiheit neu bewerten:\n      ' + [...new Set(fund)].join('\n      '));
});
