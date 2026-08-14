// ── Role-Based Access Control — v1 ────────────────────────────────────────────
import { IS_SUPERADMIN, IS_MANAGER, IS_BOOKER, IS_CREW } from './state.js';

export function hasPermission(action) {
  if (IS_SUPERADMIN) return true;
  switch (action) {
    case 'assignCrew':
    case 'createPlan':
    case 'editPlan':
    case 'deletePlan':
    case 'addDate':
    case 'removeDate':
    case 'addPosition':
    case 'removePosition':
    case 'addCrewMember':
    case 'removeCrewMember':
    case 'sendInvite':
    case 'sendReminder':
    case 'sendCancellation':
    case 'cancelAssignment':
    // v0.8.3: war 'linkCrewEmail' (Werkzeug „Crew verknüpfen", entfallen). Deckt jetzt den
    // Crew-Pool ab — auswählen UND neu anlegen. Manager brauchen volle Personalhoheit: Wer
    // eine Tour mit Personal plant, muss das Personal auch anlegen können.
    case 'managePool':
      return IS_MANAGER;
    case 'viewAllAssignments':
    case 'viewStats':
      return IS_BOOKER || IS_MANAGER;
    case 'confirmOwnAssignment':
    case 'declineOwnAssignment':
      return IS_CREW || IS_MANAGER;
    case 'exportPDF':
    case 'exportCalendar':
      return true;
    case 'accessAdminConsole':
    case 'manageUsers':
    case 'manageRoles':
      return IS_SUPERADMIN;
    default:
      return false;
  }
}
