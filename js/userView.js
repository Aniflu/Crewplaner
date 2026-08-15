// ── User View — Meine Einsätze / Confirm / Decline ────────────────────────────
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, crewMeta,
         IS_CREW, IS_MANAGER, CURRENT_USER_EMAIL, CURRENT_USER_ID, setStatus,
         pendingCancellations } from './state.js';
import { SUPABASE_ENABLED, POCKETBASE_URL } from './config.js';
import { getVal, isPending, esc, showToast, fmtD, sameCrew } from './utils.js';
import { pbPatch, pbPost, pbFirst } from './pb.js';
import { confirmAssignment, declineAssignment, loadAssignmentStatuses, sendUpdateNotice,
         bulkProposeCrew, sendAvailabilityNotice, loadPlanForCrew, loadCrewMeta,
         loadCrewPlans } from './dataService.js';
import { _getNewSlotsForCrew } from './crewNotify.js';
import { renderTable, resetTodayAutoScroll } from './render.js';
import { getActivePlanId, getPlansIndex } from './plans.js';
import { closeModal, openModal } from './modals.js';
import { icsExportRows, ICS_STATUS_LABEL, crewIcsContent, feedUrls } from './pure.js';

// ── Änderungen mitteilen — ausstehende Absagen ────────────────────────────────
export function toggleCancellation(dateStr, posId) {
  const key = dateStr + '|' + posId;
  if (pendingCancellations.has(key)) pendingCancellations.delete(key);
  else pendingCancellations.add(key);
  _updateCancellationBar();
  renderTable();
}

function _updateCancellationBar() {
  const btn = document.getElementById('btnSendCancellations');
  if (!btn) return;
  const n = pendingCancellations.size;
  btn.style.display = IS_CREW && n > 0 ? '' : 'none';
  btn.querySelector('.sb-gl').textContent = n > 0 ? `⚠ ${n}` : '⚠';
}

export async function sendCancellations() {
  if (!pendingCancellations.size) return;
  showToast('Wird übermittelt…', '#e8c84a');
  try {
    for (const key of Array.from(pendingCancellations)) {
      const [dateStr, posId] = key.split('|');
      await declineAssignment(dateStr, posId); // setzt lokalen Status bei Erfolg selbst
    }
    pendingCancellations.clear();
    _updateCancellationBar();
    showToast('Änderungen mitgeteilt — Manager wird benachrichtigt ✓', '#4ae8a0');
    renderTable();
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
    await loadAssignmentStatuses();
    renderTable();
  }
}

// ── Crew: Plan-Umschalter in der Seitenleiste ─────────────────────────────────
// Crew kann in mehreren Touren stecken (z.B. AMK + Provinz). Der Manager-Plan-Index
// (getPlansIndex/localStorage) ist für Crew leer → eigene Liste aus PB (loadCrewPlans),
// gerendert ins gleiche #planList-Element wie beim Manager.
export function renderCrewPlanList(plans, activeId) {
  const el = document.getElementById('planList');
  if (!el) return;
  const list = plans || [];
  if (!list.length) {
    el.innerHTML = '<div style="font-size:.65rem;color:var(--muted);padding:4px 0;">Keine Tour zugeordnet.</div>';
    return;
  }
  el.innerHTML = list.map(p => `
    <div class="plan-item${p.id === activeId ? ' active' : ''}">
      <span class="plan-item-name" onclick="switchCrewPlan('${p.id}')" style="cursor:pointer;">${esc(p.name)}</span>
    </div>`).join('');
}

export async function switchCrewPlan(pbId) {
  if (!pbId) return;
  const current = localStorage.getItem('tourplan_active_pb_id');
  if (pbId === current) return;
  try { localStorage.setItem('tourplan_crew_selected_pb_id', pbId); } catch(_) {}
  showToast('Tour wird geladen…', '#e8c84a');
  try {
    await loadPlanForCrew();
    await Promise.all([loadCrewMeta(), loadAssignmentStatuses()]);
    resetTodayAutoScroll();   // neue Tour → einmalig wieder zu „heute" scrollen
    renderTable();
    const plans = await loadCrewPlans();
    renderCrewPlanList(plans, localStorage.getItem('tourplan_active_pb_id'));
    checkAndOpenMySchedule();
    showToast('Tour geladen ✓', '#4ae8a0');
  } catch(e) {
    showToast('Fehler beim Laden: ' + e.message, '#e84a4a');
  }
}

export function getMyCrewName() {
  if (!SUPABASE_ENABLED || !CURRENT_USER_ID) return null;
  const myEmail = (CURRENT_USER_EMAIL || '').toLowerCase();
  return Object.keys(crewMeta).find(n =>
    crewMeta[n]?.userId === CURRENT_USER_ID ||
    (crewMeta[n]?.email || '').toLowerCase() === myEmail
  ) || null;
}

// ── Meine offenen Slots sammeln ───────────────────────────────────────────────
// Basis = was die Crew in der Tabelle SIEHT (getVal: assignments/defaultCrew), NICHT nur
// vorab angelegte proposed-Records. So sind auch defaultCrew-Slots ohne Record bestätigbar
// (confirmAssignment legt den Record bei Bedarf an). Bereits bestätigte fallen raus.
export function getMyPendingSlots() {
  const myName = getMyCrewName();
  if (!myName) return [];
  const _dates = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []);
  const _pos   = (typeof POSITIONS  !== 'undefined' ? POSITIONS  : []);
  const slots = [];
  _dates.forEach(day => {
    _pos.forEach(pos => {
      if (!sameCrew(getVal(day.date, pos.id), myName)) return;
      const si = (assignmentStatuses[day.date] || {})[pos.id];
      if (si && si.status === 'confirmed') return;   // schon bestätigt → nicht mehr offen
      slots.push({ date: day.date, posId: pos.id });
    });
  });
  slots.sort((a, b) => a.date.localeCompare(b.date));
  return slots;
}

// ── Modal automatisch öffnen wenn offene Slots vorhanden ─────────────────────
export function checkAndOpenMySchedule() {
  if (IS_MANAGER) return;
  const pending = getMyPendingSlots();
  if (pending.length > 0) openMyScheduleModal();
}

// ── Meine Einsätze Modal ──────────────────────────────────────────────────────
export function openMyScheduleModal() {
  const myName = getMyCrewName();
  if (!myName) return;
  document.getElementById('sharedTitle').textContent = 'Meine Einsätze';
  _renderMySchedule(myName);
  openModal('sharedModal');
}

function _renderMySchedule(myName) {
  const slots = getMyPendingSlots();
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === getActivePlanId())?.name || 'Tour Plan';

  if (slots.length === 0) {
    document.getElementById('sharedBody').innerHTML = `
      <p style="font-size:.65rem;color:var(--muted);text-align:center;padding:20px 0;">
        Keine offenen Einsätze — alles erledigt ✅
      </p>
      <div class="mactions"><button class="mbtn primary" onclick="closeModal('sharedModal')">Schließen</button></div>`;
    return;
  }

  const rows = slots.map(({ date, posId }, i) => {
    const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
    const tourDay = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(d => d.date === date);
    const [y, m, d] = date.split('-');
    const dateStr = `${d}.${m}.${y}`;
    const location = tourDay?.loc || '';
    const posLabel = pos?.label || posId;
    const typeLabel = tourDay?.typeLabel || tourDay?.type || '';

    const si = (assignmentStatuses||{})[date]?.[posId];
    const wasChanged = si?.proposedBy === 'update';
    const changedBadge = wasChanged
      ? `<div style="font-size:.58rem;color:#e84a4a;font-weight:bold;margin-top:2px;">⚠ GEÄNDERT — bitte erneut bestätigen</div>`
      : '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" id="slot_${i}" data-date="${date}" data-pos="${posId}" checked
        style="width:16px;height:16px;accent-color:#4ae8a0;flex-shrink:0;cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:.68rem;color:var(--ink);font-weight:600;">${dateStr}
          <span style="color:#5a6070;font-weight:400;margin-left:6px;">${typeLabel}</span>
        </div>
        <div style="font-size:.6rem;color:var(--muted);margin-top:2px;">${posLabel}${location ? ' · ' + location : ''}</div>
        ${changedBadge}
      </div>
      <span class="slot-avail-label" style="font-size:.58rem;color:#4ae8a0;">Verfügbar</span>
    </label>`;
  }).join('');

  document.getElementById('sharedBody').innerHTML = `
    <div style="font-size:.62rem;color:var(--muted);margin-bottom:12px;line-height:1.5;">
      <strong style="color:var(--ink);">${planName}</strong> · Haken entfernen = nicht verfügbar
    </div>
    <div style="max-height:55vh;overflow-y:auto;margin-bottom:14px;">${rows}</div>
    <div class="mactions">
      <button class="mbtn" onclick="closeModal('sharedModal')">Später</button>
      <button class="mbtn primary" onclick="_bulkConfirmMySlots()" style="background:#4ae8a0;color:#1a1a2e;">Bestätigen ✓</button>
    </div>`;

  // Checkbox-Label live updaten
  document.querySelectorAll('#sharedBody input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const lbl = cb.closest('label').querySelector('.slot-avail-label');
      if (lbl) { lbl.textContent = cb.checked ? 'Verfügbar' : 'Nicht verfügbar'; lbl.style.color = cb.checked ? '#4ae8a0' : '#e84a4a'; }
    });
  });
}

export async function _bulkConfirmMySlots() {
  const checkboxes = document.querySelectorAll('#sharedBody input[type=checkbox]');
  const decisions = Array.from(checkboxes).map(cb => ({
    date: cb.dataset.date,
    posId: cb.dataset.pos,
    confirmed: cb.checked
  }));

  showToast('Wird gespeichert…', '#e8c84a');
  try {
    await Promise.all(decisions.map(d =>
      d.confirmed ? confirmAssignment(d.date, d.posId) : declineAssignment(d.date, d.posId)
    ));
  } catch(e) {
    showToast('Teilweise fehlgeschlagen: ' + e.message, '#e84a4a');
    await loadAssignmentStatuses();
    renderTable();
    return;
  }

  // Lokaler Status wird von confirm/declineAssignment gesetzt (nur bei echtem PB-Record)
  closeModal('sharedModal');
  showToast('Einsätze bestätigt ✓', '#4ae8a0');
  renderTable();
}

// ── Slot-Bestätigungs-Modal (Einzelklick aus Tabelle) ────────────────────────
export function openSlotConfirmModal(dateStr, posId) {
  const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
  const tourDay = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(d => d.date === dateStr);
  const [y, m, d] = dateStr.split('-');
  const dateLabel = `${d}.${m}.${y}`;
  const posLabel = pos?.label || posId;
  const loc = tourDay?.loc || '';
  document.getElementById('sharedTitle').textContent = 'Einsatz bestätigen';
  document.getElementById('sharedBody').innerHTML = `
    <div style="font-size:.68rem;color:var(--ink);margin-bottom:16px;line-height:1.7;">
      <strong>${dateLabel}</strong> · ${posLabel}${loc ? ' · ' + loc : ''}
    </div>
    <div class="mactions">
      <button class="mbtn" onclick="declineMySlot('${dateStr}','${posId}');closeModal('sharedModal')">✗ Ablehnen</button>
      <button class="mbtn primary" onclick="confirmMySlot('${dateStr}','${posId}');closeModal('sharedModal')" style="background:#4ae8a0;color:#1a1a2e;">✓ Bestätigen</button>
    </div>`;
  openModal('sharedModal');
}

// ── Alle angefragten Termine auf einmal bestätigen ────────────────────────────
export function bulkConfirmAllMySlots() {
  if (!getMyCrewName()) { showToast('Konto nicht mit Crew-Mitglied verknüpft — Admin kontaktieren', '#e84a4a'); return; }
  if (!getMyPendingSlots().length) { showToast('Keine offenen Termine — alles bestätigt ✓', '#5a6070'); return; }
  // Auswahl-Liste öffnen: abwählen was nicht geht → „Bestätigen ✓" bestätigt den Rest
  // (angehakt) und lehnt die abgewählten ab (_bulkConfirmMySlots).
  openMyScheduleModal();
}

// ── Einzelne Slot-Aktionen (aus Tabelle heraus) ───────────────────────────────
export async function confirmMySlot(dateStr, posId) {
  try {
    await confirmAssignment(dateStr, posId);
    showToast('Bestätigt ✓', '#4ae8a0');
  } catch(e) {
    showToast('Nicht gespeichert: ' + e.message, '#e84a4a');
    await loadAssignmentStatuses();
  }
  renderTable();
}

export async function declineMySlot(dateStr, posId) {
  try {
    await declineAssignment(dateStr, posId);
    showToast('Abgelehnt', '#e84a4a');
  } catch(e) {
    showToast('Nicht gespeichert: ' + e.message, '#e84a4a');
    await loadAssignmentStatuses();
  }
  renderTable();
}

// ── Bereitschaftsmeldung Draft ────────────────────────────────────────────────
export const _meldungDraft = {}; // { 'YYYY-MM-DD': Set<posId> } — in-memory only

export const _getMeldungSent = () => {
  try { return JSON.parse(localStorage.getItem('crewplan_meldungen_'+(getActivePlanId()||'')) || '{}'); } catch(_) { return {}; }
};
const _saveMeldungSent = d => localStorage.setItem('crewplan_meldungen_'+(getActivePlanId()||''), JSON.stringify(d));

function _meldungCount() {
  return Object.values(_meldungDraft).reduce((s, set) => s + set.size, 0);
}

export function _updateMeldungBar() {
  const bar = document.getElementById('meldungSubmitBar');
  if (!bar) return;
  const n = _meldungCount();
  bar.style.display = (!IS_MANAGER && n > 0) ? 'block' : 'none';
  const cnt = document.getElementById('meldungCount');
  if (cnt) cnt.textContent = n;
}

export function meinesMelden(dateStr, posId) {
  if (!getMyCrewName()) { showToast('Dein Konto ist noch nicht verknüpft. Bitte Admin kontaktieren.', '#e84a4a'); return; }
  if (!_meldungDraft[dateStr]) _meldungDraft[dateStr] = new Set();
  if (_meldungDraft[dateStr].has(posId)) {
    _meldungDraft[dateStr].delete(posId);
    if (!_meldungDraft[dateStr].size) delete _meldungDraft[dateStr];
  } else {
    _meldungDraft[dateStr].add(posId);
  }
  renderTable();
}

// ── Plan-Änderungs-Queue (Admin → Crew re-bestätigen) ─────────────────────────
// Key STABIL pro Plan: PB-Plan-ID (für Manager immer gesetzt) bevorzugt, sonst lokale
// activePlanId. Verhindert den alten Sammel-Topf mit leerem Suffix (loadPlanForManager
// setzt kein activePlanId → früher kippten ALLE Pläne in 'crewplan_updates_').
function _queuePlanKey() {
  let pid = '';
  try { pid = localStorage.getItem('tourplan_active_pb_id') || ''; } catch(_) {}
  if (!pid) pid = getActivePlanId() || '';
  return 'crewplan_updates_' + pid;
}
let _legacyQueueMigrated = false;
function _migrateLegacyQueue() {
  if (_legacyQueueMigrated) return;
  const key = _queuePlanKey();
  if (key === 'crewplan_updates_') return;   // noch keine Plan-ID — später migrieren
  if (!TOUR_DATES.length) return;            // Plan noch nicht geladen — später
  _legacyQueueMigrated = true;
  let legacy = null;
  try { legacy = JSON.parse(localStorage.getItem('crewplan_updates_') || 'null'); } catch(_) {}
  if (legacy) {
    // Nur Slots des AKTUELLEN Plans übernehmen (Datum in TOUR_DATES), Rest verwerfen.
    const valid = new Set(TOUR_DATES.map(r => r.date));
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem(key) || '{}'); } catch(_) {}
    for (const [name, entry] of Object.entries(legacy)) {
      const slots = (entry.slots || []).filter(s => valid.has(s.date));
      if (!slots.length) continue;
      if (!cur[name]) cur[name] = { email: entry.email, informational: entry.informational, slots: [] };
      for (const s of slots)
        if (!cur[name].slots.find(x => x.date === s.date && x.posLabel === s.posLabel)) cur[name].slots.push(s);
    }
    localStorage.setItem(key, JSON.stringify(cur));
  }
  try { localStorage.removeItem('crewplan_updates_'); } catch(_) {}
}
function _getCrewUpdateQueue() {
  _migrateLegacyQueue();
  try { return JSON.parse(localStorage.getItem(_queuePlanKey()) || '{}'); } catch(_) { return {}; }
}
function _saveCrewUpdateQueue(q) {
  localStorage.setItem(_queuePlanKey(), JSON.stringify(q));
}

// Live-Erkennung: jede eingeplante (getVal), aber noch nicht angefragte/bestätigte
// Person (kein aktiver PB-Record) ist ein „neuer Termin". So erscheint die Update-Bar
// auch für Tage, die schon im Plan stehen (z.B. nach Reload oder vor diesem Code
// hinzugefügt) — nicht nur im Moment des Hinzufügens. Bestätigte Slots haben Records
// und fallen NICHT rein (kein Flut bestehender Tage).
function _liveNewSlotsByCrew() {
  const out = {};
  if (!IS_MANAGER) return out;
  for (const name of Object.keys(crewMeta || {})) {
    const meta = crewMeta[name] || {};
    if (!meta.email) continue;
    let ns = [];
    try { ns = _getNewSlotsForCrew(name, meta.email) || []; } catch(_) { ns = []; }
    if (ns.length) out[name] = { email: meta.email, slots: ns };
  }
  return out;
}
// Live-Slots in die (persistente) Queue mischen — als informational. Idempotent.
function _mergeLiveNewSlots(q) {
  const live = _liveNewSlotsByCrew();
  let changed = false;
  for (const [name, { email, slots }] of Object.entries(live)) {
    for (const s of slots) {
      if (!q[name]) { q[name] = { email, informational: true, slots: [] }; changed = true; }
      if (!q[name].slots.find(x => x.date === s.date && x.posId === s.posId)) {
        q[name].slots.push({ kind: 'new', date: s.date, posId: s.posId, posLabel: s.posLabel, changes: ['Neuer Termin'] });
        changed = true;
      }
    }
  }
  return changed;
}
export function _dateBlockId(date) {
  const r = TOUR_DATES.find(x => x.date === date);
  return r ? (r.blockId || '') : '';
}

export function _queueCrewUpdate(dateStr, changeDesc) {
  const day = assignmentStatuses[dateStr];
  if (!day) return;
  let affected = 0;
  const q = _getCrewUpdateQueue();
  Object.entries(day).forEach(([posId, si]) => {
    if (si.status !== 'confirmed' && si.status !== 'proposed') return;
    const meta = crewMeta[si.crewName] || {};
    if (!meta.email) return;
    if (!q[si.crewName]) q[si.crewName] = { email: meta.email, slots: [] };
    const pos = POSITIONS.find(p => p.id === posId);
    const posLabel = pos?.label || posId;
    let slot = q[si.crewName].slots.find(s => s.date === dateStr && s.posLabel === posLabel);
    if (!slot) { slot = { date: dateStr, posLabel, changes: [] }; q[si.crewName].slots.push(slot); }
    if (!slot.changes.includes(changeDesc)) slot.changes.push(changeDesc);
    setStatus(dateStr, posId, { ...si, status: 'proposed' });
    affected++;
  });
  if (affected === 0) return;
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
  renderTable();
}

export function _queueGlobalCrewUpdate(changeDesc, dates) {
  // dates = Liste der NEU hinzugefügten Datumswerte. OHNE dates passiert nichts (kein
  // Plan-Flut). Die Belegung neuer Tage kommt aus defaultCrew/getVal — NICHT aus
  // assignmentStatuses (dort hat ein frischer Tag noch keine Records). Deshalb hier
  // über getVal befüllen, sonst bleibt die Queue leer und die „Updates"-Bar erscheint nie.
  if (!Array.isArray(dates) || !dates.length) return;
  const q = _getCrewUpdateQueue();
  let affected = 0;
  dates.forEach(dateStr => {
    if (!TOUR_DATES.find(r => r.date === dateStr)) return;
    POSITIONS.forEach(pos => {
      const name = getVal(dateStr, pos.id);
      if (!name) return;
      const meta = crewMeta[name] || {};
      if (!meta.email) return;
      if (!q[name]) q[name] = { email: meta.email, informational: true, slots: [] };
      const posLabel = pos.label || pos.id;
      let slot = q[name].slots.find(s => s.date === dateStr && s.posId === pos.id);
      if (!slot) { slot = { date: dateStr, posId: pos.id, posLabel, changes: [] }; q[name].slots.push(slot); }
      if (!slot.changes.includes(changeDesc)) slot.changes.push(changeDesc);
      affected++;
    });
  });
  if (affected === 0) return;
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
}

// Entfernten (vorher bestätigten/angefragten) Slot in die Updates-Queue legen
// (v0.30.0 — ersetzt das frühere Absage-Banner). aid = PB-Record-ID des
// soft-gecancelten assignments-Records (Ziel des „GESEHEN ✓"-Mail-Buttons).
export function _queueRemovedSlot(crewName, email, dateStr, posId, posLabel, aid) {
  if (!email) return;   // ohne Mail-Adresse nichts sendbar (wie bei Updates)
  const q = _getCrewUpdateQueue();
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  const exists = q[crewName].slots.some(s => s.kind === 'removed' && s.date === dateStr && s.posId === posId);
  if (!exists) q[crewName].slots.push({ kind: 'removed', date: dateStr, posId, posLabel, aid, changes: ['Termin entfernt'] });
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
}

// Statuswechsel „bestätigt ⇄ vorgemerkt" (v0.5.0) in die Updates-Queue legen.
// `to` = Zielstatus ('pencilled' | 'confirmed'). Anders als bei removed bleibt die Person
// in der Zelle stehen — nur die Verbindlichkeit ändert sich. Versand wie immer erst per
// Knopfdruck („Updates senden"), nie automatisch.
export function _queueStatusSlot(crewName, email, dateStr, posId, posLabel, to) {
  if (!email) return;   // ohne Mail-Adresse nichts sendbar (wie bei Updates)
  const q = _getCrewUpdateQueue();
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  // Gleicher Slot schon gequeued? Dann nur die Richtung aktualisieren — sonst stünden
  // nach einem Hin-und-Zurück zwei widersprüchliche Einträge in der Mail.
  const prev = q[crewName].slots.find(s => s.kind === 'status' && s.date === dateStr && s.posId === posId);
  if (prev) { prev.to = to; prev.changes = [_STATUS_CHANGE_LABEL[to] || 'Status geändert']; }
  else q[crewName].slots.push({ kind: 'status', to, date: dateStr, posId, posLabel,
                                changes: [_STATUS_CHANGE_LABEL[to] || 'Status geändert'] });
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
}
// 'proposed' seit v0.9.0: Der Sammel-Dialog kann anfragen. Ohne Eintrag hier stünde in der
// Mail nur „Status geändert" — die Person wüsste nicht, dass sie antworten soll.
const _STATUS_CHANGE_LABEL = { pencilled: 'Jetzt vorgemerkt', confirmed: 'Wieder bestätigt',
                               proposed: 'Angefragt — bitte bestätigen oder ablehnen' };

export function _updateCrewUpdateBar() {
  const q = _getCrewUpdateQueue();
  // Queue bereinigen: nur Slots im AKTUELLEN Plan (Datum in TOUR_DATES) behalten,
  // Mitglieder ohne gültige Slots entfernen. Zählt EXAKT wie das Modal rendert —
  // verhindert „Badge zeigt N, Modal ist leer" (früher fügte ein Auto-Add proposed-
  // Mitglieder mit leeren slots:[] hinzu → Badge +1, Modal zeigte nichts).
  const valid = new Set(TOUR_DATES.map(r => r.date));
  let changed = false, slotCount = 0;
  for (const name of Object.keys(q)) {
    const entry = q[name] || {};
    const orig = entry.slots || [];
    const slots = orig.filter(s => {
      if (!valid.has(s.date)) return false;
      // removed-Slots sind per Definition nicht mehr in getVal → NICHT wegheilen.
      if (s.kind === 'removed') return true;
      // Statuswechsel-Slots (v0.5.0) sind weiter in getVal — sie gelten nur, solange die
      // Person auch wirklich noch in der Zelle steht. Nimmt der Manager sie danach ganz
      // heraus, legt der Entfernen-Pfad seinen eigenen removed-Eintrag an.
      if (s.kind === 'status') return s.posId ? getVal(s.date, s.posId) === name : true;
      // Self-Heal: ein auto-gequeuter (informational) Slot ist nur gültig, solange die
      // Person dort noch eingeplant ist. Entfernt der Manager den Namen wieder
      // (getVal → ''), fällt der Slot raus → Bar/Badge stimmen live. posId nötig
      // (Legacy-Slots ohne posId bleiben unangetastet).
      if (entry.informational && s.posId) return getVal(s.date, s.posId) === name;
      return true;
    });
    if (slots.length !== orig.length) { entry.slots = slots; changed = true; }
    if (!slots.length) { delete q[name]; changed = true; continue; }
    slotCount += slots.length;
  }
  if (changed) _saveCrewUpdateQueue(q);
  // Live: zusätzlich eingeplante, aber noch nicht angefragte Personen (read-only zählen,
  // ohne zu persistieren — gemergt wird erst beim Öffnen des Modals).
  const live = _liveNewSlotsByCrew();
  let liveSlotCount = 0;
  for (const e of Object.values(live)) liveSlotCount += e.slots.length;
  const people = new Set([...Object.keys(q), ...Object.keys(live)]);
  const btn = document.getElementById('btnUpdateQueue');
  const badge = document.getElementById('updateQueueBadge');
  if (btn) btn.style.display = (IS_MANAGER && (slotCount + liveSlotCount) > 0) ? '' : 'none';
  if (badge) badge.textContent = people.size;
}

const _QBTN = "background:#23233a;color:#9ad;border:1px solid #3a3a55;border-radius:3px;padding:1px 7px;font-family:inherit;font-size:.58rem;letter-spacing:.5px;cursor:pointer;";

export function _openUpdateQueueModal() {
  const q = _getCrewUpdateQueue();
  // Live erkannte neue Termine fest in die Queue übernehmen (damit sie auswähl-/sendbar
  // sind), dann normal rendern.
  if (_mergeLiveNewSlots(q)) _saveCrewUpdateQueue(q);
  const body = document.getElementById('crewUpdateModalBody');
  if (!body) return;

  // Nur Slots des AKTUELLEN Plans (Datum in TOUR_DATES). Block-Reihenfolge aus TOUR_DATES.
  const valid = new Set(TOUR_DATES.map(r => r.date));
  const blockName = {}; const blockOrder = []; const seenB = new Set();
  TOUR_DATES.forEach(r => {
    const bid = r.blockId || '';
    if (bid && r.blockName) blockName[bid] = r.blockName;
    if (!seenB.has(bid)) { seenB.add(bid); blockOrder.push(bid); }
  });

  // gruppieren: block → crew → [slots]
  const grouped = {}; let total = 0;
  for (const [name, entry] of Object.entries(q)) {
    for (const slot of (entry.slots || [])) {
      if (!valid.has(slot.date)) continue;
      const bid = _dateBlockId(slot.date);
      (grouped[bid] = grouped[bid] || {});
      (grouped[bid][name] = grouped[bid][name] || []).push(slot);
      total++;
    }
  }

  let html = '';
  if (total === 0) {
    html = '<div style="color:#888;font-size:.7rem;">Queue ist leer.</div>';
  } else {
    for (const bid of blockOrder) {
      const g = grouped[bid]; if (!g) continue;
      const bLabel = bid ? (blockName[bid] || 'Block') : 'Ohne Block';
      html += `<div style="margin:14px 0 6px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #e8c84a55;padding-bottom:3px;">
        <span style="color:#e8c84a;font-size:.72rem;letter-spacing:1px;flex:1;">▣ ${esc(bLabel)}</span>
        <button data-block="${esc(bid)}" data-val="1" onclick="_queueGrpSel(this)" style="${_QBTN}">alle</button>
        <button data-block="${esc(bid)}" data-val="0" onclick="_queueGrpSel(this)" style="${_QBTN}">keine</button>
      </div>`;
      for (const [name, slots] of Object.entries(g)) {
        const entry = q[name] || {};
        html += `<div style="display:flex;align-items:center;gap:6px;margin:6px 0 2px;">
          <span style="color:#9ad;font-size:.66rem;flex:1;">${esc(name)} <span style="color:#777;">(${esc(entry.email||'')})</span></span>
          <button data-block="${esc(bid)}" data-crew="${esc(name)}" data-val="1" onclick="_queueGrpSel(this)" style="${_QBTN}">alle</button>
          <button data-block="${esc(bid)}" data-crew="${esc(name)}" data-val="0" onclick="_queueGrpSel(this)" style="${_QBTN}">keine</button>
        </div>`;
        slots.forEach(slot => {
          const slotKey = `${slot.date}|${slot.posLabel}`;
          const isChecked = slot.selected !== false;
          const kindTag = slot.kind === 'removed'
            ? `<span style="color:var(--warn);font-weight:600;">➖ entfernt</span> · `
            : slot.kind === 'status'
              ? (slot.to === 'pencilled'
                  ? `<span style="color:var(--pencilled);font-weight:600;">✎ vorgemerkt</span> · `
                  : `<span style="color:var(--show);font-weight:600;">✓ wieder bestätigt</span> · `)
              : `<span style="color:var(--show);">➕ neu</span> · `;
          html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0 2px 14px;border-bottom:1px solid #2a2a3a;font-size:.64rem;color:#ccc;">
            <input type="checkbox" data-crew="${esc(name)}" data-key="${esc(slotKey)}" ${isChecked ? 'checked' : ''}
              onchange="_toggleSlotSelection(this)"
              style="width:14px;height:14px;accent-color:#4ae8a0;flex-shrink:0;cursor:pointer;">
            <span style="flex:1;">${kindTag}${esc(slot.date)} · ${esc(slot.posLabel||'')}</span>
            <span class="q-del" data-crew="${esc(name)}" data-key="${esc(slotKey)}" onclick="_deleteSlotFromQueue(this)" style="cursor:pointer;color:#e84a4a;margin-left:8px;font-size:.7rem;">✕</span>
          </div>`;
        });
      }
    }
  }
  body.innerHTML = html;
  document.body.style.overflow = 'hidden';
  const modal = document.getElementById('crewUpdateModal');
  if (modal) modal.style.display = 'flex';
  _updateSendButton();
}

// Auswahl-Helfer: setzt slot.selected für alle (gefilterten) Slots, speichert, rendert neu.
function _applyQueueSel(slotPred, value, crewFilter) {
  const q = _getCrewUpdateQueue();
  const valid = new Set(TOUR_DATES.map(r => r.date));
  for (const [name, entry] of Object.entries(q)) {
    if (crewFilter && name !== crewFilter) continue;
    for (const slot of (entry.slots || [])) {
      if (!valid.has(slot.date)) continue;
      if (slotPred(slot)) slot.selected = value;
    }
  }
  _saveCrewUpdateQueue(q);
  _openUpdateQueueModal();
}
export function _queueSelectAll(value) { _applyQueueSel(() => true, value); }
export function _queueGrpSel(btn) {
  const block = btn.dataset.block;            // immer gesetzt ('' = Ohne Block)
  const crew = btn.dataset.crew || null;      // optional
  const value = btn.dataset.val === '1';
  _applyQueueSel(slot => _dateBlockId(slot.date) === block, value, crew);
}

export function _closeUpdateQueueModal() {
  const modal = document.getElementById('crewUpdateModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// Komplette Queue leeren (z.B. um einen früher gefluteten Bestand loszuwerden).
export async function _clearUpdateQueue() {
  const ok = typeof showConfirm === 'function'
    ? await showConfirm('Update-Queue komplett leeren? Es werden KEINE Mails versendet.')
    : true;
  if (!ok) return;
  _saveCrewUpdateQueue({});
  _updateCrewUpdateBar();
  _openUpdateQueueModal();
}

export function _deleteSlotFromQueue(el) {
  const crewName = el?.dataset?.crew;
  const slotKey = el?.dataset?.key;
  if (!crewName || !slotKey) return;
  const q = _getCrewUpdateQueue();
  if (!q[crewName]) return;
  q[crewName].slots = q[crewName].slots.filter(s => `${s.date}|${s.posLabel}` !== slotKey);
  if (q[crewName].slots.length === 0) delete q[crewName];
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
  _openUpdateQueueModal();
}

export function _toggleSlotSelection(cb) {
  const crewName = cb.dataset.crew;
  const slotKey = cb.dataset.key;
  const q = _getCrewUpdateQueue();
  if (!q[crewName]) return;
  const slot = q[crewName].slots.find(s => `${s.date}|${s.posLabel}` === slotKey);
  if (slot) slot.selected = cb.checked;
  _saveCrewUpdateQueue(q);
  _updateSendButton();
}

function _updateSendButton() {
  const q = _getCrewUpdateQueue();
  const valid = new Set(TOUR_DATES.map(r => r.date));
  let count = 0;
  for (const entry of Object.values(q)) {
    for (const slot of (entry.slots || [])) {
      if (valid.has(slot.date) && slot.selected !== false) count++;
    }
  }
  const btn = document.getElementById('btnSendUpdates');
  if (btn) btn.textContent = `AUSWAHL SENDEN (${count}) →`;
}

function _activePlanName() {
  try {
    const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
    const byIndex = plans.find(p => p.id === getActivePlanId())?.name;
    if (byIndex) return byIndex;
    // Crew: getPlansIndex ist leer → Name aus loadPlanForCrew (localStorage).
    const stored = localStorage.getItem('tourplan_active_plan_name');
    return stored || 'Tour Plan';
  } catch { return 'Tour Plan'; }
}
function _fmtPrevDate(iso) {
  const p = String(iso || '').split('-');
  return (p.length === 3 && p[0].length === 4) ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

// ── Crew: eigener Export (nur EIGENE Termine) ─────────────────────────────────
// Liefert die bestätigten UND vorgemerkten Tage der eingeloggten Crew + Bandname +
// Datum-Metadaten. Vorgemerkte tragen ihren Status mit (v0.5.0).
function _myConfirmedExport() {
  const myName = getMyCrewName();
  if (!myName) { showToast('Konto nicht mit Crew-Mitglied verknüpft — Admin kontaktieren', '#e84a4a'); return null; }
  const rows = icsExportRows(TOUR_DATES, POSITIONS, assignmentStatuses, { onlyCrew: true, myName });
  if (!rows.length) { showToast('Keine Termine', '#5a6070'); return null; }
  const dateMeta = {}; TOUR_DATES.forEach(r => { dateMeta[r.date] = r; });
  return { rows, dateMeta, band: _activePlanName(), myName };
}

// .ics: pro Eintrag NUR Band (Titel) + Ort + Art — keine anderen Namen/Positionen.
export function downloadMyICS() {
  const x = _myConfirmedExport(); if (!x) return;
  const content = crewIcsContent(x.band, x.rows, x.dateMeta);
  const safe = (x.band || 'tour').replace(/[^\wäöüÄÖÜ.-]+/g, '_');
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}_meine-termine.ics`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast(`${x.rows.length} Termine exportiert ✓`, '#2d6a3f');
}

// ── Crew: Kalender abonnieren (persönlicher, sich aktualisierender Feed) ───────
// Zeigt den persönlichen Abo-Link (Server-Route /ics/{feed_token}). Anders als der
// einmalige Download aktualisiert sich ein Abo automatisch, sobald sich Termine ändern.
export function openSubscribeModal() {
  let token = '';
  try { token = (JSON.parse(localStorage.getItem('pb_user') || '{}').feed_token) || ''; } catch (_) {}
  const planId   = localStorage.getItem('tourplan_active_pb_id') || '';
  const planName = _activePlanName() || 'diese Tour';
  const body = document.getElementById('subscribeBody');
  if (!body) return;

  if (!token) {
    body.innerHTML = `<p style="font-size:12px;line-height:1.6;color:var(--muted);">
      Dein Abo-Link ist noch nicht bereit. Bitte einmal <b>abmelden und wieder anmelden</b> —
      danach steht er hier.</p>`;
    openModal('subscribeModal');
    return;
  }
  if (!planId) {
    body.innerHTML = `<p style="font-size:12px;line-height:1.6;color:var(--muted);">
      Keine Tour geöffnet. Bitte zuerst links eine Tour auswählen — der Abo-Link gilt
      immer für die geöffnete Tour.</p>`;
    openModal('subscribeModal');
    return;
  }

  const { https, webcal } = feedUrls(POCKETBASE_URL, token, planId);
  window._copyFeed = (which) => {
    const url = which === 'https' ? https : webcal;
    if (!navigator.clipboard) { showToast('Kopieren nicht möglich — Link manuell markieren', '#e84a4a'); return; }
    navigator.clipboard.writeText(url).then(
      () => showToast('Link kopiert ✓', '#2d6a3f'),
      () => showToast('Kopieren nicht möglich — Link manuell markieren', '#e84a4a')
    );
  };

  body.innerHTML = `
    <p style="font-size:12px;line-height:1.6;color:var(--muted);margin-bottom:6px;">
      Abonniere deine Termine <b>einmal</b> — dein Kalender aktualisiert sich danach
      automatisch, sobald sich etwas ändert (bestätigte und angefragte Einsätze).</p>
    <p style="font-size:12px;line-height:1.5;margin-bottom:14px;">
      Gilt für: <b style="color:var(--accent);">${esc(planName)}</b></p>

    <div class="mf">
      <label class="ml">Ein-Tipp-Abo (Apple · iPhone · Android · Outlook)</label>
      <a href="${esc(webcal)}" class="mbtn primary" style="display:block;text-align:center;text-decoration:none;margin-bottom:6px;">📆 Jetzt abonnieren</a>
      <button class="mbtn" style="width:100%;" onclick="window._copyFeed('webcal')">Link kopieren</button>
    </div>

    <div class="mf">
      <label class="ml">Google Kalender (per URL hinzufügen)</label>
      <input class="mi" readonly value="${esc(https)}" onclick="this.select()" style="margin-bottom:6px;">
      <button class="mbtn" style="width:100%;" onclick="window._copyFeed('https')">Link kopieren</button>
      <p style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5;">
        Google Kalender → „Weitere Kalender" → „Per URL" → diesen Link einfügen.</p>
    </div>

    <p style="font-size:10px;color:var(--muted);line-height:1.5;border-top:1px solid var(--rule);padding-top:10px;">
      Der Link gilt nur für <b>${esc(planName)}</b>. Bist du in mehreren Touren, links die
      Tour wechseln und erneut abonnieren.</p>`;
  openModal('subscribeModal');
}

// PDF: druckfertige Liste (Datum · Art · Ort), Titel = Band → „Als PDF speichern".
export function printMySchedule() {
  const x = _myConfirmedExport(); if (!x) return;
  const rowsHtml = x.rows.map(r => {
    const m = x.dateMeta[r.date] || {};
    const st = ICS_STATUS_LABEL[r.status] || '';
    return `<tr><td>${esc(_fmtPrevDate(r.date))}</td><td>${esc(m.typeLabel || m.type || '')}</td><td>${esc(m.loc || '')}</td><td>${esc(st)}</td></tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${esc(x.band)} — Meine Termine</title>
    <style>
      body{font-family:'Courier New',monospace;color:#1a1a2e;margin:32px;}
      h1{font-size:20px;letter-spacing:1px;margin:0 0 2px;}
      .sub{font-size:11px;color:#777;margin:0 0 20px;text-transform:uppercase;letter-spacing:2px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd;}
      th{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#999;border-bottom:2px solid #e8c84a;}
      @media print{body{margin:12mm;}}
    </style></head><body>
    <h1>${esc(x.band)}</h1>
    <p class="sub">Meine Termine · ${esc(x.myName)} · ${x.rows.length}</p>
    <table><thead><tr><th>Datum</th><th>Art</th><th>Ort</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <script>window.onload=function(){window.print();};<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('Pop-up blockiert — bitte erlauben', '#e84a4a'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ── E-Mail-Vorschau (pro Person, vor dem Senden) ──────────────────────────────
let _updatePreviewResolve = null;
function _openUpdatePreview(opts) {
  return new Promise(resolve => {
    _updatePreviewResolve = resolve;
    const body = document.getElementById('updatePreviewBody');
    if (body) {
      const _kindTxt = s => s.kind === 'removed' ? '➖ entfernt'
        : s.kind === 'status' ? (s.to === 'pencilled' ? '✎ vorgemerkt' : '✓ bestätigt')
        : '➕ neu';
      const rows = (opts.slots || []).map(s =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #2a2f3a;">${esc(_fmtPrevDate(s.date))}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #2a2f3a;">${esc(s.posLabel || '')}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #2a2f3a;">${esc(_kindTxt(s))}</td></tr>`).join('');
      body.innerHTML =
        `<div><strong style="color:#9aa0aa;">An:</strong> ${esc(opts.email || '')}</div>
         <div><strong style="color:#9aa0aa;">Betreff:</strong> ${esc(opts.subject || '')}</div>
         <div style="margin-top:8px;color:#9aa0aa;">${opts.intro || ''}</div>
         ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:.62rem;color:#9aa0aa;">${rows}</table>` : ''}`;
    }
    const ta = document.getElementById('updatePreviewText'); if (ta) ta.value = '';
    const m = document.getElementById('updatePreviewModal'); if (m) m.style.display = 'flex';
    setTimeout(() => document.getElementById('updatePreviewText')?.focus(), 50);
  });
}
function _resolveUpdatePreview(action) {
  const ta = document.getElementById('updatePreviewText');
  const customText = (ta?.value || '').trim();
  const r = _updatePreviewResolve; _updatePreviewResolve = null;
  const m = document.getElementById('updatePreviewModal'); if (m) m.style.display = 'none';
  if (r) r(action === 'send' ? { action, customText } : { action });
}
export function _updatePreviewSend()   { _resolveUpdatePreview('send'); }
export function _updatePreviewSkip()   { _resolveUpdatePreview('skip'); }
export function _updatePreviewCancel() { _resolveUpdatePreview('cancel'); }

// Sendet das Update für EINE Person (legt fehlende PB-Records an, mailt). customText
// optional → wird als Freitext-Notiz (custom_message) mitgeschickt. Entfernte Slots
// (kind:'removed', v0.30.0) gehen mit aid in die Mail — der Hook rendert daraus den
// ➖-Abschnitt mit „GESEHEN ✓"-Button; sie werden NICHT auf proposed gesetzt.
async function _sendUpdateForEntry(name, entry, customText) {
  const removed = (entry.slots || []).filter(s => s.kind === 'removed');
  // Statuswechsel-Slots (v0.5.0) gehen NUR in die Mail. Sie dürfen NICHT in `normal`
  // landen — der Zweig unten patcht dort jeden Slot auf 'proposed' und würde damit die
  // gerade gesetzte Vormerkung zerstören und eine Anfrage-Mail auslösen.
  const status  = (entry.slots || []).filter(s => s.kind === 'status');
  const normal  = (entry.slots || []).filter(s => s.kind !== 'removed' && s.kind !== 'status');
  const removedMail = removed.map(s => ({ date: s.date, posLabel: s.posLabel, kind: 'removed', aid: s.aid || '', changes: ['Termin entfernt'] }));
  const statusMail = status.map(s => ({ date: s.date, posLabel: s.posLabel, kind: 'status', to: s.to || 'pencilled',
                                        changes: [_STATUS_CHANGE_LABEL[s.to] || 'Status geändert'] }));

  if (entry.informational) {
    // Nur die ausgewählten neuen Slots anfragen + mailen (nicht den ganzen Plan).
    const allNew = _getNewSlotsForCrew(name, entry.email);
    const wanted = new Set(normal.map(s => s.date + '|' + (s.posId || '')));
    let newSlots = allNew.filter(s => wanted.has(s.date + '|' + s.posId));
    if (!newSlots.length && normal.length) newSlots = allNew;   // Fallback (Legacy-Slots ohne posId)
    if (newSlots.length) await bulkProposeCrew(newSlots);
    const mailSlots = newSlots.map(s => ({ date: s.date, posLabel: s.posLabel, kind: 'new', changes: ['Neuer Termin'] })).concat(removedMail, statusMail);
    if (mailSlots.length) await sendUpdateNotice(name, entry.email, mailSlots, customText);
    return;
  }
  // Änderung an bestehenden Einsätzen: vorhandene Records auf proposed setzen + mailen.
  const newSlots = _getNewSlotsForCrew(name, entry.email);
  if (newSlots.length) await bulkProposeCrew(newSlots);
  const planId = localStorage.getItem('tourplan_active_pb_id');
  for (const slot of normal) {
    const day = assignmentStatuses[slot.date];
    const posId = day ? Object.keys(day).find(p => {
      const pos = POSITIONS.find(pp => pp.id === p);
      return (pos?.label || p) === slot.posLabel && day[p].crewName === name;
    }) : null;
    if (posId && planId) {
      const existing = await pbFirst('assignments',
        `plan_id = "${planId}" && date = "${slot.date}" && pos_id = "${posId}"`);
      if (existing) await pbPatch('/api/collections/assignments/records/'+existing.id,
        { status: 'proposed', proposed_by: 'update' });
    }
  }
  await sendUpdateNotice(name, entry.email, normal.concat(removedMail, statusMail), customText);
}

export async function _sendSelectedUpdates() {
  const full = _getCrewUpdateQueue();
  const valid = new Set(TOUR_DATES.map(r => r.date));
  const recipients = [];
  for (const [name, entry] of Object.entries(full)) {
    const planSlots = (entry.slots || []).filter(s => valid.has(s.date));
    const selectedSlots = planSlots.filter(s => s.selected !== false);
    if (selectedSlots.length) recipients.push({ name, entry, slots: selectedSlots });
  }
  if (!recipients.length) { showToast('Nichts ausgewählt', '#5a6070'); return; }

  const planName = _activePlanName();
  const sentKeys = {};   // name → Set('date|posLabel') erfolgreich gesendet
  for (const r of recipients) {
    const res = await _openUpdatePreview({
      email: r.entry.email,
      subject: 'ÄNDERUNG · ' + planName,
      // Reine Statuswechsel verlangen keine erneute Bestätigung — Wortlaut entsprechend.
      intro: r.slots.every(s => s.kind === 'status')
        ? `${r.slots.length} Einsätze für <strong>${esc(planName)}</strong> haben einen neuen Status.`
        : `${r.slots.length} aktualisierte/neue Einsätze für <strong>${esc(planName)}</strong> — bitte erneut bestätigen.`,
      slots: r.slots,
    });
    if (res.action === 'cancel') break;
    if (res.action === 'skip') continue;
    try {
      await _sendUpdateForEntry(r.name, { ...r.entry, slots: r.slots }, res.customText);
      sentKeys[r.name] = new Set(r.slots.map(s => s.date + '|' + s.posLabel));
    } catch(e) {
      showToast('Fehler bei ' + r.name + ': ' + e.message, '#e84a4a');
    }
  }

  const sentNames = Object.keys(sentKeys);
  if (sentNames.length) {
    const q = _getCrewUpdateQueue();
    for (const name of sentNames) {
      const entry = q[name]; if (!entry) continue;
      entry.slots = (entry.slots || []).filter(s => !sentKeys[name].has(s.date + '|' + s.posLabel));
      if (!entry.slots.length) delete q[name];
    }
    _saveCrewUpdateQueue(q);
    showToast('Update-Mails gesendet ✓', '#4ae8a0');
    await loadAssignmentStatuses();
    renderTable();
  }
  _updateCrewUpdateBar();
  if (Object.keys(_getCrewUpdateQueue()).length) _openUpdateQueueModal();
  else _closeUpdateQueueModal();
}

export async function _sendPendingUpdates() {
  const q = _getCrewUpdateQueue();
  const names = Object.keys(q);
  if (!names.length) { showToast('Nichts ausgewählt', '#5a6070'); return; }
  showToast('Update-Mails werden gesendet…', '#e8c84a');
  try {
    for (const name of names) await _sendUpdateForEntry(name, q[name]);
    _saveCrewUpdateQueue({});
    _updateCrewUpdateBar();
    _closeUpdateQueueModal();
    showToast('Update-Mails gesendet ✓', '#4ae8a0');
    await loadAssignmentStatuses();
    renderTable();
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
  }
}

export async function _submitMeldung() {
  const myName = getMyCrewName();
  if (!myName) return;
  const meta = crewMeta[myName] || {};
  const sent = _getMeldungSent();
  const slots = [];
  Object.entries(_meldungDraft).sort().forEach(([date, posSet]) => {
    posSet.forEach(posId => {
      const pos = POSITIONS.find(p => p.id === posId);
      slots.push({ date, posLabel: pos?.label || posId });
      if (!sent[date]) sent[date] = [];
      if (!sent[date].includes(posId)) sent[date].push(posId);
    });
  });
  if (!slots.length) return;
  showToast('Wird gesendet…', '#e8c84a');
  try {
    await sendAvailabilityNotice(myName, meta.email, slots);
    _saveMeldungSent(sent);
    Object.keys(_meldungDraft).forEach(k => delete _meldungDraft[k]);
    showToast('Bereitschaft gemeldet ✓', '#4ae8a0');
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
  }
  renderTable();
}
