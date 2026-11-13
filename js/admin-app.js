// Entry point for admin.html
import { SUPABASE_ENABLED } from './config.js';
import './state.js';
import './pb.js';
import './utils.js';
import './types.js';
import './plans.js';
import './logos.js';
import './calendar.js';
import './pdf.js';
import './emailLog.js';
import './crewNotify.js';
import './dialog.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList } from './pb.js';
import { esc, showToast } from './utils.js';
import { normEmail, mergeCrewDirectory, renameInPlanData, icsTitel } from './pure.js';
import { openModal, closeModal } from './modals.js';
import { renderEmailLog } from './emailLog.js';
import { loadAssignmentStatuses, loadCrewMeta, createPoolMember, notify } from './dataService.js';
import { POOL_PLAN_ID } from './config.js';
import { generatePDF, openPDFFilter, pdfSetView, pdfToggleAll } from './pdf.js';
import { loadPlanState, setAuthState } from './state.js';
import { activateConsolePlan, consolePlanSnapshot } from './consoleplan.js';
import { renderCrew, removeCrew, renameCrew, openImportCrewModal, confirmImportCrew, _importSelectAll, _closeImportCrew, _showNewPersonForm, createAndTakeCrew } from './crew.js';
import { openRenamePos, openAddPos } from './positions.js';
import { renderCrewNotifyInto, sendInvite, sendUpdate, sendCancellationSummary, openCancelSelect, closeCancelSelect, cxlAddManual, sendSelectedCancellation, openInvitePreview, openUpdatePreview, closeSendPreview, confirmSendPreview } from './crewNotify.js';
import { _updateCrewUpdateBar, _openUpdateQueueModal, _closeUpdateQueueModal, _queueSelectAll, _queueGrpSel, _clearUpdateQueue, _deleteSlotFromQueue, _toggleSlotSelection, _sendSelectedUpdates, _updatePreviewSend, _updatePreviewSkip, _updatePreviewCancel } from './userView.js';
import { tvInit, tvCompare, tvOpenDay, tvCloseDay, tvShiftDay, tvPickSlot, tvMove, tvRenderWithBundles, tvSave, tvSaveAsk, tvDiscard, tvLeaveCheck, tvSelChange, tvHasUnsaved } from './tourvergleich-ui.js';
// HINWEIS: KEIN Import von calendar.js generateICS mehr — admin.html hat eine eigene
// Inline-`adminGenerateICS`, die den GELADENEN Plan (_wrk*/TOUR_DATES) exportiert.
// Der frühere `window.adminGenerateICS = generateICS` überschrieb sie und las `state.js`
// (im Admin veraltet/falscher Plan) → ICS enthielt den falschen Plan (v0.19.1).

// Admin.html has its own inline bootstrap script for auth.
// This entry point ensures all modules are loaded and their functions are available.
// Expose needed functions as window globals for inline scripts:
window.pbGet = pbGet;
window.pbPost = pbPost;
window.pbPatch = pbPatch;
window.pbDelete = pbDelete;
window.pbList = pbList;
window.esc = esc;
window.normEmail = normEmail;
// Eine Titelregel fuer alle ICS-Wege (v0.12.0) — admin.html kann nicht importieren.
window.icsTitel = icsTitel;
window.mergeCrewDirectory = mergeCrewDirectory;
window.renameInPlanData = renameInPlanData;
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.renderEmailLog = renderEmailLog;
window.loadAssignmentStatuses = loadAssignmentStatuses;
window.loadCrewMeta = loadCrewMeta;
// admin.html ist ein klassisches Inline-Skript und kann nicht importieren — der eine
// Mail-/Schreibweg kommt wie alles andere von hier.
window.notify = notify;
// admin.html ist ein klassisches Inline-Skript und kann nicht importieren — Pool-Sentinel und
// Anlege-Funktion kommen von hier. Beide erst INNERHALB von Funktionen lesen, dieses Modul
// läuft nach dem Inline-Skript (siehe Kommentar dort).
window.POOL_PLAN_ID = POOL_PLAN_ID;
window.createPoolMember = createPoolMember;
// pdf.js liest aus state.js, admin.html hält den geladenen Plan in eigenen Variablen —
// openAdminPDF übergibt ihn damit, bevor der Filter aufgeht (v0.13.8).
window.loadPlanState = loadPlanState;
window.generatePDF = generatePDF;
window.openPDFFilter = openPDFFilter;
window.pdfSetView = pdfSetView;
window.pdfToggleAll = pdfToggleAll;
// Tourvergleich (v1.2.0): Tab-Handler für admin.html (Inline-Skript kann nicht importieren).
Object.assign(window, { tvInit, tvCompare, tvOpenDay, tvCloseDay, tvShiftDay, tvPickSlot, tvMove, tvRenderWithBundles, tvSave, tvSaveAsk, tvDiscard, tvLeaveCheck, tvSelChange, tvHasUnsaved });

// v1.3.0: Rolle und aktiver Plan der Konsole (js/consoleplan.js)
window.setConsoleAuth = setAuthState;
window.activateConsolePlan = activateConsolePlan;
window.consolePlanSnapshot = consolePlanSnapshot;

// v1.3.0: Karte „Crew & Positionen“ — dieselben Module wie die Touransicht, kein eigener Code.
Object.assign(window, { renderCrew, removeCrew, renameCrew, openImportCrewModal, confirmImportCrew, _importSelectAll, _closeImportCrew, _showNewPersonForm, createAndTakeCrew,
  openRenamePos, openAddPos, renderCrewNotifyInto, sendInvite, sendUpdate, sendCancellationSummary, openCancelSelect, closeCancelSelect, cxlAddManual, sendSelectedCancellation, openInvitePreview, openUpdatePreview, closeSendPreview, confirmSendPreview,
  _updateCrewUpdateBar, _openUpdateQueueModal, _closeUpdateQueueModal, _queueSelectAll, _queueGrpSel, _clearUpdateQueue, _deleteSlotFromQueue, _toggleSlotSelection, _sendSelectedUpdates, _updatePreviewSend, _updatePreviewSkip, _updatePreviewCancel });
// Jede Crew-/Positionsänderung rendert die Liste neu (renderCrew) → Karte und Konsolen-Werte nachziehen.
document.addEventListener('crew-rendered', () => { if (typeof window._crewCardRefresh === 'function') window._crewCardRefresh(); });
