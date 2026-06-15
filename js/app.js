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

// ── Explicit imports for window.* registrations (onclick handlers) ──
import { saveJSON, savePlan, loadJSON, onFileLoad } from './persistence.js';
import { openCrewModal, toggleSidebar } from './sidebar.js';
import { addCrew } from './crew.js';
import { closeDD } from './dropdown.js';
import { setView } from './render.js';
import { handleLogoUpload, removeLogo } from './logos.js';
import { generateICS } from './calendar.js';
import { openNewPlan } from './plans.js';
import { openAddType } from './types.js';
import { openAddPos } from './positions.js';
import { openTourBlock, tbBack, tbStep2, tbSetAll, tbConfirm, openBlockRange } from './tourblock.js';
import { openAddDate } from './dates.js';
import { clearAllCancellations, flushAllCancellations } from './crewNotify.js';
import { sendCancellations, bulkConfirmAllMySlots,
         _openUpdateQueueModal, _closeUpdateQueueModal,
         _sendPendingUpdates, _sendSelectedUpdates, _submitMeldung } from './userView.js';
import { openModal, closeModal } from './modals.js';
import { showToast } from './utils.js';
import { generatePDF, pdfSetView, pdfToggleAll, openPDFFilter } from './pdf.js';

// ── Migrations-Fix v0.10.5: onclick-Handler die nach ES6-Migration nicht mehr global registriert waren ──
import { openCrewDD, openDateDD, openDefaultDD, openTypeDD, requestAll, requestForPos, bulkCancelPos } from './dropdown.js';
import { openPosMenu, openRenamePos } from './positions.js';
import { confirmNewPlan, confirmRenamePlan, deletePlan, renamePlan, switchPlan } from './plans.js';
import { _confirmTypeModal, deleteType, openEditType } from './types.js';
import { adSetMode, confirmAddDate } from './dates.js';
import { removeCrew } from './crew.js';
import { saveCrewLinkRow } from './crewLink.js';
import { sendCancellationSummary, sendInvite, sendUpdate } from './crewNotify.js';
import { tbChangeLoc, tbChangeType } from './tourblock.js';
import { confirmMySlot, declineMySlot, openSlotConfirmModal, toggleCancellation,
         _bulkConfirmMySlots, _deleteSlotFromQueue, _toggleSlotSelection, meinesMelden,
         _queueSelectAll, _queueGrpSel } from './userView.js';
import { startLocEdit } from './render.js';

// ── Register all onclick-handler functions as window globals ──
window.logout = logout;
window.saveJSON = saveJSON;
window.savePlan = savePlan;
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
window.openAddDate = openAddDate;
window.openBlockRange = openBlockRange;
window.tbBack = tbBack;
window.tbStep2 = tbStep2;
window.tbSetAll = tbSetAll;
window.tbConfirm = tbConfirm;
window.clearAllCancellations = clearAllCancellations;
window.flushAllCancellations = flushAllCancellations;
window.sendCancellations = sendCancellations;
window.bulkConfirmAllMySlots = bulkConfirmAllMySlots;
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

// ── Migrations-Fix v0.10.5: fehlende onclick-Handler-Registrierungen (index.html) ──
window.openCrewDD = openCrewDD;
window.openDateDD = openDateDD;
window.openDefaultDD = openDefaultDD;
window.openTypeDD = openTypeDD;
window.requestAll = requestAll;
window.requestForPos = requestForPos;
window.bulkCancelPos = bulkCancelPos;
window.openPosMenu = openPosMenu;
window.openRenamePos = openRenamePos;
window.confirmNewPlan = confirmNewPlan;
window.confirmRenamePlan = confirmRenamePlan;
window.deletePlan = deletePlan;
window.renamePlan = renamePlan;
window.switchPlan = switchPlan;
window._confirmTypeModal = _confirmTypeModal;
window.deleteType = deleteType;
window.openEditType = openEditType;
window.adSetMode = adSetMode;
window.confirmAddDate = confirmAddDate;
window.removeCrew = removeCrew;
window.saveCrewLinkRow = saveCrewLinkRow;
window.sendCancellationSummary = sendCancellationSummary;
window.sendInvite = sendInvite;
window.sendUpdate = sendUpdate;
window.tbChangeLoc = tbChangeLoc;
window.tbChangeType = tbChangeType;
window.confirmMySlot = confirmMySlot;
window.declineMySlot = declineMySlot;
window.openSlotConfirmModal = openSlotConfirmModal;
window.toggleCancellation = toggleCancellation;
window._bulkConfirmMySlots = _bulkConfirmMySlots;
window._deleteSlotFromQueue = _deleteSlotFromQueue;
window._toggleSlotSelection = _toggleSlotSelection;
window._queueSelectAll = _queueSelectAll;
window._queueGrpSel = _queueGrpSel;
window.meinesMelden = meinesMelden;
window.startLocEdit = startLocEdit;
window._dismissCrewUpdates = function(){ const b=document.getElementById('crewUpdateBar'); if(b) b.style.display='none'; };

// ── Security: Redirect to login if not authenticated ──────────────────────
if (!localStorage.getItem('pb_token')) {
  // Check if plan-transfer is in progress — NUTZE localStorage, nicht sessionStorage!
  const planTransferActive = !!localStorage.getItem('_planTransfer_flag');
  if (!window.location.pathname.includes('login') && !window.location.pathname.includes('view') && !planTransferActive) {
    window.location.href = window.getNavUrl('login.html');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[app.js] DOMContentLoaded fired. SUPABASE_ENABLED:', SUPABASE_ENABLED);
  if (!SUPABASE_ENABLED) {
    console.warn('[app.js] SUPABASE_ENABLED=false, skipping auth check');
    // Direct import + call for offline mode (no PocketBase)
    import('./init.js').then(m => m.startApp());
    return;
  }
  if (window.location.pathname.includes('login')) {
    console.log('[app.js] On login page, skipping auth check');
    return;
  }
  console.log('[app.js] Starting auth check...');
  // auth-bootstrap.js already handles visibility
  // startApp() wird von authService.js nach Plan-Transfer aufgerufen
  _authCheckAndStart().catch(e => {
    console.error('[app.js] Auth check failed:', e);
    window.location.href = window.getNavUrl('login.html');
  });
});
