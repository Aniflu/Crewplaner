// Guard: keine echten Mailadressen und keine Server-Kennungen in ausgelieferten Dateien.
//
// Befund K-1 des Audits vom 2026-08-09: `crewplanner.nyxlightwork.de` liefert nicht nur die
// App aus, sondern JEDE Datei des Repos — `CLAUDE.md` (164 KB), `.pb_hooks/main.pb.js`,
// `HANDOFF.md`, `docs/`, `tools/`. Ohne Anmeldung abrufbar, gemessen mit curl.
//
// Darin standen:
//   · die echten Mailadressen von **vierzehn** Personen, darunter neun Crew-Mitglieder —
//     fremde personenbezogene Daten, die für die Tourplanung überlassen wurden, nicht
//     zur Veröffentlichung;
//   · die Superadmin-Adresse, im Hook sogar fest verdrahtet — zusammen mit dem fehlenden
//     Rate-Limiting am Login ein namentlich benanntes Angriffsziel;
//   · Container-Namen, Docker-Volume-Pfade und der SSH-Alias des Servers.
//
// Die eigentliche Lösung ist serverseitig (nur App-Dateien ausliefern, siehe
// docs/admin-runbook-audit-v0.8.0.md). Dieser Guard sichert die Hälfte, die im Repo liegt:
// Was hier nicht steht, kann auch nicht ausgeliefert werden. Platzhalter in «…» sind gewollt;
// die echten Werte stehen in `.claude.local.md` (nicht eingecheckt).
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const dateien = execSync("git ls-files '*.md' '*.js' '*.mjs' '*.html'", { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);

// Freimail- und die im Projekt vorkommenden Firmen-Domains. Bewusst NICHT geprüft:
// `@crewplanner.nyxlightwork.de` (der Absender `noreply@…` gehört in den Code) und
// `@example.com` (Test-Fixtures).
const PRIVAT = /[a-zA-Z0-9._%+-]+@(?:gmx|web|live|outlook|gmail|googlemail|me|icloud|hoch-online|tse-ag|t-online|yahoo|aol)\.[a-z.]{2,}/gi;

test('keine echten Mailadressen in ausgelieferten Dateien', () => {
  const fund = [];
  for (const f of dateien) {
    const treffer = readFileSync(join(root, f), 'utf8').match(PRIVAT);
    if (treffer) fund.push(`${f}: ${[...new Set(treffer)].join(', ')}`);
  }
  ok(fund.length === 0,
    'personenbezogene Mailadressen im Repo (werden öffentlich ausgeliefert):\n      ' +
    fund.join('\n      '));
});

// Server-Kennungen sind für sich genommen wertlos ohne Zugang — aber sie ersparen einem
// Angreifer die Aufklärung und gehören nicht in eine öffentlich abrufbare Datei.
test('keine Server-Kennungen in ausgelieferten Dateien', () => {
  const MUSTER = [
    [/pocketbase-ad9adhh\w+/g, 'Container-Name der Live-PocketBase'],
    [/ad9adhh\w*_pocketbase-hooks/g, 'Docker-Volume der Live-Hooks'],
    [/\bssh\s+hetzner\b/g, 'SSH-Alias des Servers'],
  ];
  const fund = [];
  for (const f of dateien) {
    const src = readFileSync(join(root, f), 'utf8');
    for (const [rx, was] of MUSTER) if (rx.test(src)) fund.push(`${f}: ${was}`);
  }
  ok(fund.length === 0, 'Server-Kennungen im Repo:\n      ' + fund.join('\n      '));
});

// v0.8.2: Die interne Doku ist aus der Git-Verfolgung genommen (siehe .gitignore). Damit ist
// sie über github.com/raw.githubusercontent.com nicht mehr abrufbar — das Dockerfile allein
// hätte sie nur von der Live-Domain genommen, nicht aus dem öffentlichen Repo.
//
// Dieser Guard ersetzt für diese Dateien die Inhaltsprüfung oben: die kann sie nach dem
// Untracken gar nicht mehr sehen (`git ls-files`). Ohne ihn wäre ein `git add CLAUDE.md`
// unbemerkt — und CLAUDE.md ist die Datei, die den größten Teil von K-1 ausgemacht hat.
test('interne Doku ist nicht eingecheckt', () => {
  const verfolgt = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n');
  const MUSTER = [
    [/^CLAUDE\.md$/, 'Arbeitsanweisung inkl. Chronik aller gefundenen Lücken'],
    [/^CHANGELOG\.md$/, 'Entwicklungschronik'],
    [/^HANDOFF\.md$/, 'interner Übergabestand'],
    [/^docs\/audit-.*\.md$/, 'Audit-Bericht'],
    [/^docs\/befund-.*\.md$/, 'Befund-Doku'],
    [/^docs\/bericht-.*\.md$/, 'Abschlussbericht'],
  ];
  const fund = [];
  for (const f of verfolgt)
    for (const [rx, was] of MUSTER) if (rx.test(f)) fund.push(`${f} (${was})`);
  ok(fund.length === 0,
    'interne Doku wieder eingecheckt — über GitHub öffentlich lesbar:\n      ' + fund.join('\n      '));
});

// Die Adresse des Planers darf nur aus der Umgebung kommen. Stünde sie als Rückfall im Code,
// wäre sie über /.pb_hooks/main.pb.js wieder öffentlich — genau der Zustand vor v0.8.0.
test('Hook holt die Planer-Adresse ausschließlich aus ADMIN_EMAIL', () => {
  const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
  const stellen = hook.match(/\$os\.getenv\('ADMIN_EMAIL'\)[^\n;]*/g) || [];
  ok(stellen.length >= 2, `ADMIN_EMAIL wird nur ${stellen.length}× gelesen (erwartet: 2)`);
  for (const s of stellen) {
    ok(!/\|\|\s*'[^']*@/.test(s),
      `fest verdrahtete Rückfall-Adresse: "${s.trim()}" — sie wäre öffentlich abrufbar`);
  }
});
