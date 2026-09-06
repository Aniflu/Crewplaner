// Mengengrenze beim Anlegen (v0.10.6) — gemessen an der Live-Datenbank, nicht geschätzt.
//
// PocketBase läuft mit der Regel `*:create` = 20 Anfragen / 5 Sekunden (Settings → Rate
// limiters, Live-Instanz am 2026-09-05 ausgelesen). Im Log beider gemeldeter Versuche steht
// exakt dieses Muster: 20 × POST 200, dann der 21. mit 429.
//
// Das ist KEINE Gleichzeitigkeits-, sondern eine reine Mengengrenze — Anfragen zu bündeln
// hilft nicht, sie müssen zeitlich gestreckt werden. Betroffen ist nur das ANLEGEN: ein
// neues Crew-Mitglied auf 25 Termine setzen heißt 25 neue assignments-Records. Bei einer
// Person, die schon Records hat, sind es PATCHes — die zählen nicht gegen diese Grenze,
// deshalb fiel es erst beim neu hinzugefügten Mitglied auf.
//
// Die Drossel sitzt bewusst in pb.js: admin.html reicht dasselbe pbPost über window durch
// (js/admin-app.js), also sind Admin-Ansicht und Plan-Ansicht in einem Zug abgedeckt.
import { test, eq, ok } from './_assert.mjs';
import { loadGraph } from './_graph.mjs';

// Echte 5-Sekunden-Fenster würden die Testsuite unbrauchbar langsam machen — die Drossel
// ist deshalb einstellbar. Geprüft wird das VERHALTEN (kein Fenster über der Grenze),
// nicht die konkrete Sekundenzahl.
async function mitDrossel(g, werte, fn){
  const d = g.pb._drossel;
  const alt = { ...d };
  Object.assign(d, werte);
  try { return await fn(); }
  finally { Object.assign(d, alt); d.zeiten.length = 0; }
}

function zeitstempelSammler(status = 200){
  const t = [];
  globalThis.fetch = async () => { t.push(Date.now()); return { status, ok: status < 400, json: async () => ({ id:'x' }) }; };
  return t;
}

test('nie mehr Neuanlagen pro Zeitfenster, als der Server erlaubt', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  await mitDrossel(g, { max: 6, fensterMs: 150 }, async () => {
    const t = zeitstempelSammler();
    const auftraege = [];
    for (let i = 0; i < 20; i++) auftraege.push(g.pb.pbPost('/api/collections/assignments/records', { i }));
    await Promise.all(auftraege);

    eq(t.length, 20, 'alle 20 Anlagen gehen raus');
    // Kern der Zusage: in KEINEM Fenster liegen mehr als `max` Anfragen.
    for (let i = 0; i + 6 < t.length; i++)
      ok(t[i + 6] - t[i] >= 150,
         `Anfrage ${i} und ${i+6} liegen nur ${t[i+6]-t[i]} ms auseinander — das ist ein Fenster mit 7 Anlagen`);
  });
});

test('GET und PATCH werden NICHT gedrosselt (sonst wird die ganze App zäh)', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  await mitDrossel(g, { max: 2, fensterMs: 5000 }, async () => {
    zeitstempelSammler();
    const start = Date.now();
    await Promise.all([
      g.pb.pbGet('/api/collections/assignments/records'),
      g.pb.pbGet('/api/collections/assignments/records'),
      g.pb.pbPatch('/api/collections/assignments/records/a', {}),
      g.pb.pbPatch('/api/collections/assignments/records/b', {}),
      g.pb.pbPatch('/api/collections/assignments/records/c', {}),
    ]);
    ok(Date.now() - start < 1000, 'Lesen und Ändern laufen ungebremst durch');
  });
});

test('ein 429 wird abgewartet und wiederholt, nicht durchgereicht', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  await mitDrossel(g, { max: 6, fensterMs: 50, backoffMs: 60 }, async () => {
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      if (n === 1) return { status:429, ok:false, json: async () => ({ message:'Too Many Requests.' }) };
      return { status:200, ok:true, json: async () => ({ id:'r' }) };
    };
    const res = await g.pb.pbPost('/api/collections/assignments/records', {});
    eq(res.id, 'r', 'der Vorgang läuft nach der Wartezeit durch');
    eq(n, 2, 'genau eine Wiederholung nötig');
  });
});

test('bleibt der 429 bestehen, wird er ehrlich gemeldet statt endlos wiederholt', async () => {
  const g = await loadGraph(); if(!g) return 'SKIP';
  await mitDrossel(g, { max: 6, fensterMs: 50, backoffMs: 20 }, async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; return { status:429, ok:false, json: async () => ({ message:'Too Many Requests.' }) }; };
    let geworfen = null;
    try { await g.pb.pbPost('/api/collections/assignments/records', {}); } catch(e) { geworfen = e; }
    ok(geworfen && geworfen.status === 429, 'der Fehler kommt beim Aufrufer an');
    ok(n <= 5, `nicht endlos wiederholen — ${n} Versuche`);
  });
});

// ── Der gemeldete Weg lief woanders lang (v0.10.6) ────────────────────────────
// Der Fehler wurde in der ADMIN-Ansicht ausgelöst, nicht im Plan-Fenster: sendAdminInvite
// legt die Slots in einer eigenen Schleife an. Sie greift auf window.pbPost zu (gesetzt in
// js/admin-app.js), läuft also durch dieselbe gedrosselte Schicht — genau davon hängt der
// Fix ab. Wer dort je auf ein direktes fetch() ausweicht, umgeht die Drossel unbemerkt und
// holt sich den 429 zurück. Dieser Wächter hält das fest.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adminHtml = readFileSync(join(root, 'admin.html'), 'utf8');

test('admin.html geht nie per eigenem fetch an die records-API', () => {
  const eigenesFetch = adminHtml.match(/fetch\(\s*[^)]*\/api\/collections\/[^)]*records/g) || [];
  eq(eigenesFetch.length, 0,
     'ein direktes fetch() auf die records-API umgeht die Anlage-Drossel in pb.js');
});

// Seit v0.11.0 legt der SERVER die Termine an (POST /notify, eine Transaktion). Die frühere
// Schleife im Browser samt Fortschrittsanzeige ist damit gegenstandslos — und darf nicht
// zurückkommen: Sie war der Weg, der in die Mengengrenze lief.
test('admin.html legt Einsätze nicht mehr selbst an — das macht der Server', () => {
  ok(!/pbPost\('\/api\/collections\/assignments\/records'/.test(adminHtml),
     'die Slot-Anlage gehört in die Transaktion des Endpoints, nicht in den Browser');
  ok(/notify\(\{/.test(adminHtml), 'die Admin-Ansicht sendet über notify()');
});
