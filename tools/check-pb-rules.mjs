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

// Zugriff auf `plans`: NUR Owner und superadmin (seit v0.6.1).
// Der frühere crew_members-Zweig ist entfallen, weil Crew ihre Touren seit Hook v4.16
// über /myplans und /myplan/{id} lädt und die plans-Collection gar nicht mehr anfasst.
// Damit sieht niemand außer Owner/superadmin je den `view_token` im Payload.
// ⚠️ Meldet Abweichung, solange der Admin die Regel noch nicht nachgezogen hat — das ist
// gewollt und zeigt genau den offenen Schritt an.
const PLANS_RULE = '@request.auth.id = owner || @request.auth.role = "superadmin"';

// v0.8.1 — „Crew sieht nur Namen": superadmin und Tour-Eigentümer sehen alles, ein
// Crew-Konto nur die EIGENEN Einsätze (nötig zum Bestätigen/Absagen).
const OWN_OR_OWNER =
  '@request.auth.role = "superadmin" || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id) || crew_email = @request.auth.email';

// Für crew_members: die Crew braucht die Collection gar nicht mehr (Namen kommen aus
// plan_data und /planstatus, der eigene Name aus /myplan). Deshalb ohne Eigen-Zweig —
// und dieselbe Regel auch für create/update/delete, sonst kann sich jedes Konto per
// Selbstbedienung Zugriff auf fremde Touren verschaffen (Audit K-3).
const OWNER_ONLY =
  '@request.auth.role = "superadmin" || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)';

// v0.8.3 — Crew-Pool: Manager brauchen volle Personalhoheit. Wer eine Tour mit Personal plant,
// muss das Personal auch anlegen können; bis hierher ging das nur als superadmin, weil
// Pool-Einträge `plan_id="__pool__"` tragen und damit auf keinen plans-Record zeigen.
//
// Der Manager-Zweig ist bewusst auf Pool-Einträge BEGRENZT: Manager bekommen den Pool
// vollständig (lesen, anlegen, ändern, löschen), aber keinen Zugriff auf die crew_members
// fremder Touren — sonst wäre K-3 wieder offen. Crew- und Booker-Konten ändert sich nichts,
// „Crew sieht nur Namen" (v0.8.1) bleibt unangetastet.
//
// ⚠️ Folge, die bewusst in Kauf genommen wird: users.createRule ist
// `@collection.crew_members.email ?= email`. Ein Manager, der jemanden in den Pool legt,
// erteilt damit die Registrierungsfreigabe. Das ist die direkte Bedeutung von Personalhoheit.
const POOL_OR_OWNER =
  '@request.auth.role = "superadmin" || (plan_id = "__pool__" && @request.auth.role = "manager") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)';

// ── Soll-Regeln (Stand 2026-08-04, nach dem Schließen von assignments UND plans) ──
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
    //
    // v0.8.1: `@request.auth.id != ""` reichte nicht — damit konnte JEDES angemeldete Konto
    // ALLE Einsätze ALLER Touren abrufen, inklusive crew_email jeder Person (Audit K-2).
    // Vorgabe des Users: „Crew-Mitglieder dürfen AUSSCHLIESSLICH die Namen sehen, sonst
    // nichts." Die Namen liefert jetzt die Hook-Route /planstatus/{id} (v4.20) ohne
    // Adressen; über die Collection darf die Crew nur noch die EIGENEN Datensätze sehen —
    // das braucht sie zum Bestätigen/Absagen (confirmAssignment sucht per pbFirst).
    listRule:   OWN_OR_OWNER,
    viewRule:   OWN_OR_OWNER,
    // createRule bleibt `auth != ""`: Crew legt beim Bestätigen ggf. den eigenen Record an.
    // v0.26.0 — Crew ändert nur EIGENE Einsätze
    updateRule: '@request.auth.role = "superadmin" || (@request.auth.id != "" && crew_email = @request.auth.email) || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)',
  },
  crew_invites: {
    // v0.26.0 — nur Owner/superadmin dürfen an Fremde mailen; „availability" geht an den Admin
    createRule: '@request.auth.role = "superadmin" || (@request.auth.id != "" && type = "availability") || (@collection.plans.id ?= plan_id && @collection.plans.owner ?= @request.auth.id)',
  },
  plans: {
    // v0.6.0: Der frühere Zweig `|| view_token != ""` machte ALLE Pläne anonym lesbar —
    // inkl. der view_token im Klartext (2026-08-04). Die öffentliche Ansicht holt den Plan
    // jetzt über die Hook-Route /viewplan/{token}; hier darf nur noch Angemeldetes durch.
    // Crew braucht Lesezugriff auf IHRE Touren (loadPlanForCrew/loadCrewPlans) — die
    // crew_members-Bedingung deckt das ab.
    listRule:   PLANS_RULE,
    viewRule:   PLANS_RULE,
    updateRule: '@request.auth.id = owner || @request.auth.role = "superadmin"',
    deleteRule: '@request.auth.id = owner || @request.auth.role = "superadmin"',
  },
  crew_members: {
    // v0.8.1: war `auth != ""` für list/view und komplett offen für create/update/delete.
    // Letzteres war Rechteausweitung: `/myplan/{id}` gewährt Zugriff, wenn ein
    // crew_members-Eintrag mit der eigenen Adresse und der Tour-ID existiert — und den
    // durfte sich jedes Konto selbst anlegen (Audit K-3).
    // v0.8.3: Pool-Zweig für Manager ergänzt (siehe POOL_OR_OWNER). Nach dem Setzen einmal
    // durchspielen — und zwar mit einem echten `manager`-Konto, nicht nur als superadmin:
    // „+ Neues Crew-Mitglied" in der Konsole UND „Crew hinzufügen" in der Tour.
    listRule:   POOL_OR_OWNER,
    viewRule:   POOL_OR_OWNER,
    createRule: POOL_OR_OWNER,
    updateRule: POOL_OR_OWNER,
    deleteRule: POOL_OR_OWNER,
  },
  // Reine Protokolle — die Konsole liest sie, die Crew hat dort nichts zu suchen.
  email_log: {
    listRule: OWNER_ONLY,
    viewRule: OWNER_ONLY,
  },
  activity_log: {
    listRule: OWNER_ONLY,
    viewRule: OWNER_ONLY,
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
  // Am Statuscode NICHT festmachen — PocketBase antwortet bei einer FILTER-Regel mit 200
  // und leerer Liste; nur eine null-Regel gibt 403. Maßgeblich ist totalItems.
  console.log('   Ohne Anmeldung abrufbar:');
  for (const coll of ['assignments', 'crew_members', 'users', 'plans', 'email_log', 'activity_log']) {
    const r = await fetch(`${inst.base_url}/api/collections/${coll}/records?perPage=1`);
    const j = await r.json().catch(() => ({}));
    const n = j.totalItems ?? 'gesperrt';
    const ok = n === 0 || n === 'gesperrt';
    if (!ok) abweichungen++;
    console.log(`     ${ok ? '✓' : '✗'} ${coll.padEnd(13)} ${n}`);
  }

  // CORS: PocketBase antwortet ohne Zutun JEDER Herkunft mit `*`. Seit Hook v4.18 grenzt eine
  // routerUse-Middleware das auf die zur Instanz passende Frontend-Herkunft ein. Die
  // token-geschützten öffentlichen Routen (/viewplan, /viewstatus, /ics) bleiben bewusst offen.
  console.log('   CORS:');
  const eigene = inst.base_url.includes('api-test.')
    ? 'https://aniflu.github.io' : 'https://crewplanner.nyxlightwork.de';
  const acao = async (origin, pfad = '/api/health') => {
    const r = await fetch(inst.base_url + pfad, { headers: { Origin: origin } });
    return r.headers.get('access-control-allow-origin');
  };
  const eigen = await acao(eigene);
  const fremd = await acao('https://evil.example.com');
  if (eigen !== eigene) { abweichungen++; console.log(`     ✗ eigenes Frontend nicht freigegeben — ${eigen}`); }
  else console.log(`     ✓ eigenes Frontend freigegeben (${eigene})`);
  if (fremd === '*' || fremd === 'https://evil.example.com') {
    abweichungen++;
    console.log(`     ✗ fremde Herkunft bekommt Freigabe — ${fremd}  (Hook v4.18 nicht aktiv?)`);
  } else console.log('     ✓ fremde Herkunft bekommt keine Freigabe');

  // Und: die öffentliche Ansicht darf ihre Daten nur noch über die Hook-Routen bekommen.
  // Wenn plans wieder anonym liefert, taucht dort auch der view_token auf — genau das
  // war der Befund vom 2026-08-04.
  const leak = await fetch(`${inst.base_url}/api/collections/plans/records?perPage=50`)
    .then(r => r.text()).catch(() => '');
  if (/"view_token"\s*:\s*"[^"]+"/.test(leak)) {
    abweichungen++;
    console.log('     ✗ view_token liegt anonym offen — plans-Regel ist wieder zu weit');
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
for (const [name, inst] of instanzen) {
  // Ein Aussetzer (Netz, nicht-JSON-Antwort) darf NICHT als Absturz enden — sonst sieht ein
  // echtes Problem aus wie ein Werkzeugfehler. Lieber laut als Abweichung melden.
  try { summe += await pruefe(name, inst); }
  catch (e) { console.log(`   ✗ ${name}: Prüfung abgebrochen — ${e.message}`); summe++; }
}

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
  : `\nErgebnis: ${summe} Abweichung(en).`
    + (FIX ? ' — konnten NICHT behoben werden.'
           : ' Regel-Abweichungen setzt --fix zurück; CORS hängt am Hook (v4.18) und braucht einen Deploy.'));
process.exit(summe === 0 ? 0 : 1);
