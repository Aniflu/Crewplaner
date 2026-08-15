#!/usr/bin/env node
// Liefert die App lokal MIT der Content-Security-Policy aus — zum Erproben, bevor sie live geht.
//
// Warum es das gibt: `nginx.conf` hat keine Testumgebung. Test ist GitHub Pages, dort lässt sich
// kein Header setzen, und Docker ist auf dem Arbeitsrechner nicht installiert. Was sich hier
// prüfen lässt, ist die **Wirkung der Policy** — der Browser wertet sie aus, ganz gleich wer den
// Header gesetzt hat. Was sich NICHT prüfen lässt, ist die nginx-Syntax der add_header-Zeile.
//
//   node tools/serve-csp.mjs           → http://localhost:8081 (normales Durchklicken)
//   node tools/serve-csp.mjs --probe   → zusätzlich der Verstoß-Sammler im DOM
//   node tools/serve-csp.mjs 9000     → anderer Port
//
// ⚠️ Ein Unterschied zur Live-Policy ist unvermeidlich: `pickApiUrl` (js/config.js) wählt die
// API nach Hostname — auf localhost also die TEST-Instanz. Im connect-src steht hier deshalb
// api-test…, live steht api… . Die Struktur der Direktiven ist identisch; genau darauf kommt es
// an. Wer die Live-Policy Zeichen für Zeichen prüfen will, muss sie live messen (curl -I).
//
// Durchklicken und dabei die Browser-Konsole auf „Refused to …" lesen:
//   Anmeldung · Plan laden · Crew-Pool-Dialog (Auswahl UND „+ Neue Person") · PDF-Export in
//   allen drei Ansichten samt Druckfenster · iCal-Download · Logo-Upload (img-src data:) ·
//   Service Worker (worker-src) · beide Anleitungen · Konsole inkl. „Öffentlicher Link".
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, normalize, extname } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a))) || 8081;
const PROBE = args.includes('--probe');

// Bis auf den API-Host identisch mit der Zeile in nginx.conf. Ändert sich dort etwas, gehört es
// auch hierher — sonst prüft man am Ende eine Policy, die so nie ausgeliefert wird.
const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://api-test.crewplanner.nyxlightwork.de",
  "img-src 'self' data:",
  "font-src 'self'",
  "worker-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
].join('; ');

// ── Verstoß-Sammler (--probe) ────────────────────────────────────────────────
// Chrome 151 leitet Konsolenmeldungen nicht mehr nach stderr — ein `--enable-logging`-Grep
// findet KEINE Verstöße, auch wenn es welche gibt. Das ist ein falsches Grün der teuersten
// Sorte: Man misst und glaubt, geprüft zu haben.
//
// Deshalb wird der Verstoß dort abgefangen, wo er entsteht: `securitypolicyviolation` feuert im
// Dokument selbst. Der Sammler schreibt jeden Treffer in ein <pre id="csp-verstoesse">, das
// `chrome --dump-dom` dann sichtbar macht. Läuft nur mit --probe, damit das normale
// Durchklicken im Browser unverändert bleibt.
//
// ⚠️ Der Schalter ist bewusst ein SERVER-Argument (--probe) und kein Query-Parameter: Ohne
// Anmeldung leitet index.html per location.replace() auf login.html um, und dabei ginge ein
// ?cspprobe=1 verloren — gemessen würde dann eine Seite ohne Sammler, Ergebnis „0 Verstöße".
// Genau so ein falsches Grün ist hier schon einmal entstanden.
//
// Der Sammler ist selbst inline — erlaubt, weil script-src 'unsafe-inline' führt. Fiele das je
// weg, müsste er als eigene Datei ausgeliefert werden.
const SAMMLER = `<script>
(function(){
  var box=document.createElement('pre');
  box.id='csp-verstoesse';
  box.setAttribute('data-anzahl','0');
  var n=0;
  document.addEventListener('securitypolicyviolation',function(e){
    n++; box.setAttribute('data-anzahl',String(n));
    box.textContent+='VERSTOSS '+e.effectiveDirective+' → '+e.blockedURI+'\\n';
  });
  document.addEventListener('DOMContentLoaded',function(){document.body.appendChild(box);});
})();
</script>`;

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ics':  'text/calendar',
};

createServer(async (req, res) => {
  const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // normalize() vor dem join: sonst käme man mit ../ aus dem Repo heraus. Das ist hier nur ein
  // lokales Werkzeug, aber ein Verzeichniswechsel-Loch schreibt man auch dort nicht hin.
  const rel = normalize(pfad === '/' ? '/index.html' : pfad).replace(/^(\.\.[/\\])+/, '');
  const datei = join(root, rel);

  try {
    let inhalt = await readFile(datei);
    const typ = TYPEN[extname(datei)] || 'application/octet-stream';
    // Der Sammler muss FRÜH stehen — Verstöße beim Laden der eigenen <head>-Ressourcen feuern,
    // bevor </body> geparst ist. Deshalb direkt hinter <head>.
    if (PROBE && typ.startsWith('text/html')) {
      inhalt = Buffer.from(String(inhalt).replace(/<head>/i, '<head>' + SAMMLER));
    }
    res.writeHead(200, {
      'Content-Type': typ,
      'Content-Security-Policy': CSP,
      'Cache-Control': 'no-store',   // sonst prüft man den Stand von vorhin
    });
    res.end(inhalt);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP });
    res.end('404 — ' + rel);
  }
}).listen(port, () => {
  console.log(`CSP-Prüfserver auf http://localhost:${port}`);
  console.log(`Policy: ${CSP}\n`);
  console.log('Konsole offen lassen und auf „Refused to …" achten. Beenden mit Strg+C.');
});
