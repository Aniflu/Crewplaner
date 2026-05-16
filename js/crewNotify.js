// ── Crew-Benachrichtigung Modal (nur Admin) ────────────────────────────────────
const CREW_INVITES_KEY = 'tourplan_crew_invites';
const PENDING_CANCELLATIONS_KEY = 'tourplan_pending_cancellations';

function _storePendingCancellation(crewName, email, dateStr, posLabel) {
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  const exists = q[crewName].slots.some(s => s.date === dateStr && s.posLabel === posLabel);
  if (!exists) q[crewName].slots.push({ date: dateStr, posLabel });
  localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(q));
}

function _clearPendingCancellations(crewName) {
  const q = JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}');
  delete q[crewName];
  localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(q));
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
  if (!IS_ADMIN) return;
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
        <span style="flex:1;font-size:.65rem;color:var(--ink);">${name}</span>
        <span style="font-size:.58rem;color:#5a6070;">Keine E-Mail hinterlegt</span>
      </div>`;
    }

    let badge, btn;
    if (status === 'confirmed') {
      badge = `<span style="font-size:.58rem;color:#4ae8a0;">✅ Bestätigt</span>`;
      btn = '';
    } else if (status === 'invited_pending') {
      badge = `<span style="font-size:.58rem;color:#e8c84a;">🟡 Eingeladen ${_fmtInviteDate(name)}</span>`;
      btn = `<button class="mbtn sm" onclick="sendInvite('${name.replace(/'/g,"\\'")}','reminder')" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">🔔 Erinnerung</button>`;
    } else {
      badge = `<span style="font-size:.58rem;color:#5a6070;">⚪ Nicht eingeladen</span>`;
      btn = `<button class="mbtn primary sm" onclick="sendInvite('${name.replace(/'/g,"\\'")}','invite')" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">📧 Einladen</button>`;
    }

    const cancelBtn = pendingCount > 0
      ? `<div style="margin-top:5px;"><button class="mbtn sm" onclick="sendCancellationSummary('${name.replace(/'/g,"\\'")}');" style="font-size:.58rem;padding:3px 7px;background:#e84a4a;color:#fff;border:none;">✕ ${pendingCount} Absage${pendingCount > 1 ? 'n' : ''} senden</button></div>`
      : '';

    return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;margin-top:5px;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.65rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
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

async function sendInvite(crewName, type) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }

  // Beim ersten Einladen: Crew-Mitglied für alle Default-Positionen vorschlagen
  if (type === 'invite') {
    const defaultPositions = Object.keys(defaultCrew || {}).filter(posId => defaultCrew[posId] === crewName);
    if (defaultPositions.length > 0) {
      const slots = [];
      (TOUR_DATES || []).forEach(day => {
        if (day.type === 'off') return;
        defaultPositions.forEach(posId => {
          slots.push({ date: day.date, posId, crewName });
        });
      });
      if (slots.length) await bulkProposeCrew(slots);
    }
  }

  await sendCrewInvite(crewName, meta.email, type);
  _saveInvite(crewName);
  const label = type === 'reminder' ? 'Erinnerung gesendet ✓' : 'Einladung gesendet ✓';
  showToast(`${crewName}: ${label}`, '#4ae8a0');
  _renderCrewNotifyList();
}
