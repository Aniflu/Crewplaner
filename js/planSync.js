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

export function normPlanData(pd) {
  let v = pd;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { return 'invalid:' + v; } }
  return JSON.stringify(_canon(v == null ? null : v));
}

export function setPlanBase(pbId, planData) { if (pbId) _base.set(pbId, normPlanData(planData)); }
export function hasPlanBase(pbId) { return _base.has(pbId); }
export function clearPlanBases() { _base.clear(); _queue.clear(); }
export function registerLoader(fn) { _loader = fn; }

// Plan samt Crew-Meta und Status aus der DB laden (Hilfsfunktion für switchPlan/Start).
export async function reloadFromDb(pbId) {
  if (!_loader) return false;
  try { return await _loader(pbId); } catch (e) { console.warn('[planSync] Nachladen fehlgeschlagen:', e && e.message); return false; }
}

// Prüft gegen die DB und schreibt nur bei unverändertem Basisstand.
//   ctx.isActive():  ist dieser Plan gerade der angezeigte?
//   ctx.onReloaded(rec): nach Mismatch aufgerufen (aktiver Plan: neu rendern; sonst Zwischenspeicher schreiben)
// Gibt die Promise des Speichervorgangs zurück; bei Abbruch wird sie mit Error(Hinweistext) abgelehnt.
export function guardedPatch(pbId, sentStr, ctx) {
  const prev = _queue.get(pbId) || Promise.resolve();
  const job = prev.catch(() => {}).then(() => _run(pbId, sentStr, ctx || {}));
  _queue.set(pbId, job.catch(() => {}));
  return job;
}

async function _run(pbId, sentStr, ctx) {
  const path = '/api/collections/plans/records/' + pbId;
  let rec;
  try { rec = await pbGet(path); }
  catch (e) {
    showToast(MSG_OFFLINE, '#e84a4a');
    throw new Error(MSG_OFFLINE);
  }
  const cur = normPlanData(rec && rec.plan_data);
  if (!_base.has(pbId) || _base.get(pbId) !== cur) {
    // Fremdänderung (oder kein bekannter Ausgangsstand): NICHT schreiben, DB-Stand übernehmen.
    if (ctx.isActive && ctx.isActive()) await reloadFromDb(pbId);
    else _base.set(pbId, cur);
    try { if (ctx.onReloaded) ctx.onReloaded(rec); } catch (e) { console.warn('[planSync] onReloaded:', e && e.message); }
    showToast(MSG_ZWISCHENDURCH, '#e84a4a');
    throw new Error(MSG_ZWISCHENDURCH);
  }
  await pbPatch(path, { plan_data: sentStr });
  _base.set(pbId, normPlanData(sentStr));
}
