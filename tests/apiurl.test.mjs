// Guard: die Backend-Auswahl steht an fünf Stellen — sie müssen übereinstimmen.
//
// Warum die Duplikate existieren (und bleiben): `js/pure.js` hält die getestete Fassung,
// aber die Inline-Skripte im `<head>` von index/admin/login.html laufen VOR den Modulen und
// können sie nicht importieren; `js/pb-login-bundle.js` ist ein eigenständiges Bündel.
// Dieselbe bewusste Doppelung wie bei `getNavUrl`.
//
// Warum sie überwacht werden müssen: `pickApiUrl` ist eine SICHERHEITSENTSCHEIDUNG mit dem
// Grundsatz „im Zweifel Test" — nur der exakte Live-Host bekommt die Live-API, alles andere
// die Test-API, damit nie versehentlich in die Live-Datenbank geschrieben wird (v0.31.0).
// Fünf Kopien sind fünf Gelegenheiten, dass eine davon abweicht. Läuft eine Kopie aus dem
// Takt, schreibt eine Umgebung still in die falsche Datenbank — ein Fehler, der niemandem
// auffällt, bis echte Daten betroffen sind.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { test, eq, ok } from './_assert.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = f => readFileSync(join(root, f), 'utf8');

const LIVE_API = 'https://api.crewplanner.nyxlightwork.de';
const TEST_API = 'https://api-test.crewplanner.nyxlightwork.de';
const LIVE_HOSTS = ['crewplanner.nyxlightwork.de', 'www.crewplanner.nyxlightwork.de'];

// `js/pb-login-bundle.js` steht bewusst NICHT hier: es führt keine eigene Kopie der
// Auswahl, sondern übernimmt `window.POCKETBASE_URL` aus dem Kopf-Skript von login.html.
// Das ist die bessere Bauweise — geprüft wird sie unten gesondert.
const QUELLEN = ['js/pure.js', 'index.html', 'admin.html', 'login.html'];

for (const datei of QUELLEN) {
  test(`${datei}: Backend-Auswahl stimmt mit pure.js überein`, () => {
    const src = lies(datei);

    // Beide Live-Hostnamen müssen genannt sein — fehlt `www.`, landet der www-Aufruf
    // still auf der Test-Datenbank.
    for (const h of LIVE_HOSTS) {
      ok(src.includes(`'${h}'`) || src.includes(`"${h}"`),
        `Live-Hostname ${h} fehlt — dieser Aufruf würde auf der Test-API landen`);
    }

    ok(src.includes(LIVE_API), 'Live-API-Adresse fehlt');
    ok(src.includes(TEST_API), 'Test-API-Adresse fehlt (der sichere Rückfall)');
  });
}

// Das Login-Bündel erbt die Adresse, statt sie zu kopieren — und fällt im Zweifel auf TEST
// zurück. Fiele es auf LIVE zurück, würde ein fehlendes Kopf-Skript in login.html jeden
// Anmeldeversuch still gegen die echte Datenbank laufen lassen.
test('js/pb-login-bundle.js erbt die Adresse und fällt auf TEST zurück', () => {
  const src = lies('js/pb-login-bundle.js');
  ok(/window\.POCKETBASE_URL/.test(src),
    'übernimmt window.POCKETBASE_URL nicht — führt also eine eigene, ungeprüfte Kopie');
  ok(src.includes(TEST_API), 'Rückfall-Adresse fehlt');
  ok(!src.includes(LIVE_API),
    'fällt auf die LIVE-API zurück — im Zweifel muss es die Test-API sein');
});

// Der eigentliche Sicherheitsgrundsatz: Rückfall ist TEST, nicht Live. Wer die Reihenfolge
// umdreht (unbekannter Host → Live), schreibt aus jeder Testumgebung in echte Daten.
test('Backend-Auswahl fällt im Zweifel auf TEST zurück', async () => {
  const { pickApiUrl } = await import('../js/pure.js');
  eq(pickApiUrl('crewplanner.nyxlightwork.de'), LIVE_API, 'Live-Host → Live-API');
  eq(pickApiUrl('www.crewplanner.nyxlightwork.de'), LIVE_API, 'www-Live-Host → Live-API');
  for (const h of ['aniflu.github.io', 'localhost', '127.0.0.1', '', 'crewplanner.nyxlightwork.de.evil.com']) {
    eq(pickApiUrl(h), TEST_API, `unbekannter Host "${h}" muss auf die Test-API fallen`);
  }
});
