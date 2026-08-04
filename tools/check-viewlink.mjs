#!/usr/bin/env node
// Prüft den öffentlichen Booker-Link Ende-zu-Ende gegen das echte Backend.
//
// Warum es das gibt: Die öffentliche Ansicht ist die einzige Oberfläche, die niemand
// täglich benutzt — sie bricht bei Änderungen an Zugriffsregeln oder Datenpfaden und
// fällt erst auf, wenn man sie jemandem zeigen will. Sie war schon dreimal kaputt:
//   • v0.27.2  Termine da, aber ALLE Zellen leer (window.* statt state.js-Setter)
//   • 2026-07-04  Tour unsichtbar, weil dem Plan der view_token fehlte
//   • v0.5.2   Status-Farben weg, als `assignments` geschlossen wurde
// Die Unit-Guards fangen das nicht: sie prüfen Code, nicht ob mit echtem Backend
// Termine, Namen UND Status ankommen.
//
//   node tools/check-viewlink.mjs              → beide Umgebungen
//   node tools/check-viewlink.mjs --only=test
//
// Zugangsdaten aus der lokalen Superuser-Datei (Pfad via PB_CRED überschreibbar) —
// gebraucht wird nur ein echter view_token, den es anonym absichtlich nicht mehr gibt.
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CRED = process.env.PB_CRED || join(homedir(),
  '.claude/projects/-Users-marcohoch-Library-CloudStorage-Dropbox-Incomming-github-Crewplaner/pb-admin.local.json');

const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];

let fehler = 0;
const pruef = (ok, text, detail = '') => {
  if (!ok) fehler++;
  console.log(`     ${ok ? '✓' : '✗'} ${text}${detail ? ' — ' + detail : ''}`);
  return ok;
};

async function auth(inst) {
  const r = await fetch(inst.base_url + '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: inst.identity, password: inst.password }),
  });
  const j = await r.json();
  if (!j.token) throw new Error('Anmeldung fehlgeschlagen: ' + (j.message || r.status));
  return j.token;
}

async function pruefeInstanz(name, inst) {
  console.log(`\n── ${name.toUpperCase()} · ${inst.base_url}`);
  let token;
  try { token = await auth(inst); }
  catch (e) { console.log(`   ✗ ${e.message}`); fehler++; return; }

  const plans = await fetch(`${inst.base_url}/api/collections/plans/records?perPage=50`,
    { headers: { Authorization: token } }).then(r => r.json());
  const mitToken = (plans.items || []).filter(p => p.view_token);
  if (!mitToken.length) {
    console.log('   ✗ kein Plan mit view_token — es gibt gar keinen Booker-Link');
    fehler++; return;
  }
  console.log(`   ${mitToken.length} von ${plans.totalItems} Plänen haben einen Link`);

  for (const plan of mitToken) {
    console.log(`   ▸ ${plan.name}`);
    const vt = plan.view_token;

    // 1) Plan über die Route — das, was view.html als Erstes tut
    // Plan- und Status-Route bewusst UNABHÄNGIG prüfen: fehlt die eine (z.B. Hook noch
    // nicht deployt), soll die andere trotzdem gemeldet werden — sonst verdeckt ein
    // fehlender Deploy die eigentliche Diagnose.
    let pj = null;
    try {
      const r = await fetch(`${inst.base_url}/viewplan/${encodeURIComponent(vt)}`);
      if (pruef(r.ok, 'Plan-Route antwortet', r.ok ? '' : 'HTTP ' + r.status)) pj = await r.json();
    } catch (e) { pruef(false, 'Plan-Route antwortet', e.message); }

    if (pj) {
      const pd = typeof pj.plan_data === 'string' ? JSON.parse(pj.plan_data) : pj.plan_data;
      pruef(!!pj.name, 'Plantitel vorhanden', pj.name || '');
      const tage = (pd?.tourDates || []).length;
      pruef(tage > 0, 'Termine vorhanden', tage + ' Tage');
      const crew = (pd?.crew || []).length;
      pruef(crew > 0, 'Crew-Namen vorhanden', crew + ' Personen');
      const pos = (pd?.positions || []).length;
      pruef(pos > 0, 'Positionen vorhanden', pos + '');

      // 2) Nichts Vertrauliches im Payload
      const roh = JSON.stringify(pj);
      pruef(!/view_token/.test(roh), 'kein view_token im Payload');
      pruef(!/"owner"/.test(roh), 'keine Owner-ID im Payload');
      pruef(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(roh), 'keine E-Mail-Adresse im Payload');
    }

    // 3) Status-Route — die Farben, die schon zweimal still verschwunden sind
    try {
      const r = await fetch(`${inst.base_url}/viewstatus/${encodeURIComponent(vt)}`);
      if (pruef(r.ok, 'Status-Route antwortet', r.ok ? '' : 'HTTP ' + r.status)) {
        const sj = await r.json();
        const tageMitStatus = Object.keys(sj.statuses || {}).length;
        pruef(tageMitStatus > 0, 'Status-Farben werden geliefert', tageMitStatus + ' Tage');
        pruef(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(JSON.stringify(sj)), 'keine E-Mail-Adresse im Status-Payload');
      }
    } catch (e) { pruef(false, 'Status-Route antwortet', e.message); }
  }

  // 4) Erfundener Token darf nichts liefern
  console.log('   ▸ Missbrauchsproben');
  for (const route of ['viewplan', 'viewstatus']) {
    const r = await fetch(`${inst.base_url}/${route}/nicht-existierender-token-xyz`);
    pruef(r.status === 404, `${route}: erfundener Token → 404`, 'HTTP ' + r.status);
  }
  // 5) Und die Tokens dürfen nicht anonym auffindbar sein (Befund 2026-08-04)
  const anon = await fetch(`${inst.base_url}/api/collections/plans/records?perPage=50`)
    .then(r => r.text()).catch(() => '');
  pruef(!/"view_token"\s*:\s*"[^"]+"/.test(anon), 'Tokens sind anonym NICHT auffindbar');

  // 6) Crew-Durchlauf: legt ein temporäres Konto für ein echtes crew_members-Mitglied an,
  //    prüft die Routen aus dessen Sicht und räumt danach wieder auf. Genau dieses Muster
  //    hat die Regel-Semantik schon einmal zuverlässig geklärt.
  console.log('   ▸ Crew-Sicht');
  const crewRows = await fetch(`${inst.base_url}/api/collections/crew_members/records?perPage=500`,
    { headers: { Authorization: token } }).then(r => r.json()).catch(() => ({}));
  const proPerson = {};
  for (const c of (crewRows.items || [])) {
    if (!c.email || c.plan_id === '__pool__') continue;
    (proPerson[c.email] = proPerson[c.email] || new Set()).add(c.plan_id);
  }
  // Jemanden nehmen, der NICHT in allen Touren steckt — sonst prüft „fremde Tour" nichts —
  // und der noch KEIN Konto hat, damit wir keinem echten Nutzer das Passwort überschreiben
  // und ihn hinterher löschen.
  const bestehende = await fetch(`${inst.base_url}/api/collections/users/records?perPage=500`,
    { headers: { Authorization: token } }).then(r => r.json()).catch(() => ({}));
  const hatKonto = new Set((bestehende.items || []).map(u => (u.email || '').toLowerCase()));
  const alle = mitToken.length;
  const teilweise = Object.entries(proPerson).filter(([, ps]) => ps.size > 0 && ps.size < alle);
  const kandidat = teilweise.find(([m]) => !hatKonto.has(m.toLowerCase()));
  if (!kandidat) {
    // Beide Gründe auseinanderhalten — sonst behauptet die Ausgabe etwas Falsches.
    console.log(teilweise.length
      ? `     — übersprungen: alle ${teilweise.length} geeigneten Personen haben schon ein Konto`
        + ' (kein Konto anlegen/löschen auf fremden Nutzern)'
      : '     — übersprungen: niemand ist in nur einem Teil der Touren');
    return;
  }
  const [mail, eigene] = kandidat;
  const pw = 'PruefLauf-' + Math.random().toString(36).slice(2, 10);
  let uid = null;
  try {
    const cr = await fetch(`${inst.base_url}/api/collections/users/records`, {
      method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, password: pw, passwordConfirm: pw,
                             role: 'crew', emailVisibility: true, verified: true }),
    }).then(r => r.json());
    if (!cr.id) { console.log('     — übersprungen: Konto für ' + mail + ' existiert schon oder ist nicht anlegbar'); return; }
    uid = cr.id;

    const ut = await fetch(`${inst.base_url}/api/collections/users/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: mail, password: pw }),
    }).then(r => r.json());
    if (!pruef(!!ut.token, `Anmeldung als ${mail}`)) return;
    const H = { Authorization: 'Bearer ' + ut.token };

    const meine = await fetch(`${inst.base_url}/myplans`, { headers: H }).then(r => r.json()).catch(() => null);
    pruef(Array.isArray(meine) && meine.length === eigene.size,
      'sieht genau die eigenen Touren', `${Array.isArray(meine) ? meine.length : '?'} von ${alle}`);
    pruef(!/view_token/.test(JSON.stringify(meine || {})), 'kein view_token in /myplans');

    const eigeneId = [...eigene][0];
    const fremde = mitToken.find(p => !eigene.has(p.id));
    const r1 = await fetch(`${inst.base_url}/myplan/${eigeneId}`, { headers: H });
    pruef(r1.ok, 'eigene Tour ist ladbar', 'HTTP ' + r1.status);
    if (r1.ok) {
      const t1 = await r1.text();
      pruef(!/view_token/.test(t1), 'kein view_token in /myplan');
      pruef(!/"owner"/.test(t1), 'keine Owner-ID in /myplan');
    }
    if (fremde) {
      const r2 = await fetch(`${inst.base_url}/myplan/${fremde.id}`, { headers: H });
      pruef(r2.status === 404, 'fremde Tour → 404', 'HTTP ' + r2.status);
    }
    // Gegenprobe: der direkte REST-Weg muss der Crew verschlossen sein
    const r3 = await fetch(`${inst.base_url}/api/collections/plans/records/${eigeneId}`, { headers: H });
    pruef(r3.status === 404, 'plans-REST ist für Crew zu', 'HTTP ' + r3.status);
  } finally {
    if (uid) {
      const del = await fetch(`${inst.base_url}/api/collections/users/records/${uid}`,
        { method: 'DELETE', headers: { Authorization: token } });
      pruef(del.ok, 'Prüfkonto wieder entfernt', 'HTTP ' + del.status);
    }
  }
}

let cred;
try { cred = JSON.parse(readFileSync(CRED, 'utf8')); }
catch { console.error(`Zugangsdaten nicht lesbar: ${CRED}\n(Pfad via PB_CRED setzen)`); process.exit(2); }

const instanzen = Object.entries(cred.instances || {}).filter(([n]) => !ONLY || n === ONLY);
if (!instanzen.length) { console.error('Keine passende Instanz in der Zugangsdatei.'); process.exit(2); }

for (const [name, inst] of instanzen) await pruefeInstanz(name, inst);

console.log(fehler === 0
  ? '\nErgebnis: der öffentliche Link funktioniert vollständig.'
  : `\nErgebnis: ${fehler} Problem(e) — der Link ist NICHT vorzeigbar.`);
process.exit(fehler === 0 ? 0 : 1);
