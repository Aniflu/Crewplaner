// Crew-Entwurf (v1.5.0): vorgemerkte Statuswechsel + Bereitschaften, die erst mit
// „Speichern" gesammelt an den Server gehen (/crewsave). Rein, ohne DOM.
// Form: { changes: [{date,posId,from,to}], availability: [{date,posId}] }

export function draftKey(pbPlanId) { return 'tourplan_crew_draft_' + pbPlanId; }

function _leer() { return { changes: [], availability: [] }; }
function _k(e) { return e.date + '|' + e.posId; }
function _kopie(d) {
  return {
    changes: (d && d.changes ? d.changes : []).map(c => ({ ...c })),
    availability: (d && d.availability ? d.availability : []).map(a => ({ ...a }))
  };
}

// Arbeitsspeicher-Kopie je Plan: greift, wenn localStorage blockiert oder leer ist
// (Privatmodus, gesperrte Website-Daten) — sonst ginge ein Klick der Crew still verloren.
const _mem = new Map();

export function loadDraft(pbPlanId) {
  let raw = null;
  try { raw = localStorage.getItem(draftKey(pbPlanId)); } catch (e) { raw = null; /* blockiert → Arbeitsspeicher */ }
  if (!raw) return _mem.has(pbPlanId) ? _kopie(_mem.get(pbPlanId)) : _leer();
  try {
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.changes) || !Array.isArray(d.availability)) return _leer();
    return _kopie(d);
  } catch (e) { return _leer(); }   // vorhandene, aber kaputte Daten → leer (nicht still ersetzen)
}

export function saveDraft(pbPlanId, draft) {
  _mem.set(pbPlanId, _kopie(draft));
  try { localStorage.setItem(draftKey(pbPlanId), JSON.stringify(draft)); } catch (e) { /* nur im Arbeitsspeicher */ }
}

export function clearDraft(pbPlanId) {
  _mem.delete(pbPlanId);
  try { localStorage.removeItem(draftKey(pbPlanId)); } catch (e) { /* nichts zu tun */ }
}

// Ersetzt den Eintrag gleicher date|posId, behält dabei das ursprüngliche `from`.
// Zurück auf den Ausgangsstatus entfernt den Eintrag.
export function setChange(draft, { date, posId, from, to }) {
  const d = _kopie(draft);
  const i = d.changes.findIndex(c => c.date === date && c.posId === posId);
  if (i < 0) {
    if (to !== from) d.changes.push({ date, posId, from, to });
    return d;
  }
  const urspruenglich = d.changes[i].from;
  if (to === urspruenglich) d.changes.splice(i, 1);
  else d.changes[i] = { date, posId, from: urspruenglich, to };
  return d;
}

export function toggleAvailability(draft, { date, posId }) {
  const d = _kopie(draft);
  const i = d.availability.findIndex(a => a.date === date && a.posId === posId);
  if (i >= 0) d.availability.splice(i, 1);
  else d.availability.push({ date, posId });
  return d;
}

// Entfernt Wechsel, deren Ausgangsstatus nicht mehr dem aktuellen entspricht.
export function dropStale(draft, currentStatus) {
  const d = _kopie(draft);
  const dropped = [];
  d.changes = d.changes.filter(c => {
    if (currentStatus(c.date, c.posId) === c.from) return true;
    dropped.push({ date: c.date, posId: c.posId, to: c.to });
    return false;
  });
  return { draft: d, dropped };
}

export function removeEntries(draft, keys) {
  const weg = new Set((keys || []).map(_k));
  const d = _kopie(draft);
  d.changes = d.changes.filter(c => !weg.has(_k(c)));
  d.availability = d.availability.filter(a => !weg.has(_k(a)));
  return d;
}

export function draftCount(draft) {
  return ((draft && draft.changes) || []).length + ((draft && draft.availability) || []).length;
}

export function effectiveStatus(draft, date, posId, base) {
  const c = ((draft && draft.changes) || []).find(x => x.date === date && x.posId === posId);
  return c ? c.to : base;
}
