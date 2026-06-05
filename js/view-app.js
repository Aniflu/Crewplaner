// Entry point for view.html (read-only tour plan view)
import { SUPABASE_ENABLED } from './config.js';
import { pbGet, pbListAll } from './pb.js';
import { TOUR_DATES } from './state.js';
import { renderTable } from './render.js';

// Read-only Modus — keine Dropdowns, keine Bearbeitungsfunktionen
window.IS_MANAGER     = false;
window.IS_SUPERADMIN  = false;
window.IS_BOOKER      = true;
window.IS_CREW        = false;

// Stubs für Funktionen die render.js ggf. aufruft
window.showDD      = () => {};
window.openCrewDD  = () => {};
window.updateStats = () => {};
window.autoSave    = () => {};
window.startLocEdit = () => {};
window.renderTable = renderTable;
window.pbGet = pbGet;
window.pbListAll = pbListAll;

// Main load function
(async function() {
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    document.getElementById('viewLoading').style.display = 'none';
    const err = document.getElementById('viewError');
    err.textContent = 'Kein Token angegeben.';
    err.style.display = 'block';
    return;
  }

  try {
    const data = await pbGet('/api/collections/plans/records?filter='
      + encodeURIComponent('view_token="' + token + '"') + '&perPage=1&sort=-id');
    const plan = (data.items || [])[0];
    if (!plan) throw new Error('Plan nicht gefunden oder Link ungültig.');

    const pd = typeof plan.plan_data === 'string'
      ? JSON.parse(plan.plan_data)
      : plan.plan_data;
    if (!pd || !pd.tourDates) throw new Error('Plan enthält keine Daten.');

    // Globals für render.js befüllen
    window.crew               = pd.crew        || [];
    window.POSITIONS          = pd.positions   || [];
    TOUR_DATES.splice(0, TOUR_DATES.length, ...(pd.tourDates || []));
    window.assignments        = pd.assignments || {};
    window.defaultCrew        = pd.defaultCrew || {};
    window.assignmentStatuses = {};

    try {
      const aData = await pbListAll('assignments',
        `plan_id="${plan.id}" && status!="assigned"`, '-id');
      (aData?.items || []).forEach(row => {
        if (!window.assignmentStatuses[row.date]) window.assignmentStatuses[row.date] = {};
        window.assignmentStatuses[row.date][row.pos_id] = { status: row.status, crewName: row.crew_name };
      });
    } catch(e) { console.warn('[view] assignmentStatuses:', e.message); }

    document.getElementById('viewPlanName').textContent = plan.name || 'Tour Plan';
    document.title = (plan.name || 'Tour Plan') + ' — Ansicht';
    document.getElementById('viewLoading').style.display = 'none';
    renderTable();
  } catch(e) {
    console.error('[view] Ladefehler:', e);
    document.getElementById('viewLoading').style.display = 'none';
    const err = document.getElementById('viewError');
    err.textContent = 'Fehler: ' + e.message;
    err.style.display = 'block';
  }
})();
