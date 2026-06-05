// ── Pocketbase-Konfiguration (für login.html) ─────────────────────────────────
const POCKETBASE_URL = 'https://api.crewplanner.nyxlightwork.de';

// ── Pocketbase REST Client ─────────────────────────────────────────────────────
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
    throw new Error(json.message || 'Pocketbase Fehler ' + res.status);
  }
  return json;
}

function pbGet(path)          { return _pbFetch('GET',    path);       }
function pbPost(path, body)   { return _pbFetch('POST',   path, body); }
function pbPatch(path, body)  { return _pbFetch('PATCH',  path, body); }
function pbDelete(path)       { return _pbFetch('DELETE', path);       }

// ── Escapes a value for safe use inside PocketBase filter strings ────────────
function pbEscapeFilter(val) {
  return String(val == null ? '' : val)
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}
