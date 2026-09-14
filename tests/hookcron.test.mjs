// Guard: der Aufräum-Cron im Hook bleibt drin — und das Löschen bleibt AUSSERHALB des Mail-Hooks.
//
// Anlass (v0.13.4 / Hook v4.27): `crew_invites` wuchs unbegrenzt. Für jede verschickte Mail legt
// der Hook einen Auslöse-Datensatz an und räumte ihn nie weg; auf Live lagen 73 Stück mit Namen
// und Mailadressen von 12 Personen, ohne jede Funktion.
//
// ⚠️ Warum NICHT im Mail-Hook löschen: `$app.delete` innerhalb eines Record-Hooks läuft in der
// Transaktion der Anlage und ist dort für Konflikte anfällig — und v4.25 hat vorgeführt, was ein
// Laufzeitfehler an dieser Stelle kostet (der Guard starb, die Crew konnte nicht mehr zu- oder
// absagen, Rückrollen auf Test). Ein `cronAdd`-Job läuft außerhalb dieser Transaktion: Geht er
// schief, bleibt der Mailversand unberührt.
//
// Dieser Test prüft, was statisch prüfbar ist. Ob der Job auf dem Server wirklich läuft, zeigt
// nur `GET /api/crons` nach dem Deploy — das steht als Messung in docs/admin-auftrag-hook-v4.27.md.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, '.pb_hooks/main.pb.js'), 'utf8');

test('Hook: Kopfzeile und Ladezeile nennen dieselbe Version', () => {
  // Stünde in beiden etwas anderes, führte die erste Frage jeder Fehlersuche („welche Version
  // läuft?") ins Leere — im Log erscheint nur die Ladezeile.
  const kopf = (hook.match(/^\/\/ Version:\s*([0-9.]+)/m) || [])[1];
  const laden = (hook.match(/main\.pb\.js v([0-9.]+) geladen/) || [])[1];
  ok(kopf, 'Kopfzeile „// Version: X.Y" nicht gefunden');
  ok(laden, 'Ladezeile „main.pb.js vX.Y geladen" nicht gefunden');
  ok(kopf === laden, `Kopfzeile sagt ${kopf}, Ladezeile sagt ${laden}`);
});

test('Hook: der Aufräum-Cron für crew_invites ist registriert', () => {
  ok(/cronAdd\s*\(/.test(hook), 'kein cronAdd im Hook — der Altbestand wüchse wieder unbegrenzt');
  ok(/purge_crew_invites/.test(hook), 'Cron-Job heißt nicht purge_crew_invites (so prüft ihn /api/crons)');
  ok(/crew_invites/.test(hook.slice(hook.indexOf('cronAdd'))), 'der Cron räumt nicht crew_invites auf');
});

test('Hook: im crew_invites-Mail-Hook wird NICHT gelöscht', () => {
  // Der Mail-Hook reicht von onRecordAfterCreateSuccess bis zum abschließenden }, 'crew_invites');
  const start = hook.indexOf("onRecordAfterCreateSuccess");
  const ende = hook.indexOf("}, 'crew_invites');");
  ok(start >= 0 && ende > start, 'Mail-Hook nicht gefunden — Aufbau geändert?');
  const block = hook.slice(start, ende);
  ok(!/\$app\.delete\s*\(/.test(block),
    '$app.delete im Mail-Hook — genau der Weg, der in der Anlage-Transaktion Konflikte auslöst');
});
