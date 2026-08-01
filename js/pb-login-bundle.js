// ── Pocketbase-Konfiguration (für login.html) ─────────────────────────────────
// Umgebungs-Auswahl (v0.31.0): login.html setzt window.POCKETBASE_URL im Kopf-Skript
// (Test- vs. Live-API nach Hostname) VOR diesem Bundle → hier nur übernehmen. Fallback
// „im Zweifel Test", falls window.POCKETBASE_URL wider Erwarten fehlt.
const POCKETBASE_URL = (typeof window !== 'undefined' && window.POCKETBASE_URL)
  || 'https://api-test.crewplanner.nyxlightwork.de';

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
    // `data` und `status` an den Fehler hängen — wie js/pb.js (v0.5.1). Vorher war es ein
    // nackter Error: `e.data` war IMMER undefined, wodurch die „E-Mail schon vergeben"-
    // Erkennung (v0.23.5, prüft `e.data.email.code`) auf der Login-Seite nie griff und
    // der Nutzer nur „Failed to create record." sah — genau das, was v0.23.5 beheben wollte.
    const err = new Error(json.message || 'Pocketbase Fehler ' + res.status);
    err.data = json.data || null;
    err.status = res.status;
    throw err;
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
