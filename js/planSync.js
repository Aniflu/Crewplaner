// ── Schutz vor veraltetem Laden / blindem Überschreiben (v1.2.1) ──────────────
// Eigenes kleines Modul, weil plans.js (Speichern) und dataService.js (Laden aus der DB)
// beide darauf zugreifen: dataService importiert plans.js, plans.js dürfte dataService
// also nicht importieren (Importzyklus). planSync kennt nur pb.js und utils.js; das
// Nachladen aus der DB bekommt es zur Laufzeit von dataService gereicht (registerLoader).
//
// Idee: Für jeden PB-Plan merken wir den Stand, den DIESER Browser zuletzt aus der DB
// gelesen bzw. selbst geschrieben hat (Basisstand). Vor jedem PATCH wird der Record frisch
// gelesen; weicht er vom Basisstand ab, hat jemand anderes (Tourvergleich, Admin-Werkzeug,
// anderes Gerät) dazwischen geschrieben — dann wird NICHT geschrieben, sondern neu geladen.
import { pbGet, pbPatch } from './pb.js';
import { showToast } from './utils.js';

export const MSG_ZWISCHENDURCH = 'Die Tour wurde zwischendurch woanders geändert – neu geladen. Bitte deine letzte Änderung wiederholen.';
export const MSG_OFFLINE = 'Keine Verbindung – nicht gespeichert';

const _base = new Map();   // pbId → normalisierter plan_data-String
const _queue = new Map();  // pbId → Promise-Kette (Speichervorgänge je Plan nacheinander)
let _loader = null;        // (pbId) → Promise<boolean>: Plan + Crew-Meta + Status aus der DB in den State

// Schlüssel sortiert, damit eine andere Schlüsselreihenfolge (PB/JSON) keinen Fehlalarm auslöst.
function _canon(v) {
  if (Array.isArray(v)) return v.map(_canon);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(k => { o[k] = _canon(v[k]); });
    return o;
  }
  return v;
}

// PB liefert plan_data als Objekt (JSON-Feld) oder als String; ein String kann selbst noch
// einmal JSON-kodiert sein. Leer (null/undefined/'') zählt als gültiger „leerer" Stand.
export function normPlanData(pd) {
  let v = pd;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    if (v === '') { v = null; break; }
    try { v = JSON.parse(v); } catch (_) { return 'invalid:' + v; }
  }
  return JSON.stringify(_canon(v == null ? null : v));
}

const _epoch = new Map();  // pbId → Lade-Epoche (zählt DB-Ladevorgänge, NICHT eigene Schreibvorgänge)
function _bump(pbId) { _epoch.set(pbId, (_epoch.get(pbId) || 0) + 1); }
// Läuft gerade ein Laden aus der DB für diesen Plan? Dann zeigt der State noch den Zwischenspeicher
// (oder wird gleich ersetzt) — jeder Save, der währenddessen gebaut oder ausgeführt wird, ist veraltet.
const _loading = new Map();
export function beginLoad(pbId) { if (pbId) _loading.set(pbId, (_loading.get(pbId) || 0) + 1); }
export function endLoad(pbId) { if (pbId) _loading.set(pbId, Math.max(0, (_loading.get(pbId) || 0) - 1)); }
const _isLoading = (pbId) => (_loading.get(pbId) || 0) > 0;
export function getPlanEpoch(pbId) { return _epoch.get(pbId) || 0; }

// opts.load=false: Basisstand aus eigenem Schreiben/Anlegen — hebt die Epoche NICHT an.
export function setPlanBase(pbId, planData, opts) {
  if (!pbId) return;
  _base.set(pbId, normPlanData(planData));
  if (!opts || opts.load !== false) _bump(pbId);
}
export function hasPlanBase(pbId) { return _base.has(pbId); }
export function clearPlanBases() { _base.clear(); _queue.clear(); _epoch.clear(); _loading.clear(); }
export function registerLoader(fn) { _loader = fn; }

// Plan samt Crew-Meta und Status aus der DB laden (Hilfsfunktion für switchPlan/Start).
export async function reloadFromDb(pbId) {
  if (!_loader) return false;
  try { return await _loader(pbId); } catch (e) { console.warn('[planSync] Nachladen fehlgeschlagen:', e && e.message); return false; }
}

// Prüft gegen die DB und schreibt nur bei unverändertem Basisstand.
//   ctx.isActive():  ist dieser Plan gerade der angezeigte?
//   ctx.onReloaded(rec, reloaded): nach Mismatch (aktiver Plan: reloaded=true heißt State ist schon
//     aktuell, nur noch rendern; nicht aktiv: Zwischenspeicher aus rec schreiben)
// Der gesendete Stand (sentStr) wurde zum AUFRUF-Zeitpunkt gebaut. Hat sich seither die Lade-Epoche
// geändert (Neuladen, Start-/Wechsel-Laden), ist er veraltet → nie schreiben.
export function guardedPatch(pbId, sentStr, ctx) {
  const epoch = _isLoading(pbId) ? -1 : getPlanEpoch(pbId);   // -1: beim Aufruf lief ein Laden → immer veraltet
  const prev = _queue.get(pbId) || Promise.resolve();
  const job = prev.catch(() => {}).then(() => _run(pbId, sentStr, ctx || {}, epoch));
  _queue.set(pbId, job.catch(() => {}));
  return job;
}

function _stale() {
  showToast(MSG_ZWISCHENDURCH, '#e84a4a');
  return new Error(MSG_ZWISCHENDURCH);
}

async function _run(pbId, sentStr, ctx, epoch) {
  const path = '/api/collections/plans/records/' + pbId;
  if (getPlanEpoch(pbId) !== epoch || _isLoading(pbId)) throw _stale();
  let rec;
  try { rec = await pbGet(path); }
  catch (e) {
    showToast(MSG_OFFLINE, '#e84a4a');
    throw new Error(MSG_OFFLINE);
  }
  if (getPlanEpoch(pbId) !== epoch || _isLoading(pbId)) throw _stale();
  const cur = normPlanData(rec && rec.plan_data);
  if (!_base.has(pbId) || _base.get(pbId) !== cur) {
    // Fremdänderung (oder kein bekannter Ausgangsstand): NICHT schreiben, DB-Stand übernehmen.
    let reloaded = false;
    if (ctx.isActive && ctx.isActive()) reloaded = await reloadFromDb(pbId);
    else { _base.set(pbId, cur); _bump(pbId); }
    try { if (ctx.onReloaded) ctx.onReloaded(rec, reloaded); } catch (e) { console.warn('[planSync] onReloaded:', e && e.message); }
    showToast(MSG_ZWISCHENDURCH, '#e84a4a');
    throw new Error(MSG_ZWISCHENDURCH);
  }
  await pbPatch(path, { plan_data: sentStr });
  setPlanBase(pbId, sentStr, { load: false });
}
