// ── Crew-Benachrichtigung Modal (nur Admin) ────────────────────────────────────
import { crew, assignments, assignmentStatuses, TOUR_DATES, POSITIONS,
         CURRENT_USER_EMAIL, IS_MANAGER, crewMeta, CREW_COLORS } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { showToast, isPending, getVal, esc } from './utils.js';
import { sendCrewInvite, sendCancellationNotice,
         sendUpdateNotice, loadAssignmentStatuses } from './dataService.js';
import { hasPermission } from './rbac.js';
import { getActivePlanId, getPlansIndex } from './plans.js';
import { openModal, closeModal } from './modals.js';

// v1.3.0: Einladungs-Vermerke und Absage-Queue gehören zum Plan DIESES Tabs (Suffix = PB-Plan-ID
// aus tourplan_pb_<lokale ID>, sonst die lokale ID). Alte globale Schlüssel ohne Suffix werden
// beim Lesen vorsichtig übernommen (siehe _migrate*), nur was nachweislich zu diesem Plan gehört.
const CREW_INVITES_KEY = 'tourplan_crew_invites';
const PENDING_CANCELLATIONS_KEY = 'tourplan_pending_cancellations';
function _planScoped(base) {
  const lid = getActivePlanId() || '';
  let pb = '';
  try { if (lid) pb = localStorage.getItem('tourplan_pb_' + lid) || ''; } catch (_) {}
  return base + '_' + (pb || lid || 'default');
}

function _readJson(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch { return {}; }
}

// Alte globale Absagen: nur Einträge, deren Person in der Crew DIESES Plans steht und deren Slots
// auf Tage dieses Plans fallen, wandern in den Plan-Schlüssel und verschwinden aus dem globalen —
// so können sie nicht in einen zweiten Plan wandern. Der Rest bleibt liegen.
function _migrateCancellations() {
  const old = _readJson(PENDING_CANCELLATIONS_KEY);
  const names = Object.keys(old);
  if (!names.length || !TOUR_DATES.length) return;
  const dates = new Set(TOUR_DATES.map(r => r.date));
  const key = _planScoped(PENDING_CANCELLATIONS_KEY);
  const cur = _readJson(key);
  let moved = false;
  for (const n of names) {
    const e = old[n];
    const slots = (e && e.slots) || [];
    if (!crew.includes(n) || !slots.length || !slots.every(sl => dates.has(sl.date))) continue;
    if (!cur[n]) cur[n] = { email: e.email, slots: [] };
    for (const sl of slots)
      if (!cur[n].slots.some(x => x.date === sl.date && x.posLabel === sl.posLabel)) cur[n].slots.push(sl);
    delete old[n]; moved = true;
  }
  if (!moved) return;
  try {
    localStorage.setItem(key, JSON.stringify(cur));
    localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(old));
  } catch (_) {}
}

function _loadCancellations() {
  _migrateCancellations();
  return _readJson(_planScoped(PENDING_CANCELLATIONS_KEY));
}

// Exportiert (v0.29.2) — wird auch von dropdown.js beim Entfernen/Ersetzen einer
// bestätigten/angefragten Person aufgerufen (war dort ohne Import aufgerufen worden →
// ReferenceError, verschluckt vom umgebenden try/catch → Absage landete nie in der Queue).
export function _storePendingCancellation(crewName, email, dateStr, posLabel) {
  const q = _loadCancellations();
  if (!q[crewName]) q[crewName] = { email, slots: [] };
  const exists = q[crewName].slots.some(s => s.date === dateStr && s.posLabel === posLabel);
  if (!exists) q[crewName].slots.push({ date: dateStr, posLabel });
  localStorage.setItem(_planScoped(PENDING_CANCELLATIONS_KEY), JSON.stringify(q));
}

function _clearPendingCancellations(crewName) {
  const q = _loadCancellations();
  delete q[crewName];
  localStorage.setItem(_planScoped(PENDING_CANCELLATIONS_KEY), JSON.stringify(q));
}

// Alter globaler Einlade-Vermerk: gilt für Personen, die in der Crew dieses Plans stehen und im
// Plan-Schlüssel noch keinen Eintrag haben (der Zeitstempel bleibt global unverändert liegen).
function _loadInvites() {
  const cur = _readJson(_planScoped(CREW_INVITES_KEY));
  const old = _readJson(CREW_INVITES_KEY);
  let moved = false;
  for (const n of Object.keys(old))
    if (!cur[n] && crew.includes(n)) { cur[n] = old[n]; moved = true; }
  if (moved) { try { localStorage.setItem(_planScoped(CREW_INVITES_KEY), JSON.stringify(cur)); } catch (_) {} }
  return cur;
}

function _saveInvite(name) {
  const inv = _loadInvites();
  inv[name] = new Date().toISOString();
  localStorage.setItem(_planScoped(CREW_INVITES_KEY), JSON.stringify(inv));
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

// Zielcontainer der Liste: Touransicht = #sharedBody (Modal), Konsole-Karte = eigener Container
// (v1.3.0, renderCrewNotifyInto). Die Aktionen unten rendern über _renderCrewNotifyList() neu
// und treffen damit immer denselben Container.
let _notifyHostId = 'sharedBody';

export function renderCrewNotifyInto(hostId) {
  _notifyHostId = hostId || 'sharedBody';
  _renderCrewNotifyList();
}

export function openCrewNotifyModal() {
  if (!hasPermission('sendInvite')) return;
  document.getElementById('sharedTitle').textContent = 'Crew benachrichtigen';
  _notifyHostId = 'sharedBody';
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

    const updBtn = hasNew
      ? `<button class="mbtn sm" data-crew="${nameAttr}" onclick="openUpdatePreview(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">↻ Update (${newSlots.length})</button>`
      : '';
    let badge, btn;
    if (status === 'confirmed') {
      badge = `<span style="font-size:.58rem;color:#4ae8a0;">✅ Bestätigt</span>`;
      btn = updBtn;
    } else if (status === 'invited_pending') {
      badge = `<span style="font-size:.58rem;color:#e8c84a;">🟡 Eingeladen ${_fmtInviteDate(name, invites)}</span>`;
      // Erinnerung immer für eingeladene Personen, auch wenn es neue Termine gibt (Update zusätzlich)
      btn = `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">${updBtn}<button class="mbtn sm" data-crew="${nameAttr}" data-type="reminder" onclick="openInvitePreview(this.dataset.crew,this.dataset.type)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">🔔 Erinnerung</button></div>`;
    } else {
      badge = `<span style="font-size:.58rem;color:#5a6070;">⚪ Nicht eingeladen</span>`;
      btn = `<button class="mbtn primary sm" data-crew="${nameAttr}" data-type="invite" onclick="openInvitePreview(this.dataset.crew,this.dataset.type)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">📧 Einladen</button>`;
    }

    // Absage zu aktiven Einsätzen (bestätigt/angefragt) und nachträglich auch zu schon
    // entfernten — früher nur in der Konsole (v1.3.0: in das Modul gewandert).
    const hasActive = _getActiveSlotsForCrew(name).length > 0;
    const cancelBtn = (pendingCount > 0 || hasActive)
      ? `<div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap;">`
        + (pendingCount > 0
          ? `<button class="mbtn sm" data-crew="${nameAttr}" onclick="sendCancellationSummary(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;background:#e84a4a;color:#fff;border:none;">✕ ${pendingCount} Absage${pendingCount > 1 ? 'n' : ''} senden</button>`
          : '')
        + `<button class="mbtn sm" data-crew="${nameAttr}" onclick="openCancelSelect(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;color:#e84a4a;">🚫 Einsätze absagen</button></div>`
      : `<div style="margin-top:5px;"><button class="mbtn sm" data-crew="${nameAttr}" onclick="openCancelSelect(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;color:#e84a4a;">🚫 Absage</button></div>`;

    return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;margin-top:5px;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.65rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</div>
        ${badge}${cancelBtn}
      </div>
      ${btn}
    </div>`;
  }).join('');

  const host = document.getElementById(_notifyHostId);
  if (!host) return;
  const inModal = _notifyHostId === 'sharedBody';
  host.innerHTML = `
    <div style="font-size:.6rem;color:var(--muted);margin-bottom:14px;line-height:1.5;">
      Einladen = eine E-Mail pro Person. Crew loggt sich ein und bestätigt ihre Einsätze.
    </div>
    ${rows || '<div style="font-size:.65rem;color:var(--muted);">Keine Crew-Mitglieder in diesem Plan.</div>'}
    ${inModal ? `<div class="mactions" style="margin-top:8px;">
      <button class="mbtn" onclick="closeModal('sharedModal')">Schließen</button>
    </div>` : ''}`;
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

// ── Vorschau mit optionalem Freitext vor Einladung/Erinnerung/Update (v1.3.0) ────
// Früher nur in der Konsole (openEmailPreview). Der Freitext geht als `customMessage` an den
// Hook — derselbe Feldname wie zuvor. Abbrechen sendet nichts.
let _previewCtx = null;

function _openSendPreview(ctx, title, subject, intro, slots) {
  _previewCtx = ctx;
  const rows = slots.map(sl => `<tr><td style="padding:4px 8px;border-bottom:1px solid var(--rule);">${esc(sl.dateLabel || _fmtDateDE(sl.date))}</td><td style="padding:4px 8px;border-bottom:1px solid var(--rule);">${esc(sl.posLabel || '')}</td></tr>`).join('');
  document.getElementById('sharedTitle').textContent = title;
  const dlg = document.getElementById('sharedBody');
  dlg.innerHTML = `<div style="font-size:.7rem;color:var(--ink);line-height:1.6;">
      <div><strong style="color:var(--ink-2);">An:</strong> ${esc(ctx.email)}</div>
      <div><strong style="color:var(--ink-2);">Betreff:</strong> ${esc(subject)}</div>
      <div style="margin-top:8px;color:var(--ink-2);">${intro}</div>
      ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:.62rem;color:var(--ink-2);">${rows}</table>` : ''}
      <textarea id="sendPreviewText" rows="3" class="mi" placeholder="Persönliche Nachricht für die E-Mail (optional)…" style="resize:vertical;width:100%;margin-top:12px;"></textarea>
    </div>
    <div class="mactions" style="margin-top:8px;">
      <button class="mbtn" onclick="closeSendPreview()">Abbrechen</button>
      <button class="mbtn primary" onclick="confirmSendPreview()">📧 Senden →</button>
    </div>`;
  openModal('sharedModal');
}

function _planNameForPreview() {
  try {
    const idx = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
    return idx.find(p => p.id === getActivePlanId())?.name || 'Tour Plan';
  } catch (_) { return 'Tour Plan'; }
}

export function openInvitePreview(crewName, type) {
  if (!hasPermission('sendInvite')) return;
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const planned = _getAllSlotsForCrew(crewName, meta.email);
  if (!planned.length) { showToast('Keine eingeplanten Termine', '#5a6070'); return; }   // wie die alte Konsole: nichts zu senden
  const slots = planned.filter(sl => assignmentStatuses[sl.date]?.[sl.posId]?.status !== 'confirmed');
  const pn = esc(_planNameForPreview());
  const isInv = type !== 'reminder';
  _openSendPreview({ kind: type, crewName, email: meta.email }, (isInv ? '📧 Einladung an ' : '🔔 Erinnerung an ') + crewName,
    (isInv ? 'CREW INVITE · ' : 'REMINDER · ') + _planNameForPreview(),
    isInv ? `Einladung zu <strong>${pn}</strong> — bitte bestätige deine ${slots.length} Einsätze:`
          : `Erinnerung, ausstehende Einsätze für <strong>${pn}</strong> zu bestätigen.`,
    slots);
}

export function openUpdatePreview(crewName) {
  if (!hasPermission('sendInvite')) return;
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const slots = _getNewSlotsForCrew(crewName, meta.email);
  if (!slots.length) { showToast('Keine neuen Termine', '#5a6070'); return; }
  _openSendPreview({ kind: 'update', crewName, email: meta.email }, '↻ Update an ' + crewName,
    'ÄNDERUNG · ' + _planNameForPreview(),
    `${slots.length} neue Einsätze für <strong>${esc(_planNameForPreview())}</strong> — Crew bestätigt erneut.`, slots);
}

export function closeSendPreview() {
  _previewCtx = null;
  if (_notifyHostId === 'sharedBody') _renderCrewNotifyList();
  else closeModal('sharedModal');
}

export async function confirmSendPreview() {
  const ctx = _previewCtx;
  if (!ctx) { closeSendPreview(); return; }
  const text = (document.getElementById('sendPreviewText')?.value || '').trim();
  _previewCtx = null;
  if (_notifyHostId !== 'sharedBody') closeModal('sharedModal');
  try {
    if (ctx.kind === 'update') await sendUpdate(ctx.crewName, text || undefined);
    else await sendInvite(ctx.crewName, ctx.kind, text || undefined);
  } catch (e) {
    // sendInvite meldet seinen Fehler (z. B. die 429-Erklärung) selbst — nicht mit einer
    // allgemeinen Meldung überschreiben. Nur der Update-Weg hat keinen eigenen Toast.
    if (ctx.kind === 'update') showToast('Fehler: ' + _einladungsFehlerText(e), '#e84a4a');
  }
}

// ── Absage aktiver Einsätze (v1.3.0, vorher nur inline in admin.html) ────────────
// Auswahl bestätigter/angefragter Einsätze plus manuell nachgetragene Termine (für Zuweisungen,
// die schon entfernt wurden, bevor die Absage rausging). Eine Anfrage: Server löscht die Records
// UND mailt (removeSlots), optional mit Freitext.
function _getActiveSlotsForCrew(crewName) {
  const out = [];
  Object.entries(assignmentStatuses || {}).forEach(([date, day]) => {
    Object.entries(day || {}).forEach(([posId, si]) => {
      if (si.crewName !== crewName) return;
      if (si.status !== 'confirmed' && si.status !== 'proposed') return;
      const pos = (POSITIONS || []).find(p => p.id === posId);
      out.push({ date, posId, posLabel: pos?.label || posId, status: si.status });
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function _fmtDateDE(iso) {
  const p = String(iso || '').split('-');
  return (p.length === 3 && p[0].length === 4) ? `${p[2].substring(0, 2)}.${p[1]}.${p[0]}` : iso;
}

let _cancelCrewName = '';
let _cxlManualIdx = 0;

export function openCancelSelect(crewName) {
  if (!hasPermission('sendInvite')) return;
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  _cancelCrewName = crewName; _cxlManualIdx = 0;
  const slots = _getActiveSlotsForCrew(crewName);
  const emptyNote = slots.length ? '' :
    `<div style="color:var(--muted);margin-bottom:10px;line-height:1.5;">Keine aktive Zuweisung gefunden (z. B. weil sie schon entfernt wurde, bevor die Absage verschickt wurde). Trag den Termin unten manuell nach, um trotzdem eine Absage-Mail zu schicken.</div>`;
  document.getElementById('sharedTitle').textContent = '🚫 Absage an ' + crewName;
  const dlg = document.getElementById('sharedBody');
  dlg.innerHTML =
    `<div id="cxlBody" style="font-size:.7rem;color:var(--ink);line-height:1.6;max-height:50vh;overflow-y:auto;">
      <div style="margin-bottom:10px;color:var(--ink-2);">Welche Einsätze von <strong>${esc(crewName)}</strong> absagen?</div>
      ${emptyNote}
      ${slots.map((s, i) => `<label style="display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--rule);cursor:pointer;">
        <input type="checkbox" id="cxl_${i}" data-date="${esc(s.date)}" data-pos="${esc(s.posId)}" data-label="${esc(s.posLabel)}" checked style="width:15px;height:15px;accent-color:#e84a4a;">
        <span style="flex:1;">${esc(_fmtDateDE(s.date))} · ${esc(s.posLabel)} <span style="color:var(--muted);">${s.status === 'confirmed' ? '✅' : '⏳'}</span></span>
      </label>`).join('')}
      <div id="cxlManualRows"></div>
      <div style="display:flex;gap:6px;margin-top:12px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="cxlManualDate" class="mi" style="flex:1;min-width:130px;">
        <input type="text" id="cxlManualPos" class="mi" placeholder="Position / Hinweis (optional)" style="flex:1;min-width:160px;">
        <button class="mbtn sm" onclick="cxlAddManual()">＋ Termin manuell</button>
      </div>
      <textarea id="cxlText" rows="3" class="mi" placeholder="Text für die E-Mail (optional)…" style="resize:vertical;width:100%;margin-top:12px;"></textarea>
    </div>
    <div class="mactions" style="margin-top:8px;">
      <button class="mbtn" onclick="closeCancelSelect()">Abbrechen</button>
      <button class="mbtn primary" style="background:#e84a4a;border-color:#e84a4a;" onclick="sendSelectedCancellation()">🚫 Absage senden</button>
    </div>`;
  openModal('sharedModal');
}

export function closeCancelSelect() {
  if (_notifyHostId === 'sharedBody') _renderCrewNotifyList();
  else closeModal('sharedModal');
}

export function cxlAddManual() {
  const dateEl = document.getElementById('cxlManualDate');
  const posEl = document.getElementById('cxlManualPos');
  const date = dateEl.value;
  if (!date) { showToast('Bitte zuerst ein Datum wählen', '#e84a4a'); return; }
  const label = posEl.value.trim() || 'Termin';
  const i = 'm' + (_cxlManualIdx++);
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--rule);cursor:pointer;';
  row.innerHTML = `<input type="checkbox" id="cxl_${i}" data-date="${esc(date)}" data-pos="manual_${i}" data-label="${esc(label)}" checked style="width:15px;height:15px;accent-color:#e84a4a;">
    <span style="flex:1;">${esc(_fmtDateDE(date))} · ${esc(label)} <span style="color:var(--muted);">(manuell)</span></span>`;
  document.getElementById('cxlManualRows').appendChild(row);
  dateEl.value = ''; posEl.value = '';
}

export async function sendSelectedCancellation() {
  const crewName = _cancelCrewName;
  const meta = crewMeta[crewName] || {};
  const chosen = Array.from(document.querySelectorAll('#cxlBody input[type=checkbox]'))
    .filter(cb => cb.checked)
    .map(cb => ({ date: cb.dataset.date, posId: cb.dataset.pos, posLabel: cb.dataset.label }));
  if (!chosen.length) { showToast('Nichts ausgewählt', '#5a6070'); return; }
  const customText = (document.getElementById('cxlText')?.value || '').trim();
  try {
    await sendCancellationNotice(crewName, meta.email, chosen, customText || undefined);
  } catch (e) {
    showToast('Fehler: ' + e.message, '#e84a4a');
    return;
  }
  chosen.forEach(s => { if (assignmentStatuses[s.date]) delete assignmentStatuses[s.date][s.posId]; });
  showToast(`${crewName}: Absage gesendet ✓`, '#4ae8a0');
  closeCancelSelect();
  _renderCrewNotifyList();
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

export async function sendInvite(crewName, type, customMessage) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }

  // Der Vermerk „eingeladen" wird NUR gesetzt, wenn wirklich eine Mail rausging. Ein
  // Fehlschlag muss sichtbar bleiben und die Person auf „⚪ Nicht eingeladen" stehen lassen —
  // sonst wartet der Planer auf eine Antwort, um die nie jemand gebeten wurde (v0.10.5).
  // Alle nicht-bestätigten Slots — der Server setzt sie auf „angefragt"
  const allSlots = _getAllSlotsForCrew(crewName, meta.email).filter(s => {
    const existing = assignmentStatuses[s.date]?.[s.posId];
    return !existing || existing.status !== 'confirmed';
  });

  // Seit v0.11.0 EIN Aufruf: Der Server schreibt die Termine und löst die Mail in derselben
  // Transaktion aus. Die frühere Vorab-Anlage im Browser (bulkProposeCrew) entfällt samt
  // ihrer Drosselung und Fortschrittsanzeige — eine Anfrage kann keine Mengengrenze reißen.
  try {
    await sendCrewInvite(crewName, meta.email, type, allSlots, customMessage);
  } catch (e) {
    showToast(`${crewName}: nicht gesendet — ${_einladungsFehlerText(e)}`, '#e84a4a');
    _renderCrewNotifyList();
    throw e;
  }

  // Geschrieben hat der Server — der lokale Status muss nachziehen, sonst zeigt die Liste
  // die Person weiter als „nicht angefragt".
  allSlots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = { status: 'proposed', proposedBy: 'bulk', crewName };
  });
  _saveInvite(crewName);
  const label = type === 'reminder' ? 'Erinnerung gesendet ✓' : 'Einladung gesendet ✓';
  showToast(`${crewName}: ${label}`, '#4ae8a0');
  _renderCrewNotifyList();
}

export async function sendUpdate(crewName, customMessage) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const newSlots = _getNewSlotsForCrew(crewName, meta.email);
  if (!newSlots.length) { showToast('Keine neuen Termine', '#5a6070'); return; }
  const updateSlots = newSlots.map(s => ({
    date: s.dateLabel, posLabel: s.posLabel,
    changes: [s.loc ? s.loc : 'Neuer Termin']
  }));
  // Schreiben und mailen in EINEM Aufruf (v0.11.0) — kein vorgelagertes bulkProposeCrew
  // mehr, das auf halber Strecke stehenbleiben konnte.
  await sendUpdateNotice(crewName, meta.email, updateSlots, customMessage || undefined, newSlots);
  newSlots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = { status: 'proposed', proposedBy: 'update', crewName };
  });
  _saveInvite(crewName);
  showToast(`${crewName}: Update gesendet ✓`, '#4ae8a0');
  _renderCrewNotifyList();
}
