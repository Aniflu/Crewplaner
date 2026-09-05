import { POCKETBASE_URL, SUPABASE_ENABLED, POOL_PLAN_ID } from './config.js';
import {
  POSITIONS, crew, defaultCrew, assignments, crewMeta,
  assignmentStatuses, TOUR_DATES, IS_CREW, IS_MANAGER,
  CURRENT_USER_EMAIL, USER_ROLE, CURRENT_USER_ID, OFFEN,
  clearStatus, meineEntfallenen
} from './state.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList, pbListAll, pbFirst, pbUpsert, pbEscapeFilter } from './pb.js';
import { showToast, sameCrew, getVal, dedupKnownCrew } from './utils.js';
import { normEmail } from './pure.js';
import { activePlanId, getActivePlanId, getPlansIndex, savePlansIndex } from './plans.js';

// ── Authentifizierte Hook-Route abrufen ───────────────────────────────────────
// Die Routen des Hooks (/myplans, /myplan/{id}) liegen am Root, nicht unter /api —
// pbGet passt also nicht. Anmeldung wie überall per Bearer-Token aus dem localStorage.
async function _pbRoute(path) {
  const token = localStorage.getItem('pb_token');
  const res = await fetch(POCKETBASE_URL + path, {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  if (!res.ok) {
    const err = new Error('Route ' + path + ' → HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

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
      // v0.8.1: über die Hook-Route statt der crew_members-REST-API. Der direkte Zugriff war
      // der Grund, warum die Collection für jedes angemeldete Konto offen stehen musste —
      // und damit lagen die Mailadressen aller Crew-Mitglieder aller Touren offen. Die Route
      // ermittelt die eigenen Touren serverseitig und liefert nur id+name.
      // ⚠️ Diese Umstellung MUSS vor dem Zumachen der Regel ausgerollt sein, sonst findet
      // kein Crew-Mitglied mehr seine Tour (dieselbe Falle wie beim v4.16-Rollout).
      const plans = await _pbRoute('/myplans');
      const planIds = [...new Set((Array.isArray(plans) ? plans : []).map(p => p.id).filter(Boolean))];
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
  // Der gemerkte Tourname gehört zur VORIGEN Tour, bis die neue wirklich geladen ist. Bricht
  // das Laden unterwegs ab, blieb er sonst stehen, während `tourplan_active_pb_id` schon
  // umgesprungen war — das Abo-Fenster behauptete dann „gilt nur für <alte Tour>". Lieber
  // gar kein Name (die Anzeige fällt auf 'Tour Plan' zurück) als ein falscher.
  try { localStorage.removeItem('tourplan_active_plan_name'); } catch(_) {}
  try {
    // Über die Hook-Route statt der plans-REST-API (v4.16): die liefert den kompletten
    // Datensatz inkl. `view_token`, und der soll ein Geheimnis bleiben — ein Crew-Mitglied
    // braucht den öffentlichen Link seiner Tour nicht. Die Route prüft serverseitig, dass
    // der Anmeldete Owner, superadmin oder crew_member DIESER Tour ist.
    const plan = await _pbRoute('/myplan/' + encodeURIComponent(planId));
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
    // Eine Anfrage statt N (v4.16): die Route ermittelt die Touren serverseitig aus
    // crew_members und liefert nur id+name — kein `view_token` im Payload.
    const plans = await _pbRoute('/myplans');
    return Array.isArray(plans) ? plans : [];
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

  // ── CREW: nur der EIGENE Eintrag ──────────────────────────────────────────
  // Vorgabe des Users (2026-08-10): „die crewmitglieder dürfen AUSSCHLIESSLICH nur die
  // Namen sehen sonst nichts." Bis v0.8.0 lud diese Funktion für JEDEN — auch für Crew —
  // alle crew_members des Plans MIT Mailadressen in den Browser.
  //
  // Gebraucht wird davon im Crew-Pfad genau eines: der eigene Anzeigename, damit
  // `getMyCrewName` (userView.js) die eigenen Slots erkennt. Den liefert `/myplan/{id}`
  // seit Hook v4.20 als `myName` mit. Alle übrigen crewMeta-Nutzungen (dropdown.js,
  // bulkStatus.js, crewNotify.js, crew.js) sind Manager-Pfade — geprüft.
  //
  // Die Namen der Kolleginnen und Kollegen sieht die Crew weiterhin: sie stehen in
  // `plan_data` (crew/defaultCrew/assignments) und in den Status-Daten. Nur die Adressen
  // kommen nicht mehr an.
  if (IS_CREW && !IS_MANAGER) {
    try {
      const plan = await _pbRoute('/myplan/' + encodeURIComponent(planId));
      Object.keys(crewMeta).forEach(k => delete crewMeta[k]);
      if (plan?.myName) {
        crewMeta[plan.myName] = { email: CURRENT_USER_EMAIL || '', userId: CURRENT_USER_ID || '' };
      }
    } catch (e) {
      console.warn('loadCrewMeta (Crew) Fehler:', e.message);
    }
    return;
  }

  // ── MANAGER/Owner: unverändert ────────────────────────────────────────────
  // Er braucht die Adressen zum Einladen, Erinnern und Benachrichtigen und ist
  // Eigentümer der Tour.
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

  // ── CREW: über die Hook-Route, ohne Mailadressen ──────────────────────────
  // Der direkte assignments-Zugriff zwang die listRule auf `@request.auth.id != ""` —
  // damit konnte jedes angemeldete Konto ALLE Einsätze ALLER Touren abrufen, inklusive
  // `crew_email` jeder Person (Audit-Befund K-2). Eine PB-Regel kann das nicht enger
  // fassen: Regeln filtern Datensätze, nicht Felder.
  //
  // `/planstatus/{id}` (v4.20) liefert Datum, Position, Status und Anzeigename — genau
  // das, was die Tabelle einfärbt — und nur für DIESE Tour.
  if (IS_CREW && !IS_MANAGER) {
    try {
      const res = await _pbRoute('/planstatus/' + encodeURIComponent(planId));
      Object.keys(assignmentStatuses).forEach(k => delete assignmentStatuses[k]);
      Object.assign(assignmentStatuses, res?.statuses || {});
      // v0.9.3: die EIGENEN entfallenen Einsätze (Hook v4.21). Sie stehen in keinem
      // plan_data mehr — beim Aufheben nimmt der Planer den Slot heraus, für die Crew
      // verschwindet der Tag spurlos. Ohne diese Liste hätte die Crew keine Möglichkeit
      // zu sehen, dass ein Tag entfallen ist, seit die Mail keine Daten mehr aufzählt.
      // Ältere Hook-Stände liefern das Feld nicht → leeres Array, nichts bricht.
      meineEntfallenen.length = 0;
      (res?.cancelled || []).forEach(c => meineEntfallenen.push(c));
    } catch (e) {
      console.warn('loadAssignmentStatuses (Crew) Fehler:', e.message);
    }
    return;
  }

  // ── MANAGER/Owner: unverändert über die REST-API ──────────────────────────
  try {
    const data = await pbListAll('assignments',
      `plan_id = "${pbEscapeFilter(planId)}" && status != "assigned" && status != "cancelled" && status != "cancel_acked"`);
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
  // ⚠️ WERFEN, nicht still zurückkehren (v0.9.1). Der Sammel-Dialog zählt jeden Durchlauf als
  // Erfolg — ohne Plan-ID meldete er „59 Einsätze bestätigt", während nichts geschrieben wurde.
  // Eine Erfolgsmeldung, die lügt, ist schlimmer als ein Fehler: Man merkt es erst viel später.
  const planId = await _getActivePlanId();
  if (!planId) throw new Error('Plan nicht gefunden – bitte neu einloggen');

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
      if (IS_CREW && !IS_MANAGER) logActivity('confirmed', { planId, crewName: existing.crew_name, crewEmail: existing.crew_email, date: dateStr, posLabel: existing.pos_label });
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
      if (IS_CREW && !IS_MANAGER) logActivity('confirmed', { planId, crewName, crewEmail: meta.email || '', date: dateStr, posLabel: pos?.label || posId });
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
      if (IS_CREW && !IS_MANAGER) logActivity('declined', { planId, crewName: existing.crew_name, crewEmail: existing.crew_email, date: dateStr, posLabel: existing.pos_label });
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
// Läuft über applyStatusToSlots (weiter unten) — NICHT über ein eigenes Promise.all.
//
// Vorher stand hier genau der Fehler, vor dem der Kommentar über BULK_GLEICHZEITIG warnt:
// ein unbegrenztes Promise.all über alle Termine, jeder Durchlauf ein pbUpsert = ZWEI
// Anfragen (erst suchen, dann schreiben). Beim Einladen einer Person mit 25 Terminen in
// „Provinz 2027" waren das 50 gleichzeitige Anfragen — die PocketBase-Drosselung antwortete
// mit 429, unten rechts stand „Too many requests" und die Einladung ging nicht raus (v0.10.5).
//
// applyStatusToSlots sucht EINMAL für den ganzen Plan, schreibt in Fünfergruppen und
// wiederholt nach einem 429. Es setzt bei Ziel 'proposed' von sich aus proposed_by='bulk' —
// dieselbe Kennzeichnung wie vorher, an der der Hook die Sammelaktion erkennt und die
// per-Slot-Anfragemail unterdrückt (der Aufrufer schickt seine eigene Einladungs-/Update-Mail).
export async function bulkProposeCrew(slots, aufFortschritt) {
  if (!SUPABASE_ENABLED || !slots.length) return;
  await applyStatusToSlots(
    slots.map(s => ({ date: s.date, posId: s.posId, name: s.crewName, email: s.crewEmail })),
    'proposed',
    aufFortschritt
  );
}

// ── Slot vorläufig vormerken (Manager, Fernzukunft, KEIN Mailversand) ─────────
// status='pencilled' ist dem Hook unbekannt (main.pb.js prüft nur 'proposed'/'declined')
// → kein automatischer Mailversand, exakt wie gewünscht. Analog zu bulkProposeCrew, aber
// Einzelslot + eigener Status.
export async function pencilInAssignment(dateStr, posId, crewName, crewEmail) {
  if (!SUPABASE_ENABLED) return;
  // ⚠️ WERFEN, nicht still zurückkehren — siehe confirmAssignment (v0.9.1).
  const planId = await _getActivePlanId();
  if (!planId) throw new Error('Plan nicht gefunden – bitte neu einloggen');
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

// ── Viele Einsätze auf einmal schreiben (v0.9.2) ──────────────────────────────
// Vorher lief der Sammel-Dialog Slot für Slot über pencilInAssignment/confirmAssignment.
// Jeder Aufruf machte ZWEI Anfragen (pbUpsert sucht erst, dann schreibt), streng nacheinander:
// 59 Einsätze = ~120 Roundtrips in Reihe, 25–40 Sekunden. Der Dialog blieb so lange offen und
// sah aus, als hinge er — genau so wurde es gemeldet.
//
// Zwei Hebel: die Suche EINMAL für den ganzen Plan (statt pro Slot), und die Schreibvorgänge
// in kleinen Gruppen nebenläufig.
//
// ⚠️ Höchstens 5 gleichzeitig. Seit dem 14.08. läuft auf PocketBase eine Drosselung
// (vom Admin gemessen, v0.8.3); ein unbegrenztes Promise.all über 59 Einsätze
// würde sie auslösen und die Hälfte mit 429 zurückbekommen — der Schutz von gestern sähe dann
// wie Datenverlust aus.
const BULK_GLEICHZEITIG = 5;

// Ein 429 heißt „zu schnell", nicht „geht nicht". Einmal kurz warten und wiederholen, bevor
// der Vorgang als gescheitert gilt.
async function _mitWiederholung(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.status === 429) {
      await new Promise(r => setTimeout(r, 1200));
      return fn();
    }
    throw e;
  }
}

// Arbeitet die Liste in Gruppen ab und meldet den Fortschritt. Ein Fehler bricht ab —
// Teilerfolg ist möglich, deshalb resynchronisiert der Aufrufer danach.
async function _inGruppen(liste, arbeit, aufFortschritt) {
  let fertig = 0;
  for (let i = 0; i < liste.length; i += BULK_GLEICHZEITIG) {
    await Promise.all(liste.slice(i, i + BULK_GLEICHZEITIG).map(async (x) => {
      await _mitWiederholung(() => arbeit(x));
      fertig++;
      if (aufFortschritt) aufFortschritt(fertig);
    }));
  }
  return fertig;
}

// targets: [{ date, posId, name, email }] · ziel: 'pencilled' | 'confirmed' | 'proposed'
export async function applyStatusToSlots(targets, ziel, aufFortschritt) {
  if (!SUPABASE_ENABLED) return 0;
  const planId = await _getActivePlanId();
  if (!planId) throw new Error('Plan nicht gefunden – bitte neu einloggen');

  // EINE Abfrage statt einer pro Slot. `row.date` kommt als reines 'YYYY-MM-DD' zurück —
  // dieselbe Form wie TOUR_DATES[].date, siehe loadAssignmentStatuses.
  const alle = await pbListAll('assignments', `plan_id = "${pbEscapeFilter(planId)}"`);
  const vorhanden = new Map();
  for (const r of (alle?.items || [])) vorhanden.set(r.date + '|' + r.pos_id, r);

  // 'proposed' aus dem Sammelweg trägt proposed_by='bulk' — daran erkennt der Hook die
  // Sammel-Aktion und lässt die Einzelmail weg (main.pb.js). Sonst ginge pro Tag eine Mail raus.
  const von = ziel === 'proposed' ? 'bulk' : 'manual';

  const geschrieben = await _inGruppen(targets, async (t) => {
    const pos = (POSITIONS || []).find(p => p.id === t.posId);
    const feld = { crew_name: t.name, pos_label: pos?.label || t.posId,
                   crew_email: t.email || '', status: ziel, proposed_by: von };
    const da = vorhanden.get(t.date + '|' + t.posId);
    if (da) await pbPatch('/api/collections/assignments/records/' + da.id, feld);
    else    await pbPost('/api/collections/assignments/records',
                         { plan_id: planId, date: t.date, pos_id: t.posId, ...feld });

    if (!assignmentStatuses[t.date]) assignmentStatuses[t.date] = {};
    assignmentStatuses[t.date][t.posId] = { status: ziel, proposedBy: von, crewName: t.name };
  }, aufFortschritt);

  return geschrieben;
}

// Dieselbe Gruppen-Mechanik für das Aufheben. Liefert je Slot, was die Update-Queue braucht;
// das Einreihen macht der Aufrufer (dataService darf userView nicht importieren — Zyklus).
export async function removeAssignmentSlots(targets, aufFortschritt) {
  const ergebnisse = [];
  await _inGruppen(targets, async (t) => {
    const r = await removeAssignmentSlot(t.date, t.posId);
    ergebnisse.push({ ...t, ...r });
  }, aufFortschritt);
  return ergebnisse;
}

// ── Anfrage am Stück (v0.9.0) ─────────────────────────────────────────────────
// Wie promotePencilledToProposed, aber mit `proposed_by: 'bulk'`. Genau daran erkennt der
// Hook eine Sammel-Aktion und lässt die Einzelmail weg (main.pb.js: „UPDATE re-proposed via
// bulk/plan-change, kein Anfrage-Mail"). Ohne diese Kennzeichnung ginge pro Tag eine eigene
// Anfrage-Mail raus — bei einer 30-Tage-Tour also 30 Mails an dieselbe Person.
// Die eine, gebündelte Mail verschickt danach „Updates senden".
//
// Legt den Record an, falls noch keiner existiert (frisch geplante Tage haben keinen).
export async function proposeAssignmentBulk(dateStr, posId, crewName, crewEmail) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) throw new Error('Plan nicht gefunden – bitte neu einloggen');
  const pos = (POSITIONS || []).find(p => p.id === posId);
  await pbUpsert(
    'assignments',
    `plan_id = "${pbEscapeFilter(planId)}" && date = "${pbEscapeFilter(dateStr)}" && pos_id = "${pbEscapeFilter(posId)}"`,
    { plan_id: planId, date: dateStr, pos_id: posId, pos_label: pos?.label || posId,
      crew_name: crewName, crew_email: crewEmail || '', status: 'proposed', proposed_by: 'bulk' },
    { crew_name: crewName, pos_label: pos?.label || posId, crew_email: crewEmail || '',
      status: 'proposed', proposed_by: 'bulk' }
  );
  if (!assignmentStatuses[dateStr]) assignmentStatuses[dateStr] = {};
  assignmentStatuses[dateStr][posId] = { status: 'proposed', proposedBy: 'bulk', crewName };
}

// ── Besetzung eines Slots aufheben (v0.9.0) ───────────────────────────────────
// Vorher eine Closure in dropdown.js. Herausgelöst, damit Zellen-Menü und Sammel-Dialog
// nachweislich dasselbe tun — die beiden Wege liefen sonst auseinander.
//
// War die Person schon benachrichtigt (confirmed/proposed), bleibt der Record als
// `cancelled` stehen: Nur so hat der „GESEHEN ✓"-Knopf in der Änderungs-Mail ein Ziel.
// Sonst (vorgemerkt, abgelehnt, ohne Record) wird hart gelöscht — da gab es nie eine Mail.
//
// Das Einreihen in die Update-Queue macht der AUFRUFER: dataService darf userView nicht
// importieren (userView importiert bereits dataService — das wäre ein Zyklus).
// Rückgabe: { wasActive, rec, crewName } — genau das, was die Queue braucht.
export async function removeAssignmentSlot(dateStr, posId) {
  const si = assignmentStatuses[dateStr]?.[posId];
  const wasActive = !!(si && (si.status === 'confirmed' || si.status === 'proposed'));
  let rec = null;
  if (wasActive)   rec = await softCancelAssignment(dateStr, posId);
  else if (si)     await cancelProposal(dateStr, posId);
  if (assignmentStatuses[dateStr]) delete assignmentStatuses[dateStr][posId];
  return { wasActive, rec, crewName: si?.crewName || '' };
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
  try {
    await pbPatch('/api/collections/assignments/records/' + existing.id, {
      status: 'cancelled', responded_at: new Date().toISOString()
    });
    clearStatus(dateStr, posId);   // Zelle sofort „leer" (Cache), Record bleibt in PB
    return existing;
  } catch (e) {
    console.warn('softCancelAssignment Fehler:', e.message);
    throw e;
  }
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
      if (!myEmail || !rec.crew_email) continue;
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

// ⚠️ NUR die Felder mitschicken, die der Hook wirklich liest: `kind`, `to`, `aid`.
//
// `date`, `posId`, `posLabel` und `changes` sind Altlast aus der Zeit, als die Mail eine
// Terminliste enthielt. Seit Hook v4.21 zählt sie nur noch die Arten und braucht die `aid`s
// für die Quittung — der Rest wird nirgends gelesen, ging aber weiter mit.
//
// Das war kein Schönheitsfehler: Die Slots landen als JSON in `crew_invites.app_url`, und das
// Feld ist bei 5000 Zeichen zu Ende. Bei 59 Einsätzen ergaben sich ~7700 Zeichen — PocketBase
// wies den Datensatz ab, es kam ein roter Hinweis und die Mail ging gar nicht raus.
// Schlank sind dieselben 59 Einsätze ~2400 Zeichen.
//
// Die lokale Warteschlange behält die vollen Daten — die Vorschau zeigt dir ja die Tage.
function _schlankeSlots(slots) {
  return (slots || []).map(s => {
    const o = {};
    if (s.kind) o.kind = s.kind;
    if (s.to)   o.to   = s.to;
    if (s.aid)  o.aid  = s.aid;   // trägt die Quittung — darf NIE wegfallen
    return o;
  });
}

const APP_URL_GRENZE = 5000;   // Feldlänge in crew_invites.app_url

export async function sendUpdateNotice(crewName, crewEmail, slots, customMessage) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  const nutzlast = JSON.stringify(_schlankeSlots(slots));

  // Sollte es je wieder eng werden, soll dastehen WAS zu tun ist — nicht die rohe
  // Datenbankmeldung über eine Feldlänge, mit der niemand etwas anfangen kann.
  if (nutzlast.length > APP_URL_GRENZE) {
    const msg = `Zu viele Änderungen für eine Mail (${slots.length} Einsätze). `
              + 'Bitte in zwei Durchgängen senden: erst einen Teil anhaken, dann den Rest.';
    _showMailError(msg);
    throw new Error(msg);
  }

  try {
    await pbPost('/api/collections/crew_invites/records', {
      plan_id: planId, crew_name: crewName, crew_email: crewEmail,
      type: 'update', plan_name: planName,
      app_url: nutzlast,
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
    // WEITERWERFEN (v0.10.5): Vorher endete der Fehler hier. sendInvite lief danach durch,
    // vermerkte die Person als „eingeladen" und meldete grün „Einladung gesendet ✓" über die
    // rote Meldung hinweg — ohne dass je eine Mail rausging.
    throw e;
  }
}

// ── Crew-Mitglied mit E-Mail verknüpfen (Admin) ───────────────────────────────
// ── Alle je angelegten Crew-Mitglieder tour-übergreifend laden (für Import) ──────
// Kein plan_id-Filter: genau die planübergreifende Liste ist gewünscht. Single-Owner-
// Setup (listRule = auth). De-Dup + E-Mail-Bevorzugung in dedupKnownCrew (pure).
// ⚠️ `pool` MUSS mitgereicht werden: dedupKnownCrew entscheidet damit, welcher Datensatz bei
// gleicher Adresse überlebt. Ohne die Markierung gewann ein beliebiger — und eine frisch im
// Pool angelegte Person konnte hinter einem älteren Tour-Eintrag verschwinden (v0.8.5).
export async function loadAllKnownCrew() {
  if (!SUPABASE_ENABLED) return [];
  const data = await pbListAll('crew_members', '');
  return dedupKnownCrew((data?.items || []).map(m => ({
    name: m.name,
    email: m.email || '',
    pool: m.plan_id === POOL_PLAN_ID,
  })));
}

// ── Neue Person im globalen Crew-Pool anlegen ─────────────────────────────────
// Der EINZIGE Weg, auf dem eine Person überhaupt entsteht — sowohl aus dem Tour-Dialog
// (js/crew.js) als auch aus der Konsole (admin.html). Vorher gab es die Logik nur inline in
// admin.html; als der Tour-Dialog dazukam, wäre sie sonst ein zweites Mal dagestanden.
//
// Die Adresse ist zugleich die Registrierungsfreigabe: users.createRule ist
// `@collection.crew_members.email ?= email`. Wer hier hereinkommt, darf sich anmelden —
// deshalb der Dublettencheck über ALLE crew_members (Pool wie Touren), nicht nur den Pool.
export async function createPoolMember(name, email, role = 'crew') {
  if (!SUPABASE_ENABLED) return null;
  const n = String(name ?? '').trim();
  const mail = normEmail(email);
  if (!n)    throw new Error('Bitte Namen eingeben.');
  if (!mail) throw new Error('Bitte E-Mail eingeben.');

  const existing = await pbFirst('crew_members', `email = "${pbEscapeFilter(mail)}"`);
  if (existing) throw new Error('E-Mail bereits vergeben.');

  return pbPost('/api/collections/crew_members/records',
    { plan_id: POOL_PLAN_ID, name: n, email: mail, role });
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
    if (typeof showToast === 'function') showToast('⚠ E-Mail-Speichern fehlgeschlagen: ' + e.message, '#e84a4a', 6000);
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
