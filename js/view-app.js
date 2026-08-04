// Entry point for view.html (read-only tour plan view)
import { SUPABASE_ENABLED, POCKETBASE_URL } from './config.js';
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
    // Plan über die token-geschützte Server-Route holen (Hook v4.15) statt über die
    // plans-REST-API. Vorher musste dafür `plans.listRule` auf `view_token != ""` stehen —
    // dieser Zweig trifft aber auf JEDEN Plan mit Token zu, wodurch alle Pläne anonym
    // abrufbar waren, inklusive der `view_token` im Klartext (2026-08-04). Die Route gibt
    // nur Plantitel und plan_data heraus, kein Token, keine Owner-ID.
    const res = await fetch(POCKETBASE_URL + '/viewplan/' + encodeURIComponent(token));
    if (res.status === 404) throw new Error('Plan nicht gefunden oder Link ungültig.');
    if (!res.ok) throw new Error('Plan nicht ladbar (HTTP ' + res.status + ').');
    const plan = await res.json();
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

    // Bestätigungs-Status über die token-geschützte Server-Route holen (Hook v4.14).
    // Früher las diese Seite die assignments-Collection direkt — dafür musste deren
    // listRule offen sein, wodurch alle Einsätze INKLUSIVE der Crew-Mailadressen
    // weltöffentlich abrufbar waren (2026-08-03 geschlossen). Die Route liefert nur
    // Datum/Position/Status/Name und nur für den Plan hinter diesem Token.
    // Schlägt sie fehl (z.B. Hook noch nicht deployt), rendert die Ansicht wie bisher
    // ohne Status-Einfärbung weiter — deshalb try/catch statt Abbruch.
    try {
      const res = await fetch(POCKETBASE_URL + '/viewstatus/' + encodeURIComponent(token));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const sData = await res.json();
      loadStatusesData(sData?.statuses || {});
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
