// ── User View — Meine Einsätze / Confirm / Decline ────────────────────────────
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, crewMeta,
         IS_CREW, IS_MANAGER, CURRENT_USER_EMAIL, CURRENT_USER_ID, setStatus,
         pendingCancellations } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { getVal, isPending, esc, showToast, fmtD } from './utils.js';
import { pbPatch, pbPost, pbFirst } from './pb.js';
import { confirmAssignment, declineAssignment, loadAssignmentStatuses, sendUpdateNotice,
         bulkProposeCrew, sendAvailabilityNotice } from './dataService.js';
import { _getNewSlotsForCrew } from './crewNotify.js';
import { renderTable } from './render.js';
import { getActivePlanId, getPlansIndex } from './plans.js';
import { closeModal, openModal } from './modals.js';

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

export function getMyCrewName() {
  if (!SUPABASE_ENABLED || !CURRENT_USER_ID) return null;
  const myEmail = (CURRENT_USER_EMAIL || '').toLowerCase();
  return Object.keys(crewMeta).find(n =>
    crewMeta[n]?.userId === CURRENT_USER_ID ||
    (crewMeta[n]?.email || '').toLowerCase() === myEmail
  ) || null;
}

// ── Meine offenen Slots sammeln ───────────────────────────────────────────────
export function getMyPendingSlots() {
  const myName = getMyCrewName();
  if (!myName) return [];
  const slots = [];
  Object.entries(assignmentStatuses || {}).forEach(([date, positions]) => {
    Object.entries(positions).forEach(([posId, info]) => {
      if (info.crewName === myName && info.status === 'proposed') {
        slots.push({ date, posId });
      }
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
export async function bulkConfirmAllMySlots() {
  if (!getMyCrewName()) { showToast('Konto nicht mit Crew-Mitglied verknüpft — Admin kontaktieren', '#e84a4a'); return; }
  const slots = getMyPendingSlots();
  if (!slots.length) { showToast('Keine offenen Termine', '#5a6070'); return; }
  showToast('Wird bestätigt…', '#e8c84a');
  try {
    await Promise.all(slots.map(s => confirmAssignment(s.date, s.posId)));
    showToast('Alle Termine bestätigt ✓', '#4ae8a0');
  } catch(e) {
    showToast('Fehler – bitte erneut versuchen: ' + e.message, '#e84a4a');
    await loadAssignmentStatuses();
  }
  renderTable();
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
function _dateBlockId(date) {
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
  // dates = Liste der TATSÄCHLICH betroffenen Datumswerte (z.B. neu hinzugefügte Tage).
  // Ohne dates fällt es auf das alte „ganzer Plan"-Verhalten zurück (Rückwärts-Kompat),
  // aber alle Aufrufer übergeben die Liste → es wird NICHT mehr der Altbestand geflutet.
  const only = Array.isArray(dates) ? new Set(dates) : null;
  const q = _getCrewUpdateQueue();
  let affected = 0;
  Object.entries(assignmentStatuses || {}).forEach(([dateStr, positions]) => {
    if (only && !only.has(dateStr)) return;
    Object.entries(positions).forEach(([posId, si]) => {
      if (si.status !== 'confirmed' && si.status !== 'proposed') return;
      const meta = crewMeta[si.crewName] || {};
      if (!meta.email) return;
      if (!q[si.crewName]) q[si.crewName] = { email: meta.email, informational: true, slots: [] };
      const pos = POSITIONS.find(p => p.id === posId);
      const posLabel = pos?.label || posId;
      let slot = q[si.crewName].slots.find(s => s.date === dateStr && s.posLabel === posLabel);
      if (!slot) { slot = { date: dateStr, posLabel, changes: [] }; q[si.crewName].slots.push(slot); }
      if (!slot.changes.includes(changeDesc)) slot.changes.push(changeDesc);
      affected++;
    });
  });
  if (affected === 0) return;
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
}

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
    const slots = orig.filter(s => valid.has(s.date));
    if (slots.length !== orig.length) { entry.slots = slots; changed = true; }
    if (!slots.length) { delete q[name]; changed = true; continue; }
    slotCount += slots.length;
  }
  if (changed) _saveCrewUpdateQueue(q);
  const n = Object.keys(q).length;
  const btn = document.getElementById('btnUpdateQueue');
  const badge = document.getElementById('updateQueueBadge');
  if (btn) btn.style.display = (IS_MANAGER && slotCount > 0) ? '' : 'none';
  if (badge) badge.textContent = n;
}

const _QBTN = "background:#23233a;color:#9ad;border:1px solid #3a3a55;border-radius:3px;padding:1px 7px;font-family:inherit;font-size:.58rem;letter-spacing:.5px;cursor:pointer;";

export function _openUpdateQueueModal() {
  const q = _getCrewUpdateQueue();
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
          html += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0 2px 14px;border-bottom:1px solid #2a2a3a;font-size:.64rem;color:#ccc;">
            <input type="checkbox" data-crew="${esc(name)}" data-key="${esc(slotKey)}" ${isChecked ? 'checked' : ''}
              onchange="_toggleSlotSelection(this)"
              style="width:14px;height:14px;accent-color:#4ae8a0;flex-shrink:0;cursor:pointer;">
            <span style="flex:1;">${esc(slot.date)} · ${esc(slot.posLabel||'')}</span>
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

export async function _sendSelectedUpdates() {
  const full = _getCrewUpdateQueue();
  const valid = new Set(TOUR_DATES.map(r => r.date));
  const filtered = {};
  const remaining = {};
  for (const [name, entry] of Object.entries(full)) {
    // Slots fremder Pläne (Datum nicht im aktuellen Plan) gar nicht erst senden.
    const planSlots = (entry.slots||[]).filter(s => valid.has(s.date));
    const selectedSlots = planSlots.filter(s => s.selected !== false);
    const skippedSlots  = planSlots.filter(s => s.selected === false);
    if (selectedSlots.length) filtered[name] = { ...entry, slots: selectedSlots };
    if (skippedSlots.length)  remaining[name] = { ...entry, slots: skippedSlots };
  }
  const success = await _sendQueueEntries(filtered);
  if (success) _saveCrewUpdateQueue(remaining);
}

async function _sendQueueEntries(q) {
  const names = Object.keys(q);
  if (!names.length) { showToast('Nichts ausgewählt', '#5a6070'); return false; }
  showToast('Update-Mails werden gesendet…', '#e8c84a');
  try {
    for (const name of names) {
      const entry = q[name];
      let newSlots = _getNewSlotsForCrew(name, entry.email);
      if (newSlots.length) await bulkProposeCrew(newSlots);
      if (!entry.informational) {
        const planId = localStorage.getItem('tourplan_active_pb_id');
        for (const slot of entry.slots) {
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
        await sendUpdateNotice(name, entry.email, entry.slots);
      } else {
        if (newSlots.length) {
          const mailSlots = newSlots.map(s => ({ date: s.date, posLabel: s.posLabel, changes: ['Neuer Termin'] }));
          await sendUpdateNotice(name, entry.email, mailSlots);
        }
      }
    }
    _updateCrewUpdateBar();
    _closeUpdateQueueModal();
    showToast('Update-Mails gesendet ✓', '#4ae8a0');
    await loadAssignmentStatuses();
    renderTable();
    return true;
  } catch(e) {
    showToast('Fehler: '+e.message, '#e84a4a');
    return false;
  }
}

export async function _sendPendingUpdates() {
  const q = _getCrewUpdateQueue();
  await _sendQueueEntries(q);
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
