// ── Crew-Benachrichtigung Modal (nur Admin) ────────────────────────────────────
import { crew, assignments, assignmentStatuses, TOUR_DATES, POSITIONS,
         CURRENT_USER_EMAIL, IS_MANAGER, crewMeta, CREW_COLORS } from './state.js';
import { SUPABASE_ENABLED } from './config.js';
import { showToast, getVal, esc } from './utils.js';
import { sendCrewInvite, sendCancellationNotice, sendPencilInfo, _getActivePlanId,
         sendUpdateNotice, loadAssignmentStatuses } from './dataService.js';
import { pbListAll, pbEscapeFilter } from './pb.js';
import { hasPermission } from './rbac.js';
import { getActivePlanId, getPlansIndex } from './plans.js';
import { openModal, closeModal } from './modals.js';

// v1.3.0: Pencil-Vermerke und Absage-Queue gehören zum Plan DIESES Tabs (Suffix = PB-Plan-ID
// aus tourplan_pb_<lokale ID>, sonst die lokale ID). Alte globale Schlüssel ohne Suffix werden
// beim Lesen vorsichtig übernommen (siehe _migrate*), nur was nachweislich zu diesem Plan gehört.
const PENCIL_INFO_KEY = 'tourplan_pencil_info';
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

// v1.5.0: „eingeladen“ sagt der Mailserver (email_log), nicht der Browser. Pro Render einmal
// geladen (Cache je Plan). Zustand: 'loading' | 'ok' | 'error' (Fehler → „❔ Status unbekannt“).
let _logRows = [];
let _logState = 'loading';
async function _refreshInviteLog() {
  try {
    const pid = await _getActivePlanId();
    if (!pid) { _logRows = []; _logState = 'error'; return; }
    const r = await pbListAll('email_log', `plan_id = "${pbEscapeFilter(pid)}"`, '-sent_at');
    _logRows = r?.items || []; _logState = 'ok';
  } catch (e) { _logRows = []; _logState = 'error'; console.warn('email_log laden:', e.message); }
}

// Jüngster invite-Eintrag mit success true|skipped. Treffer per crew_email (klein), sonst per
// crew_name — der Name nur, wenn es keinen Adress-Treffer gibt.
export function inviteStateFromLog(rows, name, email) {
  const em = (email || '').toLowerCase();
  const ok = (rows || []).filter(r => r && r.email_type === 'invite' && (r.success === 'true' || r.success === 'skipped'));
  const newest = list => list.reduce((a, r) => (!a || String(r.sent_at) > String(a.sent_at)) ? r : a, null);
  const byMail = em ? ok.filter(r => (r.crew_email || '').toLowerCase() === em) : [];
  const hit = byMail.length ? newest(byMail) : newest(ok.filter(r => r.crew_name === name));
  return hit ? { at: hit.sent_at, skipped: hit.success === 'skipped' } : null;
}

// v1.4.0: Vermerk „Vormerkung mitgeteilt“ je Plan (gleiches Muster wie die Einlade-Vermerke)
function _loadPencilInfos() { return _readJson(_planScoped(PENCIL_INFO_KEY)); }
function _savePencilInfo(name) {
  const m = _loadPencilInfos();
  m[name] = new Date().toISOString();
  try { localStorage.setItem(_planScoped(PENCIL_INFO_KEY), JSON.stringify(m)); } catch (_) {}
}
function _fmtDay(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}
function _pencilledSlots(name, email) {
  return _getAllSlotsForCrew(name, email).filter(s => assignmentStatuses[s.date]?.[s.posId]?.status === 'pencilled');
}
function _pencilDeclinedCount(name) {
  let n = 0;
  Object.values(assignmentStatuses || {}).forEach(day => Object.values(day).forEach(s => {
    if (s && s.crewName === name && s.status === 'pencil_declined') n++;
  }));
  return n;
}

// „gesehen ✓“: jüngster activity_log-Eintrag pencil_seen je Person für DIESEN Plan. Pro Render
// einmal geladen (Cache je Plan); crew_email hat Vorrang vor crew_name.
let _seenRows = [];
let _seenPlan = '';
async function _refreshPencilSeen() {
  try {
    const pid = await _getActivePlanId();
    if (!pid) { _seenRows = []; _seenPlan = ''; return; }
    const r = await pbListAll('activity_log',
      `plan_id = "${pbEscapeFilter(pid)}" && action = "pencil_seen"`, '-ts');
    _seenRows = r?.items || []; _seenPlan = pid;
  } catch (e) { _seenRows = []; _seenPlan = ''; console.warn('pencil_seen laden:', e.message); }
}
function _pencilSeenTs(name, email) {
  const em = (email || '').toLowerCase();
  const rows = _seenRows.filter(r => r.action === 'pencil_seen');
  const hit = (em && rows.find(r => (r.crew_email || '').toLowerCase() === em))
           || rows.find(r => !r.crew_email && r.crew_name === name);
  return hit ? hit.ts : '';
}

// Status eines Termins FÜR diese Person: gehört der Datensatz einer anderen Person (Zelle neu
// besetzt), gilt der Termin als ohne Status.
function _slotStatus(s, name) {
  const si = assignmentStatuses[s.date]?.[s.posId];
  return (si && (!si.crewName || si.crewName === name)) ? si.status : undefined;
}

// Status-Zählung über alle Tabellentermine der Person (Termin ohne Status zählt nicht;
// pencil_declined zählt zu declined).
export function statusCounts(name) {
  const c = { pencilled: 0, proposed: 0, confirmed: 0, declined: 0 };
  _getAllSlotsForCrew(name).forEach(s => {
    const st = _slotStatus(s, name);
    if (st === 'pencil_declined') c.declined++;
    else if (st in c) c[st]++;
  });
  return c;
}

// Einladung (v1.5.0): ALLE Tabellentermine der Person als mailSlots mit Status; slots = nur die
// ohne aktiven Datensatz (die fragt der Server an). cancelled/cancel_acked gelten als „keiner“.
export function buildInvitePayload(name, email) {
  const all = _getAllSlotsForCrew(name, email);
  const slots = [], mailSlots = [];
  all.forEach(s => {
    const st = _slotStatus(s, name);
    const none = !st || st === 'cancelled' || st === 'cancel_acked';
    mailSlots.push({ date: s.date, posId: s.posId, posLabel: s.posLabel, status: none ? 'proposed' : st });
    if (none) slots.push(s);
  });
  return { slots, mailSlots };
}

// Zielcontainer der Liste: Touransicht = #sharedBody (Modal), Konsole-Karte = eigener Container
// (v1.3.0, renderCrewNotifyInto). Die Aktionen unten rendern über _renderCrewNotifyList() neu
// und treffen damit immer denselben Container.
let _notifyHostId = 'sharedBody';

export function renderCrewNotifyInto(hostId) {
  _notifyHostId = hostId || 'sharedBody';
  _logState = 'loading';
  _renderCrewNotifyList();
  return Promise.all([_refreshInviteLog(), _refreshPencilSeen()]).then(() => _renderCrewNotifyList());
}

export function openCrewNotifyModal() {
  if (!hasPermission('sendInvite')) return;
  document.getElementById('sharedTitle').textContent = 'Crew benachrichtigen';
  _notifyHostId = 'sharedBody';
  _logState = 'loading';
  _renderCrewNotifyList();
  openModal('sharedModal');
  Promise.all([_refreshInviteLog(), _refreshPencilSeen()]).then(() => { if (_notifyHostId === 'sharedBody' && !_previewCtx) _renderCrewNotifyList(); });
}

function _renderCrewNotifyList() {
  const pending = _loadCancellations();
  const pencilInfos = _loadPencilInfos();
  const rows = crew.map((name, i) => {
    const meta = crewMeta[name] || {};
    const dot = CREW_COLORS[i % CREW_COLORS.length];
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
    // v1.5.0: Badge aus dem Mail-Log, Status-Zählung getrennt davon, Hauptknopf mit Terminzahl.
    const inv = _logState === 'ok' ? inviteStateFromLog(_logRows, name, meta.email) : null;
    let badge;
    if (_logState === 'error') badge = `<span style="font-size:.58rem;color:#e8c84a;">❔ Status unbekannt</span>`;
    else if (_logState === 'loading') badge = `<span style="font-size:.58rem;color:#5a6070;">… Status wird geladen</span>`;
    else if (inv) badge = `<span style="font-size:.58rem;color:#4ae8a0;">📧 Eingeladen am ${esc(_fmtDay(inv.at))}</span>`
      + (inv.skipped ? ` <span style="font-size:.58rem;color:#e8c84a;">Test – nicht versendet</span>` : '');
    else badge = `<span style="font-size:.58rem;color:#8a92a0;">⚪ Noch nicht eingeladen</span>`;

    const cnt = statusCounts(name);
    const cntParts = [['✎', cnt.pencilled, 'vorgemerkt', '#c9a8f0'], ['⏳', cnt.proposed, 'angefragt', '#e8c84a'],
                      ['✅', cnt.confirmed, 'bestätigt', '#4ae8a0'], ['✗', cnt.declined, 'abgesagt', '#e84a4a']]
      .filter(p => p[1] > 0)
      .map(p => `<span style="color:${p[3]};">${p[0]} ${p[1]} ${p[2]}</span>`);
    const countLine = cntParts.length
      ? `<div style="font-size:.58rem;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">${cntParts.join('')}</div>` : '';

    const total = _getAllSlotsForCrew(name, meta.email).length;
    const mainLabel = inv ? `📧 Erneut einladen (${total})` : `📧 Einladen (${total} Termine)`;
    const mainBtn = total > 0
      ? `<button class="mbtn primary sm" data-crew="${nameAttr}" data-type="invite" onclick="openInvitePreview(this.dataset.crew,this.dataset.type)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">${mainLabel}</button>`
      : `<button class="mbtn primary sm" disabled title="Keine Termine in der Tabelle" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;opacity:.4;cursor:not-allowed;filter:grayscale(1);">📧 Einladen (0 Termine)</button>
         <span style="font-size:.55rem;color:#e8c84a;">Keine Termine in der Tabelle</span>`;
    // Erinnerung nur für laut Log Eingeladene mit ≥ 1 angefragtem Termin (Update zusätzlich)
    const remBtn = (inv && cnt.proposed > 0)
      ? `<button class="mbtn sm" data-crew="${nameAttr}" data-type="reminder" onclick="openInvitePreview(this.dataset.crew,this.dataset.type)" style="font-size:.58rem;padding:3px 7px;flex-shrink:0;">🔔 Erinnerung</button>` : '';
    const btn = `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">${mainBtn}${updBtn}${remBtn}</div>`;

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

    // v1.4.0: Vormerkung = reine Information. Knopf nur bei ≥1 vorgemerktem Tag.
    const pencilled = _pencilledSlots(name, meta.email);
    const pdecl = _pencilDeclinedCount(name);
    let pencilBlock = '';
    if (pencilled.length || pdecl) {
      const sent = pencilInfos[name] ? `<span style="font-size:.58rem;color:var(--muted);">mitgeteilt am ${esc(_fmtDay(pencilInfos[name]))}</span>` : '';
      const seenTs = _pencilSeenTs(name, meta.email);
      const seen = seenTs ? `<span style="font-size:.58rem;color:#4ae8a0;">gesehen ✓ ${esc(_fmtDay(seenTs))}</span>` : '';
      const declTxt = pdecl ? `<span style="font-size:.58rem;color:var(--pencilled);">✎✗ ${pdecl} Vormerkung${pdecl > 1 ? 'en' : ''} abgesagt</span>` : '';
      pencilBlock = `<div style="margin-top:5px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">`
        + (pencilled.length
          ? `<button class="mbtn sm" data-crew="${nameAttr}" onclick="openPencilInfoPreview(this.dataset.crew)" style="font-size:.58rem;padding:3px 7px;">✉ Vormerkung mitteilen</button>`
          : '')
        + sent + seen + declTxt + `</div>`;
    }

    return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0;margin-top:5px;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.65rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</div>
        ${badge}${countLine}${pencilBlock}${cancelBtn}
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
const MAIL_LISTE_MAX = 5;   // wie im Hook: darüber keine Einzeldaten in der Mail
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
  if (!planned.length) { showToast('Keine eingeplanten Termine', '#5a6070'); return; }   // nichts zu senden
  const pn = esc(_planNameForPreview());
  const isInv = type !== 'reminder';
  if (!isInv) {
    const slots = planned.filter(_einladbar);
    _openSendPreview({ kind: type, crewName, email: meta.email }, '🔔 Erinnerung an ' + crewName,
      'REMINDER · ' + _planNameForPreview(),
      `Erinnerung, ausstehende Einsätze für <strong>${pn}</strong> zu bestätigen.`, slots);
    return;
  }
  // Einladung: alle Termine mit Status; über MAIL_LISTE_MAX nur die Zählung, wie die Mail.
  const { slots: anfrage, mailSlots } = buildInvitePayload(crewName, meta.email);
  const SYM = { pencilled: '✎ vorgemerkt', pencil_declined: '✗ abgesagt', proposed: '⏳ angefragt', confirmed: '✅ bestätigt', declined: '✗ abgesagt' };
  const many = mailSlots.length > MAIL_LISTE_MAX;
  const rows = many ? [] : mailSlots.map(m => ({ date: m.date, posLabel: m.posLabel + ' · ' + (SYM[m.status] || m.status) }));
  const c = statusCounts(crewName);
  const countTxt = [['✎', c.pencilled, 'vorgemerkt'], ['⏳', c.proposed, 'angefragt'], ['✅', c.confirmed, 'bestätigt'], ['✗', c.declined, 'abgesagt']]
    .filter(p => p[1] > 0).map(p => `${p[0]} ${p[1]} ${p[2]}`).join(' · ');
  const none = anfrage.length;   // werden angefragt (gleiche Quelle wie die Nutzlast)
  const extra = many
    ? `<div style="margin-top:6px;">${mailSlots.length} Termine: ${esc(countTxt)}${none ? ` · ⏳ ${none} ohne Status werden angefragt` : ''}<br>Es gibt mehr als ${MAIL_LISTE_MAX} Einträge. Bitte logg dich ein und schau nach.</div>` : '';
  _openSendPreview({ kind: 'invite', crewName, email: meta.email }, '📧 Einladung an ' + crewName,
    'CREW INVITE · ' + _planNameForPreview(),
    `Einladung zu <strong>${pn}</strong> — ${mailSlots.length} Termine. Die Einladung teilt den Status mit, ändert ihn nicht.${extra}`,
    rows);
}

export function openPencilInfoPreview(crewName) {
  if (!hasPermission('sendInvite')) return;
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const slots = _pencilledSlots(crewName, meta.email);
  if (!slots.length) { showToast('Keine vorgemerkten Termine', '#5a6070'); return; }
  _openSendPreview({ kind: 'pencil_info', crewName, email: meta.email }, '✉ Vormerkung an ' + crewName,
    'Vormerkung – nur Information · ' + _planNameForPreview(),
    `Du bist für diese Termine vorgemerkt (<strong>${esc(_planNameForPreview())}</strong>). Das ist <strong>keine Anfrage</strong>. Halte dir die Tage bitte frei.`, slots);
}

export async function sendPencilInfoTo(crewName, customMessage) {
  const meta = crewMeta[crewName] || {};
  if (!meta.email) { showToast('Keine E-Mail hinterlegt', '#e84a4a'); return; }
  const slots = _pencilledSlots(crewName, meta.email);
  if (!slots.length) { showToast('Keine vorgemerkten Termine', '#5a6070'); return; }
  try {
    await sendPencilInfo(crewName, meta.email, slots, customMessage);
  } catch (e) {
    showToast(`${crewName}: nicht gesendet — ${_einladungsFehlerText(e)}`, '#e84a4a');
    _renderCrewNotifyList();
    throw e;
  }
  _savePencilInfo(crewName);
  showToast(`${crewName}: Vormerkung mitgeteilt ✓`, '#4ae8a0');
  _renderCrewNotifyList();
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
    else if (ctx.kind === 'pencil_info') await sendPencilInfoTo(ctx.crewName, text || undefined);
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

// Einladung/Erinnerung (v1.4.0): weder bestätigte noch vorgemerkte Tage. Eine Vormerkung ist
// reine Information und wird NICHT angefragt (Hook v4.29 setzt sie ebenfalls nicht auf proposed).
// Eigene Mitteilung dafür: pencil_info.
function _einladbar(s) {
  const st = assignmentStatuses[s.date]?.[s.posId]?.status;
  return st !== 'confirmed' && st !== 'pencilled' && st !== 'pencil_declined';
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

  // Ein Fehlschlag muss sichtbar bleiben (v0.10.5). Seit v1.5.0 gibt es keinen lokalen Vermerk
  // mehr: „eingeladen“ liest die Konsole nach dem Senden aus dem email_log.
  const isInv = type !== 'reminder';
  let slots, mailSlots;
  if (isInv) {
    ({ slots, mailSlots } = buildInvitePayload(crewName, meta.email));
    if (!mailSlots.length) { showToast('Keine Termine in der Tabelle', '#5a6070'); return; }   // nie eine Mail ohne Termine
  } else {
    slots = _getAllSlotsForCrew(crewName, meta.email).filter(_einladbar);
  }

  // EIN Aufruf: Der Server schreibt die Termine ohne Datensatz (→ angefragt) und mailt in derselben
  // Transaktion; bestehende Status bleiben unberührt.
  try {
    await sendCrewInvite(crewName, meta.email, type, slots, customMessage, isInv ? mailSlots : undefined);
  } catch (e) {
    showToast(`${crewName}: nicht gesendet — ${_einladungsFehlerText(e)}`, '#e84a4a');
    _renderCrewNotifyList();
    throw e;
  }

  // Der lokale Status zieht nur für die vom Server angefragten Termine nach.
  slots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = { status: 'proposed', proposedBy: 'bulk', crewName };
  });
  const label = type === 'reminder' ? 'Erinnerung gesendet ✓' : 'Einladung gesendet ✓';
  showToast(`${crewName}: ${label}`, '#4ae8a0');
  await _refreshInviteLog();
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
  showToast(`${crewName}: Update gesendet ✓`, '#4ae8a0');
  _renderCrewNotifyList();
}
