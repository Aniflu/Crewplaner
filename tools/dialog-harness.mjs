#!/usr/bin/env node
// Prüfstand für den Dialog „Status umstellen" — echte Module, echtes DOM, echte Klicks.
//
// Warum es das gibt: tests/bulkstatus.test.mjs prüft das gerenderte Markup als ZEICHENKETTE.
// Damit lief die Klickfolge „auswählen → anwenden" grün, während sie im Browser nichts tat
// (gemeldet zu v0.8.6). Was dort fehlt, ist alles, was erst ein echtes DOM hat: dass ein Klick
// auf eine Checkbox `change` auslöst, dass `dataset.key` den Wert zurückgibt, den `esc()`
// hineingeschrieben hat, dass innerHTML-Ersatz Handler neu bindet.
//
//   node tools/dialog-harness.mjs          → Server auf http://localhost:8082
//   node tools/dialog-harness.mjs --run    → fährt die Klickfolgen headless und meldet Abweichungen
//
// ⚠️ Chrome 151 leitet Konsolenmeldungen NICHT nach stderr — jedes Ergebnis muss ins DOM
// geschrieben und per --dump-dom abgeholt werden. Ein Grep über das Chrome-Log meldet sonst
// stumm „alles gut".
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname, normalize } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8082;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Das Modal-Markup wird aus index.html GESCHNITTEN, nicht abgeschrieben — sonst prüft der
// Prüfstand irgendwann eine Oberfläche, die es so nicht mehr gibt.
async function modalMarkup() {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const von = html.indexOf('<div id="bulkStatusModal"');
  if (von < 0) throw new Error('bulkStatusModal nicht in index.html gefunden');
  const ende = html.indexOf('\n</div>', html.indexOf('<div style="text-align:right;">', von));
  if (ende < 0) throw new Error('Ende des bulkStatusModal nicht gefunden');
  return html.slice(von, ende + 7);
}

const SEITE = (modal) => `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Dialog-Prüfstand</title>
<style>
  :root{--accent:#e8c84a;--on-accent:#111;--panel2:#222;--rule-2:#444;--rule:#333;
        --muted:#888;--ink:#eee;--ink-2:#ccc;--warn:#e84a4a;--show:#4ae8a0;
        --pencilled:#7A5FB3;--accent-wash-2:#333;}
  body{background:#111;color:var(--ink);font-family:monospace;}
  .modal-bg{display:block;} .modal-box{max-width:560px;}
</style></head><body>
${modal}
<!-- applyBulkStatus ruft am Ende renderTable(); das greift ungeschützt auf diese Elemente zu.
     Ohne sie bricht der Prüfstand mit „Cannot set properties of null" ab — und zwar NACH den
     Schreibvorgängen, was wie ein Fehler im Dialog aussähe. Sie bleiben leer, gemessen wird
     hier der Dialog, nicht die Tabelle. -->
<table id="viewTable"><thead id="tHead"></thead><tbody id="tBody"></tbody></table>
<div id="viewBlocks"></div><div id="viewCrew"></div><div id="viewMeta"></div>
<div id="kpiStrip"></div><div id="statsBar"></div>
<div id="toast"></div>
<pre id="ergebnis" data-fertig="0"></pre>
<script type="module">
import * as state from './js/state.js';
import * as bulk  from './js/bulkStatus.js';

// ── Zustand: 4 Tourtage, eine Person, alles geplant und ohne Status ──────────────
state.setAuthState('u1','mgr@example.com','manager');
for (let i = 1; i <= 4; i++)
  state.TOUR_DATES.push({date:'2026-09-0'+i,type:'show',typeLabel:'Show',loc:'Ort',blockId:'B1',blockName:'Block 1'});
state.POSITIONS.push({id:'gl',label:'Gruppenleitung'});
for (let i = 1; i <= 4; i++) state.assignments['2026-09-0'+i] = {gl:'Wolf Geffenius'};
state.crewMeta['Wolf Geffenius'] = {email:'wolf@example.com'};
localStorage.setItem('pb_token','t');
localStorage.setItem('tourplan_active_pb_id','PLAN1');
localStorage.setItem('tourplan_pb_default','PLAN1');

// Kein echter Server: jede Schreib-Anfrage gilt als erfolgreich, wir zählen sie.
let posts = 0;
window.fetch = async (url, opts) => {
  const m = (opts && opts.method) || 'GET';
  if (m !== 'GET') posts++;
  return {status:200, ok:true, json: async () => ({items:[],page:1,perPage:200,totalPages:1,id:'r1'})};
};

for (const [k,v] of Object.entries(bulk)) window[k] = v;   // onclick=… im Markup

const aus = document.getElementById('ergebnis');
const log = (s) => { aus.textContent += s + '\\n'; };
const kaesten = () => [...document.querySelectorAll('#bulkStatusBody input[type=checkbox]')];
const knopf   = () => document.getElementById('btnBulkStatusApply');
const klick   = (el) => { el.checked = !el.checked; el.dispatchEvent(new Event('change',{bubbles:true})); };

async function folge(name, schritte, erwartet) {
  posts = 0;
  bulk.openBulkStatusModal();
  await schritte();
  const label = knopf().textContent;
  const aktiv = !knopf().disabled;
  await bulk.applyBulkStatus();
  const ok = posts === erwartet;
  log((ok ? 'OK   ' : 'FEHL ') + name
      + ' | Knopf: "' + label + '" aktiv=' + aktiv
      + ' | Schreibvorgaenge: ' + posts + ' erwartet: ' + erwartet);
  // Zustand zwischen den Folgen zuruecksetzen
  for (const d of Object.keys(state.assignmentStatuses)) delete state.assignmentStatuses[d];
  localStorage.removeItem('crewplan_updates_PLAN1');
}

try {
  // Nach dem Öffnen ist NICHTS vorausgewählt (v0.9.0) — ein Klick auf AUSFÜHREN darf nichts tun.
  await folge('ohne Auswahl ausfuehren',   async () => {}, 0);
  await folge('oben ALLE',                 async () => { bulk._bulkStatusSelectAll(true); }, 4);
  await folge('NUR OFFENE',                async () => { bulk._bulkStatusSelectOpen(); }, 4);
  await folge('KEINE + 2 Kaestchen',       async () => { bulk._bulkStatusSelectAll(false); klick(kaesten()[0]); klick(kaesten()[2]); }, 2);
  await folge('nur 2 Kaestchen angeklickt',async () => { klick(kaesten()[1]); klick(kaesten()[3]); }, 2);
  await folge('Gruppenknopf alle',         async () => { document.querySelector('#bulkStatusBody button[data-crew]').click(); }, 4);
  await folge('Gruppe alle, dann 1 ab',    async () => { document.querySelector('#bulkStatusBody button[data-crew]').click(); klick(kaesten()[0]); }, 3);
  // Klick auf die BEREITS AKTIVE Aktion darf die Auswahl NICHT verwerfen (Fehler aus v0.8.6).
  await folge('aktive Aktion erneut',      async () => { klick(kaesten()[0]); document.querySelector('[data-bsmode=pencil]').click(); }, 1);
  // Wechsel auf eine ANDERE Aktion verwirft die Auswahl — bewusst, mit Hinweis.
  await folge('Aktion gewechselt',         async () => { klick(kaesten()[0]); document.querySelector('[data-bsmode=confirm]').click(); }, 0);
  // Gegenprobe: Diese Zeile MUSS fehlschlagen. Steht sie auf OK, misst der Prüfstand nichts.
  await folge('GEGENPROBE (muss FEHL sein)', async () => { bulk._bulkStatusSelectAll(true); }, 99);
} catch (e) {
  // Stack mitschreiben: Ohne ihn steht da nur „Cannot set properties of null" und man rät,
  // welches Element fehlt. Chrome 151 gibt die Konsole nicht über stderr aus.
  log('AUSNAHME ' + (e && e.message));
  log((e && e.stack || '').split('\\n').slice(0, 6).join('\\n'));
}
aus.setAttribute('data-fertig','1');
<\/script></body></html>`;

const TYPEN = {'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8'};

const modal = await modalMarkup();
const server = createServer(async (req, res) => {
  const pfad = decodeURIComponent(new URL(req.url,'http://x').pathname);
  if (pfad === '/' || pfad === '/index.html') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    return res.end(SEITE(modal));
  }
  const rel = normalize(pfad).replace(/^(\.\.[/\\])+/,'');
  try {
    const inhalt = await readFile(join(root, rel));
    res.writeHead(200, {'Content-Type': TYPEN[extname(rel)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(inhalt);
  } catch { res.writeHead(404); res.end('404 ' + rel); }
});

server.listen(PORT, async () => {
  if (!process.argv.includes('--run')) {
    console.log(`Dialog-Prüfstand auf http://localhost:${PORT} — Strg+C beendet ihn.`);
    return;
  }
  const chrome = spawn(CHROME, ['--headless','--disable-gpu','--no-sandbox',
    '--virtual-time-budget=8000','--dump-dom', `http://localhost:${PORT}/`]);
  let dom = '';
  chrome.stdout.on('data', d => { dom += d; });
  chrome.on('close', () => {
    const m = dom.match(/<pre id="ergebnis"[^>]*>([\s\S]*?)<\/pre>/);
    const zeilen = (m ? m[1] : '').trim();
    if (!zeilen) {
      console.log('KEIN ERGEBNIS — der Prüfstand hat nichts geschrieben. Nicht als „alles gut" lesen!');
      process.exit(2);
    }
    const text = zeilen.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    console.log(text);

    // Die GEGENPROBE MUSS fehlschlagen — sonst misst der Prüfstand nichts und meldet
    // fälschlich „alles gut". Genau dieser Selbstbetrug ist heute schon zweimal passiert
    // (Chrome-Log-Grep bei der CSP, Query-Parameter beim Verstoß-Sammler).
    const zeilenListe = text.split('\n').filter(Boolean);
    const gegenprobeOk = zeilenListe.some(z => z.startsWith('FEHL') && z.includes('GEGENPROBE'));
    const echteFehler  = zeilenListe.filter(z => (z.startsWith('FEHL') && !z.includes('GEGENPROBE'))
                                                || z.startsWith('AUSNAHME'));

    if (!gegenprobeOk) {
      console.log('\n→ Die GEGENPROBE ist NICHT fehlgeschlagen. Der Prüfstand misst nichts —'
                + ' das Ergebnis oben ist wertlos.');
      server.close(); process.exit(2);
    }
    console.log(echteFehler.length
      ? `\n→ ${echteFehler.length} echte Abweichung(en).`
      : '\n→ Alle Folgen wie erwartet (Gegenprobe hat angeschlagen).');
    server.close();
    process.exit(echteFehler.length ? 1 : 0);
  });
});
