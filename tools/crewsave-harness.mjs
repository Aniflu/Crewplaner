#!/usr/bin/env node
// Klick-Durchlauf v1.5.0: Crew sammelt Änderungen, verwirft/speichert; Konsole zeigt „Eingeladen" aus dem Mail-Log.
// Echte Module (userView, crewNotify, dialog, dataService), echtes DOM, echtes HTTP gegen eine
// nachgebildete PocketBase (dieser Server: /myplans, /myplan, /planstatus, /crewsave, email_log).
//
//   node tools/crewsave-harness.mjs          → Server auf http://localhost:8083 (zum Ansehen)
//   node tools/crewsave-harness.mjs --run    → fährt beide Phasen headless und meldet PASS/FAIL
//
// Phase 1 (Seite A): 3 Änderungen → Verwerfen (Dialog bestätigt) → Entwurf leer; dann 7 Änderungen stehen lassen.
// Phase 2 (NEUER Chrome-Start, gleiches Profil = „neu laden"): Dialog „ungespeicherte Änderungen" erscheint,
//   Speichern → genau EIN /crewsave mit 7 Änderungen; danach Konsole mit Mail-Log-Attrappe.
// ⚠️ Chrome leitet die Konsole nicht nach stderr: Ergebnisse stehen im DOM (<pre id="ergebnis">), Abholung per --dump-dom.
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname, normalize } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8083;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PB = 'PB1';
const POS = [{ id: 'gl', label: 'Gruppenleitung', short: 'GL' }];
const TAGE = Array.from({ length: 11 }, (_, i) => '2026-09-' + String(i + 1).padStart(2, '0'));

// ── nachgebildete Datenbank (Zustand im Server, überlebt das „Neuladen" der Seite) ──
let saves = [];
let statuses = {};
function reset() {
  saves = [];
  statuses = {};
  TAGE.slice(0, 10).forEach(d => { statuses[d] = { gl: { status: 'proposed', crewName: 'Anna Crew' } }; });
}
reset();
const planData = () => ({
  tourDates: TAGE.map(d => ({ date: d, type: 'show', typeLabel: 'Show', loc: 'Ort', blockId: 'B1', blockName: 'Block 1' })),
  crew: ['Anna Crew', 'Ben Crew'], positions: POS,
  assignments: Object.fromEntries(TAGE.map((d, i) => [d, { gl: i < 10 ? 'Anna Crew' : 'Ben Crew' }]))
});
// Mail-Log: Anna eingeladen (success 'true'), Ben nur ein FEHLGESCHLAGENER Versuch → darf NICHT als eingeladen zählen.
const emailLog = [
  { email_type: 'invite', success: 'true', crew_email: 'anna@x.de', crew_name: 'Anna Crew', sent_at: '2026-11-14 10:00:00.000Z', plan_id: PB },
  { email_type: 'invite', success: 'false', crew_email: 'ben@x.de', crew_name: 'Ben Crew', sent_at: '2026-11-14 10:01:00.000Z', plan_id: PB }
];

const SEITE = (phase, bar) => `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Crewsave-Prüfstand</title>
<style>
  :root{--accent:#e8c84a;--on-accent:#111;--panel2:#222;--rule-2:#444;--rule:#333;--muted:#888;--ink:#eee;--ink-2:#ccc;
        --warn:#e84a4a;--show:#4ae8a0;--pencilled:#7A5FB3;--accent-wash-2:#333;}
  body{background:#111;color:var(--ink);font-family:monospace;}
</style><link rel="stylesheet" href="styles.css"></head><body>
<table id="viewTable"><thead id="tHead"></thead><tbody id="tBody"></tbody></table>
<div id="viewBlocks"></div><div id="viewCrew"></div><div id="viewMeta"></div>
<div id="kpiStrip"></div><div id="statsBar"></div><div id="toast"></div>
${bar}
<div id="notifyHost"></div>
<pre id="ergebnis" data-fertig="0"></pre>
<script>window.POCKETBASE_URL = location.origin;</script>
<script type="module">
import * as state from './js/state.js';
import * as dlg from './js/dialog.js';
import * as uv from './js/userView.js';
import * as dsv from './js/dataService.js';
import * as cn from './js/crewNotify.js';
import { loadDraft, draftKey } from './js/crewDraft.js';

const PHASE = ${phase};
const TAGE = ${JSON.stringify(TAGE)};
const aus = document.getElementById('ergebnis');
const log = (s) => { aus.textContent += s + '\\n'; };
const warte = (ms) => new Promise(r => setTimeout(r, ms));
let unbehandelt = [];
window.addEventListener('error', (e) => unbehandelt.push('error: ' + (e.message || e)));
window.addEventListener('unhandledrejection', (e) => unbehandelt.push('unhandledrejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
const pruefe = (name, ok, info) => log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' | ' + info : ''));
const stats = async () => (await fetch('/__stats')).json();
const entwurfRoh = () => { try { return localStorage.getItem(draftKey('${PB}')); } catch (e) { return 'ls-fehler'; } };
const bar = () => document.getElementById('crewSaveBar');
const barSichtbar = () => bar() && bar().style.display !== 'none';
// Dialog des Projekts (js/dialog.js): sichtbar? Text? Knopf drücken.
const dlgSichtbar = () => { const o = document.getElementById('sp-dlg-ov'); return !!o && o.style.display !== 'none'; };
const dlgText = () => (document.getElementById('sp-dlg-msg') || {}).textContent || '';
const dlgKlick = (cls) => document.querySelector('#sp-dlg-btns .' + cls).click();
async function warteBis(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await warte(20); } return false; }

async function crewLaden() {
  state.setAuthState('u1', 'anna@x.de', 'crew');
  localStorage.setItem('pb_token', 't');
  await dsv.loadPlanForCrew();
  await dsv.loadAssignmentStatuses();
}

try {
  if (PHASE === 1) {
    localStorage.clear();
    await fetch('/__reset');
    await crewLaden();
    pruefe('Plan geladen (Plan-ID, 11 Tage)', dsv.getCrewLoadedPlanId() === '${PB}' && state.TOUR_DATES.length === 11, 'plan=' + dsv.getCrewLoadedPlanId());

    // 3 Änderungen → Leiste → Verwerfen (Dialog bestätigt) → Entwurf leer
    ['2026-09-01', '2026-09-02', '2026-09-03'].forEach(d => uv.queueCrewChange(d, 'gl', 'confirmed'));
    pruefe('3 Aenderungen im Entwurf', uv.getCrewDraft().changes.length === 3, 'n=' + uv.getCrewDraft().changes.length);
    pruefe('Leiste sichtbar, Text "3 ungespeicherte"', barSichtbar() && document.getElementById('crewSaveCount').textContent.startsWith('3 '),
           document.getElementById('crewSaveCount').textContent);
    const verwerfen = uv.discardMyChanges();
    const dlgDa = await warteBis(dlgSichtbar);
    pruefe('Verwerfen fragt ueber showConfirm (eigener Dialog)', dlgDa && /3 ungespeicherte/.test(dlgText()), dlgText());
    if (dlgDa) dlgKlick('sp-btn-ok');
    await verwerfen;
    pruefe('nach Verwerfen: Entwurf leer', uv.getCrewDraft().changes.length === 0 && entwurfRoh() === null, 'raw=' + entwurfRoh());
    pruefe('nach Verwerfen: Leiste weg', !barSichtbar());
    pruefe('Verwerfen schrieb nichts an den Server', (await stats()).crewsave.length === 0);

    // Gegenprobe Abbrechen: Entwurf muss stehen bleiben
    uv.queueCrewChange('2026-09-01', 'gl', 'confirmed');
    const abbr = uv.discardMyChanges();
    await warteBis(dlgSichtbar); dlgKlick('sp-btn-cancel'); await abbr;
    pruefe('Abbrechen im Dialog laesst den Entwurf stehen', uv.getCrewDraft().changes.length === 1);
    uv.queueCrewChange('2026-09-01', 'gl', 'proposed');   // zurueck auf Ausgangsstatus → Eintrag weg
    pruefe('zurueck auf Ausgangsstatus entfernt den Eintrag', uv.getCrewDraft().changes.length === 0);

    // 7 Änderungen (gemischt) stehen lassen → Neuladen
    TAGE.slice(0, 7).forEach((d, i) => uv.queueCrewChange(d, 'gl', i % 2 ? 'declined' : 'confirmed'));
    pruefe('7 Aenderungen im Entwurf (persistiert)', uv.getCrewDraft().changes.length === 7 && JSON.parse(entwurfRoh()).changes.length === 7);
    pruefe('es gab bisher keinen /crewsave', (await stats()).crewsave.length === 0);
  } else {
    // ── Phase 2: frischer Start, Entwurf nur aus dem localStorage ──
    pruefe('Entwurf nach Neuladen im localStorage (7)', entwurfRoh() && JSON.parse(entwurfRoh()).changes.length === 7);
    await crewLaden();
    const oeffnen = uv.checkCrewDraftOnOpen();
    const dlgDa = await warteBis(dlgSichtbar);
    pruefe('Dialog "ungespeicherte Aenderungen (7)" erscheint', dlgDa && /ungespeicherte Änderungen \\(7\\)/.test(dlgText()), dlgText());
    pruefe('Leiste steht ebenfalls', barSichtbar());
    pruefe('vor Speichern kein /crewsave', (await stats()).crewsave.length === 0);
    if (dlgDa) dlgKlick('sp-btn-ok');
    await oeffnen;
    const s = await stats();
    pruefe('genau EIN /crewsave', s.crewsave.length === 1, 'n=' + s.crewsave.length);
    const b = s.crewsave[0] || { changes: [] };
    pruefe('... mit 7 Aenderungen und der Plan-ID', b.changes.length === 7 && b.planId === '${PB}', 'changes=' + b.changes.length + ' plan=' + b.planId);
    pruefe('... jede Aenderung traegt from und to', b.changes.length === 7 && b.changes.every(c => c.from === 'proposed' && (c.to === 'confirmed' || c.to === 'declined')));
    pruefe('nach Speichern: Entwurf leer, Leiste weg', uv.getCrewDraft().changes.length === 0 && entwurfRoh() === null && !barSichtbar());
    pruefe('Status neu geladen (Tag 1 bestaetigt)', (state.assignmentStatuses['2026-09-01'] || {}).gl?.status === 'confirmed');

    // Konsole (Planer): „Eingeladen am" kommt aus dem Mail-Log, nicht aus dem Browser
    state.setAuthState('m1', 'mgr@x.de', 'manager');
    localStorage.setItem('tourplan_pb_default', '${PB}');
    state.crewMeta['Anna Crew'] = { email: 'anna@x.de' };
    state.crewMeta['Ben Crew'] = { email: 'ben@x.de' };
    await cn.renderCrewNotifyInto('notifyHost');
    const txt = document.getElementById('notifyHost').textContent;
    pruefe('Konsole zeigt "📧 Eingeladen am 14.11.2026" (Anna, aus email_log)', txt.includes('📧 Eingeladen am 14.11.2026'), txt.slice(0, 160));
    pruefe('genau eine Person als eingeladen (Ben: nur success=false → "Noch nicht eingeladen")',
           (txt.match(/Eingeladen am/g) || []).length === 1 && txt.includes('Noch nicht eingeladen'));
    pruefe('Status-Zaehlung getrennt sichtbar (✅ bestaetigt)', txt.includes('✅') && txt.includes('bestätigt'));
  }
} catch (e) {
  log('AUSNAHME ' + (e && e.message));
  log((e && e.stack || '').split('\\n').slice(0, 6).join('\\n'));
}
for (const u of unbehandelt) log('FAIL unbehandelt: ' + u.split('\\n').slice(0, 2).join(' | '));
aus.setAttribute('data-fertig', '1');
<\/script></body></html>`;

const TYPEN = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

// Leistenmarkup aus index.html GESCHNITTEN (nicht abgeschrieben)
async function barMarkup() {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const von = html.indexOf('<div id="crewSaveBar"');
  const ende = html.indexOf('</div>\n<!--', von);
  if (von < 0 || ende < 0) throw new Error('crewSaveBar nicht in index.html gefunden');
  return html.slice(von, ende + 6);
}
const bar = await barMarkup();

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const pfad = decodeURIComponent(u.pathname);
  if (pfad === '/__phase1') { res.writeHead(200, { 'Content-Type': TYPEN['.html'] }); return res.end(SEITE(1, bar)); }
  if (pfad === '/__phase2') { res.writeHead(200, { 'Content-Type': TYPEN['.html'] }); return res.end(SEITE(2, bar)); }
  if (pfad === '/__reset') { reset(); return json(res, 200, {}); }
  if (pfad === '/__stats') return json(res, 200, { crewsave: saves });
  if (pfad === '/myplans') return json(res, 200, [{ id: PB, name: 'Provinz' }]);
  if (pfad === '/myplan/' + PB) return json(res, 200, { id: PB, name: 'Provinz', plan_data: planData() });
  if (pfad === '/planstatus/' + PB) return json(res, 200, { statuses, cancelled: [] });
  if (pfad === '/api/collections/email_log/records') return json(res, 200, { items: emailLog, page: 1, perPage: 200, totalPages: 1 });
  if (pfad === '/api/collections/activity_log/records') return json(res, 200, { items: [], page: 1, perPage: 200, totalPages: 1 });
  if (pfad === '/crewsave' && req.method === 'POST') {
    let body = ''; for await (const c of req) body += c;
    const b = JSON.parse(body);
    saves.push(b);
    (b.changes || []).forEach(c => { (statuses[c.date] = statuses[c.date] || {})[c.posId] = { status: c.to, crewName: 'Anna Crew' }; });
    return json(res, 200, { ok: true });
  }
  const rel = normalize(pfad).replace(/^(\.\.[/\\])+/, '');
  try {
    const inhalt = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': TYPEN[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(inhalt);
  } catch { res.writeHead(404); res.end('404 ' + rel); }
});

function chromeLauf(profil, seite) {
  return new Promise((resolve) => {
    const c = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + profil,
      '--virtual-time-budget=12000', '--dump-dom', `http://localhost:${PORT}/${seite}`]);
    let dom = '';
    const kill = setTimeout(() => c.kill('SIGKILL'), 60000);
    c.stdout.on('data', d => { dom += d; });
    c.on('close', () => {
      clearTimeout(kill);
      const m = dom.match(/<pre id="ergebnis"[^>]*>([\s\S]*?)<\/pre>/);
      resolve({ text: (m ? m[1] : '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
                fertig: /data-fertig="1"/.test(dom) });
    });
  });
}

server.listen(PORT, async () => {
  if (!process.argv.includes('--run')) {
    console.log(`Crewsave-Prüfstand auf http://localhost:${PORT}/__phase1 (dann /__phase2) — Strg+C beendet ihn.`);
    return;
  }
  const profil = mkdtempSync(join(tmpdir(), 'crewsave-profil-'));
  let zeilen = [];
  for (const seite of ['__phase1', '__phase2']) {
    const r = await chromeLauf(profil, seite);
    if (!r.text || !r.fertig) { zeilen.push('FAIL ' + seite + ': KEIN ERGEBNIS (Prüfstand nicht fertig) — nicht als „alles gut" lesen'); break; }
    zeilen = zeilen.concat(r.text.split('\n').filter(Boolean));
  }
  rmSync(profil, { recursive: true, force: true });
  console.log(zeilen.join('\n'));
  const fail = zeilen.filter(z => z.startsWith('FAIL') || z.startsWith('AUSNAHME'));
  console.log(`\n→ ${zeilen.filter(z => z.startsWith('PASS')).length} PASS, ${fail.length} FAIL`);
  server.close();
  process.exit(fail.length ? 1 : 0);
});
