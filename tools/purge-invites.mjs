#!/usr/bin/env node
// Räumt alte `crew_invites` weg — die Auslöse-Datensätze verschickter Mails.
//
// Warum es das gibt: Der Hook legt für JEDE Mail einen Datensatz an und löschte ihn nie, obwohl
// ein Kommentar im Code das behauptete. Auf Live lagen am 2026-09-13 deshalb 73 Stück mit Namen
// und Mailadressen von 12 Personen — ohne jede Funktion, denn gelesen wird die Collection nach
// dem Versand von niemandem mehr (das Frontend fasst sie gar nicht an, siehe notify.test.mjs).
//
// Ab Hook v4.27 erledigt das ein täglicher Cron auf dem Server. Dieses Werkzeug bleibt trotzdem:
// Ein Hook-Deploy braucht SSH und damit den Admin — das hier läuft ohne ihn, und es ist der
// einzige Weg, den Bestand von Marcos Rechner aus zu messen.
//
//   node tools/purge-invites.mjs                  → TROCKENLAUF, zeigt nur was wegfiele
//   node tools/purge-invites.mjs --loeschen       → löscht wirklich (sichert vorher als JSON)
//   node tools/purge-invites.mjs --tage=7         → andere Aufbewahrung (Standard: 30)
//   node tools/purge-invites.mjs --only=test
//
// Zugangsdaten kommen NICHT aus dem Repo, sondern aus der Superuser-Datei (Pfad via PB_CRED).
// Aufbau wie bei check-pb-rules.mjs: { "instances": { "live": {...}, "test": {...} } }
//
// ⚠️ Ohne `created`-Feld ist das Alter eines Datensatzes nicht bestimmbar. Das Feld existiert
// seit v0.13.4; Datensätze ohne Zeitstempel fasst dieses Werkzeug NICHT an — im Zweifel nicht
// löschen. Sie müssten von Hand angesehen werden.
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Auswahl: rein, ohne Netz, damit tests/purgeinvites.test.mjs sie prüfen kann ──────────
// Genau hier steckt die Entscheidung „was fliegt raus" — und die ist gegen einen echten
// Bestand nicht erprobbar, solange beide Instanzen leer sind (Stand v0.13.4: 0 und 0).
// `created` lässt sich auch nicht künstlich altern: PocketBase setzt autodate-Felder selbst.
// Deshalb ist die Auswahl als Funktion herausgezogen und wird mit erfundenen Daten geprüft.
export function waehleAlte(datensaetze, grenze) {
  return (datensaetze || []).filter(r => {
    if (!r || !r.created) return false;          // ohne Zeitstempel: im Zweifel NICHT löschen
    const d = new Date(String(r.created).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return false; // unlesbar: ebenfalls stehen lassen
    return d < grenze;
  });
}

export function grenzeFuer(tage, jetzt = Date.now()) {
  return new Date(jetzt - tage * 86400_000);
}

const CRED = process.env.PB_CRED || join(homedir(),
  '.claude/projects/-Users-marcohoch-Library-CloudStorage-Dropbox-Incomming-github-Crewplaner/pb-admin.local.json');

async function anmelden(inst) {
  const r = await fetch(inst.base_url + '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: inst.identity, password: inst.password }),
  });
  if (!r.ok) throw new Error(`Anmeldung fehlgeschlagen (${r.status})`);
  return (await r.json()).token;
}

async function alleHolen(base, token) {
  let page = 1, alle = [];
  for (;;) {
    const r = await fetch(`${base}/api/collections/crew_invites/records?perPage=200&page=${page}`,
      { headers: { Authorization: token } });
    if (!r.ok) throw new Error(`Abruf fehlgeschlagen (${r.status})`);
    const d = await r.json();
    alle.push(...d.items);
    if (page >= d.totalPages) break;
    page++;
  }
  return alle;
}

async function main() {
  const args = process.argv.slice(2);
  const LOESCHEN = args.includes('--loeschen');
  const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1];
  const TAGE = Number((args.find(a => a.startsWith('--tage=')) || '').split('=')[1] || 30);

  if (!Number.isFinite(TAGE) || TAGE < 1) {
    console.error('--tage braucht eine Zahl ≥ 1');
    process.exit(2);
  }

  let cred;
  try { cred = JSON.parse(readFileSync(CRED, 'utf8')); }
  catch { console.error(`Zugangsdaten nicht lesbar: ${CRED}\n(Pfad via PB_CRED setzen)`); process.exit(2); }

  const grenze = grenzeFuer(TAGE);
  let summe = 0;

  for (const [name, inst] of Object.entries(cred.instances || {})) {
    if (ONLY && name !== ONLY) continue;
    console.log(`\n── ${name.toUpperCase()} · ${inst.base_url}`);
    try {
      const token = await anmelden(inst);
      const alle = await alleHolen(inst.base_url, token);
      const ohneStempel = alle.filter(r => !r.created);
      const alt = waehleAlte(alle, grenze);

      console.log(`   Bestand: ${alle.length} · älter als ${TAGE} Tage: ${alt.length}` +
        (ohneStempel.length ? ` · ohne created (bleiben): ${ohneStempel.length}` : ''));

      if (!alt.length) { console.log('   nichts zu tun'); continue; }

      const nachTyp = new Map();
      for (const r of alt) nachTyp.set(r.type, (nachTyp.get(r.type) || 0) + 1);
      console.log('   nach type:', [...nachTyp].map(([k, n]) => `${k}=${n}`).join(', '));
      console.log('   ältester:', alt.map(r => r.created).sort()[0]);

      if (!LOESCHEN) { console.log('   TROCKENLAUF — mit --loeschen wirklich entfernen'); summe += alt.length; continue; }

      const pfad = join(process.env.TMPDIR || '/tmp', `crew-invites-${name}-${Date.now()}.json`);
      writeFileSync(pfad, JSON.stringify({ erzeugt: new Date().toISOString(), instanz: inst.base_url, datensaetze: alt }, null, 2));
      console.log('   gesichert:', pfad);

      let ok = 0; const fehler = [];
      for (const r of alt) {
        const d = await fetch(`${inst.base_url}/api/collections/crew_invites/records/${r.id}`,
          { method: 'DELETE', headers: { Authorization: token } });
        d.ok ? ok++ : fehler.push(`${r.id} → ${d.status}`);
      }
      console.log(`   gelöscht: ${ok}/${alt.length}` + (fehler.length ? ` · Fehler: ${fehler.join(', ')}` : ''));
      const rest = await alleHolen(inst.base_url, token);
      console.log(`   Nachkontrolle: ${rest.length} verbleibend`);
      summe += ok;
    } catch (e) {
      console.log('   FEHLER:', e.message);
      process.exitCode = 1;
    }
  }

  console.log(LOESCHEN ? `\nGelöscht: ${summe}` : `\nTrockenlauf — es fielen ${summe} Datensätze weg.`);
}

// Nur ausführen, wenn direkt aufgerufen — sonst könnte der Test die Datei nicht importieren,
// ohne einen echten Lauf gegen die Server auszulösen.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
