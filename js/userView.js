// ── User View — Meine Einsätze / Confirm / Decline ────────────────────────────

function getMyCrewName() {
  if (!SUPABASE_ENABLED || !CURRENT_USER_ID) return null;
  return Object.keys(crewMeta).find(n =>
    crewMeta[n]?.userId === CURRENT_USER_ID ||
    crewMeta[n]?.email === CURRENT_USER_EMAIL
  ) || null;
}

// ── Meine offenen Slots sammeln ───────────────────────────────────────────────
function getMyPendingSlots() {
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
function checkAndOpenMySchedule() {
  if (IS_MANAGER) return;
  const pending = getMyPendingSlots();
  if (pending.length > 0) openMyScheduleModal();
}

// ── Meine Einsätze Modal ──────────────────────────────────────────────────────
function openMyScheduleModal() {
  const myName = getMyCrewName();
  if (!myName) return;
  document.getElementById('sharedTitle').textContent = 'Meine Einsätze';
  _renderMySchedule(myName);
  openModal('sharedModal');
}

function _renderMySchedule(myName) {
  const slots = getMyPendingSlots();
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';

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
    const location = tourDay?.location || '';
    const posLabel = pos?.label || posId;
    const typeLabel = tourDay?.typeLabel || tourDay?.type || '';

    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" id="slot_${i}" data-date="${date}" data-pos="${posId}" checked
        style="width:16px;height:16px;accent-color:#4ae8a0;flex-shrink:0;cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:.68rem;color:var(--ink);font-weight:600;">${dateStr}
          <span style="color:#5a6070;font-weight:400;margin-left:6px;">${typeLabel}</span>
        </div>
        <div style="font-size:.6rem;color:var(--muted);margin-top:2px;">${posLabel}${location ? ' · ' + location : ''}</div>
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
  await Promise.all(decisions.map(d =>
    d.confirmed ? confirmAssignment(d.date, d.posId) : declineAssignment(d.date, d.posId)
  ));

  // Lokale assignmentStatuses aktualisieren
  decisions.forEach(d => {
    if (assignmentStatuses[d.date]?.[d.posId]) {
      assignmentStatuses[d.date][d.posId].status = d.confirmed ? 'confirmed' : 'declined';
    }
  });

  closeModal('sharedModal');
  showToast('Einsätze bestätigt ✓', '#4ae8a0');
  renderTable();
}

// ── Einzelne Slot-Aktionen (aus Tabelle heraus) ───────────────────────────────
async function confirmMySlot(dateStr, posId) {
  await confirmAssignment(dateStr, posId);
  showToast('Bestätigt ✓', '#4ae8a0');
  renderTable();
}

async function declineMySlot(dateStr, posId) {
  await declineAssignment(dateStr, posId);
  showToast('Abgelehnt', '#e84a4a');
  renderTable();
}

function meinesMelden(dateStr, posId) {
  const myName = getMyCrewName();
  if (!myName) {
    showToast('Dein Konto ist noch nicht verknüpft. Bitte Admin kontaktieren.', '#e84a4a');
    return;
  }
  setAssign(dateStr, posId, myName);
  showToast('Eingetragen ✓', '#4ae8a0');
  renderTable();
}
