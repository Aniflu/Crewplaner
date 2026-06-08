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
    case 'linkCrewEmail':
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
