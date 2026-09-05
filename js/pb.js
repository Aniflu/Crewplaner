import { POCKETBASE_URL } from './config.js';

// ── Pocketbase REST Client ──────────────────────────────────────────────────────
// Thin fetch-wrapper: setzt Authorization-Header automatisch aus localStorage.
// Alle API-Routen: https://pocketbase.io/docs/api-records/

// ── Mengengrenze beim Anlegen einhalten (v0.10.6) ─────────────────────────────
// PocketBase läuft mit der Regel `*:create` = 20 Anfragen / 5 Sekunden. Das ist KEINE
// Gleichzeitigkeits-, sondern eine Mengengrenze: Wer ein neues Crew-Mitglied auf 25 Termine
// setzt, legt 25 assignments-Records an — ab dem 21. antwortet der Server mit 429
// „Too many requests", und die Einladung ging nicht raus (an „Provinz 2027" gemeldet, im
// Live-Log beider Versuche als 20 × 200 + 1 × 429 nachgemessen).
//
// Betroffen ist nur das ANLEGEN. Ein PATCH zählt nicht gegen diese Regel — deshalb fiel es
// erst beim neu hinzugefügten Mitglied auf, dessen Records es alle noch nicht gab.
//
// Die Drossel sitzt hier und nicht im jeweiligen Aufrufer: admin.html reicht dasselbe pbPost
// über window durch (js/admin-app.js), damit sind Admin-Ansicht und Plan-Ansicht in einem
// Zug abgedeckt — und jeder künftige Weg ebenfalls.
//
// `max` liegt bewusst unter den erlaubten 20: Nebenher laufen weitere Anlagen (crew_invites),
// und die Buchführung des Servers beginnt nicht exakt bei unserer ersten Anfrage.
export const _drossel = { max: 18, fensterMs: 5000, backoffMs: 5250, zeiten: [] };

const _warte = (ms) => new Promise(r => setTimeout(r, ms));

function _istAnlage(method, path) {
  return method === 'POST' && /^\/api\/collections\/[^/]+\/records(\?|$)/.test(path);
}

// Erteilt Anlage-Erlaubnis der Reihe nach. Die Kette ist nötig, damit gleichzeitig
// gestartete Anlagen sich nicht alle denselben freien Platz nehmen.
let _schlange = Promise.resolve();
function _anlagePlatz() {
  const meiner = _schlange.then(async () => {
    const d = _drossel;
    for (;;) {
      const jetzt = Date.now();
      while (d.zeiten.length && jetzt - d.zeiten[0] >= d.fensterMs) d.zeiten.shift();
      if (d.zeiten.length < d.max) { d.zeiten.push(Date.now()); return; }
      await _warte(d.fensterMs - (jetzt - d.zeiten[0]) + 20);
    }
  });
  _schlange = meiner.catch(() => {});
  return meiner;
}

async function _pbFetch(method, path, body) {
  const anlage = _istAnlage(method, path);
  let versuche = 0;
  for (;;) {
    if (anlage) await _anlagePlatz();
    try {
      return await _einmalSenden(method, path, body);
    } catch (e) {
      // Ein 429 heißt „zu schnell", nicht „geht nicht". Das Fenster einmal auslaufen lassen
      // und erneut versuchen — aber begrenzt, sonst hängt die Oberfläche stumm fest.
      if (e && e.status === 429 && versuche < 2) {
        versuche++;
        _drossel.zeiten.length = 0;   // unsere Buchführung liegt daneben — neu anfangen
        await _warte(_drossel.backoffMs);
        continue;
      }
      throw e;
    }
  }
}

async function _einmalSenden(method, path, body) {
  const token = localStorage.getItem('pb_token');
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(POCKETBASE_URL + path, opts);
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) {
    if (json.data) console.error('[pb] Validierungsfehler:', JSON.stringify(json.data));
    // Echten Feld-Grund an den Error hängen (PB-`message` ist generisch, z.B.
    // „Failed to create record." — der eigentliche Grund steckt in `data`).
    const fields = json.data && typeof json.data === 'object'
      ? Object.entries(json.data).map(([f, v]) => `${f}: ${(v && v.message) || v}`)
      : [];
    const err = new Error(
      fields.length
        ? (json.message || 'Pocketbase Fehler ' + res.status) + ' (' + fields.join('; ') + ')'
        : (json.message || 'Pocketbase Fehler ' + res.status)
    );
    err.data = json.data || null;
    err.status = res.status;
    throw err;
  }
  return json;
}

export function pbGet(path)          { return _pbFetch('GET',    path);       }
export function pbPost(path, body)   { return _pbFetch('POST',   path, body); }
export function pbPatch(path, body)  { return _pbFetch('PATCH',  path, body); }
export function pbDelete(path)       { return _pbFetch('DELETE', path);       }

// ── Escapes a value for safe use inside PocketBase filter strings ────────────
export function pbEscapeFilter(val) {
  return String(val == null ? '' : val)
    .replace(/\\/g, '\\\\')   // einzelnen Backslash verdoppeln (vorher matchte /\\\\/ nur DOPPEL-Backslashes)
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

// ── Liste mit Filter ───────────────────────────────────────────────────────────
export function pbList(collection, filter, sort, perPage) {
  const params = new URLSearchParams({
    filter: filter || '',
    sort: sort || '-id',
    perPage: perPage || 200
  });
  return pbGet('/api/collections/' + collection + '/records?' + params);
}

// ── Alle Seiten einer gefilterten Liste laden ──────────────────────────────────
export async function pbListAll(collection, filter, sort) {
  const perPage = 200;
  let page = 1, allItems = [];
  while (true) {
    const params = new URLSearchParams({filter: filter||'', sort: sort||'-id', perPage, page});
    const data = await pbGet('/api/collections/'+collection+'/records?'+params);
    allItems = allItems.concat(data?.items || []);
    if (page >= (data?.totalPages || 1)) break;
    page++;
  }
  return {items: allItems};
}

// ── Ersten Treffer einer Filter-Abfrage holen ──────────────────────────────────
export async function pbFirst(collection, filter) {
  const data = await pbList(collection, filter, '-id', 1);
  return data?.items?.[0] || null;
}

// ── Upsert: existierenden Record aktualisieren oder neuen anlegen ──────────────
export async function pbUpsert(collection, filter, createData, updateData) {
  let existing = null;
  try {
    existing = await pbFirst(collection, filter);
  } catch (e) {
    console.warn('pbUpsert Suche fehlgeschlagen, versuche Anlegen...', e.message);
  }
  if (existing) {
    return pbPatch(
      '/api/collections/' + collection + '/records/' + existing.id,
      updateData !== undefined ? updateData : createData
    );
  }
  return pbPost('/api/collections/' + collection + '/records', createData);
}
