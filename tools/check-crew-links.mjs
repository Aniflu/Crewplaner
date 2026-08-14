#!/usr/bin/env node
// Findet Crew-Mitglieder, die in einer Tour STEHEN, aber keinen crew_members-Datensatz haben.
//
// Warum es das gibt: Bis v0.8.2 legte der `+`-Knopf im Dialog „Crew & Positionen" nur einen
// NAMEN an (crew.push in js/crew.js) — der crew_members-Datensatz entsteht aber ausschließlich
// in saveCrewLink (js/dataService.js). Wer so hereinkam, existierte nur als Zeichenkette in
// plan_data.crew. Folge, beides unsichtbar:
//
//   · keine Anfrage-/Einladungsmail — der Hook steigt bei leerer crew_email still aus;
//   · seit v0.8.1 sieht die Person die Tour ÜBERHAUPT NICHT — /myplan und /myplans prüfen
//     genau auf diesen Datensatz.
//
// v0.8.3 verhindert NEUE Fälle (Adresse ist Pflicht). Dieses Werkzeug findet die alten.
// Es liest ausschließlich und ändert nichts.
//
//   PB_USER=… PB_PASS=… node tools/check-crew-links.mjs
//   node tools/check-crew-links.mjs --only=live
//
// Zugang: Superuser-Datei unter PB_CRED, falls vorhanden — sonst das NORMALE App-Login über
// PB_USER/PB_PASS. Die App-Rolle `superadmin` darf plans und crew_members lesen, das genügt
// hier vollständig. Das Werkzeug ist bewusst nicht auf den Superuser angewiesen: Marco hat
// keinen Server-Zugang, und die Superuser-Datei ist nichts, worauf man sich verlassen sollte.
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const INSTANZEN = {
  test: 'https://api-test.crewplanner.nyxlightwork.de',
  live: 'https://api.crewplanner.nyxlightwork.de',
};

const args = process.argv.slice(2);
const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1];
const CRED = process.env.PB_CRED || join(homedir(),
  '.claude/projects/-Users-marcohoch-Library-CloudStorage-Dropbox-Incomming-github-Crewplaner/pb-admin.local.json');

const norm = s => String(s ?? '').trim().toLowerCase();

let superCred = null;
try { superCred = JSON.parse(readFileSync(CRED, 'utf8')); } catch { /* kein Superuser — App-Konto */ }

async function anmelden(base, instName) {
  const s = superCred?.instances?.[instName];
  if (s?.identity && s?.password) {
    const r = await fetch(base + '/api/collections/_superusers/auth-with-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: s.identity, password: s.password }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.token) return { token: j.token, als: 'Superuser' };
  }
  if (!process.env.PB_USER || !process.env.PB_PASS)
    throw new Error('Keine Zugangsdaten — PB_USER und PB_PASS setzen (dein normales App-Login)');
  const r = await fetch(base + '/api/collections/users/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_USER, password: process.env.PB_PASS }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error('Anmeldung fehlgeschlagen: ' + (j.message || r.status));
  if (j.record?.role !== 'superadmin')
    console.log(`   ⚠ Rolle "${j.record?.role}" — es werden nur eigene Touren geprüft`);
  return { token: j.token, als: `App-Konto (${j.record?.role || '?'})` };
}

async function hole(base, token, pfad) {
  const r = await fetch(base + pfad, { headers: { Authorization: token } });
  if (!r.ok) throw new Error(`HTTP ${r.status} bei ${pfad}`);
  return r.json();
}

async function pruefe(name, base) {
  console.log(`\n── ${name.toUpperCase()} · ${base}`);
  const { token, als } = await anmelden(base, name);
  console.log(`   angemeldet als ${als}`);

  const plaene = (await hole(base, token, '/api/collections/plans/records?perPage=200')).items || [];
  if (!plaene.length) { console.log('   keine Touren sichtbar'); return 0; }

  let funde = 0;
  for (const p of plaene) {
    // plan_data ist ein JSON-Feld; über die REST-API kommt es als Objekt, nach einem
    // Schema-Reimport aber auch schon einmal als String an — beides abfangen.
    let pd = p.plan_data;
    if (typeof pd === 'string') { try { pd = JSON.parse(pd); } catch { pd = {}; } }
    const namen = Array.isArray(pd?.crew) ? pd.crew : [];

    const mitglieder = (await hole(base, token,
      `/api/collections/crew_members/records?perPage=500&filter=(plan_id="${p.id}")`)).items || [];
    const nachName = new Map(mitglieder.map(m => [norm(m.name), m]));

    const ohneDatensatz = [];
    const ohneMail = [];
    for (const n of namen) {
      const m = nachName.get(norm(n));
      if (!m) ohneDatensatz.push(n);
      else if (!norm(m.email)) ohneMail.push(n);
    }

    if (!ohneDatensatz.length && !ohneMail.length) {
      console.log(`   ✓ ${p.name} — ${namen.length} Personen, alle verknüpft`);
      continue;
    }
    console.log(`   ✗ ${p.name}`);
    for (const n of ohneDatensatz)
      console.log(`       ${n} — kein crew_members-Datensatz: bekommt keine Anfrage UND sieht die Tour nicht`);
    for (const n of ohneMail)
      console.log(`       ${n} — Datensatz da, aber ohne Adresse: bekommt keine Anfrage`);
    funde += ohneDatensatz.length + ohneMail.length;
  }
  return funde;
}

let summe = 0, fehler = 0;
for (const [name, base] of Object.entries(INSTANZEN)) {
  if (ONLY && name !== ONLY) continue;
  // Ein Aussetzer auf einer Instanz darf die andere nicht verschlucken — sonst sieht ein
  // Netzfehler aus wie „alles in Ordnung".
  try { summe += await pruefe(name, base); }
  catch (e) { console.log(`   ✗ ${e.message}`); fehler++; }
}

if (summe === 0 && !fehler) {
  console.log('\nErgebnis: jede Person in einer Tour hat einen Datensatz mit Adresse. ✓');
} else {
  console.log(`\nErgebnis: ${summe} Fund(e)${fehler ? `, ${fehler} Instanz(en) nicht prüfbar` : ''}.`);
  // Reparaturhinweis nur, wenn es auch etwas zu reparieren gibt — sonst liest sich ein reiner
  // Zugangsfehler wie ein Datenproblem.
  if (summe > 0)
    console.log('Reparatur: Konsole → Werkzeuge → „Crew verknüpfen" (Adresse eintragen legt den Datensatz an).');
}
process.exit(summe > 0 || fehler ? 1 : 0);
