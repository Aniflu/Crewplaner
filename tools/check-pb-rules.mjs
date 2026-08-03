#!/usr/bin/env node
// Prüft die gehärteten PocketBase-Zugriffsregeln auf BEIDEN Instanzen gegen den Soll-Stand.
//
// Warum es das gibt: Coolify-Redeploy und Schema-Reimport setzen die Regeln auf den
// permissiven Stand zurück — in diesem Projekt mehrfach passiert. Zuletzt am 2026-08-03
// entdeckt: `assignments.listRule` war LEER, also waren 913 Zuweisungen inkl. 10 echter
// Crew-Mailadressen ohne jede Anmeldung abrufbar. Ohne regelmäßige Prüfung fällt so etwas
// erst auf, wenn jemand danach sucht.
//
//   node tools/check-pb-rules.mjs            → nur prüfen (Exit 1 bei Abweichung)
//   node tools/check-pb-rules.mjs --fix      → Abweichungen zurücksetzen
//   node tools/check-pb-rules.mjs --only=live
//
// Zugangsdaten kommen NICHT aus dem Repo, sondern aus der lokalen Superuser-Datei
// (Standardpfad unten, überschreibbar via PB_CRED=/pfad/zur/datei.json). Aufbau:
//   { "instances": { "live": {"base_url","identity","password"}, "test": {…} } }
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CRED = process.env.PB_CRED || join(homedir(),
  '.claude/projects/-Users-marcohoch-Library-CloudStorage-Dropbox-Incomming-github-Crewplaner/pb-admin.local.json');

// ── Soll-Regeln (Stand 2026-08-03, nach dem Schließen des assignments-Lecks) ──
// Nur sicherheitsrelevante Regeln. Was hier NICHT steht, wird nicht geprüft.
const SOLL = {
  users: {
    listRule:   '@request.auth.role = "superadmin"',
    updateRule: '@request.auth.role = "superadmin"',
    deleteRule: '@request.auth.role = "superadmin"',
    // v0.5.1 — nur vorher angelegte Adressen dürfen ein Konto anlegen
    createRule: '@collection.crew_members.email ?= email',
  },
  assignments: {
    // 2026-08-03: war LEER = weltöffentlich (Mailadressen!). Nie wieder leer lassen.
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    // v0.26.0 — Crew ändert nur EIGENE Einsätze
    updateRule: '@request.auth.role = "superadmin" || (@request.auth.id != "" && crew_email = @request.auth.email) || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)',
  },
  crew_invites: {
    // v0.26.0 — nur Owner/superadmin dürfen an Fremde mailen; „availability" geht an den Admin
    createRule: '@request.auth.role = "superadmin" || (@request.auth.id != "" && type = "availability") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)',
  },
  plans: {
    // öffentlich lesbar NUR mit view_token (Booker-Link) — bewusst so
    listRule:   '@request.auth.id = owner || @request.auth.role = "superadmin" || view_token != ""',
    viewRule:   '@request.auth.id = owner || @request.auth.role = "superadmin" || view_token != ""',
    updateRule: '@request.auth.id = owner || @request.auth.role = "superadmin"',
    deleteRule: '@request.auth.id = owner || @request.auth.role = "superadmin"',
  },
  crew_members: {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
  },
};

const args = process.argv.slice(2);
const FIX  = args.includes('--fix');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1];

const norm = v => String(v ?? '').trim();

async function auth(inst) {
  const r = await fetch(inst.base_url + '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: inst.identity, password: inst.password }),
  });
  const j = await r.json();
  if (!j.token) throw new Error('Anmeldung fehlgeschlagen: ' + (j.message || r.status));
  return j.token;
}

async function pruefe(name, inst) {
  console.log(`\n── ${name.toUpperCase()} · ${inst.base_url}`);
  let token;
  try { token = await auth(inst); }
  catch (e) { console.log(`   ✗ ${e.message}`); return 1; }

  let abweichungen = 0;
  for (const [coll, regeln] of Object.entries(SOLL)) {
    const res = await fetch(`${inst.base_url}/api/collections/${coll}`, { headers: { Authorization: token } });
    if (!res.ok) { console.log(`   ✗ ${coll}: nicht lesbar (HTTP ${res.status})`); abweichungen++; continue; }
    const def = await res.json();
    const patch = {};
    for (const [regel, soll] of Object.entries(regeln)) {
      const ist = norm(def[regel]);
      if (ist === norm(soll)) continue;
      abweichungen++;
      const istTxt = def[regel] === null ? '(nur superuser)' : ist === '' ? '(LEER = öffentlich!)' : ist;
      console.log(`   ✗ ${coll}.${regel}\n       ist:  ${istTxt}\n       soll: ${soll}`);
      patch[regel] = soll;
    }
    if (FIX && Object.keys(patch).length) {
      const p = await fetch(`${inst.base_url}/api/collections/${coll}`, {
        method: 'PATCH', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      console.log(p.ok ? `   → ${coll}: ${Object.keys(patch).length} Regel(n) zurückgesetzt ✓`
                       : `   → ${coll}: Zurücksetzen FEHLGESCHLAGEN (HTTP ${p.status})`);
    }
  }

  // Gegenprobe von außen: was liefert die API OHNE Anmeldung?
  console.log('   Ohne Anmeldung abrufbar:');
  for (const coll of ['assignments', 'crew_members', 'users', 'plans']) {
    const r = await fetch(`${inst.base_url}/api/collections/${coll}/records?perPage=1`);
    const j = await r.json().catch(() => ({}));
    const n = j.totalItems ?? 'gesperrt';
    // plans ist bewusst öffentlich (Booker-Link), alles andere muss 0 sein
    const ok = coll === 'plans' ? true : (n === 0 || n === 'gesperrt');
    if (!ok) abweichungen++;
    console.log(`     ${ok ? '✓' : '✗'} ${coll.padEnd(13)} ${n}${coll === 'plans' ? '  (gewollt: Booker-Link)' : ''}`);
  }
  console.log(abweichungen === 0 ? '   Alles wie erwartet ✓' : `   ${abweichungen} Abweichung(en)`);
  return abweichungen;
}

let cred;
try { cred = JSON.parse(readFileSync(CRED, 'utf8')); }
catch { console.error(`Zugangsdaten nicht lesbar: ${CRED}\n(Pfad via PB_CRED setzen)`); process.exit(2); }

const instanzen = Object.entries(cred.instances || {}).filter(([n]) => !ONLY || n === ONLY);
if (!instanzen.length) { console.error('Keine passende Instanz in der Zugangsdatei.'); process.exit(2); }

let summe = 0;
for (const [name, inst] of instanzen) summe += await pruefe(name, inst);

if (FIX && summe > 0) {
  // Nach dem Reparieren zählt nur noch, was ÜBRIG bleibt — sonst meldet --fix Exit 1,
  // obwohl alles behoben ist, und bricht aufrufende Skripte ab.
  console.log('\n── Nachkontrolle nach --fix');
  let rest = 0;
  for (const [name, inst] of instanzen) rest += await pruefe(name, inst);
  summe = rest;
}

console.log(summe === 0
  ? '\nErgebnis: alle geprüften Regeln stehen richtig.'
  : `\nErgebnis: ${summe} Abweichung(en).` + (FIX ? ' — konnten NICHT behoben werden.' : ' Mit --fix zurücksetzen.'));
process.exit(summe === 0 ? 0 : 1);
