// Guard: Die Live-Domain liefert nur die App aus — und schickt Schutz-Header mit.
//
// Audit-Befunde K-1 und W-2 (docs/audit-2026-08-09.md, lokal). Gemessen am 2026-08-11 gegen
// crewplanner.nyxlightwork.de, alle mit 200: /CLAUDE.md, /.pb_hooks/main.pb.js,
// /tools/check-pb-rules.mjs, /CHANGELOG.md — und dazu nicht ein einziger Schutz-Header.
//
// Die Ursache war strukturell und heißt „öffentlich ist die Voreinstellung": Es lag alles im
// Netz, WEIL niemand es aktiv herausgenommen hatte. Das Dockerfile dreht das um (es zählt auf,
// was raus SOLL). Dieser Guard hält die Umkehrung fest — sonst schleicht sich beim nächsten
// „ach, das kopier ich schnell mit" der alte Zustand zurück, und gemerkt hätte es niemand.
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
const nginxConf = readFileSync(join(root, 'nginx.conf'), 'utf8');

// Alle COPY-Quellen sammeln. Letztes Argument ist das Ziel, der Rest sind Quellen; die
// nginx.conf geht nach /etc/nginx und ist keine Auslieferungsdatei.
function copyQuellen(src) {
  const out = [];
  for (const zeile of src.split('\n')) {
    const t = zeile.trim();
    if (!/^COPY\s/i.test(t)) continue;
    const teile = t.replace(/^COPY\s+/i, '').split(/\s+/).filter(Boolean);
    const ziel = teile[teile.length - 1];
    if (ziel.startsWith('/etc/')) continue;
    out.push(...teile.slice(0, -1));
  }
  return out;
}
const quellen = copyQuellen(dockerfile);

test('Dockerfile liefert keine internen Dateien aus', () => {
  // Was hier steht, war am 2026-08-11 nachweislich öffentlich abrufbar.
  const VERBOTEN = [
    'CLAUDE.md', 'CHANGELOG.md', 'HANDOFF.md', 'README.md', 'LICENSE',
    '.pb_hooks', 'tools', 'tests', 'pocketbase', '.github', '.claude',
  ];
  const fund = [];
  for (const q of quellen) {
    const norm = q.replace(/^\.\//, '').replace(/\/$/, '');
    if (VERBOTEN.some(v => norm === v || norm.startsWith(v + '/')))
      fund.push(q);
    // docs/ enthält die Runbooks und den Audit-Bericht — nur die zwei Anleitungen dürfen raus.
    if (/^\.?\/?docs\//.test(norm) && !/^\.?\/?docs\/guide-[a-z]+\.html$/.test(norm))
      fund.push(q);
  }
  ok(fund.length === 0,
    `Dockerfile kopiert interne Dateien in die Auslieferung: ${fund.join(', ')}`);
});

test('Dockerfile kopiert nicht pauschal das ganze Repo', () => {
  // Der eine Handgriff, der die gesamte Härtung aushebeln würde — und der beim Debuggen
  // („warum fehlt die Datei?") am nächsten liegt.
  const PAUSCHAL = ['.', './', '*', './*', '/', 'docs', 'docs/', './docs'];
  const fund = quellen.filter(q => PAUSCHAL.includes(q));
  ok(fund.length === 0,
    `pauschale COPY-Quelle "${fund.join(', ')}" — damit läge wieder ALLES im Netz`);
});

test('Dockerfile liefert alles aus, was die App braucht', () => {
  // Gegenrichtung: Ein Guard, der nur verbietet, führt beim nächsten Mal zu einer kaputten App.
  const PFLICHT = [
    'index.html', 'admin.html', 'login.html', 'view.html',
    'styles.css', 'theme.css', 'favicon.svg', 'sw.js',
    'js/', 'assets/',
    'docs/guide-crew.html', 'docs/guide-admin.html',
  ];
  const norm = quellen.map(q => q.replace(/^\.\//, ''));
  const fehlt = PFLICHT.filter(p => !norm.includes(p) && !norm.includes(p.replace(/\/$/, '')));
  ok(fehlt.length === 0, `Dockerfile liefert nicht aus: ${fehlt.join(', ')}`);
});

test('Dateien der Pflichtliste existieren wirklich', () => {
  // Ein COPY auf eine nicht vorhandene Datei bricht erst im Coolify-Build ab — also erst,
  // nachdem gepusht wurde. Hier fällt es vorher auf.
  const fehlt = quellen
    .map(q => q.replace(/\/$/, ''))
    .filter(q => !existsSync(join(root, q)));
  ok(fehlt.length === 0, `Dockerfile kopiert nicht vorhandene Pfade: ${fehlt.join(', ')}`);
});

// ── W-2: Schutz-Header ────────────────────────────────────────────────────────────────
// Nur unkommentierte Zeilen zählen. Ein Header in einem Kommentar ist genau das Gegenteil
// eines Schutzes — er sieht aus, als wäre die Sache erledigt.
const aktiv = nginxConf.split('\n').filter(z => !z.trim().startsWith('#')).join('\n');

test('nginx.conf setzt die vier Schutz-Header', () => {
  const PFLICHT = [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
  ];
  const fehlt = PFLICHT.filter(h => !new RegExp(`add_header\\s+${h}\\b`).test(aktiv));
  ok(fehlt.length === 0, `Schutz-Header fehlen oder sind auskommentiert: ${fehlt.join(', ')}`);
});

test('jeder Schutz-Header trägt always', () => {
  // Ohne `always` setzt nginx den Header nur bei 2xx/3xx — ausgerechnet Fehlerseiten
  // gingen ungeschützt raus, und das sieht man einer curl-Messung auf / nicht an.
  //
  // ⚠️ Nicht über `[^;]+;` schneiden: Der HSTS-Wert enthält selbst ein Semikolon
  // ("max-age=31536000; includeSubDomains"), der Ausdruck bricht dann mitten im Wert ab und
  // meldet einen Fehlalarm auf genau den Header, der korrekt gesetzt ist. Zeilenweise prüfen.
  const ohne = aktiv.split('\n')
    .map(z => z.trim())
    .filter(z => /^add_header\s/.test(z))
    .filter(z => !/\balways\s*;\s*$/.test(z))
    .map(z => z.split(/\s+/)[1]);
  ok(ohne.length === 0, `add_header ohne always: ${ohne.join(', ')}`);
});

test('CSP-Vorlage steht in der nginx.conf', () => {
  // Sie ist in Push 1 bewusst auskommentiert (kein Testweg für nginx-Konfiguration, siehe
  // Runbook). Sie darf aber nicht verschwinden — sonst wird Push 2 nie gemacht.
  ok(/Content-Security-Policy/.test(nginxConf), 'keine CSP in der nginx.conf, auch nicht als Vorlage');
});

test('eine aktive CSP lässt keinen Datenabfluss zu', () => {
  const zeile = (aktiv.match(/add_header\s+Content-Security-Policy[^;]+;/) || [])[0];
  if (!zeile) return 'SKIP';   // Push 1: CSP noch auskommentiert
  const connect = (zeile.match(/connect-src([^;"]*)/) || [])[1] || '';
  ok(connect.includes("'self'"), "connect-src ohne 'self'");
  ok(!connect.includes('*'),
    'connect-src enthält ein Wildcard — genau die Direktive, die den Token-Abfluss verhindern soll');
  ok(/frame-ancestors\s+'none'/.test(zeile), "frame-ancestors 'none' fehlt");
});
