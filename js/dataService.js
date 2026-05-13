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
async function _getActivePlanId() {
  if (!SUPABASE_ENABLED || !CURRENT_USER_ID) return null;
  const key = 'tourplan_pb_' + (activePlanId || 'default');
  const stored = localStorage.getItem(key);
  if (stored) return stored;

  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';

  try {
    // Prüfen ob Plan schon existiert (z.B. nach Cache-Löschung)
    const existing = await pbFirst('plans',
      `name = "${planName.replace(/"/g, '\\"')}" && owner = "${CURRENT_USER_ID}"`);
    if (existing) {
      localStorage.setItem(key, existing.id);
      return existing.id;
    }

    const created = await pbPost('/api/collections/plans/records', {
      name: planName, owner: CURRENT_USER_ID
    });
    if (created?.id) {
      localStorage.setItem(key, created.id);
      await pbPost('/api/collections/plan_members/records', {
        plan_id: created.id, user_id: CURRENT_USER_ID, role: 'owner'
      });
      return created.id;
    }
  } catch (e) {
    console.warn('Plan-Sync-Fehler:', e.message);
  }
  return null;
}

// ── Crew-Meta laden (E-Mail + user_id pro Crew-Name) ──────────────────────────
async function loadCrewMeta() {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbList('crew_members', `plan_id = "${planId}"`);
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
async function loadAssignmentStatuses() {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const data = await pbList('assignments',
      `plan_id = "${planId}" && status != "assigned"`);
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

// ── Crew vorschlagen (Admin → Crew-Mitglied) ───────────────────────────────────
async function proposeCrew(dateStr, posId, crewName, crewEmail) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const pos = typeof POSITIONS !== 'undefined' ? POSITIONS.find(p => p.id === posId) : null;
  const posLabel = pos?.label || posId;

  try {
    await pbUpsert(
      'assignments',
      `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`,
      {
        plan_id: planId, date: dateStr, pos_id: posId, pos_label: posLabel,
        crew_name: crewName, status: 'proposed', proposed_by: CURRENT_USER_ID
      },
      { crew_name: crewName, pos_label: posLabel, status: 'proposed', proposed_by: CURRENT_USER_ID }
    );
  } catch (e) {
    console.warn('proposeCrew Fehler:', e.message);
    return;
  }

  if (!assignmentStatuses[dateStr]) assignmentStatuses[dateStr] = {};
  assignmentStatuses[dateStr][posId] = { status: 'proposed', proposedBy: CURRENT_USER_ID, crewName };
  // E-Mail wird via Pocketbase-Hook automatisch gesendet (siehe .pb_hooks/main.pb.js)
}

// ── Slot bestätigen (Crew-Mitglied) ───────────────────────────────────────────
async function confirmAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`);
    if (existing) {
      await pbPatch('/api/collections/assignments/records/' + existing.id, {
        status: 'confirmed', responded_at: new Date().toISOString()
      });
    }
    if (assignmentStatuses[dateStr]?.[posId]) {
      assignmentStatuses[dateStr][posId].status = 'confirmed';
    }
  } catch (e) {
    console.warn('confirmAssignment Fehler:', e.message);
  }
}

// ── Slot ablehnen (Crew-Mitglied → E-Mail an Admin via Hook) ──────────────────
async function declineAssignment(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const si = assignmentStatuses[dateStr]?.[posId];

  try {
    const existing = await pbFirst('assignments',
      `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`);
    if (existing) {
      await pbPatch('/api/collections/assignments/records/' + existing.id, {
        status: 'declined', responded_at: new Date().toISOString()
      });
    }
    if (si) si.status = 'declined';
    // E-Mail an Admin wird via Pocketbase-Hook automatisch gesendet
  } catch (e) {
    console.warn('declineAssignment Fehler:', e.message);
  }
}

// ── Anfrage zurückziehen (Admin) ──────────────────────────────────────────────
async function cancelProposal(dateStr, posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const existing = await pbFirst('assignments',
    `plan_id = "${planId}" && date = "${dateStr}" && pos_id = "${posId}"`);
  if (existing) {
    await pbDelete('/api/collections/assignments/records/' + existing.id);
  }
}

// ── Alle Anfragen einer Position zurückziehen (Admin) ─────────────────────────
async function bulkCancelProposals(posId) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  const data = await pbList('assignments',
    `plan_id = "${planId}" && pos_id = "${posId}" && (status = "proposed" || status = "declined")`);
  await Promise.all((data?.items || []).map(row =>
    pbDelete('/api/collections/assignments/records/' + row.id)
  ));
}

// ── Crew für mehrere Slots auf einmal vorschlagen ─────────────────────────────
async function bulkProposeCrew(slots) {
  if (!SUPABASE_ENABLED || !slots.length) return;
  const planId = await _getActivePlanId();
  if (!planId) return;

  await Promise.all(slots.map(s => {
    const pos = typeof POSITIONS !== 'undefined' ? POSITIONS.find(p => p.id === s.posId) : null;
    return pbUpsert(
      'assignments',
      `plan_id = "${planId}" && date = "${s.date}" && pos_id = "${s.posId}"`,
      {
        plan_id: planId, date: s.date, pos_id: s.posId, pos_label: pos?.label || s.posId,
        crew_name: s.crewName, status: 'proposed', proposed_by: CURRENT_USER_ID
      },
      { crew_name: s.crewName, pos_label: pos?.label || s.posId, status: 'proposed', proposed_by: CURRENT_USER_ID }
    );
  }));

  slots.forEach(s => {
    if (!assignmentStatuses[s.date]) assignmentStatuses[s.date] = {};
    assignmentStatuses[s.date][s.posId] = {
      status: 'proposed', proposedBy: CURRENT_USER_ID, crewName: s.crewName
    };
  });
}

// ── Crew einladen / Erinnerung schicken (E-Mail via Pocketbase-Hook) ──────────
async function sendCrewInvite(crewName, crewEmail, type) {
  if (!SUPABASE_ENABLED || !crewEmail) return;
  // Hook-Trigger: temporären invite-Record anlegen, Hook sendet Mail und löscht ihn
  const planId = await _getActivePlanId();
  if (!planId) return;
  const plans = typeof getPlansIndex === 'function' ? getPlansIndex() : [];
  const planName = plans.find(p => p.id === activePlanId)?.name || 'Tour Plan';
  const appUrl = window.location.origin + window.location.pathname;
  try {
    await pbPost('/api/collections/crew_invites/records', {
      plan_id: planId, crew_name: crewName, crew_email: crewEmail,
      type, plan_name: planName, app_url: appUrl
    });
  } catch (e) {
    console.warn('sendCrewInvite Fehler:', e.message);
    _showMailError(e.message);
  }
}

// ── Crew-Mitglied mit E-Mail verknüpfen (Admin) ───────────────────────────────
async function saveCrewLink(crewName, email) {
  if (!SUPABASE_ENABLED) return;
  const planId = await _getActivePlanId();
  if (!planId) throw new Error('Plan nicht gefunden – bitte neu einloggen');

  await pbUpsert(
    'crew_members',
    `plan_id = "${planId}" && name = "${crewName.replace(/"/g, '\\"')}"`,
    { plan_id: planId, name: crewName, email, sort_order: crew.indexOf(crewName) },
    { email }
  );
  if (!crewMeta[crewName]) crewMeta[crewName] = {};
  crewMeta[crewName].email = email;
}
