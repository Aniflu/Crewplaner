// ── User View — Meine Einsätze / Confirm / Decline ────────────────────────────
import { TOUR_DATES, POSITIONS, assignments, assignmentStatuses, crewMeta,
         IS_CREW, IS_MANAGER, CURRENT_USER_EMAIL, CURRENT_USER_ID, setStatus,
         meineEntfallenen } from './state.js';
import { SUPABASE_ENABLED, POCKETBASE_URL } from './config.js';
import { getVal, isPending, esc, showToast, fmtD, fmtDParts, sameCrew } from './utils.js';
import { loadAssignmentStatuses, sendUpdateNotice,
         loadPlanForCrew, loadCrewMeta,
         loadCrewPlans, moveAssignmentDate,
         logActivity, getCrewLoadedPlanId, saveCrewChanges } from './dataService.js';
import { loadDraft, saveDraft, clearDraft, setChange, toggleAvailability, dropStale,
         removeEntries, draftCount, effectiveStatus } from './crewDraft.js';
import { _getNewSlotsForCrew } from './crewNotify.js';
import { renderTable, resetTodayAutoScroll } from './render.js';
import { getActivePlanId, getPlansIndex, activePlanName, _savePlanToLS } from './plans.js';
import { closeModal, openModal } from './modals.js';
import { showConfirm, showAlert } from './dialog.js';
import { isCrewStatusTransitionAllowed, icsExportRows, ICS_STATUS_LABEL, crewIcsContent, feedUrls,
         checkDateMove, moveDateInPlan, queueAddRemoved } from './pure.js';

// ── Crew-Entwurf (v1.5.0) ─────────────────────────────────────────────────────
// Die Crew schreibt NICHTS mehr einzeln an den Server. Jede Antwort (bestätigen, absagen,
// Vormerkung zurücknehmen, „Gesehen", Bereitschaft) landet im Entwurf (js/crewDraft.js, im
// localStorage je PB-Plan). Erst „Änderungen speichern" schickt alles in EINEM Aufruf an
// /crewsave — der Planer bekommt genau eine Mail. Nur für IS_CREW && !IS_MANAGER; der
// Planer-Pfad (confirmAssignment/declineAssignment in dataService.js) bleibt unberührt.
const _istCrew = () => IS_CREW && !IS_MANAGER;
const _LEER = () => ({ changes: [], availability: [] });
const _planKey = () => getCrewLoadedPlanId() || '';

export function getCrewDraft() {
  return _istCrew() ? loadDraft(_planKey()) : _LEER();
}
function _setDraft(d) {
  if (draftCount(d)) saveDraft(_planKey(), d); else clearDraft(_planKey());
  renderTable();   // rendert auch die Leiste (render.js → _updateCrewSaveBar)
}
// Aktueller Server-Stand eines Termins: Status, 'cancelled' (entfallen, steht nicht in
// assignmentStatuses) oder 'none' (kein Datensatz).
function _currentStatus(date, posId) {
  const si = (assignmentStatuses || {})[date]?.[posId];
  if (si && si.status) return si.status;
  return meineEntfallenen.some(c => c.date === date && c.posId === posId) ? 'cancelled' : 'none';
}
// Wirksamer Status = Entwurf, sonst Server-Stand (für Tabelle und „Meine Einsätze").
function _effStatus(date, posId) {
  return effectiveStatus(getCrewDraft(), date, posId, _currentStatus(date, posId));
}
export function isDraftChanged(date, posId) {
  return getCrewDraft().changes.some(c => c.date === date && c.posId === posId);
}
function _offeneEntfallene() {
  return meineEntfallenen.filter(c => _effStatus(c.date, c.posId) !== 'cancel_acked');
}

// Gemeinsamer Schreibweg in den Entwurf. `to` = Wunschstatus. Liefert true, wenn vorgemerkt.
export function queueCrewChange(date, posId, to) {
  if (!_istCrew()) return false;
  if (!_planKey()) { showToast('Plan nicht geladen – bitte neu laden', '#e84a4a'); return false; }
  const from = _currentStatus(date, posId);
  // Verboten ist nur, was der Server ohnehin ablehnen würde (statt es erst beim Speichern
  // scheitern zu lassen). „Zurück auf den Ausgangsstatus" (to === from) ist immer erlaubt.
  if (to !== from && !isCrewStatusTransitionAllowed(from === 'none' ? '' : from, to)) {
    showToast('Diesen Status kannst du nicht selbst ändern – bitte den Planer fragen', '#e84a4a');
    return false;
  }
  _setDraft(setChange(getCrewDraft(), { date, posId, from, to }));
  return true;
}

// ── Änderungen speichern / verwerfen (Leiste #crewSaveBar) ────────────────────
export function _updateCrewSaveBar() {
  const bar = document.getElementById('crewSaveBar');
  if (!bar) return;
  const n = _istCrew() ? draftCount(getCrewDraft()) : 0;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const cnt = document.getElementById('crewSaveCount');
  if (cnt) cnt.textContent = n + (n === 1 ? ' ungespeicherte Änderung' : ' ungespeicherte Änderungen');
  if (document.body && document.body.classList) document.body.classList.toggle('has-save-bar', n > 0);
}

const _STATUS_TEXT = { proposed: 'angefragt', confirmed: 'bestätigt', declined: 'abgesagt',
  pencilled: 'vorgemerkt', pencil_declined: 'Vormerkung abgesagt', cancelled: 'entfallen',
  cancel_acked: 'entfallen (gesehen)', none: 'nicht eingeplant' };
function _slotText(date, posId) {
  const [y, m, d] = String(date).split('-');
  const pos = POSITIONS.find(p => p.id === posId);
  return d + '.' + m + '.' + y + ' ' + (pos?.label || posId);
}

let _saving = false;
export async function saveMyChanges() {
  if (!_istCrew() || _saving) return;
  const pb = _planKey();
  const draft = getCrewDraft();
  if (!draftCount(draft)) return;
  _saving = true;
  showToast('Wird gespeichert…', '#e8c84a');
  try {
    await saveCrewChanges(pb, draft);
    const sent = _getMeldungSent();
    draft.availability.forEach(a => {
      if (!sent[a.date]) sent[a.date] = [];
      if (!sent[a.date].includes(a.posId)) sent[a.date].push(a.posId);
    });
    try { _saveMeldungSent(sent); } catch (_) { /* nur Anzeige „Gemeldet" */ }
    // Nur die GESENDETEN Einträge entfernen (unverändert gesendet): Klicks während der Anfrage bleiben.
    const jetzt = getCrewDraft();
    const gesendet = jetzt.changes.filter(c => draft.changes.some(x => x.date === c.date && x.posId === c.posId && x.from === c.from && x.to === c.to))
      .concat(jetzt.availability.filter(a => draft.availability.some(x => x.date === a.date && x.posId === a.posId)));
    const rest = removeEntries(jetzt, gesendet);
    if (draftCount(rest)) saveDraft(pb, rest); else clearDraft(pb);
    await loadAssignmentStatuses();
    renderTable();
    showToast('Gespeichert – der Planer bekommt eine Mail ✓', '#4ae8a0');
  } catch (e) {
    if (e.status === 409 && e.body && Array.isArray(e.body.stale)) {
      // Der Planer war schneller: genau diese Einträge raus, Rest bleibt, Stand neu laden.
      const stale = e.body.stale;
      _setDraft(removeEntries(getCrewDraft(), stale));
      await loadAssignmentStatuses();
      renderTable();
      const zeilen = stale.map(x => _slotText(x.date, x.posId) + ' (jetzt: ' + (_STATUS_TEXT[x.now] || x.now) + ')');
      await showAlert('Der Planer hat inzwischen geändert: ' + zeilen.join(', ')
        + '. Diese Änderungen wurden aus deiner Liste entfernt. Prüfe sie und speichere den Rest erneut.');
    } else {
      const denied = e.body && Array.isArray(e.body.denied) ? e.body.denied : [];
      const grund = denied.length
        ? denied.map(x => _slotText(x.date, x.posId) + ': ' + x.reason).join('; ')
        : e.message;
      showToast('Nicht gespeichert: ' + grund, '#e84a4a', 6000);   // Entwurf bleibt unverändert
    }
  } finally {
    _saving = false;
  }
}

export async function discardMyChanges() {
  if (!_istCrew()) return;
  const n = draftCount(getCrewDraft());
  if (!n) return;
  const ok = await showConfirm(n + ' ungespeicherte Änderung' + (n === 1 ? '' : 'en') + ' verwerfen?', 'Verwerfen');
  if (!ok) return;
  clearDraft(_planKey());
  renderTable();
  showToast('Änderungen verworfen ↩', '#5a6070');
}

// Beim Laden des Crew-Plans: Entwurf prüfen. Veraltetes (Termin weg oder Ausgangsstatus
// inzwischen anders) fliegt raus und wird im Dialog genannt; bleibt etwas, fragt der Dialog
// Speichern / Verwerfen. „Abbrechen" lässt den Rest in der Leiste stehen.
export async function checkCrewDraftOnOpen() {
  if (!_istCrew()) return;
  const pb = _planKey();
  if (!pb) return;
  let draft = loadDraft(pb);
  if (!draftCount(draft)) { _updateCrewSaveBar(); return; }
  const dropped = [];
  const tage = new Set(TOUR_DATES.map(t => t.date));
  if (tage.size) {
    const weg = draft.changes.concat(draft.availability).filter(x => !tage.has(x.date));
    weg.forEach(x => dropped.push({ date: x.date, posId: x.posId }));
    draft = removeEntries(draft, weg);
  }
  const r = dropStale(draft, _currentStatus);
  draft = r.draft;
  r.dropped.forEach(x => dropped.push(x));
  if (dropped.length) { if (draftCount(draft)) saveDraft(pb, draft); else clearDraft(pb); }
  const verworfen = dropped.length
    ? '\n\nVerworfen, weil der Termin oder sein Stand sich inzwischen geändert hat: '
      + dropped.map(x => _slotText(x.date, x.posId)).join(', ') + '.'
    : '';
  renderTable();
  const n = draftCount(draft);
  if (!n) { if (dropped.length) await showAlert('Deine ungespeicherten Änderungen sind nicht mehr gültig.' + verworfen); return; }
  const speichern = await showConfirm('Du hast ungespeicherte Änderungen (' + n + '). Jetzt speichern?' + verworfen, 'Speichern');
  if (speichern) { await saveMyChanges(); return; }
  const verwerfen = await showConfirm('Stattdessen verwerfen? Mit „Abbrechen“ bleiben sie in der Leiste unten stehen.', 'Verwerfen');
  if (verwerfen) { clearDraft(pb); renderTable(); }
}

// Änderung der Absage-Wahl direkt in der Tabelle (bestätigter Einsatz „Absagen?").
export function toggleCancellation(dateStr, posId) {
  const base = _currentStatus(dateStr, posId);
  const eff = _effStatus(dateStr, posId);
  queueCrewChange(dateStr, posId, eff === 'declined' ? base : 'declined');
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
    await checkCrewDraftOnOpen();
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
      const eff = _effStatus(day.date, pos.id);
      if (eff === 'confirmed') return;   // schon bestätigt (auch im Entwurf) → nicht mehr offen
      // „Vorgemerkt" ist KEINE offene Frage (v0.13.0). Es ist Planung des Managers — utils.js
      // sagt das seit v0.29.0 im Kommentar zu isPending, hier stand es nur nicht. Solange es
      // fehlte, fragte der Login nach vorgemerkten Tagen und die Antwort hob sie still auf
      // bestätigt, obwohl den Status ausschließlich Admin/Tourmanager bewegen darf.
      // Absagen kann die Crew sie trotzdem — dafür gibt es getMyPencilledSlots().
      if (eff === 'pencilled' || eff === 'pencil_declined') return;   // v1.4.0 (v1.5.0: wirksamer Status)
      slots.push({ date: day.date, posId: pos.id });
    });
  });
  slots.sort((a, b) => a.date.localeCompare(b.date));
  return slots;
}

// ── Meine Vormerkungen sammeln ───────────────────────────────────────────────
// Bewusst getrennt von getMyPendingSlots: Diese Tage werden NICHT gefragt („kannst du?"),
// sie sind nur sichtbar — mit genau einer erlaubten Aktion, der Absage. Wer nicht kann,
// muss das sagen dürfen, bevor der Manager fest mit ihm plant.
export function getMyPencilledSlots() {
  const myName = getMyCrewName();
  if (!myName) return [];
  const _dates = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []);
  const _pos   = (typeof POSITIONS  !== 'undefined' ? POSITIONS  : []);
  const slots = [];
  _dates.forEach(day => {
    _pos.forEach(pos => {
      if (!sameCrew(getVal(day.date, pos.id), myName)) return;
      if (_effStatus(day.date, pos.id) !== 'pencilled') return;   // v1.5.0: wirksamer Status
      slots.push({ date: day.date, posId: pos.id });
    });
  });
  slots.sort((a, b) => a.date.localeCompare(b.date));
  return slots;
}

// Meine abgesagten Vormerkungen (v1.4.0) — einzige Aktion: „↩ Wieder vormerken".
export function getMyPencilDeclinedSlots() {
  const myName = getMyCrewName();
  if (!myName) return [];
  const _dates = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []);
  const _pos   = (typeof POSITIONS  !== 'undefined' ? POSITIONS  : []);
  const slots = [];
  _dates.forEach(day => {
    _pos.forEach(pos => {
      if (!sameCrew(getVal(day.date, pos.id), myName)) return;
      if (_effStatus(day.date, pos.id) !== 'pencil_declined') return;   // v1.5.0: wirksamer Status
      slots.push({ date: day.date, posId: pos.id });
    });
  });
  slots.sort((a, b) => a.date.localeCompare(b.date));
  return slots;
}

// ── Info-Popup „Nur zur Information" (v1.4.0) ────────────────────────────────
// Erscheint für Vormerkungen, die die Person noch nicht mit OK bestätigt hat. Gemerkt wird je
// Plan im Browser (crew_pencil_seen_<PB>), zusätzlich EIN pencil_seen-Eintrag je OK (der Planer
// sieht „gesehen ✓"). Kein Absagen im Popup, kein Bestätigen irgendwo.
// Plan-ID aus dem im Tab GELADENEN Crew-Plan, nie aus dem globalen Zeiger (zweiter Tab).
export function _pencilSeenKey(pb = getCrewLoadedPlanId()) {
  return 'crew_pencil_seen_' + (pb || '');
}
function _readPencilSeen(pb) {
  try { const a = JSON.parse(localStorage.getItem(_pencilSeenKey(pb)) || '[]'); return Array.isArray(a) ? a : []; }
  catch(_) { return []; }
}
// Rein: nur Schlüssel `date|posId`, die noch nicht in `seen` stehen.
export function unseenPencilSlots(slots, seen) {
  const s = new Set(seen || []);
  return (slots || []).filter(x => !s.has(x.date + '|' + x.posId));
}
let _pencilShown = [];
let _pencilPlan = '';
export function checkPencilInfoPopup() {
  if (IS_MANAGER || !IS_CREW) return false;
  const pb = getCrewLoadedPlanId();
  if (!pb) return false;
  const neu = unseenPencilSlots(getMyPencilledSlots(), _readPencilSeen(pb));
  if (!neu.length) return false;
  _pencilShown = neu;
  _pencilPlan = pb;
  const zeilen = neu.map(({ date, posId }) => {
    const [y, m, d] = date.split('-');
    const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
    const td  = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(x => x.date === date);
    const ort = td && td.loc ? ' · ' + esc(td.loc) : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--rule);">'
      + '<span style="color:var(--pencilled);flex-shrink:0;">✎</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.66rem;color:var(--ink);">' + d + '.' + m + '.' + y + '</div>'
      + '<div style="font-size:.58rem;color:var(--muted);">' + esc(pos?.label || posId) + ort + '</div>'
      + '</div></div>';
  }).join('');
  document.getElementById('sharedTitle').textContent = 'ℹ Nur zur Information';
  document.getElementById('sharedBody').innerHTML =
    '<div style="font-size:.64rem;color:var(--ink);line-height:1.6;margin-bottom:10px;">'
    + 'Das ist <strong>keine Anfrage</strong>. Du bist für diese Termine vorgemerkt. Halte dir die Tage bitte frei. '
    + 'Ob du wirklich gebraucht wirst, erfährst du mit einer Anfrage. '
    + 'Wenn du schon weißt, dass du nicht kannst, sag bitte in der App ab.</div>'
    + '<div style="max-height:40vh;overflow-y:auto;">' + zeilen + '</div>'
    + '<div class="mactions"><button class="mbtn primary" onclick="pencilInfoOk()">OK, verstanden</button></div>';
  openModal('sharedModal');
  return true;
}
export function pencilInfoOk() {
  const pb = _pencilPlan;
  const shown = _pencilShown;
  _pencilShown = []; _pencilPlan = '';
  closeModal('sharedModal');
  if (!pb || !shown.length) return;   // Doppelklick bzw. kein Popup offen: nichts schreiben
  const seen = new Set(_readPencilSeen(pb));
  shown.forEach(x => seen.add(x.date + '|' + x.posId));
  try { localStorage.setItem(_pencilSeenKey(pb), JSON.stringify([...seen])); } catch(_) {}
  logActivity('pencil_seen', { planId: pb, crewName: getMyCrewName() || '', crewEmail: CURRENT_USER_EMAIL || '' });
  // Danach greifen die normalen Öffnungsregeln (offene Anfragen / entfallene Tage).
  if (getMyPendingSlots().length > 0 || _offeneEntfallene().length > 0) openMyScheduleModal();
}

// ── Modal automatisch öffnen wenn offene Slots vorhanden ─────────────────────
export function checkAndOpenMySchedule() {
  if (IS_MANAGER) return;
  // v1.4.0: Neue Vormerkungen haben Vorrang (Info-Popup); das OK öffnet danach ggf. die Liste.
  if (checkPencilInfoPopup()) return;
  // Auch bei ausschließlich ENTFALLENEN Tagen öffnen (v0.9.3). Vorher nur bei offenen Slots —
  // seit die Update-Mail keine Daten mehr aufzählt, wäre ein entfallener Tag sonst nirgends
  // zu sehen: Er steht in keinem plan_data mehr und taucht in der Tabelle nicht auf.
  // Vormerkungen lösen hier BEWUSST nichts aus (v0.13.0): Sie sind keine Frage, also darf
  // der Login nicht danach fragen. Genau das war der gemeldete Fehler — wer vorgemerkt war,
  // bekam beim Anmelden „kannst du an diesen Terminen?" und hob mit der Antwort still den
  // Status auf bestätigt. Erreichbar bleiben sie über den Knopf (bulkConfirmAllMySlots).
  if (getMyPendingSlots().length > 0 || _offeneEntfallene().length > 0) openMyScheduleModal();
}

// „Gesehen" für die entfallenen Tage — derselbe Weg, den auch der Knopf in der Mail auslöst
// (action=ackcancel). ackCancelledAssignments prüft serverseitig, dass die Adresse zum
// Datensatz passt; hier wird nichts umgangen.
export function _ackMeineEntfallenen() {
  const offen = _offeneEntfallene();
  if (!offen.length) return;
  // v1.5.0: kein Schreiben — „Gesehen" geht in den Entwurf und mit „Änderungen speichern" raus.
  let d = getCrewDraft();
  offen.forEach(c => { d = setChange(d, { date: c.date, posId: c.posId, from: _currentStatus(c.date, c.posId), to: 'cancel_acked' }); });
  _setDraft(d);
  showToast(offen.length + ' Änderung(en) als gesehen vorgemerkt – bitte speichern', '#e8c84a');
  closeModal('sharedModal');
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

  // Entfallene Tage: eigener Abschnitt. Sie stehen in KEINEM plan_data mehr — ohne diese
  // Liste gäbe es für die Crew keinen Ort, an dem sie sichtbar wären (v0.9.3).
  // ⚠️ Zeilen VOR dem Template bauen, nicht als verschachteltes `${…map(c => { … })}`:
  // tests/imports.test.mjs entfernt Template-Literale mit `\$\{[^}]*\}` und stolpert über
  // innere Klammern — der Rest der Datei wird dann falsch geparst und der Guard meldet
  // Unsinn. Getrennt ist es ohnehin lesbarer.
  const entfallenZeilen = _offeneEntfallene().map(c => {
    const [y, m, d] = String(c.date || '').split('-');
    const td = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(x => x.date === c.date);
    const ort = td && td.loc ? ' · ' + esc(td.loc) : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--rule);">'
      + '<span style="color:#e84a4a;flex-shrink:0;">✕</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.66rem;color:var(--ink);">' + d + '.' + m + '.' + y + '</div>'
      + '<div style="font-size:.58rem;color:var(--muted);">' + esc(c.posLabel || c.posId || '') + ort + '</div>'
      + '</div></div>';
  }).join('');

  const entfallenHTML = _offeneEntfallene().length
    ? '<div style="margin-top:18px;border-top:1px solid var(--rule);padding-top:14px;">'
      + '<div style="font-size:.62rem;color:#e84a4a;font-weight:bold;margin-bottom:8px;">'
      + '➖ Entfallen — diese Tage bist du nicht mehr eingeplant (' + _offeneEntfallene().length + ')</div>'
      // Eigener Scrollbereich wie die Liste darüber. Bei 20 entfallenen Tagen wäre der
      // „Gesehen"-Knopf sonst weit unten in der Box — erreichbar, aber man sucht ihn.
      + '<div style="max-height:30vh;overflow-y:auto;">' + entfallenZeilen + '</div>'
      + '<div style="margin-top:10px;"><button class="mbtn" onclick="_ackMeineEntfallenen()">Gesehen ✓</button></div>'
      + '</div>'
    : '';

  // Vormerkungen: eigener Abschnitt, BEWUSST ohne Checkbox (v0.13.0). Eine Checkbox in der
  // Liste oben verspricht „wird bestätigt" — und genau das darf die Crew hier nicht. Den
  // Status vorgemerkt bewegt nur Admin/Tourmanager. Absagen darf sie trotzdem, sonst plant
  // der Manager auf Sand; deshalb pro Zeile genau ein Knopf.
  const vormerkZeilen = getMyPencilledSlots().map(({ date, posId }) => {
    const [y, m, d] = date.split('-');
    const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
    const td  = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(x => x.date === date);
    const ort = td && td.loc ? ' · ' + esc(td.loc) : '';
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--rule);">'
      + '<span style="color:var(--pencilled);flex-shrink:0;">✎</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.66rem;color:var(--ink);">' + d + '.' + m + '.' + y + '</div>'
      + '<div style="font-size:.58rem;color:var(--muted);">' + esc(pos?.label || posId) + ort + '</div>'
      + '</div>'
      + '<button class="mbtn" style="flex-shrink:0;font-size:.58rem;padding:4px 8px;" '
      + 'onclick="declineMySlot(\'' + date + '\',\'' + posId + '\')">✗ Absagen</button>'
      + '</div>';
  }).join('');

  const vormerkHTML = vormerkZeilen
    ? '<div style="margin-top:18px;border-top:1px solid var(--rule);padding-top:14px;">'
      + '<div style="font-size:.62rem;color:var(--pencilled);font-weight:bold;margin-bottom:4px;">'
      + '✎ Vorgemerkt (' + getMyPencilledSlots().length + ')</div>'
      + '<div style="font-size:.58rem;color:var(--muted);margin-bottom:8px;line-height:1.5;">'
      + 'Nur zur Information, keine Anfrage — die Tourleitung plant hier erst. Du musst nichts tun. '
      + 'Wenn du jetzt schon weißt, dass es nicht geht, sag bitte ab.</div>'
      + '<div style="max-height:30vh;overflow-y:auto;">' + vormerkZeilen + '</div>'
      + '<div style="margin-top:10px;"><button class="mbtn" onclick="declineAllMyPencilled()">✗ Alle absagen</button></div>'
      + '</div>'
    : '';

  // Abgesagte Vormerkungen (v1.4.0): zurücknehmen möglich, sonst nichts.
  const abgesagtZeilen = getMyPencilDeclinedSlots().map(({ date, posId }) => {
    const [y, m, d] = date.split('-');
    const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--rule);">'
      + '<span style="color:var(--pencilled);flex-shrink:0;text-decoration:line-through;">✎</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.66rem;color:var(--muted);text-decoration:line-through;">' + d + '.' + m + '.' + y + '</div>'
      + '<div style="font-size:.58rem;color:var(--muted);">' + esc(pos?.label || posId) + ' · Vormerkung abgesagt</div>'
      + '</div>'
      + '<button class="mbtn" style="flex-shrink:0;font-size:.58rem;padding:4px 8px;" '
      + 'onclick="restoreMyPencil(\'' + date + '\',\'' + posId + '\')">↩ Wieder vormerken</button>'
      + '</div>';
  }).join('');
  const abgesagtHTML = abgesagtZeilen
    ? '<div style="margin-top:18px;border-top:1px solid var(--rule);padding-top:14px;">'
      + '<div style="font-size:.62rem;color:var(--muted);font-weight:bold;margin-bottom:8px;">'
      + '✎✗ Vormerkung abgesagt (' + getMyPencilDeclinedSlots().length + ')</div>'
      + '<div style="max-height:30vh;overflow-y:auto;">' + abgesagtZeilen + '</div>'
      + '</div>'
    : '';

  if (slots.length === 0) {
    document.getElementById('sharedBody').innerHTML = `
      ${(_offeneEntfallene().length || vormerkZeilen || abgesagtZeilen) ? '' : `<p style="font-size:.65rem;color:var(--muted);text-align:center;padding:20px 0;">
        Keine offenen Einsätze — alles erledigt ✅
      </p>`}
      ${vormerkHTML}
      ${abgesagtHTML}
      ${entfallenHTML}
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
        <div style="font-size:.6rem;color:var(--muted);margin-top:2px;">${esc(posLabel)}${location ? ' · ' + esc(location) : ''}</div>
        ${changedBadge}
      </div>
      <span class="slot-avail-label" style="font-size:.58rem;color:#4ae8a0;">Verfügbar</span>
    </label>`;
  }).join('');

  document.getElementById('sharedBody').innerHTML = `
    <div style="font-size:.62rem;color:var(--muted);margin-bottom:12px;line-height:1.5;">
      <strong style="color:var(--ink);">${planName}</strong> · Haken entfernen = nicht verfügbar
    </div>
    <div style="max-height:45vh;overflow-y:auto;margin-bottom:14px;">${rows}</div>
    ${vormerkHTML}
    ${abgesagtHTML}
    ${entfallenHTML}
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

export function _bulkConfirmMySlots() {
  const checkboxes = document.querySelectorAll('#sharedBody input[type=checkbox]');
  const decisions = Array.from(checkboxes).map(cb => ({
    date: cb.dataset.date,
    posId: cb.dataset.pos,
    confirmed: cb.checked
  }));
  // v1.5.0: nichts geht sofort an den Server — die Wahl landet im Entwurf (Leiste unten).
  let d = getCrewDraft();
  let abgelehnt = 0;
  decisions.forEach(x => {
    const from = _currentStatus(x.date, x.posId);
    const to = x.confirmed ? 'confirmed' : 'declined';
    if (to !== from && !isCrewStatusTransitionAllowed(from === 'none' ? '' : from, to)) { abgelehnt++; return; }
    d = setChange(d, { date: x.date, posId: x.posId, from, to });
  });
  _setDraft(d);
  closeModal('sharedModal');
  showToast(abgelehnt ? 'Teilweise vorgemerkt – bitte speichern' : 'Vorgemerkt – bitte „Änderungen speichern“ drücken', abgelehnt ? '#e8c84a' : '#4ae8a0');
}

// ── Slot-Bestätigungs-Modal (Einzelklick aus Tabelle) ────────────────────────
export function openSlotConfirmModal(dateStr, posId) {
  const pos = (typeof POSITIONS !== 'undefined' ? POSITIONS : []).find(p => p.id === posId);
  const tourDay = (typeof TOUR_DATES !== 'undefined' ? TOUR_DATES : []).find(d => d.date === dateStr);
  const [y, m, d] = dateStr.split('-');
  const dateLabel = `${d}.${m}.${y}`;
  const posLabel = pos?.label || posId;
  const loc = tourDay?.loc || '';
  // Vorgemerkt → nur absagen (v0.13.0). Ein „✓ Bestätigen" wäre hier gelogen: Der Klick
  // würde vom Guard in dataService.js abgewiesen und die Crew stünde vor einem Knopf, der
  // nichts tut. Lieber gar nicht anbieten, was das System nicht annimmt.
  const _st = _effStatus(dateStr, posId);   // v1.5.0: wirksamer Status inkl. Entwurf
  const istVorgemerkt = _st === 'pencilled';
  const istVormAbgesagt = _st === 'pencil_declined';
  // ⚠️ Beide Blöcke VOR dem Template bauen, nicht als verschachteltes `${… ? `…` : ''}` —
  // dieselbe Falle wie in _renderMySchedule: tests/imports.test.mjs entfernt Template-Literale
  // per `\$\{[^}]*\}`, verschluckt sich an den inneren Backticks und meldet danach Unsinn.
  const hinweisHTML = istVorgemerkt
    ? '<div style="font-size:.6rem;color:var(--muted);margin-bottom:16px;line-height:1.6;">'
      + '✎ Die Tourleitung hat dich hier vorgemerkt — eine Anfrage ist das noch nicht, du musst '
      + 'nichts tun. Wenn du jetzt schon weißt, dass es nicht geht, sag bitte ab.</div>'
    : '';
  // Vorgemerkt → kein „Bestätigen". Der Knopf würde vom Guard in dataService.js abgewiesen,
  // und ein Knopf, der nichts tut, ist schlimmer als keiner.
  const bestaetigenHTML = istVorgemerkt
    ? ''
    : '<button class="mbtn primary" onclick="confirmMySlot(\'' + dateStr + '\',\'' + posId + '\');closeModal(\'sharedModal\')" '
      + 'style="background:#4ae8a0;color:#1a1a2e;">✓ Bestätigen</button>';
  document.getElementById('sharedTitle').textContent = istVorgemerkt ? 'Vorgemerkter Einsatz' : istVormAbgesagt ? 'Vormerkung abgesagt' : 'Einsatz bestätigen';
  if (istVormAbgesagt) {
    document.getElementById('sharedBody').innerHTML =
      '<div style="font-size:.68rem;color:var(--ink);margin-bottom:16px;line-height:1.7;">'
      + '<strong>' + dateLabel + '</strong> · ' + esc(posLabel) + (loc ? ' · ' + esc(loc) : '') + '</div>'
      + '<div style="font-size:.6rem;color:var(--muted);margin-bottom:16px;line-height:1.6;">'
      + 'Du hast diese Vormerkung abgesagt. Wenn es doch geht, kannst du sie zurücknehmen.</div>'
      + '<div class="mactions"><button class="mbtn" onclick="closeModal(\'sharedModal\')">Schließen</button>'
      + '<button class="mbtn primary" onclick="restoreMyPencil(\'' + dateStr + '\',\'' + posId + '\');closeModal(\'sharedModal\')">↩ Wieder vormerken</button></div>';
    openModal('sharedModal');
    return;
  }
  document.getElementById('sharedBody').innerHTML = `
    <div style="font-size:.68rem;color:var(--ink);margin-bottom:16px;line-height:1.7;">
      <strong>${dateLabel}</strong> · ${esc(posLabel)}${loc ? ' · ' + esc(loc) : ''}
    </div>
    ${hinweisHTML}
    <div class="mactions">
      <button class="mbtn" onclick="declineMySlot('${dateStr}','${posId}');closeModal('sharedModal')">✗ Absagen</button>
      ${bestaetigenHTML}
    </div>`;
  openModal('sharedModal');
}

// ── Alle angefragten Termine auf einmal bestätigen ────────────────────────────
export function bulkConfirmAllMySlots() {
  if (!getMyCrewName()) { showToast('Konto nicht mit Crew-Mitglied verknüpft — Admin kontaktieren', '#e84a4a'); return; }
  // Auch bei NUR Vormerkungen öffnen (v0.13.0): Seit die aus getMyPendingSlots draußen sind,
  // wäre der Absage-Weg sonst unerreichbar — das Modal ist der einzige Ort, an dem er steht.
  if (!getMyPendingSlots().length && !getMyPencilledSlots().length) {
    showToast('Keine offenen Termine — alles bestätigt ✓', '#5a6070'); return;
  }
  // Auswahl-Liste öffnen: abwählen was nicht geht → „Bestätigen ✓" bestätigt den Rest
  // (angehakt) und lehnt die abgewählten ab (_bulkConfirmMySlots).
  openMyScheduleModal();
}

// ── Einzelne Slot-Aktionen (aus Tabelle heraus) ───────────────────────────────
export function confirmMySlot(dateStr, posId) {
  if (queueCrewChange(dateStr, posId, 'confirmed')) showToast('Vorgemerkt: bestätigt – bitte speichern', '#4ae8a0');
}

export function declineMySlot(dateStr, posId) {
  // Vormerkung sagt die Crew mit eigenem Status ab (v1.4.0), alles andere mit „declined".
  const to = _currentStatus(dateStr, posId) === 'pencilled' ? 'pencil_declined' : 'declined';
  if (queueCrewChange(dateStr, posId, to)) showToast('Vorgemerkt: abgesagt – bitte speichern', '#e8c84a');
}

export function restoreMyPencil(dateStr, posId) {
  if (queueCrewChange(dateStr, posId, 'pencilled')) showToast('Wieder vorgemerkt ↩ – bitte speichern', '#4ae8a0');
  if (document.getElementById('sharedModal')?.classList?.contains('open')) openMyScheduleModal();
}

// „Alle absagen": NUR Vormerkungen (pencilled) — nie Anfragen oder Bestätigte.
export async function declineAllMyPencilled() {
  const slots = getMyPencilledSlots();
  if (!slots.length) return;
  const ok = await showConfirm('Alle ' + slots.length + ' Vormerkungen absagen?', 'Absagen');
  if (!ok) return;
  let d = getCrewDraft();
  slots.forEach(({ date, posId }) => {
    d = setChange(d, { date, posId, from: _currentStatus(date, posId), to: 'pencil_declined' });
  });
  _setDraft(d);
  showToast('Vorgemerkt: Vormerkungen abgesagt – bitte speichern', '#e8c84a');
  openMyScheduleModal();
}

// ── Bereitschaftsmeldung Draft ────────────────────────────────────────────────
export const _getMeldungSent = () => {
  try { return JSON.parse(localStorage.getItem('crewplan_meldungen_'+(getActivePlanId()||'')) || '{}'); } catch(_) { return {}; }
};
const _saveMeldungSent = d => localStorage.setItem('crewplan_meldungen_'+(getActivePlanId()||''), JSON.stringify(d));

// Bereitschaft („📋 Bewerben") steht im selben Entwurf wie alle anderen Crew-Änderungen
// (v1.5.0): erneutes Tippen nimmt sie zurück, gesendet wird mit „Änderungen speichern".
export function isAvailabilityDrafted(date, posId) {
  return getCrewDraft().availability.some(a => a.date === date && a.posId === posId);
}

export function meinesMelden(dateStr, posId) {
  if (!getMyCrewName()) { showToast('Dein Konto ist noch nicht verknüpft. Bitte Admin kontaktieren.', '#e84a4a'); return; }
  if (!_istCrew()) return;
  _setDraft(toggleAvailability(getCrewDraft(), { date: dateStr, posId }));
}

// ── Plan-Änderungs-Queue (Admin → Crew re-bestätigen) ─────────────────────────
// Key STABIL pro Plan: PB-Plan-ID (für Manager immer gesetzt) bevorzugt, sonst lokale
// activePlanId. Verhindert den alten Sammel-Topf mit leerem Suffix (loadPlanForManager
// setzt kein activePlanId → früher kippten ALLE Pläne in 'crewplan_updates_').
function _queuePlanKey() {
  // Aus dem EIGENEN Plan dieses Tabs (im Speicher) — nie aus dem globalen Zeiger
  // tourplan_active_pb_id, den ein zweiter Tab (Konsole) jederzeit umsetzen kann.
  const lid = getActivePlanId() || '';
  let pid = '';
  try { if (lid) pid = localStorage.getItem('tourplan_pb_' + lid) || ''; } catch(_) {}
  return 'crewplan_updates_' + (pid || lid);
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

// Datum eines Tour-Tags ändern (v1.1.0). Reihenfolge ist Absicht: erst prüfen (ohne Netz),
// dann die PB-Records verschieben, erst danach den lokalen Stand — scheitert der Server, bleibt
// die Tabelle wie sie war. Angefragte/bestätigte Crew geht wie bei einer Ortsänderung zurück
// auf „angefragt" und landet mit „Datum: alt → neu" in der Update-Queue.
export async function changeTourDate(oldDate, newDate) {
  const reason = checkDateMove(TOUR_DATES, oldDate, newDate);
  if (reason) return { ok: false, reason };
  await moveAssignmentDate(oldDate, newDate);
  const q = _getCrewUpdateQueue();
  moveDateInPlan({ tourDates: TOUR_DATES, assignments, statuses: assignmentStatuses, queue: q }, oldDate, newDate);
  _saveCrewUpdateQueue(q);
  _savePlanToLS(getActivePlanId());
  _queueCrewUpdate(newDate, `Datum: ${fmtDParts(oldDate).dt}. → ${fmtDParts(newDate).dt}.`);
  renderTable();
  return { ok: true, reason: '' };
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
  const q = queueAddRemoved(_getCrewUpdateQueue(), crewName, email, dateStr, posId, posLabel, aid);
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
  // Touransicht: Hinweis-Knopf zur Konsole (Senden geschieht dort). Statusfarbe, sobald etwas offen ist.
  const hint = document.getElementById('btnCrewKonsole');
  const hintTxt = document.getElementById('btnCrewKonsoleTxt');
  if (hint && hintTxt) {
    const n = people.size;
    hintTxt.textContent = n > 0 ? `↻ ${n} Update${n === 1 ? '' : 's'} offen – in der Konsole senden` : 'Crew in der Konsole verwalten';
    hint.style.color = n > 0 ? 'var(--warn)' : '';
    hint.style.borderColor = n > 0 ? 'var(--warn)' : '';
    hint.style.background = n > 0 ? 'rgba(232,160,74,.15)' : '';
    hint.dataset.open = String(n);
  }
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

// _activePlanName ist mit v0.12.0 nach plans.js gewandert (activePlanName) — der Kalender
// braucht denselben Namen, und zwei Exemplare waeren zwei Gelegenheiten fuer den Fehler
// aus v0.10.4. Hier nur noch der lokale Aliasname.
const _activePlanName = activePlanName;
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

      // ⚠️ Seit v0.9.3 zählt die Mail KEINE Tage mehr auf — sie nennt nur die Art der
      // Änderung. Die Vorschau zeigte aber weiter eine Datumstabelle und versprach damit
      // etwas, das beim Empfänger gar nicht ankommt. Deshalb zweigeteilt:
      // oben das, was wirklich in der Mail steht, darunter die Tage als Kontrolle FÜR DICH.
      const slots = opts.slots || [];
      const zahl = { neu: 0, weg: 0, vor: 0, fest: 0 };
      for (const s of slots) {
        if (s.kind === 'removed') zahl.weg++;
        else if (s.kind === 'status') (s.to === 'confirmed' ? zahl.fest++ : zahl.vor++);
        else zahl.neu++;
      }
      const satz = (n, ein, viele) => (n === 1 ? ein : `${n} ${viele}`);
      const mailZeilen = [];
      if (zahl.neu)  mailZeilen.push(`➕ ${satz(zahl.neu, 'Ein neuer Termin', 'neue Termine')} — bitte bestätigen`);
      if (zahl.weg)  mailZeilen.push(`➖ ${satz(zahl.weg, 'Ein Termin ist entfallen', 'Termine sind entfallen')}`);
      if (zahl.vor)  mailZeilen.push(`✎ ${satz(zahl.vor, 'Ein Termin ist jetzt vorgemerkt', 'Termine sind jetzt vorgemerkt')}`);
      if (zahl.fest) mailZeilen.push(`✓ ${satz(zahl.fest, 'Ein Termin ist wieder fest', 'Termine sind wieder fest')}`);

      const rows = slots.map(s =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #2a2f3a;">${esc(_fmtPrevDate(s.date))}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #2a2f3a;">${esc(s.posLabel || '')}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #2a2f3a;">${esc(_kindTxt(s))}</td></tr>`).join('');

      body.innerHTML =
        `<div><strong style="color:#9aa0aa;">An:</strong> ${esc(opts.email || '')}</div>
         <div><strong style="color:#9aa0aa;">Betreff:</strong> ${esc(opts.subject || '')}</div>
         <div style="margin-top:10px;padding:10px;border:1px solid var(--rule-2);border-radius:3px;">
           <div style="font-size:.58rem;color:var(--accent);letter-spacing:1px;margin-bottom:6px;">SO KOMMT DIE MAIL AN</div>
           ${mailZeilen.map(z => `<div>${esc(z)}</div>`).join('')}
           <div style="margin-top:6px;color:#9aa0aa;">…und der Hinweis, sich einzuloggen. Einzelne Tage stehen nicht in der Mail.</div>
         </div>
         ${rows ? `<div style="margin-top:12px;font-size:.58rem;color:var(--muted);letter-spacing:1px;">BETROFFENE TAGE — NUR FÜR DICH, NICHT IN DER MAIL (${slots.length})</div>
         <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:.62rem;color:#9aa0aa;">${rows}</table>` : ''}`;
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
    const mailSlots = newSlots.map(s => ({ date: s.date, posLabel: s.posLabel, kind: 'new', changes: ['Neuer Termin'] })).concat(removedMail, statusMail);
    // Schreiben und mailen in EINEM Aufruf (v0.11.0): frueher lief bulkProposeCrew davor
    // und konnte auf halber Strecke stehenbleiben — Termine angefragt, Mail nie raus.
    if (mailSlots.length) await sendUpdateNotice(name, entry.email, mailSlots, customText, newSlots);
    return;
  }
  // Änderung an bestehenden Einsätzen: vorhandene Records auf proposed setzen + mailen.
  const newSlots = _getNewSlotsForCrew(name, entry.email);
  // Die bestehenden Einsaetze, die wieder angefragt werden sollen, aufloesen (posLabel → posId).
  // Frueher folgte darauf eine PATCH-Schleife: ein Suchen und ein Schreiben pro Slot, alles
  // einzeln und keins davon zusammenhaengend. Jetzt gehen sie mit dem Rest in EINEN Aufruf.
  const wieder = [];
  for (const slot of normal) {
    const day = assignmentStatuses[slot.date];
    const posId = day ? Object.keys(day).find(p => {
      const pos = POSITIONS.find(pp => pp.id === p);
      return (pos?.label || p) === slot.posLabel && day[p].crewName === name;
    }) : null;
    if (posId) wieder.push({ date: slot.date, posId, posLabel: slot.posLabel });
  }
  await sendUpdateNotice(name, entry.email, normal.concat(removedMail, statusMail), customText,
                         newSlots.concat(wieder));
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
