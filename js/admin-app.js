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
import { normEmail, mergeCrewDirectory, renameInPlanData } from './pure.js';
import { openModal, closeModal } from './modals.js';
import { renderEmailLog } from './emailLog.js';
import { loadAssignmentStatuses, loadCrewMeta, createPoolMember, notify } from './dataService.js';
import { POOL_PLAN_ID } from './config.js';
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
window.normEmail = normEmail;
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
window.generatePDF = generatePDF;
window.openPDFFilter = openPDFFilter;
window.pdfSetView = pdfSetView;
window.pdfToggleAll = pdfToggleAll;
