import { POCKETBASE_URL } from './config.js';

// ── Pocketbase REST Client ──────────────────────────────────────────────────────
// Thin fetch-wrapper: setzt Authorization-Header automatisch aus localStorage.
// Alle API-Routen: https://pocketbase.io/docs/api-records/

async function _pbFetch(method, path, body) {
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
    .replace(/\\\\/g, '\\\\\\\\')
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
