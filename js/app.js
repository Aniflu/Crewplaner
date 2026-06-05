// Entry point for index.html
import { SUPABASE_ENABLED } from './config.js';
import { _authCheckAndStart, logout } from './authService.js';

// Import all modules to ensure they are loaded and registered
import './state.js';
import './pb.js';
import './utils.js';
import './rbac.js';
import './types.js';
import './render.js';
import './tourblock.js';
import './stats.js';
import './sidebar.js';
import './blockview.js';
import './crewview.js';
import './dropdown.js';
import './crew.js';
import './positions.js';
import './modals.js';
import './dates.js';
import './logos.js';
import './calendar.js';
import './plans.js';
import './persistence.js';
import './crewNotify.js';
import './crewLink.js';
import './userView.js';
import './dialog.js';
import './init.js';

// ── Explicit imports for window.* registrations (onclick handlers) ──
import { saveJSON, loadJSON, onFileLoad } from './persistence.js';
import { openCrewModal, toggleSidebar } from './sidebar.js';
import { addCrew } from './crew.js';
import { closeDD } from './dropdown.js';
import { setView } from './render.js';
import { handleLogoUpload, removeLogo } from './logos.js';
import { generateICS } from './calendar.js';
import { openNewPlan } from './plans.js';
import { openAddType } from './types.js';
import { openAddPos } from './positions.js';
import { openTourBlock, tbBack, tbStep2, tbSetAll, tbConfirm } from './tourblock.js';
import { clearAllCancellations, flushAllCancellations } from './crewNotify.js';
import { sendCancellations, bulkConfirmAllMySlots, bulkDeclineAllMySlots,
         _openUpdateQueueModal, _closeUpdateQueueModal,
         _sendPendingUpdates, _sendSelectedUpdates, _submitMeldung } from './userView.js';
import { openModal, closeModal } from './modals.js';
import { showToast } from './utils.js';
import { generatePDF, pdfSetView, pdfToggleAll, openPDFFilter } from './pdf.js';

// ── Register all onclick-handler functions as window globals ──
window.logout = logout;
window.saveJSON = saveJSON;
window.loadJSON = loadJSON;
window.onFileLoad = onFileLoad;
window.openCrewModal = openCrewModal;
window.toggleSidebar = toggleSidebar;
window.addCrew = addCrew;
window.closeDD = closeDD;
window.setView = setView;
window.handleLogoUpload = handleLogoUpload;
window.removeLogo = removeLogo;
window.generateICS = generateICS;
window.openNewPlan = openNewPlan;
window.openAddType = openAddType;
window.openAddPos = openAddPos;
window.openTourBlock = openTourBlock;
window.tbBack = tbBack;
window.tbStep2 = tbStep2;
window.tbSetAll = tbSetAll;
window.tbConfirm = tbConfirm;
window.clearAllCancellations = clearAllCancellations;
window.flushAllCancellations = flushAllCancellations;
window.sendCancellations = sendCancellations;
window.bulkConfirmAllMySlots = bulkConfirmAllMySlots;
window.bulkDeclineAllMySlots = bulkDeclineAllMySlots;
window._openUpdateQueueModal = _openUpdateQueueModal;
window._closeUpdateQueueModal = _closeUpdateQueueModal;
window._sendPendingUpdates = _sendPendingUpdates;
window._sendSelectedUpdates = _sendSelectedUpdates;
window._submitMeldung = _submitMeldung;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.generatePDF = generatePDF;
window.pdfSetView = pdfSetView;
window.pdfToggleAll = pdfToggleAll;
window.openPDFFilter = openPDFFilter;

// ── Security: Redirect to login if not authenticated ──────────────────────
if (!localStorage.getItem('pb_token')) {
  if (!window.location.pathname.includes('login') && !window.location.pathname.includes('view')) {
    window.location.href = 'login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[app.js] DOMContentLoaded fired. SUPABASE_ENABLED:', SUPABASE_ENABLED);
  if (!SUPABASE_ENABLED) {
    console.warn('[app.js] SUPABASE_ENABLED=false, skipping auth check');
    return;
  }
  if (window.location.pathname.includes('login')) {
    console.log('[app.js] On login page, skipping auth check');
    return;
  }
  console.log('[app.js] Starting auth check...');
  // auth-bootstrap.js already handles visibility
  _authCheckAndStart().catch(e => {
    console.error('[app.js] Auth check failed:', e);
    window.location.href = 'login.html';
  });
});
