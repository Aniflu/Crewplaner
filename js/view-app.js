// Entry point for view.html (read-only tour plan view)
import { SUPABASE_ENABLED } from './config.js';
import { pbGet, pbListAll } from './pb.js';
import { setTourDates, setPositions, setCrew, setDefaultCrew,
         loadAssignmentsData, loadStatusesData } from './state.js';
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

// Hell/Dunkel-Umschalter (data-theme am <html>, Schlüssel cp_mode).
(function(){
  function mode(){return document.documentElement.dataset.theme||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
  function paint(){var b=document.getElementById('themeToggle');if(!b)return;var d=mode()==='dark';b.textContent=d?'☀':'☾';b.title=d?'Auf Hell umschalten':'Auf Dunkel umschalten';}
  window.toggleTheme=function(){var n=mode()==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('cp_mode',n);}catch(e){}paint();};
  paint();
})();

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

    // State für render.js/getVal befüllen — MUSS über die state.js-Setter laufen.
    // render.js und utils.js (getVal) lesen die ES-Modul-Bindings aus state.js,
    // NICHT window.* → eine window-Zuweisung bliebe für den Render wirkungslos
    // (Zellen leer, Positionen = Defaults). Nur TOUR_DATES ist ein Live-Array.
    setCrew(pd.crew                    || []);
    setPositions(pd.positions          || []);
    setTourDates(pd.tourDates          || []);
    loadAssignmentsData(pd.assignments || {});
    setDefaultCrew(pd.defaultCrew      || {});
    loadStatusesData({});

    try {
      const aData = await pbListAll('assignments',
        `plan_id="${plan.id}" && status!="assigned"`, '-id');
      const statuses = {};
      (aData?.items || []).forEach(row => {
        if (!statuses[row.date]) statuses[row.date] = {};
        statuses[row.date][row.pos_id] = { status: row.status, crewName: row.crew_name };
      });
      loadStatusesData(statuses);
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
