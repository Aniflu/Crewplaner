// ── Crew-Benachrichtigung Modal (nur Admin) ────────────────────────────────────
import { crew, assignments, assignmentStatuses, TOUR_DATES, POSITIONS,
         CURRENT_USER_EMAIL, IS_MANAGER, crewMeta, CREW_COLORS } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { showToast, isPending, getVal, esc } from './utils.js';
import { pbPost, pbList, pbFirst } from './pb.js';
import { bulkProposeCrew, sendCrewInvite, sendCancellationNotice,
         sendUpdateNotice, loadAssignmentStatuses } from './dataService.js';
import { hasPermission } from './rbac.js';
import { openModal, closeModal } from './modals.js';

const CREW_INVITES_KEY = 'tourplan_crew_invites';
const PENDING_CANCELLATIONS_KEY = 'tourplan_pending_cancellations';

function _loadCancellations() {
  try { return JSON.parse(localStorage.getItem(PENDING_CANCELLATIONS_KEY) || '{}'); } catch { return {}; }
}

// Exportiert (v0.29.2) — wird auch von dropdown.js beim Entfernen/Ersetzen einer
// bestätigten/angefragten Person aufgerufen (war dort ohne Import aufgerufen worden →
// ReferenceError, verschluckt vom umgebenden try/catch → Absage landete nie in der Queue).
export function _storePendingCancellation(crewName, email, dateStr, posLabel) {
  const q = _loadCancellations();
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  const exists = q[crewName].slots.some(s => s.date === dateStr && s.posLabel === posLabel);
  if (!exists) q[crewName].slots.push({ date: dateStr, posLabel });
  localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(q));
}

function _clearPendingCancellations(crewName) {
  const q = _loadCancellations();
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

function _getCrewInviteStatus(name, invites) {
  const inv = invites || _loadInvites();
  const hasConfirmed = Object.values(assignmentStatuses || {}).some(day =>
    Object.values(day).some(s => s.crewName === name && s.status === 'confirmed')
  );
  if (hasConfirmed) return 'confirmed';
  const hasActive = Object.values(assignmentStatuses || {}).some(day =>
    Object.values(day).some(s => s.crewName === name && isPending(s))
  );
  if (inv[name] && hasActive) return 'invited_pending';
  return 'not_invited';
}

function _fmtInviteDate(name, invites) {
  const inv = invites || _loadInvites();
  if (!inv[name]) return '';
  const d = new Date(inv[name]);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}

export function openCrewNotifyModal() {
  if (!hasPermission('sendInvite')) return;
  document.getElementById('sharedTitle').textContent = 'Crew benachrichtigen';
  _renderCrewNotifyList();
  openModal('sharedModal');
}

function _renderCrewNotifyList() {
  const pending = _loadCancellations();
  const invites = _loadInvites();
  const rows = crew.map((name, i) => {
    const meta = crewMeta[name] || {};
    const dot = CREW_COLORS[i % CREW_COLORS.length];
    const status = _getCrewInviteStatus(name, invites);
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
    const nameAttr = esc(name);

    let badge, btn;
    if (status === 'confirmed') {
      badge = `<span style="font-size:.58rem;color:#4ae8a0;">✅ Bestätigt</span>`;
      btn = hasNew
        ? `<button class="mbtn sm" data-crew="${nameAttr}" onclick="sendUpdate(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">↻ Update (${newSlots.length})</button>`
        : '';
    } else if (status === 'invited_pending') {
      badge = `<span style="font-size:.58rem;color:#e8c84a;">🟡 Eingeladen ${_fmtInviteDate(name, invites)}</span>`;
      btn = hasNew
        ? `<button class="mbtn sm" data-crew="${nameAttr}" onclick="sendUpdate(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">↻ Update (${newSlots.length})</button>`
        : `<button class="mbtn sm" data-crew="${nameAttr}" data-type="reminder" onclick="sendInvite(this.dataset.crew,this.dataset.type)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">🔔 Erinnerung</button>`;
    } else {
      badge = `<span style="font-size:.58rem;color:#5a6070;">⚪ Nicht eingeladen</span>`;
      btn = `<button class="mbtn primary sm" data-crew="${nameAttr}" data-type="invite" onclick="sendInvite(this.dataset.crew,this.dataset.type)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">📧 Einladen</button>`;
    }

    const cancelBtn = pendingCount > 0
      ? `<div style="margin-top:5px;"><button class="mbtn sm" data-crew="${nameAttr}" onclick="sendCancellationSummary(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;background:#e84a4a;color:#fff;border:none;">✕ ${pendingCount} Absage${pendingCount > 1 ? 'n' : ''} senden</button></div>`
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

export async function sendCancellationSummary(crewName) {
  const q = _loadCancellations();
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

// ── Alle Slots eines Crew-Mitglieds via getVal() (inkl. defaultCrew) ─────────
function _getAllSlotsForCrew(crewName, crewEmail) {
  const slots = [];
  const _dates = typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : [];
  const _pos   = typeof POSITIONS  !== 'undefined' ? POSITIONS  : [];
  _dates.forEach(day => {
    _pos.forEach(pos => {
      const val = typeof getVal === 'function' ? getVal(day.date, pos.id) : '';
      if (val === crewName) {
        const [y,m,d2] = day.date.split('-');
        slots.push({ date: day.date, posId: pos.id, crewName, crewEmail,
          dateLabel: `${d2}.${m}.${y}`, posLabel: pos.label || pos.id, loc: day.loc || '' });
      }
    });
  });
  return slots;
}

export function _getNewSlotsForCrew(crewName, crewEmail) {
  return _getAllSlotsForCrew(crewName, crewEmail).filter(s => {
    const existing = assignmentStatuses[s.date]?.[s.posId];
    return !existing || existing.status === 'declined';
  });
}

// Übersetzt die rohe Meldung in einen Satz, aus dem hervorgeht, WAS zu tun ist. Bei der
// Drosselung ist das entscheidend: 429 heißt „zu schnell", nicht „geht nicht" — wer das
// nicht weiß, hält die Einladung für kaputt. (Vorbild: login.html)
function _einladungsFehlerText(e) {
  const roh = (e && e.message) || 'unbekannter Fehler';
  if ((e && e.status === 429) || /too many requests/i.test(roh))
    return 'Zu viele Anfragen auf einmal — bitte eine halbe Minute warten und erneut einladen.';
  return roh;
}

export async function sendInvite(crewName, type) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }

  // Der Vermerk „eingeladen" wird NUR gesetzt, wenn wirklich eine Mail rausging. Ein
  // Fehlschlag muss sichtbar bleiben und die Person auf „⚪ Nicht eingeladen" stehen lassen —
  // sonst wartet der Planer auf eine Antwort, um die nie jemand gebeten wurde (v0.10.5).
  try {
    // Alle nicht-bestätigten Slots auf proposed setzen
    const allSlots = _getAllSlotsForCrew(crewName, meta.email).filter(s => {
      const existing = assignmentStatuses[s.date]?.[s.posId];
      return !existing || existing.status !== 'confirmed';
    });
    if (allSlots.length) await bulkProposeCrew(allSlots);

    await sendCrewInvite(crewName, meta.email, type);
  } catch (e) {
    showToast(`${crewName}: nicht gesendet — ${_einladungsFehlerText(e)}`, '#e84a4a');
    _renderCrewNotifyList();
    throw e;
  }

  _saveInvite(crewName);
  const label = type === 'reminder' ? 'Erinnerung gesendet ✓' : 'Einladung gesendet ✓';
  showToast(`${crewName}: ${label}`, '#4ae8a0');
  _renderCrewNotifyList();
}

export async function sendUpdate(crewName) {
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
