import { POCKETBASE_URL, SUPABASE_ENABLED } from './config.js';
import {
  POSITIONS, crew, defaultCrew, assignments, crewMeta,
  assignmentStatuses, TOUR_DATES, IS_CREW, IS_MANAGER,
  CURRENT_USER_EMAIL, USER_ROLE, CURRENT_USER_ID, OFFEN,
  clearStatus
} from './state.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList, pbListAll, pbFirst, pbUpsert, pbEscapeFilter } from './pb.js';
import { showToast, sameCrew, getVal, dedupKnownCrew } from './utils.js';
import { activePlanId, getActivePlanId, getPlansIndex, savePlansIndex } from './plans.js';

// ── Mail-Fehler sichtbar anzeigen (8s Toast) ───────────────────────────────────
function _showMailError(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = '📧 E-Mail Fehler: ' + msg;
  t.style.background = '#e84a4a';
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 8000);
}

// ── Plan-Sync: erstellt/holt Pocketbase-Plan-ID für aktiven localStorage-Plan ──
// activePlanId kommt aus plans.js (globale Variable)
let _planIdPromise = null;
let _planIdPromiseKey = null;

async function _getActivePlanId() {
  if (!SUPABASE_ENABLED || !CURRENT_USER_ID) return null;

  // Crew: immer frisch aus PB via crew_members-Email laden — kein localStorage-Cache
  // (localStorage überlebt Hard-Refresh und kann auf falschen Plan zeigen)
  if (IS_CREW) {
    try {
      const email = (CURRENT_USER_EMAIL || '').toLowerCase();
      const res = await pbList('crew_members', `email = "${pbEscapeFilter(email)}"`);
      const planIds = [...new Set((res?.items || []).map(m => m.plan_id).filter(Boolean))];
      let chosen = planIds[0] || null;
      // Von der Crew bewusst gewählter Plan (Sidebar-Umschalter switchCrewPlan) hat Vorrang —
      // aber nur, wenn er noch zu den Plänen der Crew gehört (sonst stale → verwerfen).
      let picked = null;
      try { picked = localStorage.getItem('tourplan_crew_selected_pb_id'); } catch(_) {}
      if (picked && planIds.includes(picked)) {
        localStorage.setItem('tourplan_active_pb_id', picked);
        return picked;
      }
      if (picked) { try { localStorage.removeItem('tourplan_crew_selected_pb_id'); } catch(_) {} }
      // Crew in MEHREREN Plänen → den mit offenen Anfragen (proposed) bevorzugen, damit die
      // Crew dort landet, wo eine Antwort ansteht (statt zufällig). Sonst erster Treffer.
      if (planIds.length > 1) {
        for (const pid of planIds) {
          const pending = await pbFirst('assignments',
            `plan_id = "${pbEscapeFilter(pid)}" && crew_email = "${pbEscapeFilter(email)}" && status = "proposed"`);
          if (pending) { chosen = pid; break; }
        }
      }
      if (chosen) {
        localStorage.setItem('tourplan_active_pb_id', chosen);
        return chosen;
      }
    } catch(e) {
      console.warn('Crew plan-lookup fehlgeschlagen:', e.message);
    }
    return null;
  }

  const activePlanId = getActivePlanId();
  const key = 'tourplan_pb_' + (activePlanId || 'default');
  const stored = localStorage.getItem(key);
  if (stored) return stored;

  // Manager/Admin: Plan per Owner finden oder anlegen
  // Singleton-Promise verhindert Race Condition bei parallelen Aufrufen.
  if (!_planIdPromise || _planIdPromiseKey !== key) {
    _planIdPromiseKey = key;
    _planIdPromise = _createOrFetchPlanId(key).finally(() => {
      _planIdPromise = null;
      _planIdPromiseKey = null;
    });
  }
  return _planIdPromise;
}

// Löst die PB-Plan-ID NUR auf — legt NIE einen neuen Plan an. Das frühere Auto-Anlegen
// mit Default-Namen 'Tour Plan' erzeugte bei activePlanId=null + fehlgeschlagener Suche
// (z.B. direkt nach einem Coolify-Wipe) leere Phantom-Plan-Leichen. Echte Plananlage
// läuft ausschließlich über confirmNewPlan (plans.js, explizite User-Aktion).
async function _createOrFetchPlanId(key) {
  const plans = getPlansIndex();
  const activePlanId = getActivePlanId();

  // 1) Gepinnter Plan ist die verlässliche Quelle (von loadPlanForManager/switchPlan gepflegt).
  let pinned = '';
  try { pinned = localStorage.getItem('tourplan_active_pb_id') || ''; } catch(_) {}
  if (pinned) { localStorage.setItem(key, pinned); return pinned; }

  // 2) Nur mit echtem lokalen Plan-Namen per Name suchen (kein 'Tour Plan'-Default mehr).
  const planName = plans.find(p => p.id === activePlanId)?.name || '';
  if (planName) {
    try {
      const existing = await pbFirst('plans',
        `name = "${pbEscapeFilter(planName)}" && owner = "${pbEscapeFilter(CURRENT_USER_ID)}"`);
      if (existing) { localStorage.setItem(key, existing.id); return existing.id; }
    } catch (e) {
      console.warn('Plan-Sync: Namens-Suche fehlgeschlagen:', e.message);
    }
  }

  // 3) Owner-Fallback: ersten vorhandenen Plan des Owners nutzen — aber NICHT anlegen.
  try {
    const fallback = await pbFirst('plans', `owner = "${pbEscapeFilter(CURRENT_USER_ID)}"`);
    if (fallback) { localStorage.setItem(key, fallback.id); return fallback.id; }
  } catch (e) {
    console.warn('Plan-Sync: Owner-Suche fehlgeschlagen:', e.message);
  }

  // Kein Plan gefunden → null. Bewusst KEIN pbPost (verhindert Phantom-Leichen).
  console.warn('Plan-Sync: kein Plan auflösbar — lege bewusst keinen an (kein Phantom).');
  return null;
}

// ── Plan-Daten für Crew-Mitglieder aus PocketBase laden ───────────────────────
export async function loadPlanForCrew() {
  if (!SUPABASE_ENABLED || !IS_CREW) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  try {
    const plan = await pbGet('/api/collections/plans/records/' + planId);
    if (!plan?.plan_data) {
      console.warn('loadPlanForCrew: plan_data ist leer');
      if (typeof showToast === 'function') showToast('Plan noch nicht gespeichert — Admin kontaktieren', '#e84a4a');
      return;
    }
    // Bandname (Plan-Name) für Crew merken (Header + persönlicher Export) — getPlansIndex
    // ist bei Crew leer, daher hier aus dem PB-Plan.
    try {
      localStorage.setItem('tourplan_active_plan_name', plan.name || '');
      const nameEl = document.getElementById('activePlanName');
      if (nameEl) nameEl.textContent = plan.name || '';
    } catch(_) {}
    const data = typeof plan.plan_data === 'string' ? JSON.parse(plan.plan_data) : plan.plan_data;
    if (!data?.tourDates) return;
    crew.length = 0; (data.crew || []).forEach(c => crew.push(c));
    if (data.positions) { POSITIONS.length = 0; data.positions.forEach(p => POSITIONS.push(p)); }
    Object.keys(defaultCrew).forEach(k => delete defaultCrew[k]);
    if (data.defaultCrew) Object.assign(defaultCrew, data.defaultCrew);
    TOUR_DATES.length = 0; data.tourDates.forEach(d => TOUR_DATES.push(d));
    Object.keys(assignments).forEach(k => delete assignments[k]);
    Object.assign(assignments, data.assignments || {});
    localStorage.setItem('tourplan_active_pb_id', planId);
  } catch(e) {
    console.warn('loadPlanForCrew Fehler:', e.message);
  }
}

// ── Alle Pläne, in denen die eingeloggte Crew steckt ──────────────────────────
// Für den Sidebar-Umschalter: crew_members per Email → eindeutige plan_ids → Plan-Namen.
// Liefert [{ id, name }] alphabetisch. Fehlerhafte/gelöschte Pläne werden übersprungen.
export async function loadCrewPlans() {
  if (!SUPABASE_ENABLED || !IS_CREW || !CURRENT_USER_ID) return [];
  try {
    const email = (CURRENT_USER_EMAIL || '').toLowerCase();
    const res = await pbList('crew_members', `email = "${pbEscapeFilter(email)}"`);
    const planIds = [...new Set((res?.items || []).map(m => m.plan_id).filter(Boolean))];
    const plans = [];
    for (const id of planIds) {
      try {
        const plan = await pbGet('/api/collections/plans/records/' + id);
        if (plan?.id) plans.push({ id: plan.id, name: plan.name || 'Tour Plan' });
      } catch(_) { /* gelöschter/unzugänglicher Plan → überspringen */ }
    }
    plans.sort((a, b) => a.name.localeCompare(b.name));
    return plans;
  } catch(e) {
    console.warn('loadCrewPlans Fehler:', e.message);
    return [];
  }
}

// ── Plan-Daten für Manager aus PocketBase laden ────────────────────────────
export async function loadPlanForManager() {
  if (!SUPABASE_ENABLED || !IS_MANAGER) return;
  try {
    // GEZIELT den aktuell gewählten Plan laden (tourplan_active_pb_id), nicht blind
    // den ersten by owner — sonst überschreibt ein Reload bei mehreren Plänen den
    // angezeigten Plan mit einem fremden (v0.14.6 Datenverlust-Symptom).
    const pinned = localStorage.getItem('tourplan_active_pb_id');
    let plan = null;
    if (pinned) {
      try { plan = await pbGet('/api/collections/plans/records/' + pinned); } catch(_) { plan = null; }
    }
    // Fallback: nur wenn kein Zeiger gesetzt ist → erster Plan des Owners.
    if (!plan) plan = await pbFirst('plans', `owner = "${pbEscapeFilter(CURRENT_USER_ID)}"`);
    if (!plan) { console.warn('loadPlanForManager: kein Plan für owner gefunden'); return; }
    if (!plan.plan_data) {
      console.warn('loadPlanForManager: plan_data ist leer');
      if (typeof showToast === 'function')
        showToast('Plan noch nicht synchronisiert — bitte in Tourview speichern', '#e8c84a');
      return;
    }
    const data = typeof plan.plan_data === 'string' ? JSON.parse(plan.plan_data) : plan.plan_data;
    if (!data?.tourDates) return;
    crew.length = 0; (data.crew || []).forEach(c => crew.push(c));
    if (data.positions) { POSITIONS.length = 0; data.positions.forEach(p => POSITIONS.push(p)); }
    Object.keys(defaultCrew).forEach(k => delete defaultCrew[k]);
    if (data.defaultCrew) Object.assign(defaultCrew, data.defaultCrew);
    TOUR_DATES.length = 0; data.tourDates.forEach(d => TOUR_DATES.push(d));
    Object.keys(assignments).forEach(k => delete assignments[k]);
    Object.assign(assignments, data.assignments || {});
    // PB-Plan-ID im localStorage cachen für _savePlanToLS
    if (activePlanId) localStorage.setItem('tourplan_pb_' + activePlanId, plan.id);
    localStorage.setItem('tourplan_active_pb_id', plan.id);
    // Plans-Index aktualisieren
    if (activePlanId && typeof savePlansIndex === 'function') {
      const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
      const found = plans.find(p => p.id === activePlanId);
      if (found) { found.name = plan.name; savePlansIndex(plans); }
    }
  } catch(e) {
    console.warn('loadPlanForManager Fehler:', e.message);
  }
}

// ── Crew-Meta laden (E-Mail + user_id pro Crew-Name) ──────────────────────────
export async function loadCrewMeta() {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbList('crew_members', `plan_id = "${pbEscapeFilter(planId)}"`);
    Object.keys(crewMeta).forEach(k => delete crewMeta[k]);
    (data?.items || []).forEach(row => {
      if (row.email || row.user_id) {
        crewMeta[row.name] = { email: row.email, userId: row.user_id };
      }
    });
  } catch (e) {
    console.warn('loadCrewMeta Fehler:', e.message);
  }
}

// ── Assignment-Status laden ────────────────────────────────────────────────────
export async function loadAssignmentStatuses() {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbListAll('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && status != "assigned"`);
    Object.keys(assignmentStatuses).forEach(k => delete assignmentStatuses[k]);
    (data?.items || []).forEach(row => {
      if (!assignmentStatuses[row.date]) assignmentStatuses[row.date] = {};
      assignmentStatuses[row.date][row.pos_id] = {
        status: row.status,
        proposedBy: row.proposed_by,
        crewName: row.crew_name
      };
    });
  } catch (e) {
    console.warn('loadAssignmentStatuses Fehler:', e.message);
  }
}

// ── Slot bestätigen (Crew-Mitglied) ───────────────────────────────────────────
export async function confirmAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const _myEmail = (CURRENT_USER_EMAIL || '').toLowerCase();
  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
    if (existing) {
      // Crew darf nur EIGENE Einsätze bestätigen (Manager verwaltet den ganzen Plan).
      if (IS_CREW && !IS_MANAGER && (existing.crew_email || '').toLowerCase() !== _myEmail)
        throw new Error('Zugriff verweigert – nicht dein Einsatz');
      await pbPatch('/api/collections/assignments/records/' + existing.id, {
        status: 'confirmed', responded_at: new Date().toISOString()
      });
      // Lokal NUR setzen wenn wirklich ein Record gepatcht wurde (sonst falsches "grün")
      if (assignmentStatuses[dateStr]?.[posId]) assignmentStatuses[dateStr][posId].status = 'confirmed';
    } else {
      // KEIN Record vorhanden → geplante Crew direkt als bestätigt anlegen (Manager
      // bestätigt einen nachträglich eingetragenen Slot, der nie „angefragt" wurde).
      const crewName = getVal(dateStr, posId);
      if (!crewName || crewName === OFFEN) return; // nichts Geplantes zu bestätigen
      const pos = (POSITIONS || []).find(p => p.id === posId);
      const meta = crewMeta[crewName] || {};
      // Crew darf nur den eigenen geplanten Slot anlegen/bestätigen.
      if (IS_CREW && !IS_MANAGER && (meta.email || '').toLowerCase() !== _myEmail)
        throw new Error('Zugriff verweigert – nicht dein Einsatz');
      await pbPost('/api/collections/assignments/records', {
        plan_id: planId, date: dateStr, pos_id: posId,
        pos_label: pos?.label || posId,
        crew_name: crewName, crew_email: meta.email || '',
        status: 'confirmed', proposed_by: 'manual',
        responded_at: new Date().toISOString()
      });
      // lokalen Status-Cache setzen (gleiche Form wie loadAssignmentStatuses) → sofort grün
      if (!assignmentStatuses[dateStr]) assignmentStatuses[dateStr] = {};
      assignmentStatuses[dateStr][posId] = { status: 'confirmed', proposedBy: 'manual', crewName };
    }
  } catch (e) {
    console.warn('confirmAssignment Fehler:', e.message);
    throw e; // Aufrufer muss Fehler sehen (Resync + Toast) — kein stiller Fehlschlag
  }
}

// ── Slot ablehnen (Crew-Mitglied → E-Mail an Admin via Hook) ──────────────────
export async function declineAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const si = assignmentStatuses[dateStr]?.[posId];
  const _myEmail = (CURRENT_USER_EMAIL || '').toLowerCase();

  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
    if (existing) {
      // Crew darf nur EIGENE Einsätze absagen (Manager verwaltet den ganzen Plan).
      if (IS_CREW && !IS_MANAGER && (existing.crew_email || '').toLowerCase() !== _myEmail)
        throw new Error('Zugriff verweigert – nicht dein Einsatz');
      await pbPatch('/api/collections/assignments/records/' + existing.id, {
        status: 'declined', responded_at: new Date().toISOString()
      });
      // Lokal NUR bei echtem Record. E-Mail an Admin via Pocketbase-Hook.
      if (si) si.status = 'declined';
    }
  } catch (e) {
    console.warn('declineAssignment Fehler:', e.message);
    throw e; // Aufrufer muss Fehler sehen (Resync + Toast)
  }
}

// ── Anfrage zurückziehen (Admin) ──────────────────────────────────────────────
export async function cancelProposal(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
    if (existing) {
      await pbDelete('/api/collections/assignments/records/' + existing.id);
      clearStatus(dateStr, posId);  // ← NEW: fix stale state
    }
  } catch(e) {
    console.warn('cancelProposal Fehler:', e.message);
    throw e;
  }
}

// ── Alle Anfragen einer Position zurückziehen (Admin) ─────────────────────────
export async function bulkCancelProposals(posId, crewName) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbList('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && pos_id = "${pbEscapeFilter(posId)}" && (status = "proposed" || status = "declined")`);
    // crewName optional + trim/case-tolerant in JS filtern (PB-Filter wäre case-sensitiv)
    const rows = (data?.items || []).filter(row => !crewName || sameCrew(row.crew_name, crewName));
    await Promise.all(rows.map(row => {
      clearStatus(row.date, row.pos_id);  // ← NEW: fix stale state
      return pbDelete('/api/collections/assignments/records/' + row.id);
    }));
  } catch(e) {
    console.warn('bulkCancelProposals Fehler:', e.message);
    throw e;
  }
}

// ── Crew für mehrere Slots auf einmal vorschlagen ─────────────────────────────
export async function bulkProposeCrew(slots) {
  if (!SUPABASE_ENABLED || !slots.length) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  await Promise.all(slots.map(s => {
    const pos = typeof POSITIONS !== 'undefined' ? POSITIONS.find(p => p.id === s.posId) : null;
    return pbUpsert(
      'assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(s.date)}" && pos_id = "${pbEscapeFilter(s.posId)}"`,
      {
        plan_id: planId, date: s.date, pos_id: s.posId, pos_label: pos?.label || s.posId,
        crew_name: s.crewName, crew_email: s.crewEmail || '',
        status: 'proposed', proposed_by: 'bulk'
      },
      // proposed_by:'bulk' → Hook unterdrückt per-Slot-Anfrage-Mail (Aufrufer sendet eigene Invite/Update-Mail)
      { crew_name: s.crewName, pos_label: pos?.label || s.posId, crew_email: s.crewEmail || '',
        status: 'proposed', proposed_by: 'bulk' }
    );
  }));

  slots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = {
      status: 'proposed', proposedBy: CURRENT_USER_ID, crewName: s.crewName
    };
  });
}

// ── Slot vorläufig vormerken (Manager, Fernzukunft, KEIN Mailversand) ─────────
// status='pencilled' ist dem Hook unbekannt (main.pb.js prüft nur 'proposed'/'declined')
// → kein automatischer Mailversand, exakt wie gewünscht. Analog zu bulkProposeCrew, aber
// Einzelslot + eigener Status.
export async function pencilInAssignment(dateStr, posId, crewName, crewEmail) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const pos = (POSITIONS || []).find(p => p.id === posId);
  await pbUpsert(
    'assignments',
    `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`,
    { plan_id: planId, date: dateStr, pos_id: posId, pos_label: pos?.label || posId,
      crew_name: crewName, crew_email: crewEmail || '', status: 'pencilled', proposed_by: 'manual' },
    { crew_name: crewName, pos_label: pos?.label || posId, crew_email: crewEmail || '',
      status: 'pencilled', proposed_by: 'manual' }
  );
  if (!assignmentStatuses[dateStr]) assignmentStatuses[dateStr] = {};
  assignmentStatuses[dateStr][posId] = { status: 'pencilled', proposedBy: 'manual', crewName };
}

// ── Vormerkung → echte Anfrage („Jetzt anfragen") ──────────────────────────────
// Setzt NUR den Status auf 'proposed' (Slot verhält sich danach wie jede andere Anfrage,
// inkl. Sichtbarkeit in der Einladen/Update-Sammelfunktion). Sendet HIER bewusst KEINE
// eigene Mail — Mailversand läuft wie bei jedem Slot über die bestehende, konsolidierte
// Einladen/Update-Funktion (kein doppelter/inkonsistenter Mail-Pfad).
export async function promotePencilledToProposed(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const existing = await pbFirst('assignments',
    `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
  if (!existing) return;
  await pbPatch('/api/collections/assignments/records/' + existing.id, { status: 'proposed' });
  if (assignmentStatuses[dateStr]?.[posId]) assignmentStatuses[dateStr][posId].status = 'proposed';
}

// ── Soft-Cancel: Zuweisung entfernen, Record BEHALTEN (v0.30.0) ────────────────
// Statt zu löschen wird status='cancelled' gesetzt — nur so hat der „GESEHEN ✓"-
// Button in der Änderungs-Mail ein Ziel (aid). Liefert den gepatchten Record
// (für die Queue) oder null, wenn keiner existiert.
export async function softCancelAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return null;
  const planId = await _getActivePlanId();
  if (!planId) return null;
  const existing = await pbFirst('assignments',
    `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`);
  if (!existing) return null;
  await pbPatch('/api/collections/assignments/records/' + existing.id, {
    status: 'cancelled', responded_at: new Date().toISOString()
  });
  clearStatus(dateStr, posId);   // Zelle sofort „leer" (Cache), Record bleibt in PB
  return existing;
}

// ── Absage-Quittung („ÄNDERUNGEN GESEHEN ✓" aus der Mail) ─────────────────────
// Patcht NUR Records, die noch status='cancelled' haben (Guard: der Slot kann
// inzwischen neu besetzt sein — pbUpsert überschreibt cancelled-Records) und die
// der eingeloggten Crew gehören. Liefert die Anzahl quittierter Termine.
export async function ackCancelledAssignments(aids) {
  if (!SUPABASE_ENABLED || !aids?.length) return 0;
  const myEmail = (CURRENT_USER_EMAIL || '').toLowerCase();
  let n = 0;
  for (const aid of aids) {
    try {
      const rec = await pbGet('/api/collections/assignments/records/' + aid);
      if (!rec || rec.status !== 'cancelled') continue;
      if ((rec.crew_email || '').toLowerCase() !== myEmail) continue;
      await pbPatch('/api/collections/assignments/records/' + aid, {
        status: 'cancel_acked', responded_at: new Date().toISOString()
      });
      logActivity('cancel_acked', { planId: rec.plan_id, crewName: rec.crew_name,
        crewEmail: rec.crew_email, date: rec.date, posLabel: rec.pos_label });
      n++;
    } catch (e) { console.warn('ackCancelledAssignments:', e.message); }
  }
  return n;
}

// ── Aktivitäts-Log (fire-and-forget — darf NIE den Hauptflow brechen) ─────────
// action: 'confirmed' | 'declined' | 'cancel_acked'. ts client-seitig (die
// Collections haben KEIN created-Feld, siehe sort=-id-Gotcha).
export function logActivity(action, { planId, crewName, crewEmail, date, posLabel }) {
  if (!SUPABASE_ENABLED) return;
  pbPost('/api/collections/activity_log/records', {
    plan_id: planId || '', crew_name: crewName || '', crew_email: crewEmail || '',
    action, date: date || '', pos_label: posLabel || '',
    ts: new Date().toISOString()
  }).catch(e => console.warn('logActivity:', e.message));
}

// ── Absage-Sammel-E-Mail an Crew-Mitglied (via Pocketbase-Hook) ───────────────
export async function sendCancellationNotice(crewName, crewEmail, slots) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  try {
    await pbPost('/api/collections/crew_invites/records', {
      plan_id: planId, crew_name: crewName, crew_email: crewEmail,
      type: 'cancellation', plan_name: planName,
      app_url: JSON.stringify(slots)
    });
  } catch (e) {
    console.warn('sendCancellationNotice Fehler:', e.message);
    _showMailError(e.message);
  }
}

// ── Bereitschaftsmeldung an Admin (via Pocketbase-Hook) ───────────────────────
export async function sendAvailabilityNotice(crewName, crewEmail, slots) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  try {
    await pbPost('/api/collections/crew_invites/records', {
      plan_id: planId, crew_name: crewName, crew_email: crewEmail,
      type: 'availability', plan_name: planName,
      app_url: JSON.stringify(slots)
    });
  } catch(e) {
    console.warn('sendAvailabilityNotice Fehler:', e.message);
    _showMailError(e.message);
    throw e;
  }
}

export async function sendUpdateNotice(crewName, crewEmail, slots, customMessage) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  try {
    await pbPost('/api/collections/crew_invites/records', {
      plan_id: planId, crew_name: crewName, crew_email: crewEmail,
      type: 'update', plan_name: planName,
      app_url: JSON.stringify(slots),
      ...(customMessage ? { custom_message: customMessage } : {})
    });
  } catch(e) {
    console.warn('sendUpdateNotice Fehler:', e.message);
    _showMailError(e.message);
    throw e;
  }
}

// ── Crew einladen / Erinnerung schicken (E-Mail via Pocketbase-Hook) ──────────
export async function sendCrewInvite(crewName, crewEmail, type) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  // Hook-Trigger: temporären invite-Record anlegen, Hook sendet Mail und löscht ihn
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  const appUrl = window.location.origin + window.location.pathname;
  const _fmt = d => { const o=new Date(d); return isNaN(o.getTime())?d:('0'+o.getDate()).slice(-2)+'.'+ ('0'+(o.getMonth()+1)).slice(-2)+'.'+String(o.getFullYear()).slice(-2); };
  const _dates = (TOUR_DATES||[]).map(r=>r.date).sort();
  const _range = _dates.length>=2 ? ' · '+_fmt(_dates[0])+'–'+_fmt(_dates[_dates.length-1]) : '';
  const planNameDisplay = planName + _range;
  try {
    await pbPost('/api/collections/crew_invites/records', {
      plan_id: planId, crew_name: crewName, crew_email: crewEmail,
      type, plan_name: planNameDisplay, app_url: appUrl
    });
  } catch (e) {
    console.warn('sendCrewInvite Fehler:', e.message);
    _showMailError(e.message);
  }
}

// ── Crew-Mitglied mit E-Mail verknüpfen (Admin) ───────────────────────────────
// ── Alle je angelegten Crew-Mitglieder tour-übergreifend laden (für Import) ──────
// Kein plan_id-Filter: genau die planübergreifende Liste ist gewünscht. Single-Owner-
// Setup (listRule = auth). De-Dup + E-Mail-Bevorzugung in dedupKnownCrew (pure).
export async function loadAllKnownCrew() {
  if (!SUPABASE_ENABLED) return [];
  const data = await pbListAll('crew_members', '');
  return dedupKnownCrew((data?.items || []).map(m => ({ name: m.name, email: m.email || '' })));
}

export async function saveCrewLink(crewName, email) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) throw new Error('Plan nicht gefunden – bitte neu einloggen');

  try {
    await pbUpsert(
      'crew_members',
      `plan_id = "${pbEscapeFilter(planId)}" && name = "${pbEscapeFilter(crewName)}"`,
      { plan_id: planId, name: crewName, email, sort_order: crew.indexOf(crewName) },
      { email }
    );
  } catch (e) {
    console.error('saveCrewLink Fehler:', e.message);
    if (typeof showToast === 'function') showToast('⚠ E-Mail-Speichern fehlgeschlagen: ' + e.message, 6000);
    throw e;
  }
  if (!crewMeta[crewName]) crewMeta[crewName] = {};
  crewMeta[crewName].email = email;
}

// ── Crew-Mitglied umbenennen — KEINE Dublette: bestehende Records umbenennen ────
export async function renameCrewMember(oldName, newName) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  // crew_members-Record(s) umbenennen (statt neu anlegen)
  const members = await pbList('crew_members', `plan_id = "${pbEscapeFilter(planId)}" && name = "${pbEscapeFilter(oldName)}"`);
  for (const m of (members?.items || [])) {
    await pbPatch('/api/collections/crew_members/records/' + m.id, { name: newName });
  }
  // Bestätigungs-Records (assignments) mit umbenennen, damit Status/Anzeige passt
  const assigns = await pbListAll('assignments', `plan_id = "${pbEscapeFilter(planId)}" && crew_name = "${pbEscapeFilter(oldName)}"`);
  for (const a of (assigns?.items || [])) {
    await pbPatch('/api/collections/assignments/records/' + a.id, { crew_name: newName });
  }
}

// ── Crew-Mitglied entfernen — auch den PB-crew_members-Record löschen (keine Leiche) ──
export async function deleteCrewMember(name) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  try {
    const members = await pbList('crew_members', `plan_id = "${pbEscapeFilter(planId)}" && name = "${pbEscapeFilter(name)}"`);
    for (const m of (members?.items || [])) {
      await pbDelete('/api/collections/crew_members/records/' + m.id);
    }
  } catch(e) { console.warn('deleteCrewMember Fehler:', e.message); }
}
