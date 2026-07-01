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
import './crewLink.js';
import './dialog.js';
import { pbGet, pbPost, pbPatch, pbDelete, pbList } from './pb.js';
import { esc, showToast } from './utils.js';
import { openModal, closeModal } from './modals.js';
import { renderEmailLog } from './emailLog.js';
import { loadAssignmentStatuses, loadCrewMeta } from './dataService.js';
import { generatePDF, openPDFFilter, pdfSetView, pdfToggleAll } from './pdf.js';
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
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.renderEmailLog = renderEmailLog;
window.loadAssignmentStatuses = loadAssignmentStatuses;
window.loadCrewMeta = loadCrewMeta;
window.generatePDF = generatePDF;
window.openPDFFilter = openPDFFilter;
window.pdfSetView = pdfSetView;
window.pdfToggleAll = pdfToggleAll;
