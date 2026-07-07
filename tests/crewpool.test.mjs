// Globaler Crew-Pool (v0.22.0): E-Mail-Normalisierung beim Anlegen eines neuen Pool-Mitglieds.
// Der eigentliche Dublettencheck läuft server-seitig (crew_members?filter=email="…") —
// hier nur die reine Normalisierung, die davor greift (case-/whitespace-tolerant, klein).
import { test, eq } from './_assert.mjs';
import { normEmail } from '../js/pure.js';

test('normEmail: trim + lowercase; leer bleibt leer', () => {
  eq(normEmail('  Foo@Bar.DE '), 'foo@bar.de');
  eq(normEmail(''), '');
  eq(normEmail(null), '');
  eq(normEmail(undefined), '');
});

test('normEmail: idempotent + robust gegen Nicht-Strings', () => {
  eq(normEmail('a@b.de'), 'a@b.de');
  eq(normEmail(normEmail('  A@B.DE ')), 'a@b.de');
  eq(normEmail(123), '123');
});
