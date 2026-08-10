// Guards für die Zusage: „Crew-Mitglieder dürfen AUSSCHLIESSLICH die Namen sehen, sonst nichts."
// (Vorgabe des Users, 2026-08-10 → v0.8.1, Hook v4.20)
//
// Ausgangslage (Audit-Befund K-2): Der Crew-Ladepfad las `crew_members` und `assignments`
// direkt über die REST-API. Damit mussten deren Regeln auf `@request.auth.id != ""` stehen —
// und jedes angemeldete Konto konnte ALLE Einsätze ALLER Touren abrufen, inklusive der
// `crew_email` jeder Person (~913 Datensätze in zwei Anfragen).
//
// Warum das nicht über Zugriffsregeln zu lösen war: PocketBase-Regeln filtern DATENSÄTZE,
// nicht FELDER. „Lesen ja, Mailadresse nein" lässt sich als Regel nicht ausdrücken. Also
// Hook-Routen, wie schon bei /viewstatus (v4.14), /viewplan (v4.15) und /myplan (v4.16).
//
// Diese Guards sichern beide Hälften ab: dass das Frontend die Collections nicht mehr anfasst,
// UND dass die Routen keine Adressen herausgeben. Fällt eine davon, ist die Zusage gebrochen.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entkommentiert = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // `//` in URLs stehen lassen

const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');
const ds   = readFileSync(join(root, 'js/dataService.js'), 'utf8');

// Eine Funktion aus dataService.js herausschneiden — bis zur NÄCHSTEN Funktionsdeklaration.
//
// ⚠️ Vorher stand hier ein festes Fenster (`slice(start, start+2600)`). Das lief in die
// Folgefunktion hinein: `confirmAssignment` enthält ebenfalls `IS_CREW && !IS_MANAGER`,
// weshalb der Guard beim Mutationstest grün blieb, obwohl die Trennung in
// `loadCrewMeta`/`loadAssignmentStatuses` entkernt war. Dieselbe Falle wie beim trägen
// Routen-Ausdruck in v0.6.1 — ein Guard darf nie über seine Grenze hinauslesen.
function funktion(src, name) {
  const start = src.indexOf(`function ${name}(`);
  ok(start !== -1, `${name} nicht gefunden`);
  const rest = src.slice(start + 10);
  const ende = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s/);
  return ende === -1 ? rest : rest.slice(0, ende);
}

// Einen Routen-Block bis zum nächsten `routerAdd(` schneiden — sonst läuft der träge
// Ausdruck in die Folgeroute und deren `requireAuth` täuscht Sicherheit vor
// (dieselbe Guard-Schwäche wie in v0.6.1 gefunden).
function route(pfad) {
  const start = hook.indexOf(`routerAdd('GET', '${pfad}'`);
  ok(start !== -1, `Route ${pfad} fehlt im Hook`);
  const rest = hook.slice(start + 10);
  const ende = rest.indexOf('routerAdd(');
  return entkommentiert(ende === -1 ? rest : rest.slice(0, ende));
}

test('Hook: /planstatus ist authentifiziert und gibt KEINE Mailadresse heraus', () => {
  const r = route('/planstatus/{id}');
  ok(/\$apis\.requireAuth\(\)/.test(r), 'Route ist nicht mit requireAuth geschützt');
  ok(!/crew_email/.test(r), 'die Route gibt crew_email heraus — genau das soll sie nicht');
  ok(/crew_name/.test(r), 'der Anzeigename fehlt — die Crew soll die Namen ja sehen');
  // Zugriffsprüfung: Owner ODER superadmin ODER crew_member DIESER Tour, sonst 404.
  ok(/crew_members/.test(r) && /404/.test(r),
    'keine Zugehörigkeitsprüfung mit 404-Ablehnung erkennbar');
});

test('Hook: /planstatus liefert nur EINE Tour, nicht alle', () => {
  const r = route('/planstatus/{id}');
  // ⚠️ NICHT bloß auf `plan_id = {:p}` prüfen: derselbe Ausdruck steht auch in der
  // Zugehörigkeitsprüfung (`plan_id = {:p} && email = {:m}`). Beim Mutationstest blieb der
  // Guard deshalb grün, obwohl die Eingrenzung der EINSÄTZE entfernt war — dann hätte die
  // Route die Einsätze ALLER Touren ausgeliefert. Also gezielt den assignments-Filter prüfen.
  ok(/plan_id = \{:p\} && status !=/.test(r),
    'der Einsatz-Filter grenzt nicht auf die angefragte Tour ein — die Route gäbe alle Touren heraus');
});

test('Hook: /myplan liefert den eigenen Namen mit (ersetzt das Laden aller crew_members)', () => {
  const r = route('/myplan/{id}');
  ok(/myName/.test(r), 'myName fehlt — loadCrewMeta müsste sonst wieder alle Adressen laden');
  ok(!/crew_email/.test(r), '/myplan gibt crew_email heraus');
});

// Die Frontend-Hälfte. Ohne sie nützt die beste Route nichts: solange der Crew-Pfad die
// Collections direkt liest, müssen deren Regeln offen bleiben.
test('dataService: der Crew-Pfad liest crew_members und assignments nicht mehr direkt', () => {
  const src = entkommentiert(ds);

  // Jede der drei Funktionen muss für Crew über eine Route gehen.
  for (const [fn, r] of [
    ['loadCrewMeta', '/myplan/'],
    ['loadAssignmentStatuses', '/planstatus/'],
    ['_getActivePlanId', '/myplans'],
  ]) {
    ok(funktion(src, fn).includes(r), `${fn} nutzt die Route ${r} nicht`);
  }

  // Der Crew-Zweig von _getActivePlanId darf crew_members gar nicht mehr anfassen.
  const gap = src.indexOf('function _getActivePlanId(');
  const crewZweig = src.slice(gap, src.indexOf('const activePlanId = getActivePlanId();', gap));
  ok(!/pbList\(\s*'crew_members'/.test(crewZweig),
    'der Crew-Zweig liest crew_members weiterhin über die REST-API');
});

// Die Trennung Crew/Manager muss explizit sein. Fiele sie weg, liefe der Manager über die
// Crew-Route (und verlöre die Adressen, die er zum Einladen braucht) — oder umgekehrt die
// Crew über den REST-Weg, und die Zusage wäre still gebrochen.
test('dataService: Crew- und Manager-Pfad sind getrennt', () => {
  const src = entkommentiert(ds);
  for (const fn of ['loadCrewMeta', 'loadAssignmentStatuses']) {
    ok(/IS_CREW\s*&&\s*!IS_MANAGER/.test(funktion(src, fn)),
      `${fn} unterscheidet Crew und Manager nicht (erwartet: IS_CREW && !IS_MANAGER)`);
  }
});
