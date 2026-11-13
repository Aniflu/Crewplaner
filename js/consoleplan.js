// v1.3.0: Die Konsole (admin.html) macht den geladenen Plan zum AKTIVEN Plan der gemeinsamen
// Module (state.js, plans.js, dataService.js, planSync.js) — genau wie die Touransicht.
// Dadurch schreiben Crew-/Positions-Funktionen (js/crew.js, positions.js, crewNotify.js)
// über _savePlanToLS mit planSync-Schutz in den Konsolen-Plan und nie in einen anderen.
import { setActivePlanId, getActivePlanId, getPlansIndex, savePlansIndex, _today } from './plans.js';
import { loadPlanForManager, loadCrewMeta, loadAssignmentStatuses } from './dataService.js';
import { TOUR_DATES, POSITIONS, crew, defaultCrew, assignments } from './state.js';

// Lokale ID wie bei der Plan-Übergabe der Touransicht (js/authService.js).
export function consoleLocalId(pbId) { return 'pbplan_' + pbId; }

// Setzt die Zeiger (lokale ID, PB-ID, Plan-Index) und lädt den DB-Stand samt Basisstand für den
// Speicherschutz. Gibt true zurück, wenn der Plan im State liegt. Ohne Erfolg bleibt der Plan
// aktiv gesetzt, aber ohne Basisstand — _savePlanToLS schreibt dann nie blind (planSync).
export async function activateConsolePlan(pbId, name) {
  if (!pbId) return false;
  const lid = consoleLocalId(pbId);
  try {
    localStorage.setItem('tourplan_pb_' + lid, pbId);
    localStorage.setItem('tourplan_active_pb_id', pbId);
    localStorage.setItem('tourplan_active_plan', lid);
    // Genau ein Eintrag je lokaler ID: vorhandene Doppelte (z. B. aus zwei Tabs) fallen weg.
    let seen = false;
    const idx = getPlansIndex().filter(p => {
      if (!p || !p.id) return false;
      if (p.id !== lid) return true;
      if (seen) return false;
      seen = true; return true;
    });
    const hit = idx.find(p => p.id === lid);
    if (hit) { if (name) hit.name = name; }
    else idx.push({ id: lid, name: name || 'Plan', created: _today(), modified: _today() });
    savePlansIndex(idx);
  } catch (_) { /* Speicher gesperrt: der Plan wird trotzdem im State gehalten */ }
  setActivePlanId(lid);
  const ok = await loadPlanForManager(pbId);
  // Nur wenn dieser Plan noch der aktive ist (Wechsel während des Ladens) — sonst verwerfen.
  if (!ok || getActivePlanId() !== lid) return false;
  await Promise.all([loadCrewMeta(), loadAssignmentStatuses()]);
  return getActivePlanId() === lid;
}

// Kopie des geladenen Plans als plan_data-Form, für die Konsolen-Werte (PDF, ICS, Export).
export function consolePlanSnapshot() {
  return {
    tourDates: TOUR_DATES.map(d => ({ ...d })),
    positions: POSITIONS.map(p => ({ ...p })),
    crew: [...crew],
    defaultCrew: { ...defaultCrew },
    assignments: JSON.parse(JSON.stringify(assignments)),
  };
}
