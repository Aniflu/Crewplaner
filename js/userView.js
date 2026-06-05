// ── User View — Meine Einsätze / Confirm / Decline ────────────────────────────
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, crewMeta,
         IS_CREW, IS_MANAGER, CURRENT_USER_EMAIL, CURRENT_USER_ID, setStatus } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { getVal, isPending, esc, showToast, fmtD } from './utils.js';
import { pbPatch, pbPost } from './pb.js';
import { confirmAssignment, declineAssignment, loadAssignmentStatuses } from './dataService.js';
import { renderTable } from './render.js';
import { getActivePlanId, getPlansIndex } from './plans.js';
import { closeModal, openModal } from './modals.js';

// ── Änderungen mitteilen — ausstehende Absagen ────────────────────────────────
const _pendingCancellations = new Set();

export function toggleCancellation(dateStr, posId) {
  const key = dateStr + '|' + posId;
  if (_pendingCancellations.has(key)) _pendingCancellations.delete(key);
  else _pendingCancellations.add(key);
  _updateCancellationBar();
  renderTable();
}

function _updateCancellationBar() {
  const btn = document.getElementById('btnSendCancellations');
  if (!btn) return;
  const n = _pendingCancellations.size;
  btn.style.display = IS_CREW && n > 0 ? '' : 'none';
  btn.querySelector('.sb-gl').textContent = n > 0 ? `⚠ ${n}` : '⚠';
}

export async function sendCancellations() {
  if (!_pendingCancellations.size) return;
  showToast('Wird übermittelt…', '#e8c84a');
  try {
    for (const key of Array.from(_pendingCancellations)) {
      const [dateStr, posId] = key.split('|');
      await declineAssignment(dateStr, posId);
      const _si36 = assignmentStatuses[dateStr]?.[posId];
      if (_si36) setStatus(dateStr, posId, { ..._si36, status: 'declined' });
    }
    _pendingCancellations.clear();
    _updateCancellationBar();
    showToast('Änderungen mitgeteilt — Manager wird benachrichtigt ✓', '#4ae8a0');
    renderTable();
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
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

async function _bulkConfirmMySlots() {
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

  // Lokale assignmentStatuses aktualisieren
  decisions.forEach(d => {
    const _si165 = assignmentStatuses[d.date]?.[d.posId];
    if (_si165) setStatus(d.date, d.posId, { ..._si165, status: d.confirmed ? 'confirmed' : 'declined' });
  });

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
  await Promise.all(slots.map(s => confirmAssignment(s.date, s.posId)));
  slots.forEach(s => {
    const _si = assignmentStatuses[s.date]?.[s.posId];
    if (_si) setStatus(s.date, s.posId, { ..._si, status: 'confirmed' });
  });
  showToast('Alle Termine bestätigt ✓', '#4ae8a0');
  renderTable();
}

// ── Alle angefragten Termine auf einmal absagen ───────────────────────────────
export async function bulkDeclineAllMySlots() {
  if (!getMyCrewName()) { showToast('Konto nicht mit Crew-Mitglied verknüpft — Admin kontaktieren', '#e84a4a'); return; }
  const slots = getMyPendingSlots();
  if (!slots.length) { showToast('Keine offenen Termine', '#5a6070'); return; }
  showToast('Wird abgelehnt…', '#e8c84a');
  await Promise.all(slots.map(s => declineAssignment(s.date, s.posId)));
  slots.forEach(s => {
    const _si = assignmentStatuses[s.date]?.[s.posId];
    if (_si) setStatus(s.date, s.posId, { ..._si, status: 'declined' });
  });
  showToast('Alle Termine abgelehnt', '#e84a4a');
  renderTable();
}

// ── Einzelne Slot-Aktionen (aus Tabelle heraus) ───────────────────────────────
export async function confirmMySlot(dateStr, posId) {
  await confirmAssignment(dateStr, posId);
  showToast('Bestätigt ✓', '#4ae8a0');
  renderTable();
}

export async function declineMySlot(dateStr, posId) {
  await declineAssignment(dateStr, posId);
  showToast('Abgelehnt', '#e84a4a');
  renderTable();
}

// ── Bereitschaftsmeldung Draft ────────────────────────────────────────────────
const _meldungDraft = {}; // { 'YYYY-MM-DD': Set<posId> } — in-memory only

const _getMeldungSent = () => {
  try { return JSON.parse(localStorage.getItem('crewplan_meldungen_'+(getActivePlanId()||'')) || '{}'); } catch(_) { return {}; }
};
const _saveMeldungSent = d => localStorage.setItem('crewplan_meldungen_'+(getActivePlanId()||''), JSON.stringify(d));

function _meldungCount() {
  return Object.values(_meldungDraft).reduce((s, set) => s + set.size, 0);
}

function _updateMeldungBar() {
  const bar = document.getElementById('meldungSubmitBar');
  if (!bar) return;
  const n = _meldungCount();
  bar.style.display = (!IS_MANAGER && n > 0) ? 'block' : 'none';
  const cnt = document.getElementById('meldungCount');
  if (cnt) cnt.textContent = n;
}

function meinesMelden(dateStr, posId) {
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
function _getCrewUpdateQueue() {
  try { return JSON.parse(localStorage.getItem('crewplan_updates_'+(getActivePlanId()||'')) || '{}'); } catch(_) { return {}; }
}
function _saveCrewUpdateQueue(q) {
  localStorage.setItem('crewplan_updates_'+(getActivePlanId()||''), JSON.stringify(q));
}

function _queueCrewUpdate(dateStr, changeDesc) {
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

function _queueGlobalCrewUpdate(changeDesc) {
  const q = _getCrewUpdateQueue();
  let affected = 0;
  Object.entries(assignmentStatuses || {}).forEach(([dateStr, positions]) => {
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

function _updateCrewUpdateBar() {
  const q = _getCrewUpdateQueue();
  // Queue mit fehlenden proposed-Mitgliedern ergänzen (Migration alter Queues)
  if (Object.keys(q).length > 0) {
    let changed = false;
    Object.entries(assignmentStatuses || {}).forEach(([dateStr, positions]) => {
      Object.entries(positions).forEach(([posId, si]) => {
        if (si.status !== 'proposed' || q[si.crewName]) return;
        const meta = crewMeta[si.crewName] || {};
        if (!meta.email) return;
        q[si.crewName] = { email: meta.email, informational: true, slots: [] };
        changed = true;
      });
    });
    if (changed) _saveCrewUpdateQueue(q);
  }
  const n = Object.keys(q).length;
  const btn = document.getElementById('btnUpdateQueue');
  const badge = document.getElementById('updateQueueBadge');
  if (btn) btn.style.display = (IS_MANAGER && n > 0) ? '' : 'none';
  if (badge) badge.textContent = n;
}

export function _openUpdateQueueModal() {
  const q = _getCrewUpdateQueue();
  const body = document.getElementById('crewUpdateModalBody');
  if (!body) return;
  let html = '';
  for (const [name, entry] of Object.entries(q)) {
    if (!entry.slots || entry.slots.length === 0) continue;
    html += `<div style="margin-bottom:12px;">
      <div style="color:#e8c84a;font-size:.7rem;letter-spacing:1px;margin-bottom:4px;">${esc(name)} <span style="color:#888;font-size:.65rem;">(${esc(entry.email||'')})</span></div>`;
    (entry.slots||[]).forEach((slot) => {
      const slotKey = `${slot.date}|${slot.posLabel}`;
      const isChecked = slot.selected !== false;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #333;font-size:.65rem;color:#ccc;">
        <input type="checkbox" data-crew="${esc(name)}" data-key="${esc(slotKey)}" ${isChecked ? 'checked' : ''}
          onchange="_toggleSlotSelection(this)"
          style="width:14px;height:14px;accent-color:#4ae8a0;flex-shrink:0;cursor:pointer;">
        <span style="flex:1;">${esc(slot.date)} · ${esc(slot.posLabel||'')}</span>
        <span style="cursor:pointer;color:#e84a4a;margin-left:8px;font-size:.7rem;" onclick="_deleteSlotFromQueue(${JSON.stringify(name)},${JSON.stringify(slotKey)})">✕</span>
      </div>`;
    });
    html += '</div>';
  }
  if (!html) html = '<div style="color:#888;font-size:.7rem;">Queue ist leer.</div>';
  body.innerHTML = html;
  document.body.style.overflow = 'hidden';
  const modal = document.getElementById('crewUpdateModal');
  if (modal) modal.style.display = 'flex';
  _updateSendButton();
}

export function _closeUpdateQueueModal() {
  const modal = document.getElementById('crewUpdateModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function _deleteSlotFromQueue(crewName, slotKey) {
  const q = _getCrewUpdateQueue();
  if (!q[crewName]) return;
  q[crewName].slots = q[crewName].slots.filter(s => `${s.date}|${s.posLabel}` !== slotKey);
  if (q[crewName].slots.length === 0) delete q[crewName];
  _saveCrewUpdateQueue(q);
  _updateCrewUpdateBar();
  _openUpdateQueueModal();
}

function _toggleSlotSelection(cb) {
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
  let count = 0;
  for (const entry of Object.values(q)) {
    for (const slot of (entry.slots || [])) {
      if (slot.selected !== false) count++;
    }
  }
  const btn = document.getElementById('btnSendUpdates');
  if (btn) btn.textContent = `AUSWAHL SENDEN (${count}) →`;
}

export async function _sendSelectedUpdates() {
  const full = _getCrewUpdateQueue();
  const filtered = {};
  const remaining = {};
  for (const [name, entry] of Object.entries(full)) {
    const selectedSlots = (entry.slots||[]).filter(s => s.selected !== false);
    const skippedSlots  = (entry.slots||[]).filter(s => s.selected === false);
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
      let newSlots = [];
      if (typeof _getNewSlotsForCrew === 'function' && typeof bulkProposeCrew === 'function') {
        newSlots = _getNewSlotsForCrew(name, entry.email);
        if (newSlots.length) await bulkProposeCrew(newSlots);
      }
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
