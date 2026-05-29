// ── Crew-Benachrichtigung Modal (nur Admin) ────────────────────────────────────
const CREW_INVITES_KEY = 'tourplan_crew_invites';
const PENDING_CANCELLATIONS_KEY = 'tourplan_pending_cancellations';

function _storePendingCancellation(crewName, email, dateStr, posLabel) {
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  const exists = q[crewName].slots.some(s => s.date === dateStr && s.posLabel === posLabel);
  if (!exists) q[crewName].slots.push({ date: dateStr, posLabel });
  localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(q));
  renderCancellationBanner();
}

function _clearPendingCancellations(crewName) {
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  delete q[crewName];
  localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(q));
  renderCancellationBanner();
}

function renderCancellationBanner() {
  const banner = document.getElementById('cancellation-banner');
  if (!banner) return;
  if (!IS_MANAGER) { banner.style.display = 'none'; return; }
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  const total = Object.values(q).reduce((sum, e) => sum + (e.slots?.length || 0), 0);
  if (total === 0) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const el = document.getElementById('cancellation-count');
  if (el) el.textContent = total + ' Absage' + (total !== 1 ? 'n' : '') + ' ausstehend';
}

async function flushAllCancellations() {
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  const names = Object.keys(q);
  if (!names.length) return;
  for (const crewName of names) {
    await sendCancellationSummary(crewName);
  }
  renderCancellationBanner();
}

function clearAllCancellations() {
  localStorage.removeItem(PENDING_CANCELLATIONS_KEY);
  renderCancellationBanner();
}

function _loadInvites() {
  try { return JSON.parse(localStorage.getItem(CREW_INVITES_KEY) || '{}'); } catch { return {}; }
}

function _saveInvite(name) {
  const inv = _loadInvites();
  inv[name] = new Date().toISOString();
  localStorage.setItem(CREW_INVITES_KEY, JSON.stringify(inv));
}

function _getCrewInviteStatus(name) {
  const invites = _loadInvites();
  const hasConfirmed = Object.values(assignmentStatuses || {}).some(day =>
    Object.values(day).some(s => s.crewName === name && s.status === 'confirmed')
  );
  if (hasConfirmed) return 'confirmed';
  const hasActive = Object.values(assignmentStatuses || {}).some(day =>
    Object.values(day).some(s => s.crewName === name && isPending(s))
  );
  if (invites[name] && hasActive) return 'invited_pending';
  return 'not_invited';
}

function _fmtInviteDate(name) {
  const inv = _loadInvites();
  if (!inv[name]) return '';
  const d = new Date(inv[name]);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}

function openCrewNotifyModal() {
  if (!hasPermission('sendInvite')) return;
  document.getElementById('sharedTitle').textContent = 'Crew benachrichtigen';
  _renderCrewNotifyList();
  openModal('sharedModal');
}

function _renderCrewNotifyList() {
  const pending = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  const rows = crew.map((name, i) => {
    const meta = crewMeta[name] || {};
    const dot = CREW_COLORS[i % CREW_COLORS.length];
    const status = _getCrewInviteStatus(name);
    const pendingCount = pending[name]?.slots?.length || 0;

    if (!meta.email) {
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;opacity:.45;">
        <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
        <span style="flex:1;font-size:.65rem;color:var(--ink);">${esc(name)}</span>
        <span style="font-size:.58rem;color:#5a6070;">Keine E-Mail hinterlegt</span>
      </div>`;
    }

    const newSlots = _getNewSlotsForCrew(name, meta.email);
    const hasNew = newSlots.length > 0;
    const safeName = name.replace(/'/g,"\\'");

    let badge, btn;
    if (status === 'confirmed') {
      badge = `<span style="font-size:.58rem;color:#4ae8a0;">✅ Bestätigt</span>`;
      btn = hasNew
        ? `<button class="mbtn sm" onclick="sendUpdate('${safeName}')" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">↻ Update (${newSlots.length})</button>`
        : '';
    } else if (status === 'invited_pending') {
      badge = `<span style="font-size:.58rem;color:#e8c84a;">🟡 Eingeladen ${_fmtInviteDate(name)}</span>`;
      btn = hasNew
        ? `<button class="mbtn sm" onclick="sendUpdate('${safeName}')" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">↻ Update (${newSlots.length})</button>`
        : `<button class="mbtn sm" onclick="sendInvite('${safeName}','reminder')" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">🔔 Erinnerung</button>`;
    } else {
      badge = `<span style="font-size:.58rem;color:#5a6070;">⚪ Nicht eingeladen</span>`;
      btn = `<button class="mbtn primary sm" onclick="sendInvite('${safeName}','invite')" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">📧 Einladen</button>`;
    }

    const cancelBtn = pendingCount > 0
      ? `<div style="margin-top:5px;"><button class="mbtn sm" onclick="sendCancellationSummary('${name.replace(/'/g,"\\'")}');" style="font-size:.58rem;padding:3px 7px;background:#e84a4a;color:#fff;border:none;">✕ ${pendingCount} Absage${pendingCount > 1 ? 'n' : ''} senden</button></div>`
      : '';

    return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;margin-top:5px;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.65rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</div>
        ${badge}${cancelBtn}
      </div>
      ${btn}
    </div>`;
  }).join('');

  document.getElementById('sharedBody').innerHTML = `
    <div style="font-size:.6rem;color:var(--muted);margin-bottom:14px;line-height:1.5;">
      Einladen = eine E-Mail pro Person. Crew loggt sich ein und bestätigt ihre Einsätze.
    </div>
    ${rows}
    <div class="mactions" style="margin-top:8px;">
      <button class="mbtn" onclick="closeModal('sharedModal')">Schließen</button>
    </div>`;
}

async function sendCancellationSummary(crewName) {
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  const entry = q[crewName];
  if (!entry || !entry.slots.length) return;
  try {
    await sendCancellationNotice(crewName, entry.email, entry.slots);
    _clearPendingCancellations(crewName);
    showToast(`${crewName}: Absage-Mail gesendet ✓`, '#4ae8a0');
    _renderCrewNotifyList();
  } catch(e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
  }
}

// ── Alle Slots eines Crew-Mitglieds ohne bestätigten PB-Record holen ─────────
function _getNewSlotsForCrew(crewName, crewEmail) {
  const slots = [];
  Object.entries(assignments || {}).forEach(([date, positions]) => {
    Object.entries(positions || {}).forEach(([posId, val]) => {
      if (val === crewName) {
        const existing = assignmentStatuses[date]?.[posId];
        if (!existing || existing.status === 'declined') {
          const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
          const day = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(d => d.date === date);
          const [y,m,d2] = date.split('-');
          slots.push({ date, posId, crewName, crewEmail,
            dateLabel: `${d2}.${m}.${y}`, posLabel: pos?.label || posId, loc: day?.loc || '' });
        }
      }
    });
  });
  slots.sort((a,b) => a.date.localeCompare(b.date));
  return slots;
}

async function sendInvite(crewName, type) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }

  // Alle nicht-bestätigten Slots auf proposed setzen
  const slots = [];
  Object.entries(assignments || {}).forEach(([date, positions]) => {
    Object.entries(positions || {}).forEach(([posId, val]) => {
      if (val === crewName) {
        const existing = assignmentStatuses[date]?.[posId];
        if (!existing || existing.status !== 'confirmed') {
          slots.push({ date, posId, crewName, crewEmail: meta.email });
        }
      }
    });
  });
  if (slots.length) await bulkProposeCrew(slots);

  await sendCrewInvite(crewName, meta.email, type);
  _saveInvite(crewName);
  const label = type === 'reminder' ? 'Erinnerung gesendet ✓' : 'Einladung gesendet ✓';
  showToast(`${crewName}: ${label}`, '#4ae8a0');
  _renderCrewNotifyList();
}

async function sendUpdate(crewName) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const newSlots = _getNewSlotsForCrew(crewName, meta.email);
  if (!newSlots.length) { showToast('Keine neuen Termine', '#5a6070'); return; }
  await bulkProposeCrew(newSlots);
  const updateSlots = newSlots.map(s => ({
    date: s.dateLabel, posLabel: s.posLabel,
    changes: [s.loc ? s.loc : 'Neuer Termin']
  }));
  await sendUpdateNotice(crewName, meta.email, updateSlots);
  _saveInvite(crewName);
  showToast(`${crewName}: Update gesendet ✓`, '#4ae8a0');
  _renderCrewNotifyList();
}
